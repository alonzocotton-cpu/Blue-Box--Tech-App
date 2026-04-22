#!/usr/bin/env python3
"""
BBA Tech Auth Endpoints Testing - Specific Review Request
Tests the 10 auth-related endpoints mentioned in the review request.
"""

import asyncio
import httpx
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

class AuthEndpointsTester:
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
    
    async def test_demo_login(self):
        """Test 1: Demo Login (must work): POST /api/auth/login with demo credentials"""
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
                "Demo Login", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Demo Login", False, 0, f"Exception: {str(e)}")
    
    async def test_registered_user_login(self):
        """Test 2: Registered User Login (must work): POST /api/auth/login with apple@review.com"""
        try:
            test_data = {
                "username": "apple@review.com",
                "password": "AppleReview2026!"
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
                    data.get("source") == "registered"
                )
                details += f", success: {data.get('success')}, source: {data.get('source')}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "Registered User Login", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Registered User Login", False, 0, f"Exception: {str(e)}")
    
    async def test_registration(self):
        """Test 3: Registration: POST /api/auth/register with test user"""
        try:
            import time
            timestamp = int(time.time())
            test_data = {
                "email": f"testuser{timestamp}@example.com",
                "password": "Test1234!",
                "full_name": "Test User"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/register",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success") == True
                details += f", success: {data.get('success')}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "Registration", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Registration", False, 0, f"Exception: {str(e)}")
    
    async def test_google_auth_session_error_handling(self):
        """Test 4: Google Auth Session (error handling): POST /api/auth/google/session with fake session"""
        try:
            test_data = {
                "session_id": "fake-test-123"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/google/session",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 401:
                success = "expired" in response.text.lower()
                details += f", contains 'expired': {success}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "Google Auth Session (error handling)", 
                success, 
                response.status_code,
                details,
                401
            )
            
        except Exception as e:
            self.log_result("Google Auth Session (error handling)", False, 0, f"Exception: {str(e)}")
    
    async def test_google_auth_session_missing_param(self):
        """Test 5: Google Auth Session (missing param): POST /api/auth/google/session with empty body"""
        try:
            test_data = {}
            
            response = await self.client.post(
                f"{BACKEND_URL}/auth/google/session",
                json=test_data
            )
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 400:
                success = "session_id is required" in response.text
                details += f", contains 'session_id is required': {success}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "Google Auth Session (missing param)", 
                success, 
                response.status_code,
                details,
                400
            )
            
        except Exception as e:
            self.log_result("Google Auth Session (missing param)", False, 0, f"Exception: {str(e)}")
    
    async def test_sf_init(self):
        """Test 6: SF Init: GET /api/auth/salesforce/init"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/salesforce/init")
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                auth_url = data.get("auth_url", "")
                success = "login.salesforce.com" in auth_url
                details += f", auth_url contains 'login.salesforce.com': {success}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "SF Init", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("SF Init", False, 0, f"Exception: {str(e)}")
    
    async def test_auth_diagnostics(self):
        """Test 7: Auth Diagnostics (new): GET /api/auth/diagnostics"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/diagnostics")
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                required_keys = ["salesforce", "google_auth", "sf_sessions", "demo_login", "registered_users"]
                has_all_keys = all(key in data for key in required_keys)
                success = has_all_keys
                details += f", has all required keys: {has_all_keys}, keys: {list(data.keys())}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "Auth Diagnostics", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Auth Diagnostics", False, 0, f"Exception: {str(e)}")
    
    async def test_support_url_head(self):
        """Test 8: Support URL: HEAD /api/support"""
        try:
            response = await self.client.head(f"{BACKEND_URL}/support")
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            self.log_result(
                "Support URL (HEAD)", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Support URL (HEAD)", False, 0, f"Exception: {str(e)}")
    
    async def test_privacy_policy_head(self):
        """Test 9: Privacy Policy: HEAD /api/privacy-policy"""
        try:
            response = await self.client.head(f"{BACKEND_URL}/privacy-policy")
            
            success = response.status_code == 200
            details = f"Status: {response.status_code}"
            
            self.log_result(
                "Privacy Policy (HEAD)", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("Privacy Policy (HEAD)", False, 0, f"Exception: {str(e)}")
    
    async def test_sf_debug(self):
        """Test 10: SF Debug: GET /api/auth/salesforce/debug"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/salesforce/debug")
            
            success = False
            details = f"Status: {response.status_code}"
            
            if response.status_code == 200:
                data = response.json()
                pkce_enabled = data.get("pkce_enabled", False)
                success = pkce_enabled == True
                details += f", pkce_enabled: {pkce_enabled}"
            else:
                details += f", Response: {response.text[:200]}"
            
            self.log_result(
                "SF Debug", 
                success, 
                response.status_code,
                details,
                200
            )
            
        except Exception as e:
            self.log_result("SF Debug", False, 0, f"Exception: {str(e)}")
    
    async def run_all_tests(self):
        """Run all auth endpoint tests"""
        print("🔐 Starting BBA Tech Auth Endpoints Testing")
        print(f"📍 Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        # Run all tests in sequence
        print("\n🧪 AUTH ENDPOINTS TESTS:")
        await self.test_demo_login()
        await self.test_registered_user_login()
        await self.test_registration()
        await self.test_google_auth_session_error_handling()
        await self.test_google_auth_session_missing_param()
        await self.test_sf_init()
        await self.test_auth_diagnostics()
        await self.test_support_url_head()
        await self.test_privacy_policy_head()
        await self.test_sf_debug()
        
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
        
        return passed_tests == total_tests

async def main():
    """Main test runner"""
    tester = AuthEndpointsTester()
    try:
        success = await tester.run_all_tests()
        return 0 if success else 1
    finally:
        await tester.close()

if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)