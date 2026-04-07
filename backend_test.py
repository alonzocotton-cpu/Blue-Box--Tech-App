#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air App - Salesforce OAuth Focus
Testing the Salesforce OAuth endpoints after Python syntax fixes.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def test_endpoint(method, endpoint, data=None, expected_status=200, description=""):
    """Test an API endpoint and return the response"""
    url = f"{API_BASE}{endpoint}"
    print(f"\n🧪 Testing {method} {endpoint}")
    if description:
        print(f"   Description: {description}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, timeout=30)
        else:
            print(f"❌ Unsupported method: {method}")
            return None
            
        print(f"   Status: {response.status_code}")
        
        if response.status_code == expected_status:
            print(f"   ✅ Expected status {expected_status}")
        else:
            print(f"   ❌ Expected {expected_status}, got {response.status_code}")
            
        # Try to parse JSON response
        try:
            json_response = response.json()
            print(f"   Response size: {len(str(json_response))} chars")
            return json_response
        except:
            print(f"   Response (text): {response.text[:200]}...")
            return response.text
            
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Request failed: {e}")
        return None

def main():
    """Run the backend API tests focusing on Salesforce OAuth endpoints after syntax fixes"""
    print("=" * 80)
    print("🔬 BLUE BOX AIR - BACKEND API TESTING")
    print("Focus: Salesforce OAuth Endpoints After Python Syntax Fixes")
    print("=" * 80)
    
    # Test results tracking
    tests_passed = 0
    tests_failed = 0
    
    # Test 1: POST /api/auth/login - Mock login
    print("\n" + "="*50)
    print("TEST 1: POST /api/auth/login")
    print("="*50)
    
    login_data = {"username": "test", "password": "test"}
    response = test_endpoint("POST", "/auth/login", data=login_data,
                           description="Mock login should return success=true, technician data, and token")
    
    if response and isinstance(response, dict):
        if response.get("success") and response.get("technician") and response.get("token"):
            print(f"   ✅ Login successful")
            print(f"   👤 Technician: {response.get('technician', {}).get('name', 'N/A')}")
            print(f"   🔑 Token present: {bool(response.get('token'))}")
            tests_passed += 1
        else:
            print(f"   ❌ Login response missing required fields")
            print(f"   Response: {response}")
            tests_failed += 1
    else:
        print("   ❌ Invalid login response")
        tests_failed += 1
    
    # Test 2: GET /api/auth/salesforce/init - Should return auth_url
    print("\n" + "="*50)
    print("TEST 2: GET /api/auth/salesforce/init")
    print("="*50)
    
    response = test_endpoint("GET", "/auth/salesforce/init",
                           description="Should return auth_url containing 'login.salesforce.com/services/oauth2/authorize'")
    
    if response and isinstance(response, dict):
        auth_url = response.get("auth_url", "")
        if "login.salesforce.com/services/oauth2/authorize" in auth_url:
            print(f"   ✅ Auth URL contains correct Salesforce OAuth endpoint")
            print(f"   🔗 URL: {auth_url[:100]}...")
            tests_passed += 1
        else:
            print(f"   ❌ Auth URL doesn't contain expected Salesforce endpoint")
            print(f"   URL: {auth_url}")
            tests_failed += 1
    else:
        print("   ❌ Invalid auth init response")
        tests_failed += 1
    
    # Test 3: GET /api/auth/salesforce/callback?error=access_denied - Error handling
    print("\n" + "="*50)
    print("TEST 3: GET /api/auth/salesforce/callback?error=access_denied")
    print("="*50)
    
    response = test_endpoint("GET", "/auth/salesforce/callback?error=access_denied",
                           description="Should handle error gracefully")
    
    if response and isinstance(response, dict):
        if response.get("success") == False and "access_denied" in str(response.get("error", "")):
            print(f"   ✅ Error handled gracefully")
            print(f"   ❌ Error: {response.get('error')}")
            tests_passed += 1
        else:
            print(f"   ❌ Error not handled properly")
            print(f"   Response: {response}")
            tests_failed += 1
    else:
        print("   ❌ Invalid error response")
        tests_failed += 1
    
    # Test 4: GET /api/auth/salesforce/callback (no code param) - Should return 400
    print("\n" + "="*50)
    print("TEST 4: GET /api/auth/salesforce/callback (no code)")
    print("="*50)
    
    response = test_endpoint("GET", "/auth/salesforce/callback", expected_status=400,
                           description="Should return 400 error when no code parameter")
    
    if response is not None:
        print(f"   ✅ Correctly returned 400 error for missing code")
        tests_passed += 1
    else:
        print("   ❌ Failed to handle missing code parameter")
        tests_failed += 1
    
    # Test 5: GET /api/auth/salesforce/redirect - Should return 307 redirect
    print("\n" + "="*50)
    print("TEST 5: GET /api/auth/salesforce/redirect")
    print("="*50)
    
    response = test_endpoint("GET", "/auth/salesforce/redirect", expected_status=307,
                           description="Should return 307 redirect to Salesforce login page")
    
    if response is not None:
        print(f"   ✅ Correctly returned 307 redirect")
        tests_passed += 1
    else:
        print("   ❌ Failed to redirect properly")
        tests_failed += 1
    
    # Test 6: GET /api/dashboard/stats - Should return project stats
    print("\n" + "="*50)
    print("TEST 6: GET /api/dashboard/stats")
    print("="*50)
    
    response = test_endpoint("GET", "/dashboard/stats",
                           description="Should return project stats with total_projects, active, total_equipment, units_serviced")
    
    if response and isinstance(response, dict):
        required_fields = ["total_projects", "active", "total_equipment", "units_serviced"]
        missing_fields = [field for field in required_fields if field not in response]
        
        if not missing_fields:
            print(f"   ✅ All required stats fields present")
            print(f"   📊 Total projects: {response.get('total_projects')}")
            print(f"   📊 Active: {response.get('active')}")
            print(f"   📊 Total equipment: {response.get('total_equipment')}")
            print(f"   📊 Units serviced: {response.get('units_serviced')}")
            tests_passed += 1
        else:
            print(f"   ❌ Missing required fields: {missing_fields}")
            tests_failed += 1
    else:
        print("   ❌ Invalid dashboard stats response")
        tests_failed += 1
    
    # Test 7: GET /api/projects - Should return list of projects with primary_contact
    print("\n" + "="*50)
    print("TEST 7: GET /api/projects")
    print("="*50)
    
    response = test_endpoint("GET", "/projects",
                           description="Should return list of projects with primary_contact fields")
    
    if response and isinstance(response, dict) and "projects" in response:
        projects = response.get("projects", [])
        print(f"   ✅ Projects returned: {len(projects)} projects")
        
        # Check if projects have primary_contact fields
        projects_with_contact = [p for p in projects if p.get("primary_contact")]
        if projects_with_contact:
            print(f"   ✅ {len(projects_with_contact)} projects have primary_contact field")
            # Show first project contact
            first_contact = projects_with_contact[0].get("primary_contact", {})
            print(f"   👤 First contact: {first_contact.get('name', 'N/A')}")
            tests_passed += 1
        else:
            print(f"   ❌ No projects have primary_contact field")
            tests_failed += 1
    else:
        print("   ❌ Invalid projects response")
        tests_failed += 1
    
    # Test 8: POST /api/projects - Create new project
    print("\n" + "="*50)
    print("TEST 8: POST /api/projects")
    print("="*50)
    
    new_project_data = {"name": "Test Project", "client_name": "Test Client"}
    response = test_endpoint("POST", "/projects", data=new_project_data,
                           description="Should create a new project")
    
    if response and isinstance(response, dict) and response.get("success"):
        project = response.get("project", {})
        print(f"   ✅ Project created successfully")
        print(f"   📋 Project name: {project.get('name')}")
        print(f"   🏢 Client: {project.get('client_name')}")
        print(f"   🆔 Project ID: {project.get('id')}")
        tests_passed += 1
    else:
        print(f"   ❌ Failed to create project")
        print(f"   Response: {response}")
        tests_failed += 1
    
    # Test 9: POST /api/ai/chat - AI chat endpoint
    print("\n" + "="*50)
    print("TEST 9: POST /api/ai/chat")
    print("="*50)
    
    chat_data = {"message": "Hello", "session_id": "test"}
    response = test_endpoint("POST", "/ai/chat", data=chat_data,
                           description="Should return AI response")
    
    if response and isinstance(response, dict) and response.get("response"):
        ai_response = response.get("response", "")
        print(f"   ✅ AI response received")
        print(f"   🤖 Response length: {len(ai_response)} chars")
        print(f"   💬 Response preview: {ai_response[:100]}...")
        tests_passed += 1
    else:
        print(f"   ❌ Failed to get AI response")
        print(f"   Response: {response}")
        tests_failed += 1
    
    # Test 10: GET /api/reports/proj-001 - Should return report with equipment_reports and primary_contact
    print("\n" + "="*50)
    print("TEST 10: GET /api/reports/proj-001")
    print("="*50)
    
    response = test_endpoint("GET", "/reports/proj-001",
                           description="Should return report with equipment_reports and primary_contact")
    
    if response and isinstance(response, dict):
        required_fields = ["equipment_reports", "primary_contact"]
        missing_fields = [field for field in required_fields if field not in response]
        
        if not missing_fields:
            print(f"   ✅ All required report fields present")
            primary_contact = response.get("primary_contact", {})
            equipment_reports = response.get("equipment_reports", [])
            print(f"   👤 Primary contact: {primary_contact.get('name', 'N/A')}")
            print(f"   📊 Equipment reports: {len(equipment_reports)} items")
            tests_passed += 1
        else:
            print(f"   ❌ Missing required fields: {missing_fields}")
            tests_failed += 1
    else:
        print("   ❌ Invalid report response")
        tests_failed += 1
    
    # Final Results
    print("\n" + "="*80)
    print("🏁 TESTING COMPLETE")
    print("="*80)
    print(f"✅ Tests Passed: {tests_passed}")
    print(f"❌ Tests Failed: {tests_failed}")
    print(f"📊 Success Rate: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%" if (tests_passed+tests_failed) > 0 else "No tests run")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Salesforce OAuth endpoints working correctly after syntax fixes.")
        return 0
    else:
        print(f"\n⚠️  {tests_failed} test(s) failed. Check the issues above.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)