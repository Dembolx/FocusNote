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
    await update_user_streak(user_id)
    
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

async def update_user_streak(user_id: str):
    """Update user streak based on last active date"""
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0})
    if not user:
        return
    
    today = datetime.now(timezone.utc).date().isoformat()
    last_active = user.get("last_active_date")
    streak = user.get("streak_count", 0)
    
    if last_active:
        last_date = datetime.fromisoformat(last_active).date()
        today_date = datetime.now(timezone.utc).date()
        diff = (today_date - last_date).days
        
        if diff == 0:
            # Same day, no change
            pass
        elif diff == 1:
            # Consecutive day, increase streak
            streak += 1
        else:
            # Streak broken, reset to 1
            streak = 1
    else:
        streak = 1
    
    await db.users.update_one(
        {"user_id": user_id},
        {"$set": {"streak_count": streak, "last_active_date": today}}
    )

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
    
    if update_data.get("status") == "done":
        update_data["completed_at"] = datetime.now(timezone.utc).isoformat()
    
    if update_data:
        await db.tasks.update_one(
            {"task_id": task_id},
            {"$set": update_data}
        )
    
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

PRO_PLAN_PRICE = 9.99  # Monthly price in USD

@api_router.post("/subscriptions/checkout")
async def create_checkout_session(checkout: CheckoutRequest, request: Request, user: dict = Depends(get_current_user)):
    """Create Stripe checkout session for Pro plan"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout, CheckoutSessionRequest
    
    api_key = os.environ.get("STRIPE_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe not configured")
    
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url=webhook_url)
    
    success_url = f"{checkout.origin_url}/dashboard?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{checkout.origin_url}/dashboard"
    
    checkout_request = CheckoutSessionRequest(
        amount=PRO_PLAN_PRICE,
        currency="usd",
        success_url=success_url,
        cancel_url=cancel_url,
        metadata={
            "user_id": user["user_id"],
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

@api_router.get("/subscriptions/status/{session_id}")
async def get_checkout_status(session_id: str, user: dict = Depends(get_current_user)):
    """Check status of a checkout session"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    
    status = await stripe_checkout.get_checkout_status(session_id)
    
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

@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """Handle Stripe webhooks"""
    from emergentintegrations.payments.stripe.checkout import StripeCheckout
    
    api_key = os.environ.get("STRIPE_API_KEY")
    stripe_checkout = StripeCheckout(api_key=api_key, webhook_url="")
    
    body = await request.body()
    signature = request.headers.get("Stripe-Signature")
    
    try:
        webhook_response = await stripe_checkout.handle_webhook(body, signature)
        logger.info(f"Stripe webhook: {webhook_response.event_type}")
        
        if webhook_response.payment_status == "paid":
            user_id = webhook_response.metadata.get("user_id")
            if user_id:
                await db.users.update_one(
                    {"user_id": user_id},
                    {"$set": {"plan": "pro"}}
                )
                await db.payment_transactions.update_one(
                    {"session_id": webhook_response.session_id},
                    {"$set": {"payment_status": "paid"}}
                )
        
        return {"status": "ok"}
    except Exception as e:
        logger.error(f"Webhook error: {e}")
        return {"status": "error", "message": str(e)}

@api_router.get("/subscriptions/current")
async def get_current_subscription(user: dict = Depends(get_current_user)):
    """Get current user's subscription"""
    subscription = await db.subscriptions.find_one(
        {"user_id": user["user_id"], "status": "active"},
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
