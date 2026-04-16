#!/usr/bin/env python3
"""
Blue Box Air Backend API Testing
Tests the specific endpoints requested in the review
"""

import requests
import json
import sys
from urllib.parse import quote

# Backend URL from frontend/.env
BACKEND_URL = "https://techservice-app-2.emergent.host/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200):
    """Test a single endpoint and return the response"""
    url = f"{BACKEND_URL}{endpoint}"
    
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
    """Run all Blue Box Air backend API tests for the review request"""
    print("🔧 Blue Box Air Backend API Testing - Review Request")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    
    # Test 1: PUT /api/auth/profile - Profile Setup/Update endpoint
    print("\n" + "="*80)
    print("TEST 1: PUT /api/auth/profile - Profile Setup/Update endpoint")
    profile_data = {
        "first_name": "TestFirst",
        "last_name": "TestLast", 
        "position": "Senior Technician",
        "supervisor": "Ramon Reyes",
        "phone": "555-0000",
        "profile_completed": True
    }
    result = test_endpoint("PUT", "/auth/profile", data=profile_data)
    test_results.append(result)
    
    # Test 2: POST /api/auth/login - Login regression test
    print("\n" + "="*80)
    print("TEST 2: POST /api/auth/login - Login regression test")
    login_data = {
        "username": "test",
        "password": "test"
    }
    result = test_endpoint("POST", "/auth/login", data=login_data)
    test_results.append(result)
    
    # Test 3: GET /api/projects - Projects list
    print("\n" + "="*80)
    print("TEST 3: GET /api/projects - Projects list")
    result = test_endpoint("GET", "/projects")
    test_results.append(result)
    
    # Test 4: GET /api/dashboard/stats - Dashboard stats
    print("\n" + "="*80)
    print("TEST 4: GET /api/dashboard/stats - Dashboard stats")
    result = test_endpoint("GET", "/dashboard/stats")
    test_results.append(result)
    
    # Test 5: GET /api/auth/profile - Profile fetch
    print("\n" + "="*80)
    print("TEST 5: GET /api/auth/profile - Profile fetch")
    result = test_endpoint("GET", "/auth/profile")
    test_results.append(result)
    
    # Summary
    print("\n" + "="*80)
    print("🔍 TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for i, result in enumerate(test_results, 1):
        status = "✅ PASS" if result.get("success", False) else "❌ FAIL"
        endpoint = result.get("endpoint", "unknown")
        method = result.get("method", "unknown")
        print(f"Test {i:2d}: {status} - {method} {endpoint}")
        
        if result.get("success", False):
            passed += 1
        else:
            failed += 1
            if "error" in result:
                print(f"         Error: {result['error']}")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    print(f"Success Rate: {(passed/(passed+failed)*100):.1f}%")
    
    if failed > 0:
        print("\n❌ Some tests failed. Check the detailed output above.")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())