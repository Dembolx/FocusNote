# Auth Testing Playbook for FocusNote

## Step 1: Create Test User & Session
```bash
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({
  user_id: userId,
  email: 'test.user.' + Date.now() + '@example.com',
  name: 'Test User',
  avatar_url: 'https://via.placeholder.com/150',
  plan: 'free',
  streak_count: 3,
  last_active_date: null,
  created_at: new Date().toISOString()
});
db.user_sessions.insertOne({
  user_id: userId,
  session_token: sessionToken,
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
});
print('Session token: ' + sessionToken);
print('User ID: ' + userId);
"
```

## Step 2: Test Backend API
```bash
# Test auth endpoint
curl -X GET "https://focus-minimal-app.preview.emergentagent.com/api/auth/me" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"

# Test create task
curl -X POST "https://focus-minimal-app.preview.emergentagent.com/api/tasks/parse" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  -d '{"raw_input": "call dentist next Tuesday"}'

# Test get tasks
curl -X GET "https://focus-minimal-app.preview.emergentagent.com/api/tasks" \
  -H "Authorization: Bearer YOUR_SESSION_TOKEN"
```

## Step 3: Browser Testing
```javascript
// Set cookie and navigate
await page.context.add_cookies([{
    "name": "session_token",
    "value": "YOUR_SESSION_TOKEN",
    "domain": "focus-minimal-app.preview.emergentagent.com",
    "path": "/",
    "httpOnly": true,
    "secure": true,
    "sameSite": "None"
}]);
await page.goto("https://focus-minimal-app.preview.emergentagent.com/dashboard");
```

## Authentication Method
- Google OAuth via Emergent Auth (https://auth.emergentagent.com)
- Session stored in httpOnly cookie
- 7-day session expiry

## Success Indicators
✅ /api/auth/me returns user data
✅ Dashboard loads without redirect
✅ Tasks CRUD operations work
✅ Brain Dumps CRUD works
