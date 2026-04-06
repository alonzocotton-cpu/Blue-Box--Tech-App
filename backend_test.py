#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air Salesforce OAuth Integration
Tests all the endpoints specified in the review request.
"""

import asyncio
import httpx
import json
import os
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

class SalesforceOAuthTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.results = []
        
    async def close(self):
        await self.client.aclose()
    
    def log_result(self, test_name, success, details, expected=None, actual=None):
        """Log test result with details"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        if expected:
            result["expected"] = expected
        if actual:
            result["actual"] = actual
        self.results.append(result)
        
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} {test_name}: {details}")
        if not success and expected and actual:
            print(f"    Expected: {expected}")
            print(f"    Actual: {actual}")
    
    async def test_mock_login_fallback(self):
        """Test 1: POST /api/auth/login with test credentials - should fall through to mock"""
        try:
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json={"username": "test", "password": "test"}
            )
            
            if response.status_code == 200:
                data = response.json()
                expected_source = "mock"
                actual_source = data.get("source")
                expected_success = True
                actual_success = data.get("success")
                
                if actual_success == expected_success and actual_source == expected_source:
                    self.log_result(
                        "Mock Login Fallback",
                        True,
                        f"Mock login working correctly - success={actual_success}, source={actual_source}"
                    )
                    return True
                else:
                    self.log_result(
                        "Mock Login Fallback",
                        False,
                        "Response format incorrect",
                        f"success=true, source=mock",
                        f"success={actual_success}, source={actual_source}"
                    )
                    return False
            else:
                self.log_result(
                    "Mock Login Fallback",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Mock Login Fallback", False, f"Exception: {str(e)}")
            return False
    
    async def test_salesforce_oauth_init(self):
        """Test 2: GET /api/auth/salesforce/init - should return auth_url with login.salesforce.com"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/salesforce/init")
            
            if response.status_code == 200:
                data = response.json()
                auth_url = data.get("auth_url", "")
                
                # Check if auth_url contains required components
                required_components = [
                    "login.salesforce.com/services/oauth2/authorize",
                    "client_id"
                ]
                
                missing_components = [comp for comp in required_components if comp not in auth_url]
                
                if not missing_components:
                    self.log_result(
                        "Salesforce OAuth Init",
                        True,
                        f"Auth URL contains required components: {auth_url[:100]}..."
                    )
                    return True
                else:
                    self.log_result(
                        "Salesforce OAuth Init",
                        False,
                        f"Auth URL missing components: {missing_components}",
                        "URL with login.salesforce.com/services/oauth2/authorize and client_id",
                        auth_url
                    )
                    return False
            else:
                self.log_result(
                    "Salesforce OAuth Init",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Salesforce OAuth Init", False, f"Exception: {str(e)}")
            return False
    
    async def test_salesforce_callback_with_error(self):
        """Test 3: GET /api/auth/salesforce/callback with error parameters"""
        try:
            response = await self.client.get(
                f"{BACKEND_URL}/auth/salesforce/callback",
                params={
                    "error": "access_denied",
                    "error_description": "test"
                }
            )
            
            if response.status_code == 200:
                data = response.json()
                expected_success = False
                expected_error = "access_denied"
                actual_success = data.get("success")
                actual_error = data.get("error")
                
                if actual_success == expected_success and actual_error == expected_error:
                    self.log_result(
                        "Salesforce Callback Error Handling",
                        True,
                        f"Error handling working correctly - success={actual_success}, error={actual_error}"
                    )
                    return True
                else:
                    self.log_result(
                        "Salesforce Callback Error Handling",
                        False,
                        "Error response format incorrect",
                        f"success=false, error=access_denied",
                        f"success={actual_success}, error={actual_error}"
                    )
                    return False
            else:
                self.log_result(
                    "Salesforce Callback Error Handling",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Salesforce Callback Error Handling", False, f"Exception: {str(e)}")
            return False
    
    async def test_salesforce_callback_no_code(self):
        """Test 4: GET /api/auth/salesforce/callback without code parameter - should return 400"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/auth/salesforce/callback")
            
            expected_status = 400
            actual_status = response.status_code
            
            if actual_status == expected_status:
                self.log_result(
                    "Salesforce Callback No Code",
                    True,
                    f"Correctly returns 400 error when no code provided"
                )
                return True
            else:
                self.log_result(
                    "Salesforce Callback No Code",
                    False,
                    "Wrong status code",
                    f"HTTP 400",
                    f"HTTP {actual_status}"
                )
                return False
                
        except Exception as e:
            self.log_result("Salesforce Callback No Code", False, f"Exception: {str(e)}")
            return False
    
    async def test_projects_endpoint(self):
        """Test 5: GET /api/projects - should return 3 mock projects + any custom projects"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/projects")
            
            if response.status_code == 200:
                data = response.json()
                projects = data.get("projects", [])
                total = data.get("total", 0)
                
                # Should have at least 3 mock projects
                if len(projects) >= 3 and total >= 3:
                    # Check if projects have required fields
                    required_fields = ["id", "name", "client_name", "status"]
                    first_project = projects[0] if projects else {}
                    missing_fields = [field for field in required_fields if field not in first_project]
                    
                    if not missing_fields:
                        self.log_result(
                            "Projects Endpoint",
                            True,
                            f"Returns {len(projects)} projects with required fields"
                        )
                        return True
                    else:
                        self.log_result(
                            "Projects Endpoint",
                            False,
                            f"Projects missing required fields: {missing_fields}"
                        )
                        return False
                else:
                    self.log_result(
                        "Projects Endpoint",
                        False,
                        f"Expected at least 3 projects, got {len(projects)}"
                    )
                    return False
            else:
                self.log_result(
                    "Projects Endpoint",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Projects Endpoint", False, f"Exception: {str(e)}")
            return False
    
    async def test_create_project(self):
        """Test 6: POST /api/projects - should create a new project"""
        try:
            project_data = {
                "name": "Test Project",
                "client_name": "Test Client"
            }
            
            response = await self.client.post(
                f"{BACKEND_URL}/projects",
                json=project_data
            )
            
            if response.status_code == 200:
                data = response.json()
                success = data.get("success")
                project = data.get("project", {})
                
                if success and project.get("name") == "Test Project":
                    self.log_result(
                        "Create Project",
                        True,
                        f"Successfully created project: {project.get('name')} for {project.get('client_name')}"
                    )
                    return True
                else:
                    self.log_result(
                        "Create Project",
                        False,
                        "Project creation response format incorrect",
                        "success=true with project data",
                        f"success={success}, project={project}"
                    )
                    return False
            else:
                self.log_result(
                    "Create Project",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Create Project", False, f"Exception: {str(e)}")
            return False
    
    async def test_dashboard_stats(self):
        """Test 7: GET /api/dashboard/stats - should return stats with units_serviced field"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/dashboard/stats")
            
            if response.status_code == 200:
                data = response.json()
                required_fields = ["total_projects", "active", "total_equipment", "units_serviced"]
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    self.log_result(
                        "Dashboard Stats",
                        True,
                        f"Returns all required fields: total_projects={data.get('total_projects')}, units_serviced={data.get('units_serviced')}"
                    )
                    return True
                else:
                    self.log_result(
                        "Dashboard Stats",
                        False,
                        f"Missing required fields: {missing_fields}",
                        f"Fields: {required_fields}",
                        f"Available: {list(data.keys())}"
                    )
                    return False
            else:
                self.log_result(
                    "Dashboard Stats",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_result("Dashboard Stats", False, f"Exception: {str(e)}")
            return False
    
    async def run_all_tests(self):
        """Run all Salesforce OAuth integration tests"""
        print("🚀 Starting Salesforce OAuth Integration Tests for Blue Box Air")
        print(f"Backend URL: {BACKEND_URL}")
        print("=" * 80)
        
        tests = [
            self.test_mock_login_fallback,
            self.test_salesforce_oauth_init,
            self.test_salesforce_callback_with_error,
            self.test_salesforce_callback_no_code,
            self.test_projects_endpoint,
            self.test_create_project,
            self.test_dashboard_stats
        ]
        
        passed = 0
        total = len(tests)
        
        for test in tests:
            try:
                result = await test()
                if result:
                    passed += 1
            except Exception as e:
                print(f"❌ FAIL {test.__name__}: Unexpected error - {str(e)}")
        
        print("=" * 80)
        print(f"📊 Test Results: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All Salesforce OAuth integration tests PASSED!")
        else:
            print(f"⚠️  {total - passed} test(s) FAILED - see details above")
        
        return passed == total

async def main():
    """Main test runner"""
    tester = SalesforceOAuthTester()
    try:
        success = await tester.run_all_tests()
        return success
    finally:
        await tester.close()

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)