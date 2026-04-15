#!/usr/bin/env python3
"""
Blue Box Air Team Management Backend API Testing
Tests the admin access control and role assignment endpoints
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
    """Run all Blue Box Air team management tests"""
    print("🔧 Blue Box Air Team Management Backend API Testing")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    
    # Test 1: Admin Check - alonzo.cotton@blueboxair.com should be admin
    print("\n" + "="*80)
    print("TEST 1: Admin Check - alonzo.cotton@blueboxair.com (should be admin)")
    result = test_endpoint("GET", "/admin/check", params={"email": "alonzo.cotton@blueboxair.com"})
    test_results.append(result)
    
    # Test 2: Non-Admin Check - andy.haas@blueboxair.com should not be admin
    print("\n" + "="*80)
    print("TEST 2: Non-Admin Check - andy.haas@blueboxair.com (should not be admin)")
    result = test_endpoint("GET", "/admin/check", params={"email": "andy.haas@blueboxair.com"})
    test_results.append(result)
    
    # Test 3: Admin Role Assign - Admin requester should succeed
    print("\n" + "="*80)
    print("TEST 3: Admin Role Assign - Admin requester (should succeed)")
    assign_data = {
        "member_name": "Test Tech",
        "role_name": "Technician",
        "region": "New York",
        "email": "test@blueboxair.com",
        "requester_email": "alonzo.cotton@blueboxair.com"
    }
    result = test_endpoint("POST", "/roles/assign", data=assign_data)
    test_results.append(result)
    
    # Test 4: Non-Admin Role Assign Block - Non-admin requester should get 403
    print("\n" + "="*80)
    print("TEST 4: Non-Admin Role Assign Block - Non-admin requester (should get 403)")
    bad_assign_data = {
        "member_name": "Bad Actor",
        "role_name": "Technician",
        "region": "New York",
        "requester_email": "random@test.com"
    }
    result = test_endpoint("POST", "/roles/assign", data=bad_assign_data, expected_status=403)
    test_results.append(result)
    
    # Test 5: Admin Role Update - Admin should be able to update role
    print("\n" + "="*80)
    print("TEST 5: Admin Role Update - Admin should be able to update role")
    update_data = {
        "requester_email": "alonzo.cotton@blueboxair.com",
        "old_role_name": "Technician",
        "old_region": "New York",
        "new_role_name": "Lead Technician",
        "new_region": "New York"
    }
    # URL encode the member name
    member_name_encoded = quote("Test Tech")
    result = test_endpoint("PUT", f"/roles/assign/{member_name_encoded}", data=update_data)
    test_results.append(result)
    
    # Test 6: Admin Role Remove - Admin should be able to remove role
    print("\n" + "="*80)
    print("TEST 6: Admin Role Remove - Admin should be able to remove role")
    remove_params = {
        "role_name": "Lead Technician",
        "region": "New York",
        "requester_email": "alonzo.cotton@blueboxair.com"
    }
    result = test_endpoint("DELETE", f"/roles/assign/{member_name_encoded}", params=remove_params)
    test_results.append(result)
    
    # Test 7: Non-Admin Role Remove Block - Non-admin should get 403
    print("\n" + "="*80)
    print("TEST 7: Non-Admin Role Remove Block - Non-admin should get 403")
    bad_remove_params = {
        "requester_email": "random@test.com"
    }
    result = test_endpoint("DELETE", f"/roles/assign/{member_name_encoded}", params=bad_remove_params, expected_status=403)
    test_results.append(result)
    
    # Test 8: Project Tech Assign - Admin should be able to assign tech to project
    print("\n" + "="*80)
    print("TEST 8: Project Tech Assign - Admin should be able to assign tech to project")
    tech_assign_data = {
        "name": "John Smith",
        "email": "john@blueboxair.com",
        "role": "Lead Technician",
        "requester_email": "alonzo.cotton@blueboxair.com"
    }
    result = test_endpoint("POST", "/projects/proj-001/technicians", data=tech_assign_data)
    test_results.append(result)
    
    # Test 9: Get Project Techs - Should return the assigned technician
    print("\n" + "="*80)
    print("TEST 9: Get Project Techs - Should return the assigned technician")
    result = test_endpoint("GET", "/projects/proj-001/technicians")
    test_results.append(result)
    
    # Test 10: Login Regression - POST /api/auth/login should still work
    print("\n" + "="*80)
    print("TEST 10: Login Regression - POST /api/auth/login should still work")
    login_data = {
        "username": "test",
        "password": "test"
    }
    result = test_endpoint("POST", "/auth/login", data=login_data)
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