#!/usr/bin/env python3

import requests
import sys
import json
import time
from datetime import datetime

class FocusNoteAPITester:
    def __init__(self, base_url="https://focus-minimal-app.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []

    def log_test(self, name, success, details=""):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "test": name,
            "success": success,
            "details": details
        })

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}/{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if not success:
                details += f", Expected: {expected_status}"
                try:
                    error_data = response.json()
                    details += f", Response: {error_data}"
                except:
                    details += f", Response: {response.text[:200]}"

            self.log_test(name, success, details)
            
            if success:
                try:
                    return response.json()
                except:
                    return {}
            return None

        except Exception as e:
            self.log_test(name, False, f"Error: {str(e)}")
            return None

    def create_test_user(self):
        """Create test user and session using mongosh"""
        print("\n🔧 Creating test user and session...")
        
        timestamp = int(time.time())
        user_id = f"test-user-{timestamp}"
        session_token = f"test_session_{timestamp}"
        
        mongosh_command = f"""
mongosh --eval "
use('test_database');
db.users.insertOne({{
  user_id: '{user_id}',
  email: 'test.user.{timestamp}@example.com',
  name: 'Test User',
  avatar_url: 'https://via.placeholder.com/150',
  plan: 'free',
  streak_count: 3,
  last_active_date: null,
  created_at: new Date().toISOString()
}});
db.user_sessions.insertOne({{
  user_id: '{user_id}',
  session_token: '{session_token}',
  expires_at: new Date(Date.now() + 7*24*60*60*1000).toISOString(),
  created_at: new Date().toISOString()
}});
print('Test user created successfully');
"
"""
        
        import subprocess
        try:
            result = subprocess.run(mongosh_command, shell=True, capture_output=True, text=True, timeout=30)
            if result.returncode == 0:
                self.session_token = session_token
                self.user_id = user_id
                print(f"✅ Test user created: {user_id}")
                print(f"✅ Session token: {session_token}")
                return True
            else:
                print(f"❌ Failed to create test user: {result.stderr}")
                return False
        except Exception as e:
            print(f"❌ Error creating test user: {e}")
            return False

    def test_health_endpoints(self):
        """Test basic health endpoints"""
        print("\n🏥 Testing Health Endpoints...")
        self.run_test("API Root", "GET", "", 200)
        self.run_test("Health Check", "GET", "health", 200)

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔐 Testing Auth Endpoints...")
        
        # Test /me endpoint with valid session
        if self.session_token:
            user_data = self.run_test("Get Current User", "GET", "auth/me", 200)
            if user_data and user_data.get("user_id") == self.user_id:
                print(f"   User data: {user_data.get('name')} ({user_data.get('email')})")
        
        # Test /me without auth (should fail)
        temp_token = self.session_token
        self.session_token = None
        self.run_test("Get User (No Auth)", "GET", "auth/me", 401)
        self.session_token = temp_token

    def test_task_endpoints(self):
        """Test task management endpoints"""
        print("\n📝 Testing Task Endpoints...")
        
        if not self.session_token:
            print("❌ No session token, skipping task tests")
            return
        
        # Test AI task parsing
        task_data = self.run_test(
            "AI Task Parser", 
            "POST", 
            "tasks/parse", 
            200,
            {"raw_input": "call dentist next Tuesday at 2pm"}
        )
        
        task_id = None
        if task_data:
            task_id = task_data.get("task_id")
            print(f"   Created task: {task_data.get('title')} ({task_data.get('emoji')})")
            print(f"   Priority: {task_data.get('priority')}, Due: {task_data.get('due_date')}")
        
        # Test get tasks
        tasks = self.run_test("Get Tasks", "GET", "tasks", 200)
        if tasks:
            print(f"   Found {len(tasks)} tasks")
        
        # Test task update
        if task_id:
            self.run_test(
                "Update Task Status", 
                "PATCH", 
                f"tasks/{task_id}", 
                200,
                {"status": "done"}
            )
        
        # Test get completed tasks
        self.run_test("Get Completed Tasks", "GET", "tasks?status=done", 200)
        
        # Test task deletion
        if task_id:
            self.run_test("Delete Task", "DELETE", f"tasks/{task_id}", 200)

    def test_brain_dump_endpoints(self):
        """Test brain dump endpoints"""
        print("\n🧠 Testing Brain Dump Endpoints...")
        
        if not self.session_token:
            print("❌ No session token, skipping brain dump tests")
            return
        
        # Create brain dump
        dump_data = self.run_test(
            "Create Brain Dump",
            "POST",
            "brain-dumps",
            200,
            {"content": "This is a test brain dump with random thoughts and ideas"}
        )
        
        dump_id = None
        if dump_data:
            dump_id = dump_data.get("dump_id")
            print(f"   Created dump: {dump_data.get('content')[:50]}...")
        
        # Get brain dumps
        dumps = self.run_test("Get Brain Dumps", "GET", "brain-dumps", 200)
        if dumps:
            print(f"   Found {len(dumps)} brain dumps")
        
        # Update brain dump
        if dump_id:
            self.run_test(
                "Update Brain Dump",
                "PATCH",
                f"brain-dumps/{dump_id}",
                200,
                {"content": "Updated brain dump content"}
            )
        
        # Delete brain dump
        if dump_id:
            self.run_test("Delete Brain Dump", "DELETE", f"brain-dumps/{dump_id}", 200)

    def test_profile_endpoint(self):
        """Test profile endpoint"""
        print("\n👤 Testing Profile Endpoint...")
        
        if not self.session_token:
            print("❌ No session token, skipping profile test")
            return
        
        profile = self.run_test("Get Profile", "GET", "profile", 200)
        if profile:
            print(f"   Profile: {profile.get('name')} ({profile.get('email')})")
            print(f"   Plan: {profile.get('plan')}, Streak: {profile.get('streak_count')}")
            print(f"   Tasks: {profile.get('total_tasks')}, Completed: {profile.get('completed_tasks')}")

    def test_subscription_endpoints(self):
        """Test subscription endpoints"""
        print("\n💳 Testing Subscription Endpoints...")
        
        if not self.session_token:
            print("❌ No session token, skipping subscription tests")
            return
        
        # Test checkout creation
        checkout_data = self.run_test(
            "Create Checkout Session",
            "POST",
            "subscriptions/checkout",
            200,
            {"origin_url": "https://focus-minimal-app.preview.emergentagent.com"}
        )
        
        if checkout_data:
            session_id = checkout_data.get("session_id")
            print(f"   Checkout URL: {checkout_data.get('url')[:50]}...")
            
            # Test checkout status
            if session_id:
                self.run_test(
                    "Get Checkout Status",
                    "GET",
                    f"subscriptions/status/{session_id}",
                    200
                )
        
        # Test current subscription
        self.run_test("Get Current Subscription", "GET", "subscriptions/current", 200)

    def test_error_handling(self):
        """Test error handling"""
        print("\n⚠️  Testing Error Handling...")
        
        # Test invalid endpoints
        self.run_test("Invalid Endpoint", "GET", "invalid/endpoint", 404)
        
        if self.session_token:
            # Test invalid task operations
            self.run_test("Get Invalid Task", "GET", "tasks/invalid-task-id", 404)
            self.run_test("Delete Invalid Task", "DELETE", "tasks/invalid-task-id", 404)
            self.run_test("Get Invalid Brain Dump", "GET", "brain-dumps/invalid-dump-id", 404)

    def run_all_tests(self):
        """Run all tests"""
        print("🚀 Starting FocusNote API Tests...")
        print(f"🌐 Testing against: {self.base_url}")
        
        # Create test user first
        if not self.create_test_user():
            print("❌ Failed to create test user, some tests will be skipped")
        
        # Run all test suites
        self.test_health_endpoints()
        self.test_auth_endpoints()
        self.test_task_endpoints()
        self.test_brain_dump_endpoints()
        self.test_profile_endpoint()
        self.test_subscription_endpoints()
        self.test_error_handling()
        
        # Print summary
        print(f"\n📊 Test Summary:")
        print(f"   Tests run: {self.tests_run}")
        print(f"   Tests passed: {self.tests_passed}")
        print(f"   Success rate: {(self.tests_passed/self.tests_run*100):.1f}%")
        
        # Return results for further processing
        return {
            "total_tests": self.tests_run,
            "passed_tests": self.tests_passed,
            "success_rate": self.tests_passed/self.tests_run*100 if self.tests_run > 0 else 0,
            "test_results": self.test_results,
            "session_token": self.session_token,
            "user_id": self.user_id
        }

def main():
    tester = FocusNoteAPITester()
    results = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if results["success_rate"] < 80:
        print(f"\n❌ Test suite failed with {results['success_rate']:.1f}% success rate")
        return 1
    else:
        print(f"\n✅ Test suite passed with {results['success_rate']:.1f}% success rate")
        return 0

if __name__ == "__main__":
    sys.exit(main())