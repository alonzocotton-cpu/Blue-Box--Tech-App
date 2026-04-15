#!/usr/bin/env python3
"""
Blue Box Air Review Request Testing
Tests the 5 specific endpoints mentioned in the review request
"""

import requests
import json
import sys
from urllib.parse import quote

# Backend URL as specified in review request
BACKEND_URL = "http://localhost:8001/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200, headers=None):
    """Test a single endpoint and return the response"""
    url = f"{BACKEND_URL}{endpoint}"
    
    if headers is None:
        headers = {"Content-Type": "application/json"}
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, headers=headers, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, headers=headers, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, params=params, headers=headers, timeout=30)
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
            response_data = {"error": "Invalid JSON response", "text": response.text}
        
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
    """Run the 5 specific tests from the review request"""
    print("🔧 Blue Box Air Review Request Testing")
    print(f"Backend URL: {BACKEND_URL}")
    print("Testing 5 specific endpoints as requested")
    
    test_results = []
    
    # Test 1: PUT role update
    print("\n" + "="*80)
    print("TEST 1: PUT role update - Update Test Tech role")
    update_data = {
        "requester_email": "alonzo.cotton@blueboxair.com",
        "old_role_name": "Technician",
        "old_region": "New York",
        "new_role_name": "Lead Technician",
        "new_region": "New York"
    }
    result = test_endpoint("PUT", "/roles/assign/Test%20Tech", data=update_data, headers={"Content-Type": "application/json"})
    test_results.append(result)
    
    # Test 2: POST assign role (admin) - Should succeed
    print("\n" + "="*80)
    print("TEST 2: POST assign role (admin) - Admin requester should succeed")
    assign_data = {
        "member_name": "Test Tech 2",
        "role_name": "Technician",
        "region": "Florida",
        "requester_email": "alonzo.cotton@blueboxair.com"
    }
    result = test_endpoint("POST", "/roles/assign", data=assign_data)
    test_results.append(result)
    
    # Test 3: POST assign role (non-admin) - MUST fail with 403
    print("\n" + "="*80)
    print("TEST 3: POST assign role (non-admin) - MUST fail with 403")
    bad_assign_data = {
        "member_name": "Hacker",
        "role_name": "CEO / Owner",
        "requester_email": "notadmin@example.com"
    }
    result = test_endpoint("POST", "/roles/assign", data=bad_assign_data, expected_status=403)
    test_results.append(result)
    
    # Test 4: GET project techs
    print("\n" + "="*80)
    print("TEST 4: GET project techs - Get technicians for proj-001")
    result = test_endpoint("GET", "/projects/proj-001/technicians")
    test_results.append(result)
    
    # Test 5: POST project tech assign (admin)
    print("\n" + "="*80)
    print("TEST 5: POST project tech assign (admin) - Assign tech to project")
    tech_assign_data = {
        "name": "Jane Doe",
        "email": "jane@blueboxair.com",
        "role": "Technician",
        "requester_email": "alonzo.cotton@blueboxair.com"
    }
    result = test_endpoint("POST", "/projects/proj-001/technicians", data=tech_assign_data)
    test_results.append(result)
    
    # Summary
    print("\n" + "="*80)
    print("🔍 REVIEW REQUEST TEST SUMMARY")
    print("="*80)
    
    passed = 0
    failed = 0
    
    for i, result in enumerate(test_results, 1):
        status = "✅ PASS" if result.get("success", False) else "❌ FAIL"
        endpoint = result.get("endpoint", "unknown")
        method = result.get("method", "unknown")
        print(f"Test {i}: {status} - {method} {endpoint}")
        
        if result.get("success", False):
            passed += 1
        else:
            failed += 1
            if "error" in result:
                print(f"        Error: {result['error']}")
            elif result.get("status_code"):
                print(f"        Status: {result['status_code']} (expected different)")
    
    print(f"\nResults: {passed} passed, {failed} failed")
    print(f"Success Rate: {(passed/(passed+failed)*100):.1f}%")
    
    # Detailed analysis
    print("\n" + "="*80)
    print("🔍 DETAILED ANALYSIS")
    print("="*80)
    
    critical_issues = []
    working_endpoints = []
    
    for i, result in enumerate(test_results, 1):
        if not result.get("success", False):
            if result.get("status_code") == 404:
                critical_issues.append(f"Test {i}: Endpoint {result.get('method')} {result.get('endpoint')} not found (404)")
            elif result.get("status_code") == 405:
                critical_issues.append(f"Test {i}: Method {result.get('method')} not allowed for {result.get('endpoint')} (405)")
            elif "error" in result:
                critical_issues.append(f"Test {i}: Connection/Network error - {result['error']}")
            else:
                critical_issues.append(f"Test {i}: Unexpected status {result.get('status_code')} for {result.get('method')} {result.get('endpoint')}")
        else:
            working_endpoints.append(f"Test {i}: {result.get('method')} {result.get('endpoint')}")
    
    if working_endpoints:
        print("✅ WORKING ENDPOINTS:")
        for endpoint in working_endpoints:
            print(f"  - {endpoint}")
    
    if critical_issues:
        print("\n❌ CRITICAL ISSUES:")
        for issue in critical_issues:
            print(f"  - {issue}")
    
    return 0 if failed == 0 else 1

if __name__ == "__main__":
    sys.exit(main())