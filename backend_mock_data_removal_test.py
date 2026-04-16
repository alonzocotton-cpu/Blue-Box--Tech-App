#!/usr/bin/env python3
"""
Blue Box Air Backend API Testing - MOCK_DATA Removal Migration
Tests the specific endpoints after MOCK_DATA removal migration
"""

import requests
import json
import sys
from urllib.parse import quote

# Backend URL - using external URL from frontend .env
BACKEND_URL = "https://techservice-app-2.emergent.host/api"
LOCALHOST_URL = "http://localhost:8001/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200, use_localhost=False):
    """Test a single endpoint and return the response"""
    base_url = LOCALHOST_URL if use_localhost else BACKEND_URL
    url = f"{base_url}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, params=params, timeout=30)
        else:
            raise ValueError(f"Unsupported method: {method}")
        
        print(f"\n{'='*60}")
        print(f"TEST: {method} {endpoint}")
        print(f"URL: {url}")
        if data:
            print(f"Data: {json.dumps(data, indent=2)}")
        if params:
            print(f"Params: {params}")
        print(f"Status: {response.status_code}")
        
        try:
            response_data = response.json()
            print(f"Response: {json.dumps(response_data, indent=2)}")
        except:
            print(f"Response (text): {response.text}")
            response_data = {"error": "Invalid JSON response"}
        
        # Check if status matches expected
        status_match = response.status_code == expected_status
        print(f"Expected Status: {expected_status} | Actual: {response.status_code} | Match: {status_match}")
        
        return {
            "success": status_match,
            "status_code": response.status_code,
            "data": response_data,
            "endpoint": endpoint,
            "method": method
        }
        
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"ERROR testing {method} {endpoint}: {str(e)}")
        return {
            "success": False,
            "error": str(e),
            "endpoint": endpoint,
            "method": method
        }

def main():
    """Run all Blue Box Air backend API tests for MOCK_DATA removal migration"""
    print("🔧 Blue Box Air Backend API Testing - MOCK_DATA Removal Migration")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    
    # Test 1: POST /api/auth/login - Test with test credentials
    print("\n" + "="*80)
    print("TEST 1: POST /api/auth/login - Test with test credentials")
    login_data = {
        "username": "test",
        "password": "test"
    }
    result = test_endpoint("POST", "/auth/login", data=login_data)
    test_results.append(result)
    
    # Test 2: GET /api/dashboard/stats - Should return stats object
    print("\n" + "="*80)
    print("TEST 2: GET /api/dashboard/stats - Should return stats object")
    result = test_endpoint("GET", "/dashboard/stats")
    test_results.append(result)
    
    # Test 3: GET /api/projects - Should return projects array
    print("\n" + "="*80)
    print("TEST 3: GET /api/projects - Should return projects array")
    result = test_endpoint("GET", "/projects")
    test_results.append(result)
    
    # Test 4: GET /api/projects/kanban - Should return kanban object
    print("\n" + "="*80)
    print("TEST 4: GET /api/projects/kanban - Should return kanban object")
    result = test_endpoint("GET", "/projects/kanban")
    test_results.append(result)
    
    # Test 5: GET /api/auth/profile - Should return profile object
    print("\n" + "="*80)
    print("TEST 5: GET /api/auth/profile - Should return profile object")
    result = test_endpoint("GET", "/auth/profile")
    test_results.append(result)
    
    # Test 6: PUT /api/auth/profile - Test profile update
    print("\n" + "="*80)
    print("TEST 6: PUT /api/auth/profile - Test profile update")
    profile_data = {
        "first_name": "Test",
        "last_name": "User",
        "email": "test@blueboxair.com",
        "position": "Technician"
    }
    result = test_endpoint("PUT", "/auth/profile", data=profile_data)
    test_results.append(result)
    
    # Test 7: GET /api/coil-of-month - Should return array of entries
    print("\n" + "="*80)
    print("TEST 7: GET /api/coil-of-month - Should return array of entries")
    result = test_endpoint("GET", "/coil-of-month", use_localhost=True)
    test_results.append(result)
    
    # Test 8: GET /api/coil-of-month/current - Should return current entry
    print("\n" + "="*80)
    print("TEST 8: GET /api/coil-of-month/current - Should return current entry")
    result = test_endpoint("GET", "/coil-of-month/current", use_localhost=True)
    test_results.append(result)
    
    # Test 9: GET /api/salesforce/projects - Should return projects array
    print("\n" + "="*80)
    print("TEST 9: GET /api/salesforce/projects - Should return projects array")
    result = test_endpoint("GET", "/salesforce/projects")
    test_results.append(result)
    
    # Test 10: GET /api/notifications - Should return notifications array
    print("\n" + "="*80)
    print("TEST 10: GET /api/notifications - Should return notifications array")
    result = test_endpoint("GET", "/notifications")
    test_results.append(result)
    
    # Summary
    print("\n" + "="*80)
    print("🔍 TEST SUMMARY - MOCK_DATA REMOVAL MIGRATION")
    print("="*80)
    
    passed = 0
    failed = 0
    critical_failures = []
    
    for i, result in enumerate(test_results, 1):
        status = "✅ PASS" if result.get("success", False) else "❌ FAIL"
        endpoint = result.get("endpoint", "unknown")
        method = result.get("method", "unknown")
        print(f"Test {i:2d}: {status} - {method} {endpoint}")
        
        if result.get("success", False):
            passed += 1
        else:
            failed += 1
            # Check for critical failures (500 errors indicating MOCK_DATA references)
            if result.get("status_code") == 500:
                critical_failures.append(f"{method} {endpoint}")
            if "error" in result:
                print(f"         Error: {result['error']}")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    print(f"Success Rate: {(passed/(passed+failed)*100):.1f}%")
    
    if critical_failures:
        print(f"\n🚨 CRITICAL: {len(critical_failures)} endpoints returned 500 errors (likely MOCK_DATA references):")
        for endpoint in critical_failures:
            print(f"   - {endpoint}")
    
    # Validate specific response structures
    print("\n" + "="*80)
    print("🔍 RESPONSE STRUCTURE VALIDATION")
    print("="*80)
    
    structure_checks = []
    
    # Check dashboard stats structure
    dashboard_result = next((r for r in test_results if r.get("endpoint") == "/dashboard/stats"), None)
    if dashboard_result and dashboard_result.get("success"):
        data = dashboard_result.get("data", {})
        required_fields = ["total_projects", "active", "on_hold", "completed", "total_equipment", "units_serviced", "total_readings"]
        missing_fields = [f for f in required_fields if f not in data]
        if missing_fields:
            structure_checks.append(f"❌ Dashboard stats missing fields: {missing_fields}")
        else:
            structure_checks.append("✅ Dashboard stats has all required fields")
    
    # Check projects structure
    projects_result = next((r for r in test_results if r.get("endpoint") == "/projects"), None)
    if projects_result and projects_result.get("success"):
        data = projects_result.get("data", {})
        if "projects" in data and "total" in data:
            structure_checks.append("✅ Projects has correct structure (projects, total)")
        else:
            structure_checks.append("❌ Projects missing required structure")
    
    # Check kanban structure
    kanban_result = next((r for r in test_results if r.get("endpoint") == "/projects/kanban"), None)
    if kanban_result and kanban_result.get("success"):
        data = kanban_result.get("data", {})
        if "kanban" in data:
            kanban = data["kanban"]
            required_kanban_fields = ["in_progress", "completed", "not_completed"]
            missing_kanban = [f for f in required_kanban_fields if f not in kanban]
            if missing_kanban:
                structure_checks.append(f"❌ Kanban missing fields: {missing_kanban}")
            else:
                structure_checks.append("✅ Kanban has correct structure")
        else:
            structure_checks.append("❌ Kanban response missing kanban object")
    
    # Check profile structure
    profile_result = next((r for r in test_results if r.get("endpoint") == "/auth/profile"), None)
    if profile_result and profile_result.get("success"):
        data = profile_result.get("data", {})
        if "full_name" in data or "email" in data:
            structure_checks.append("✅ Profile has expected fields")
        else:
            structure_checks.append("❌ Profile missing expected fields")
    
    # Check notifications structure
    notifications_result = next((r for r in test_results if r.get("endpoint") == "/notifications"), None)
    if notifications_result and notifications_result.get("success"):
        data = notifications_result.get("data", {})
        if "notifications" in data:
            structure_checks.append("✅ Notifications has correct structure")
        else:
            structure_checks.append("❌ Notifications missing notifications array")
    
    for check in structure_checks:
        print(check)
    
    if failed > 0:
        print("\n❌ Some tests failed. Check the detailed output above.")
        return 1
    else:
        print("\n✅ All tests passed! MOCK_DATA removal migration successful.")
        return 0

if __name__ == "__main__":
    sys.exit(main())