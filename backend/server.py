from fastapi import FastAPI, APIRouter, HTTPException, Request, Depends, Response
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import httpx
import json

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============== MODELS ==============

class UserCreate(BaseModel):
    email: str
    name: str
    picture: Optional[str] = None

class User(BaseModel):
    user_id: str
    email: str
    name: str
    avatar_url: Optional[str] = None
    plan: str = "free"
    streak_count: int = 0
    last_active_date: Optional[str] = None
    created_at: str

class TaskCreate(BaseModel):
    raw_input: str

class TaskParsed(BaseModel):
    title: str
    due_date: Optional[str] = None
    priority: str = "medium"
    type: str = "task"
    emoji: str = "📝"

class Task(BaseModel):
    task_id: str
    user_id: str
    raw_input: str
    title: str
    due_date: Optional[str] = None
    priority: str
    type: str
    emoji: str
    status: str = "active"
    created_at: str
    completed_at: Optional[str] = None

class TaskUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    priority: Optional[str] = None
    due_date: Optional[str] = None

class BrainDumpCreate(BaseModel):
    content: str

class BrainDump(BaseModel):
    dump_id: str
    user_id: str
    content: str
    created_at: str

class BrainDumpUpdate(BaseModel):
    content: str

class CheckoutRequest(BaseModel):
    origin_url: str

class SessionRequest(BaseModel):
    session_id: str

# ============== AUTH HELPERS ==============

async def get_current_user(request: Request) -> dict:
    """Get current user from session token in cookie or Authorization header"""
    session_token = request.cookies.get("session_token")
    
    if not session_token:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            session_token = auth_header.split(" ")[1]
    
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    session_doc = await db.user_sessions.find_one(
        {"session_token": session_token},
        {"_id": 0}
    )
    
    if not session_doc:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # Check expiry with timezone awareness
    expires_at = session_doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at.replace('Z', '+00:00'))
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    
    user_doc = await db.users.find_one(
        {"user_id": session_doc["user_id"]},
        {"_id": 0}
    )
    
    if not user_doc:
        raise HTTPException(status_code=401, detail="User not found")
    
    return user_doc

# ============== AUTH ENDPOINTS ==============

@api_router.post("/auth/session")
async def exchange_session(request: SessionRequest, response: Response):
    """Exchange Emergent OAuth session_id for session data and create local session"""
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.get(
                "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                headers={"X-Session-ID": request.session_id}
            )
            
            if resp.status_code != 200:
                raise HTTPException(status_code=401, detail="Invalid session ID")
            
            oauth_data = resp.json()
    except Exception as e:
        logger.error(f"OAuth session exchange failed: {e}")
        raise HTTPException(status_code=401, detail="Failed to validate session")
    
    email = oauth_data.get("email")
    name = oauth_data.get("name", email.split("@")[0])
    picture = oauth_data.get("picture")
    session_token = oauth_data.get("session_token")
    
    # Check if user exists
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    
    if existing_user:
        user_id = existing_user["user_id"]
        # Update user info if needed
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"name": name, "avatar_url": picture}}
        )
    else:
        # Create new user
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        user_doc = {
            "user_id": user_id,
            "email": email,
            "name": name,
            "avatar_url": picture,
            "plan": "free",
            "streak_count": 0,
            "last_active_date": None,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.users.insert_one(user_doc)
    
    # Create session
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)
    session_doc = {
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": expires_at.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    # Remove old sessions for this user
    await db.user_sessions.delete_many({"user_id": user_id})
    await db.user_sessions.insert_one(session_doc)
    
    # Set cookie
    response.set_cookie(
        key="session_token",
        value=session_token,
        httponly=True,
        secure=True,
        samesite="none",
        path="/",
        max_age=7 * 24 * 60 * 60
    )
    
    # Update streak
    await update_user_streak(user_id, completed_task=False)
    
    # Get updated user
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    
    return user

@api_router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current authenticated user"""
    return user

@api_router.post("/auth/logout")
async def logout(response: Response, request: Request):
    """Logout user and clear session"""
    session_token = request.cookies.get("session_token")
    if session_token:
        await db.user_sessions.delete_one({"session_token": session_token})
    
    response.delete_cookie(key="session_token", path="/", secure=True, samesite="none")
    return {"message": "Logged out successfully"}

# ============== STREAK HELPER ==============

async def update_user_streak(user_id: str, completed_task: bool = False):
    """Update user streak based on task completion"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return
    
    today = datetime.now(timezone.utc).date().isoformat()
    last_active = user.get("last_active_date")
    last_completed = user.get("last_task_completed_date")
    streak = user.get("streak_count", 0)
    
    # Streak only increments when completing a task
    if completed_task:
        if last_completed:
            last_completed_date = datetime.fromisoformat(last_completed).date()
            today_date = datetime.now(timezone.utc).date()
            diff = (today_date - last_completed_date).days
            
            if diff == 0:
                # Already completed task today, no streak change
                pass
            elif diff == 1:
                # Consecutive day with task completion
                streak += 1
            else:
                # Streak broken, start fresh
                streak = 1
        else:
            # First task ever
            streak = 1
        
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {
                "streak_count": streak, 
                "last_active_date": today,
                "last_task_completed_date": today
            }}
        )
    else:
        # Just update last active (login/visit)
        await db.users.update_one(
            {"user_id": user_id},
            {"$set": {"last_active_date": today}}
        )
    
    return streak

async def check_streak_status(user_id: str) -> dict:
    """Check if user needs to complete a task today to keep streak"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return {"streak": 0, "needs_task_today": True, "completed_today": False}
    
    today = datetime.now(timezone.utc).date().isoformat()
    last_completed = user.get("last_task_completed_date")
    streak = user.get("streak_count", 0)
    
    completed_today = last_completed == today if last_completed else False
    
    # Check if streak is at risk
    needs_task_today = not completed_today and streak > 0
    
    return {
        "streak": streak,
        "needs_task_today": needs_task_today,
        "completed_today": completed_today
    }

# ============== AI TASK PARSER ==============

@api_router.post("/tasks/parse")
async def parse_and_create_task(task_input: TaskCreate, user: dict = Depends(get_current_user)):
    """Parse natural language input using AI and create task"""
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    
    api_key = os.environ.get("EMERGENT_LLM_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="LLM API key not configured")
    
    chat = LlmChat(
        api_key=api_key,
        session_id=f"parse_{uuid.uuid4().hex[:8]}",
        system_message="""You are a task parser for an ADHD-friendly task manager. 
Parse the user's input into a structured task. Return ONLY valid JSON with these fields:
- title: A clean, actionable task title (string)
- due_date: ISO 8601 datetime string if a date/time is mentioned, otherwise null
- priority: "high", "medium", or "low" based on urgency cues
- type: "task" for action items, "reminder" for time-based alerts, "note" for thoughts
- emoji: A single relevant emoji for the task

Examples:
Input: "call dentist next Tuesday"
Output: {"title": "Call dentist", "due_date": "2026-01-13T09:00:00Z", "priority": "medium", "type": "reminder", "emoji": "🦷"}

Input: "URGENT: finish report by Friday 5pm"
Output: {"title": "Finish report", "due_date": "2026-01-09T17:00:00Z", "priority": "high", "type": "task", "emoji": "📄"}

Input: "maybe try that new coffee shop"
Output: {"title": "Try the new coffee shop", "due_date": null, "priority": "low", "type": "note", "emoji": "☕"}

Today's date is """ + datetime.now(timezone.utc).strftime("%Y-%m-%d") + ". Respond with ONLY the JSON object, no explanation."
    ).with_model("openai", "gpt-4o-mini")
    
    try:
        user_message = UserMessage(text=task_input.raw_input)
        response = await chat.send_message(user_message)
        
        # Parse JSON response
        response_text = response.strip()
        if response_text.startswith("```"):
            response_text = response_text.split("```")[1]
            if response_text.startswith("json"):
                response_text = response_text[4:]
        response_text = response_text.strip()
        
        parsed = json.loads(response_text)
        
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse LLM response: {response}")
        # Fallback to basic parsing
        parsed = {
            "title": task_input.raw_input[:100],
            "due_date": None,
            "priority": "medium",
            "type": "task",
            "emoji": "📝"
        }
    except Exception as e:
        logger.error(f"LLM parsing error: {e}")
        parsed = {
            "title": task_input.raw_input[:100],
            "due_date": None,
            "priority": "medium",
            "type": "task",
            "emoji": "📝"
        }
    
    # Create task document
    task_id = f"task_{uuid.uuid4().hex[:12]}"
    task_doc = {
        "task_id": task_id,
        "user_id": user["user_id"],
        "raw_input": task_input.raw_input,
        "title": parsed.get("title", task_input.raw_input[:100]),
        "due_date": parsed.get("due_date"),
        "priority": parsed.get("priority", "medium"),
        "type": parsed.get("type", "task"),
        "emoji": parsed.get("emoji", "📝"),
        "status": "active",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "completed_at": None
    }
    
    await db.tasks.insert_one(task_doc)
    
    # Update streak
    await update_user_streak(user["user_id"])
    
    # Return without _id
    if "_id" in task_doc:
        del task_doc["_id"]
    return task_doc

# ============== TASKS CRUD ==============

@api_router.get("/tasks", response_model=List[Task])
async def get_tasks(status: Optional[str] = None, user: dict = Depends(get_current_user)):
    """Get all tasks for current user"""
    query = {"user_id": user["user_id"]}
    if status:
        query["status"] = status
    
    tasks = await db.tasks.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)
    return tasks

@api_router.patch("/tasks/{task_id}")
async def update_task(task_id: str, update: TaskUpdate, user: dict = Depends(get_current_user)):
    """Update a task"""
    task = await db.tasks.find_one(
        {"task_id": task_id, "user_id": user["user_id"]},
        {"_id": 0}
    )
    
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    
    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    
    # Track if this is a new completion
    is_new_completion = (
        update_data.get("status") == "done" and 
        task.get("status") != "done"
    )
    
    if update_data.get("status") == "done":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    if update_data:
        await db.tasks.update_one(
            {"task_id": task_id},
            {"$set": update_data}
        )
    
    # Update streak if task was just completed
    if is_new_completion:
        await update_user_streak(user["user_id"], completed_task=True)
    
    updated = await db.tasks.find_one({"task_id": task_id}, {"_id": 0})
    return updated

@api_router.delete("/tasks/{task_id}")
async def delete_task(task_id: str, user: dict = Depends(get_current_user)):
    """Delete a task"""
    result = await db.tasks.delete_one(
        {"task_id": task_id, "user_id": user["user_id"]}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Task not found")
    
    return {"message": "Task deleted"}

# ============== DASHBOARD DATA ==============

@api_router.get("/dashboard")
async def get_dashboard_data(user: dict = Depends(get_current_user)):
    """Get all dashboard data in one request"""
    user_id = user["user_id"]
    today = datetime.now(timezone.utc).date()
    today_str = today.isoformat()
    tomorrow = today + timedelta(days=1)
    
    # Get streak status
    streak_status = await check_streak_status(user_id)
    
    # Get all active tasks
    all_tasks = await db.tasks.find(
        {"user_id": user_id, "status": "active"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    
    # Separate today's tasks and upcoming
    today_tasks = []
    upcoming_tasks = []
    no_date_tasks = []
    
    for task in all_tasks:
        if task.get("due_date"):
            try:
                due = datetime.fromisoformat(task["due_date"].replace('Z', '+00:00')).date()
                if due <= today:
                    today_tasks.append(task)
                else:
                    upcoming_tasks.append(task)
            except:
                no_date_tasks.append(task)
        else:
            no_date_tasks.append(task)
    
    # Sort by priority (high > medium > low)
    priority_order = {"high": 0, "medium": 1, "low": 2}
    today_tasks.sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 1))
    upcoming_tasks.sort(key=lambda x: x.get("due_date", "9999"))
    
    # Add tasks without dates to today (they're immediate)
    today_tasks = today_tasks + no_date_tasks
    today_tasks.sort(key=lambda x: priority_order.get(x.get("priority", "medium"), 1))
    
    # Get most urgent task for Focus Mode
    most_urgent = today_tasks[0] if today_tasks else (upcoming_tasks[0] if upcoming_tasks else None)
    
    # Count active tasks for free plan limit
    active_count = len(all_tasks)
    
    # Get brain dumps (last 3 days for free, all for pro)
    if user.get("plan") == "pro":
        dumps = await db.brain_dumps.find(
            {"user_id": user_id},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    else:
        three_days_ago = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
        dumps = await db.brain_dumps.find(
            {"user_id": user_id, "created_at": {"$gte": three_days_ago}},
            {"_id": 0}
        ).sort("created_at", -1).to_list(50)
    
    return {
        "user": user,
        "streak": streak_status,
        "today_tasks": today_tasks[:3],  # Max 3 for Today's Focus
        "today_overflow": len(today_tasks) - 3 if len(today_tasks) > 3 else 0,
        "all_today_tasks": today_tasks,
        "upcoming_tasks": upcoming_tasks[:5],
        "most_urgent_task": most_urgent,
        "active_task_count": active_count,
        "is_at_limit": active_count >= 10 and user.get("plan") == "free",
        "brain_dumps": dumps
    }

@api_router.put("/brain-dumps/autosave")
async def autosave_brain_dump(dump: BrainDumpCreate, user: dict = Depends(get_current_user)):
    """Auto-save brain dump - updates or creates today's dump"""
    today = datetime.now(timezone.utc).date().isoformat()
    
    # Check for existing dump today
    existing = await db.brain_dumps.find_one(
        {
            "user_id": user["user_id"],
            "created_at": {"$regex": f"^{today}"}
        },
        {"_id": 0}
    )
    
    if existing:
        # Update existing
        await db.brain_dumps.update_one(
            {"dump_id": existing["dump_id"]},
            {"$set": {"content": dump.content, "updated_at": datetime.now(timezone.utc).isoformat()}}
        )
        updated = await db.brain_dumps.find_one({"dump_id": existing["dump_id"]}, {"_id": 0})
        return updated
    else:
        # Create new
        dump_id = f"dump_{uuid.uuid4().hex[:12]}"
        dump_doc = {
            "dump_id": dump_id,
            "user_id": user["user_id"],
            "content": dump.content,
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await db.brain_dumps.insert_one(dump_doc)
        if "_id" in dump_doc:
            del dump_doc["_id"]
        return dump_doc

# ============== BRAIN DUMPS ==============

@api_router.post("/brain-dumps", response_model=BrainDump)
async def create_brain_dump(dump: BrainDumpCreate, user: dict = Depends(get_current_user)):
    """Create a brain dump entry"""
    dump_id = f"dump_{uuid.uuid4().hex[:12]}"
    dump_doc = {
        "dump_id": dump_id,
        "user_id": user["user_id"],
        "content": dump.content,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.brain_dumps.insert_one(dump_doc)
    if "_id" in dump_doc:
        del dump_doc["_id"]
    return dump_doc

@api_router.get("/brain-dumps", response_model=List[BrainDump])
async def get_brain_dumps(user: dict = Depends(get_current_user)):
    """Get all brain dumps for current user"""
    dumps = await db.brain_dumps.find(
        {"user_id": user["user_id"]},
        {"_id": 0}
    ).sort("created_at", -1).to_list(100)
    return dumps

@api_router.patch("/brain-dumps/{dump_id}")
async def update_brain_dump(dump_id: str, update: BrainDumpUpdate, user: dict = Depends(get_current_user)):
    """Update a brain dump"""
    result = await db.brain_dumps.update_one(
        {"dump_id": dump_id, "user_id": user["user_id"]},
        {"$set": {"content": update.content}}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Brain dump not found")
    
    updated = await db.brain_dumps.find_one({"dump_id": dump_id}, {"_id": 0})
    return updated

@api_router.delete("/brain-dumps/{dump_id}")
async def delete_brain_dump(dump_id: str, user: dict = Depends(get_current_user)):
    """Delete a brain dump"""
    result = await db.brain_dumps.delete_one(
        {"dump_id": dump_id, "user_id": user["user_id"]}
    )
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Brain dump not found")
    
    return {"message": "Brain dump deleted"}

# ============== STRIPE SUBSCRIPTION ==============

PRO_PLAN_PRICE = 3.00  # Monthly price in USD

@api_router.post("/stripe/create-checkout-session")
async def create_stripe_checkout(checkout: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for Pro plan"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/stripe/webhook"
    
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    
    success_url = f"{checkout.origin_url}/dashboard?payment=success&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout.origin_url}/pricing"
    
    # Get or create Stripe customer ID
    user_doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    
    checkout_request = CheckoutSessionRequest(
        amount=PRO_PLAN_PRICE,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
            "user_email": user.get("email", ""),
            "plan": "pro"
        }
    )
    
    session = await stripe_checkout.create_checkout_session(checkout_request)
    
    # Create payment transaction record
    transaction_doc = {
        "transaction_id": f"txn_{uuid.uuid4().hex[:12]}",
        "user_id": user["user_id"],
        "session_id": session.session_id,
        "amount": PRO_PLAN_PRICE,
        "currency": "usd",
        "plan": "pro",
        "payment_status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.payment_transactions.insert_one(transaction_doc)
    
    return {"url": session.url, "session_id": session.session_id}

# Keep old endpoint for backward compatibility
@api_router.post("/subscriptions/checkout")
async def create_checkout_session(checkout: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for Pro plan (legacy endpoint)"""
    return await create_stripe_checkout(checkout, request, user)

@api_router.post("/stripe/webhook")
async def stripe_webhook_handler(request: Request):
    """Handle Stripe webhooks for subscription events"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        event_type = webhook_response.event_type
        logger.info(f"Stripe webhook received: {event_type}")
        
        user_id = webhook_response.metadata.get("user_id") if webhook_response.metadata else None
        
        # Handle checkout.session.completed
        if event_type == "checkout.session.completed" or webhook_response.payment_status == "paid":
            if user_id:
                # Update user plan to pro
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"plan": "pro"}}
                )
                
                # Update payment transaction
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}}
                )
                
                # Create or update subscription record
                existing_sub = await db.subscriptions.find_one({"user_id": user_id}, {"_id": 0})
                if existing_sub:
                    await db.subscriptions.update_one(
                        {"user_id": user_id},
                        {"$set": {
                            "status": "active",
                            "stripe_session_id": webhook_response.session_id,
                            "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                            "updated_at": datetime.now(timezone.utc).isoformat()
                        }}
                    )
                else:
                    subscription_doc = {
                        "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
                        "user_id": user_id,
                        "stripe_session_id": webhook_response.session_id,
                        "status": "active",
                        "plan": "pro",
                        "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                        "created_at": datetime.now(timezone.utc).isoformat()
                    }
                    await db.subscriptions.insert_one(subscription_doc)
                
                logger.info(f"User {user_id} upgraded to Pro")
        
        # Handle customer.subscription.deleted
        elif event_type == "customer.subscription.deleted":
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"plan": "free"}}
                )
                await db.subscriptions.update_one(
                    {"user_id": user_id},
                    {"$set": {"status": "canceled", "canceled_at": datetime.now(timezone.utc).isoformat()}}
                )
                logger.info(f"User {user_id} subscription canceled")
        
        # Handle invoice.payment_failed
        elif event_type == "invoice.payment_failed":
            if user_id:
                await db.subscriptions.update_one(
                    {"user_id": user_id},
                    {"$set": {"status": "past_due", "updated_at": datetime.now(timezone.utc).isoformat()}}
                )
                logger.info(f"User {user_id} payment failed - subscription past_due")
        
        return {"status": "ok", "event": event_type}
        
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        # Return 200 to prevent Stripe from retrying
        return {"status": "error", "message": str(e)}

# Keep old webhook endpoint for backward compatibility
@api_router.post("/webhook/stripe")
async def stripe_webhook_legacy(request: Request):
    """Handle Stripe webhooks (legacy endpoint)"""
    return await stripe_webhook_handler(request)

@api_router.get("/stripe/portal")
async def create_customer_portal(request: Request, user: dict = Depends(get_current_user)):
    """Create Stripe Customer Portal session for managing subscription"""
    import stripe
    
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    stripe.api_key = api_key
    
    # Get user's subscription to find customer ID
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": {"$in": ["active", "past_due"]}},
        {"_id": 0}
    )
    
    if not subscription:
        raise HTTPException(status_code=400, detail="No active subscription found")
    
    # Get stripe customer ID from the checkout session
    stripe_session_id = subscription.get("stripe_session_id")
    if not stripe_session_id:
        raise HTTPException(status_code=400, detail="No Stripe session found")
    
    try:
        # Retrieve the checkout session to get customer ID
        checkout_session = stripe.checkout.Session.retrieve(stripe_session_id)
        customer_id = checkout_session.customer
        
        if not customer_id:
            raise HTTPException(status_code=400, detail="No customer found for this subscription")
        
        # Get the origin URL from referer or use default
        origin = request.headers.get("referer", "").split("/api")[0]
        if not origin:
            origin = str(request.base_url).rstrip("/").replace("/api", "")
        
        # Create portal session
        portal_session = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=f"{origin}/dashboard"
        )
        
        return {"url": portal_session.url}
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe portal error: {e}")
        raise HTTPException(status_code=500, detail="Failed to create customer portal session")

@api_router.get("/subscriptions/status/{session_id}")
async def get_checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    """Check status of a checkout session"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    
    try:
        status = await stripe_checkout.get_checkout_status(session_id)
    except Exception as e:
        logger.error(f"Checkout status error: {e}")
        raise HTTPException(status_code=404, detail="Checkout session not found or expired")
    
    # Update transaction and user plan if paid
    if status.payment_status == "paid":
        # Check if already processed
        transaction = await db.payment_transactions.find_one(
            {"session_id": session_id},
            {"_id": 0}
        )
        
        if transaction and transaction.get("payment_status") != "paid":
            # Update transaction
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"payment_status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}}
            )
            
            # Update user plan
            await db.users.update_one(
                {"user_id": user["user_id"]},
                {"$set": {"plan": "pro"}}
            )
            
            # Create subscription record
            existing_sub = await db.subscriptions.find_one({"user_id": user["user_id"]}, {"_id": 0})
            if not existing_sub:
                subscription_doc = {
                    "subscription_id": f"sub_{uuid.uuid4().hex[:12]}",
                    "user_id": user["user_id"],
                    "stripe_session_id": session_id,
                    "status": "active",
                    "plan": "pro",
                    "current_period_end": (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                    "created_at": datetime.now(timezone.utc).isoformat()
                }
                await db.subscriptions.insert_one(subscription_doc)
    
    return {
        "status": status.status,
        "payment_status": status.payment_status,
        "amount_total": status.amount_total,
        "currency": status.currency
    }

@api_router.get("/subscriptions/current")
async def get_current_subscription(user: dict = Depends(get_current_user)):
    """Get current user's subscription"""
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": {"$in": ["active", "past_due"]}},
        {"_id": 0}
    )
    return subscription

# ============== USER PROFILE ==============

@api_router.get("/profile")
async def get_profile(user: dict = Depends(get_current_user)):
    """Get user profile with stats"""
    # Get task stats
    total_tasks = await db.tasks.count_documents({"user_id": user["user_id"]})
    completed_tasks = await db.tasks.count_documents({"user_id": user["user_id"], "status": "done"})
    
    # Get subscription
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": "active"},
        {"_id": 0}
    )
    
    return {
        **user,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "subscription": subscription
    }

# ============== BASE ROUTES ==============

@api_router.get("/")
async def root():
    return {"message": "FocusNote API", "version": "1.0.0"}

@api_router.get("/health")
async def health():
    return {"status": "healthy"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
