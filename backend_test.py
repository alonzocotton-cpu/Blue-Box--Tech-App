#!/usr/bin/env python3
"""
BBA Tech Backend Testing for Apple App Store Review Requirements
Tests all critical endpoints for App Store compliance and user registration/login flows.
"""

import asyncio
import httpx
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

class BBABackendTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.results = []
        self.failed_tests = []
        
    async def close(self):
        await self.client.aclose()
    
    def log_result(self, test_name, success, status_code, details="", expected_status=200):
        result = {
            "test": test_name,
            "success": success,
            "status_code": status_code,
            "expected_status": expected_status,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.results.append(result)
        
        status_icon = "✅" if success else "❌"
        print(f"{status_icon} {test_name}: {status_code} - {details}")
        
        if not success:
            self.failed_tests.append(test_name)
    
    async def test_head_support(self):
        """Test 1: HEAD /api/support - Apple checks support URL availability via HEAD"""
        try:
            response = await self.client.head(f"{BACKEND_URL}/support")
            success = response.status_code == 200
            self.log_result(
                "HEAD /api/support", 
                success, 
                response.status_code,
                "Support URL HEAD check for Apple App Store compliance",
                200
            )
        except Exception as e:
            self.log_result("HEAD /api/support", False, 0, f"Exception: {str(e)}")
    
    async def test_get_support(self):
        """Test 2: GET /api/support - Full page load"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/support")
            success = response.status_code == 200 and "BBA Tech Support" in response.text
            details = f"Status: {response.status_code}, Contains 'BBA Tech Support': {'BBA Tech Support' in response.text}"
            self.log_result(
                "GET /api/support", 
                success, 
                response.status_code,
                details,
                200
            )
        except Exception as e:
            self.log_result("GET /api/support", False, 0, f"Exception: {str(e)}")
    
    async def test_head_privacy_policy(self):
        """Test 3: HEAD /api/privacy-policy"""
        try:
            response = await self.client.head(f"{BACKEND_URL}/privacy-policy")
            success = response.status_code == 200
            self.log_result(
                "HEAD /api/privacy-policy", 
                success, 
                response.status_code,
                "Privacy policy HEAD check",
                200
            )
        except Exception as e:
            self.log_result("HEAD /api/privacy-policy", False, 0, f"Exception: {str(e)}")
    
    async def test_head_terms(self):
        """Test 4: HEAD /api/terms"""
        try:
            response = await self.client.head(f"{BACKEND_URL}/terms")
            success = response.status_code == 200
            self.log_result(
                "HEAD /api/terms", 
                success, 
                response.status_code,
                "Terms of service HEAD check",
                200
            )
        except Exception as e:
            self.log_result("HEAD /api/terms", False, 0, f"Exception: {str(e)}")
    
    async def test_register_new_user(self):
        """Test 5: POST /api/auth/register - New user registration"""
        try:
            test_data = {
                "full_name": "Test User",
                "email": "testuser123@example.com",
                "password": "TestPass123",
                "phone": "555-1234"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                success = (
                    data.get("success") == True and
                    data.get("technician", {}).get("full_name") == "Test User" and
                    data.get("technician", {}).get("email") == "testuser123@example.com" and
                    data.get("source") == "registered"
                )
                details += f", success: {data.get('success')}, technician.full_name: {data.get('technician', {}).get('full_name')}, source: {data.get('source')}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "POST /api/auth/register (new user)", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/register (new user)", False, 0, f"Exception: {str(e)}")
    
    async def test_register_duplicate_email(self):
        """Test 6: POST /api/auth/register - Duplicate email rejection"""
        try:
            test_data = {
                "full_name": "Dupe User",
                "email": "testuser123@example.com",
                "password": "TestPass123"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = response.status_code == 409 and "already exists" in response.text
            details = f"Status: {response.status_code}, Contains 'already exists': {'already exists' in response.text}"
            
            self.log_result(
                "POST /api/auth/register (duplicate email)", 
                success, 
                response.status_code,
                details,
                409
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/register (duplicate email)", False, 0, f"Exception: {str(e)}")
    
    async def test_register_missing_name(self):
        """Test 7: POST /api/auth/register - Validation: missing name"""
        try:
            test_data = {
                "full_name": "",
                "email": "a@b.com",
                "password": "Test123"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = response.status_code == 400
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/register (missing name)", 
                success, 
                response.status_code,
                details,
                400
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/register (missing name)", False, 0, f"Exception: {str(e)}")
    
    async def test_register_short_password(self):
        """Test 8: POST /api/auth/register - Validation: short password"""
        try:
            test_data = {
                "full_name": "Test",
                "email": "a@b.com",
                "password": "12"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = response.status_code == 400
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/register (short password)", 
                success, 
                response.status_code,
                details,
                400
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/register (short password)", False, 0, f"Exception: {str(e)}")
    
    async def test_login_registered_user(self):
        """Test 9: POST /api/auth/login - Login with registered account"""
        try:
            test_data = {
                "username": "testuser123@example.com",
                "password": "TestPass123"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                success = (
                    data.get("success") == True and
                    data.get("technician", {}).get("full_name") == "Test User" and
                    data.get("source") == "registered"
                )
                details += f", success: {data.get('success')}, technician.full_name: {data.get('technician', {}).get('full_name')}, source: {data.get('source')}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "POST /api/auth/login (registered user)", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/login (registered user)", False, 0, f"Exception: {str(e)}")
    
    async def test_login_demo_account(self):
        """Test 10: POST /api/auth/login - Demo account still works"""
        try:
            test_data = {
                "username": "demo@blueboxair.com",
                "password": "BBAReview2025!"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                success = (
                    data.get("success") == True and
                    data.get("technician", {}).get("full_name") == "Demo Reviewer"
                )
                details += f", success: {data.get('success')}, technician.full_name: {data.get('technician', {}).get('full_name')}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "POST /api/auth/login (demo account)", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/login (demo account)", False, 0, f"Exception: {str(e)}")
    
    async def test_google_auth_session(self):
        """Test 11: POST /api/auth/google/session - Google auth endpoint exists"""
        try:
            test_data = {
                "session_id": "invalid"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/google/session",
                json=test_data
            )
            
            # Expected: 401 (not 404/500) - endpoint exists and handles requests
            success = response.status_code == 401
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/google/session (endpoint exists)", 
                success, 
                response.status_code,
                details,
                401
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/google/session (endpoint exists)", False, 0, f"Exception: {str(e)}")
    
    async def run_all_tests(self):
        """Run all Apple App Store review tests"""
        print("🚀 Starting BBA Tech Backend Testing for Apple App Store Review")
        print(f"📍 Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        # Run all tests in sequence
        await self.test_head_support()
        await self.test_get_support()
        await self.test_head_privacy_policy()
        await self.test_head_terms()
        await self.test_register_new_user()
        await self.test_register_duplicate_email()
        await self.test_register_missing_name()
        await self.test_register_short_password()
        await self.test_login_registered_user()
        await self.test_login_demo_account()
        await self.test_google_auth_session()
        
        # Summary
        print("=" * 80)
        total_tests = len(self.results)
        passed_tests = len([r for r in self.results if r["success"]])
        failed_tests = len(self.failed_tests)
        
        print(f"📊 TEST SUMMARY:")
        print(f"   Total Tests: {total_tests}")
        print(f"   ✅ Passed: {passed_tests}")
        print(f"   ❌ Failed: {failed_tests}")
        print(f"   📈 Success Rate: {(passed_tests/total_tests)*100:.1f}%")
        
        if self.failed_tests:
            print(f"\n❌ FAILED TESTS:")
            for test in self.failed_tests:
                print(f"   • {test}")
        
        print("\n🎯 Apple App Store Review Requirements Status:")
        critical_tests = [
            "HEAD /api/support",
            "GET /api/support", 
            "POST /api/auth/register (new user)",
            "POST /api/auth/login (demo account)"
        ]
        
        critical_passed = 0
        for test in critical_tests:
            test_result = next((r for r in self.results if r["test"] == test), None)
            if test_result and test_result["success"]:
                critical_passed += 1
                print(f"   ✅ {test}")
            else:
                print(f"   ❌ {test}")
        
        print(f"\n🏆 Critical Tests: {critical_passed}/{len(critical_tests)} passed")
        
        return passed_tests == total_tests

async def main():
    """Main test runner"""
    tester = BBABackendTester()
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.close()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)