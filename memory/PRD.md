# FocusNote - Product Requirements Document

## Original Problem Statement
Build a full-stack web app called FocusNote — a minimal AI-powered task manager designed specifically for people with ADHD.

## User Personas
1. **Primary**: Adults with ADHD who struggle with traditional task managers
2. **Secondary**: Anyone seeking a calm, minimalist task management experience

## Core Requirements
- AI-powered task input parser using GPT-4o-mini
- Google OAuth authentication via Emergent Auth
- Brain Dumps section for freeform thoughts
- Stripe subscription for Pro plan ($9.99/month)
- Streak tracking for motivation
- ADHD-friendly design (calming colors, no anxiety triggers)

## Tech Stack
- **Frontend**: React with Tailwind CSS
- **Backend**: FastAPI (Python)
- **Database**: MongoDB
- **Auth**: Emergent OAuth (Google)
- **AI**: GPT-4o-mini via Emergent LLM Key
- **Payments**: Stripe (test mode)

## What's Been Implemented (Jan 2026)

### Authentication
- [x] Google OAuth via Emergent Auth
- [x] Session management with httpOnly cookies
- [x] Protected routes

### Core Features
- [x] AI task parser - natural language to structured task (GPT-4o-mini)
- [x] Tasks CRUD with priority, due date, type, emoji
- [x] Task completion/done tracking with animations
- [x] Brain Dumps - freeform textarea section with auto-save (3 sec)
- [x] User profile with stats
- [x] Streak tracking (increments on task completion)

### Enhanced Dashboard (Jan 2026)
- [x] ADHD-optimized layout with generous whitespace
- [x] Top bar: Logo + Streak counter (🔥 X days) + User avatar
- [x] Large centered input with lavender focus border
- [x] Today's Focus: Max 3 tasks, priority sorted, "+ X more" overflow
- [x] Focus Mode: Full-screen overlay (Pro only, locked for free)
- [x] Upcoming section: Next 5 tasks grouped by date
- [x] Brain Dump: Collapsible, auto-saves every 3 seconds
- [x] Streak warning: "Keep your streak alive!" if no task today
- [x] Task completion: Green checkmark animation (dopamine hit)

### Free Plan Limits
- [x] Max 10 active tasks - upgrade banner at limit
- [x] No Focus Mode - shows locked state
- [x] Brain dump shows only last 3 days

### Payments (Jan 2026 - Updated)
- [x] Stripe checkout integration ($3/month Pro plan)
- [x] POST /api/stripe/create-checkout-session
- [x] POST /api/stripe/webhook (handles checkout.session.completed, customer.subscription.deleted, invoice.payment_failed)
- [x] GET /api/stripe/portal (Customer Portal for managing/canceling)
- [x] /pricing page with Free vs Pro comparison
- [x] Payment status polling
- [x] Success toast: "Welcome to Pro! You're unstoppable. 🚀"

## Database Schema (MongoDB Collections)
- `users` - user profiles, plan, streak
- `tasks` - parsed tasks with metadata
- `brain_dumps` - freeform thought entries
- `subscriptions` - Pro plan subscriptions
- `user_sessions` - auth sessions
- `payment_transactions` - Stripe transactions

## API Endpoints
- `POST /api/auth/session` - Exchange OAuth session
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout
- `POST /api/tasks/parse` - AI parse & create task
- `GET /api/tasks` - List user tasks
- `PATCH /api/tasks/{id}` - Update task
- `DELETE /api/tasks/{id}` - Delete task
- `POST /api/brain-dumps` - Create brain dump
- `GET /api/brain-dumps` - List brain dumps
- `DELETE /api/brain-dumps/{id}` - Delete brain dump
- `GET /api/profile` - User profile with stats
- `POST /api/subscriptions/checkout` - Start Stripe checkout
- `GET /api/subscriptions/status/{id}` - Check payment status

## Prioritized Backlog

### P0 (Critical) - DONE
- [x] Core task management
- [x] AI parsing
- [x] Authentication
- [x] Brain dumps

### P1 (High Priority) - Future
- [ ] Email/password auth fallback
- [ ] Task snooze functionality
- [ ] Task reminders/notifications
- [ ] Recurring tasks

### P2 (Medium Priority) - Future
- [ ] Dark mode theme
- [ ] Task categories/tags
- [ ] Weekly/monthly task summary
- [ ] Export data feature

### P3 (Low Priority) - Future
- [ ] Mobile app (React Native)
- [ ] Team/sharing features
- [ ] Integrations (calendar, etc.)

## Next Tasks
1. Add email/password authentication as fallback
2. Implement task snooze functionality
3. Add push notifications for reminders
4. Create onboarding flow for new users
