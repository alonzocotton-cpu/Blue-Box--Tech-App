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
        # Generate unique test user email for this test run
        import time
        timestamp = int(time.time())
        self.test_user_email = f"newuser_test_{timestamp}@example.com"
        self.test_user_password = "Secure123"
        self.test_user_name = "New User"
        
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
                "full_name": self.test_user_name,
                "email": self.test_user_email,
                "password": self.test_user_password,
                "phone": "555-0000"
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
                    data.get("technician", {}).get("full_name") == self.test_user_name and
                    data.get("technician", {}).get("email") == self.test_user_email and
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
                "email": self.test_user_email,  # Use same email as registration test
                "password": self.test_user_password
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
                "username": self.test_user_email,
                "password": self.test_user_password
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
                    data.get("technician", {}).get("full_name") == self.test_user_name and
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
    
    async def test_google_auth_session_missing_id(self):
        """Test 11: POST /api/auth/google/session - Missing session_id"""
        try:
            test_data = {}
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/google/session",
                json=test_data
            )
            
            # Expected: 400 for missing session_id
            success = response.status_code == 400
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/google/session (missing session_id)", 
                success, 
                response.status_code,
                details,
                400
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/google/session (missing session_id)", False, 0, f"Exception: {str(e)}")
    
    async def test_google_auth_session_invalid(self):
        """Test 12: POST /api/auth/google/session - Invalid session_id"""
        try:
            test_data = {
                "session_id": "invalid"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/google/session",
                json=test_data
            )
            
            # Expected: 401 (not 500) - endpoint exists and handles requests
            success = response.status_code == 401
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/google/session (invalid session_id)", 
                success, 
                response.status_code,
                details,
                401
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/google/session (invalid session_id)", False, 0, f"Exception: {str(e)}")
    
    async def test_salesforce_oauth_init(self):
        """Test 13: GET /api/auth/salesforce/init - Salesforce OAuth initialization"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/salesforce/init")
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                auth_url = data.get("auth_url", "")
                success = "salesforce.com" in auth_url
                details += f", auth_url contains 'salesforce.com': {success}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "GET /api/auth/salesforce/init", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("GET /api/auth/salesforce/init", False, 0, f"Exception: {str(e)}")
    
    async def test_login_wrong_credentials(self):
        """Test 14: POST /api/auth/login - Wrong credentials should return 401"""
        try:
            test_data = {
                "username": "wrong@test.com",
                "password": "wrong"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json=test_data
            )
            
            # Expected: 401 (not 500)
            success = response.status_code == 401
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/login (wrong credentials)", 
                success, 
                response.status_code,
                details,
                401
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/login (wrong credentials)", False, 0, f"Exception: {str(e)}")
    
    async def test_login_empty_body(self):
        """Test 15: POST /api/auth/login - Empty body should not crash"""
        try:
            test_data = {}
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json=test_data
            )
            
            # Should return error (not crash with 500)
            success = response.status_code in [400, 401, 422]  # Any client error, not server error
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/login (empty body)", 
                success, 
                response.status_code,
                details,
                "4xx"
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/login (empty body)", False, 0, f"Exception: {str(e)}")
    
    async def test_register_invalid_email(self):
        """Test 16: POST /api/auth/register - Invalid email format"""
        try:
            test_data = {
                "full_name": "Test",
                "email": "notanemail",
                "password": "Test123"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = response.status_code == 400
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/auth/register (invalid email)", 
                success, 
                response.status_code,
                details,
                400
            )
            
        except Exception as e:
            self.log_result("POST /api/auth/register (invalid email)", False, 0, f"Exception: {str(e)}")
    
    async def test_get_privacy_policy(self):
        """Test 17: GET /api/privacy-policy - Full page load"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/privacy-policy")
            success = response.status_code == 200 and "Privacy Policy" in response.text
            details = f"Status: {response.status_code}, Contains 'Privacy Policy': {'Privacy Policy' in response.text}"
            self.log_result(
                "GET /api/privacy-policy", 
                success, 
                response.status_code,
                details,
                200
            )
        except Exception as e:
            self.log_result("GET /api/privacy-policy", False, 0, f"Exception: {str(e)}")
    
    async def test_get_terms(self):
        """Test 18: GET /api/terms - Full page load"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/terms")
            success = response.status_code == 200 and "Terms" in response.text
            details = f"Status: {response.status_code}, Contains 'Terms': {'Terms' in response.text}"
            self.log_result(
                "GET /api/terms", 
                success, 
                response.status_code,
                details,
                200
            )
        except Exception as e:
            self.log_result("GET /api/terms", False, 0, f"Exception: {str(e)}")
    
    async def test_core_api_projects(self):
        """Test 19: GET /api/projects - Core API regression"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/projects")
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    details += f", Projects count: {len(data)}"
                else:
                    details += f", Response type: {type(data)}"
            else:
                details += f", Response: {response.text[:100]}"
            
            self.log_result(
                "GET /api/projects", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("GET /api/projects", False, 0, f"Exception: {str(e)}")
    
    async def test_core_api_generate_report(self):
        """Test 20: POST /api/projects/{id}/generate-report - Core API regression"""
        try:
            test_data = {
                "technician_name": "Test",
                "technician_email": "test@test.com"
            }
            
            # Use a test project ID
            response = await self.client.post(
                f"{BACKEND_URL}/projects/any_id/generate-report",
                json=test_data
            )
            
            # Should return 200 or 404 (not 500)
            success = response.status_code in [200, 404]
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/projects/any_id/generate-report", 
                success, 
                response.status_code,
                details,
                "200 or 404"
            )
            
        except Exception as e:
            self.log_result("POST /api/projects/any_id/generate-report", False, 0, f"Exception: {str(e)}")
    
    async def test_core_api_chat(self):
        """Test 21: GET /api/chat - Should not crash"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/chat")
            
            # Should not crash (any response except 500 is acceptable)
            success = response.status_code != 500
            details = f"Status: {response.status_code}, Response: {response.text[:100]}"
            
            self.log_result(
                "GET /api/chat", 
                success, 
                response.status_code,
                details,
                "not 500"
            )
            
        except Exception as e:
            self.log_result("GET /api/chat", False, 0, f"Exception: {str(e)}")
    
    async def test_report_generation_specific(self):
        """Test 22: POST /api/projects/69d42c46ed575b4fa15b3265/generate-report - Specific project"""
        try:
            test_data = {
                "technician_name": "Demo Tech",
                "technician_email": "demo@test.com"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/projects/69d42c46ed575b4fa15b3265/generate-report",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                has_pdf = "pdf_base64" in data
                success = has_pdf
                details += f", has pdf_base64: {has_pdf}"
            else:
                details += f", Response: {response.text[:100]}"
            
            self.log_result(
                "POST /api/projects/69d42c46ed575b4fa15b3265/generate-report", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("POST /api/projects/69d42c46ed575b4fa15b3265/generate-report", False, 0, f"Exception: {str(e)}")
    
    async def run_all_tests(self):
        """Run all Apple App Store review tests"""
        print("🚀 Starting BBA Tech Backend Testing for Apple App Store Review")
        print(f"📍 Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        # Run all tests in sequence
        print("\n📋 SUPPORT URL ACCESSIBILITY TESTS:")
        await self.test_head_support()
        await self.test_get_support()
        await self.test_head_privacy_policy()
        await self.test_get_privacy_policy()
        await self.test_head_terms()
        await self.test_get_terms()
        
        print("\n👤 USER REGISTRATION TESTS:")
        await self.test_register_new_user()
        await self.test_register_duplicate_email()
        await self.test_register_missing_name()
        await self.test_register_short_password()
        await self.test_register_invalid_email()
        
        print("\n🔐 USER SIGN IN TESTS:")
        await self.test_login_demo_account()
        await self.test_login_wrong_credentials()
        await self.test_login_empty_body()
        await self.test_login_registered_user()
        
        print("\n🔗 GOOGLE AUTH TESTS:")
        await self.test_google_auth_session_missing_id()
        await self.test_google_auth_session_invalid()
        
        print("\n🏢 SALESFORCE OAUTH TESTS:")
        await self.test_salesforce_oauth_init()
        
        print("\n🔄 CORE API REGRESSION TESTS:")
        await self.test_core_api_projects()
        await self.test_core_api_generate_report()
        await self.test_core_api_chat()
        
        print("\n📊 REPORT GENERATION TESTS:")
        await self.test_report_generation_specific()
        
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
            "HEAD /api/privacy-policy",
            "GET /api/privacy-policy",
            "HEAD /api/terms",
            "GET /api/terms",
            "POST /api/auth/login (demo account)",
            "POST /api/auth/login (wrong credentials)",
            "POST /api/auth/register (new user)",
            "POST /api/auth/register (duplicate email)",
            "POST /api/auth/register (missing name)",
            "POST /api/auth/register (short password)",
            "POST /api/auth/register (invalid email)",
            "POST /api/auth/login (registered user)",
            "POST /api/auth/google/session (missing session_id)",
            "POST /api/auth/google/session (invalid session_id)",
            "GET /api/auth/salesforce/init",
            "GET /api/projects",
            "POST /api/projects/69d42c46ed575b4fa15b3265/generate-report"
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