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
- [x] AI task parser - natural language to structured task
- [x] Tasks CRUD with priority, due date, type, emoji
- [x] Task completion/done tracking
- [x] Brain Dumps - freeform textarea section
- [x] User profile with stats
- [x] Streak tracking

### Payments
- [x] Stripe checkout integration
- [x] Pro plan subscription flow ($9.99/month)
- [x] Payment status polling

### Design
- [x] ADHD-friendly calming design
- [x] Lavender accent colors (#7F77DD, #534AB7)
- [x] Inter + Outfit fonts
- [x] No red notifications/anxiety triggers
- [x] Responsive design

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
