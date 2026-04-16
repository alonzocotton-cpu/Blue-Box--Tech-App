#!/usr/bin/env python3
"""
Blue Box Air Backend API Testing
Tests the specific endpoints requested in the review
"""

import requests
import json
import sys
from urllib.parse import quote

# Backend URL - using localhost since external proxy has routing issues with new endpoints
BACKEND_URL = "http://localhost:8001/api"

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
    """Run all Blue Box Air backend API tests for the Coil of the Month review request"""
    print("🔧 Blue Box Air Backend API Testing - Coil of the Month Review Request")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    created_entry_id = None
    
    # Test 1: GET /api/coil-of-month - List all entries
    print("\n" + "="*80)
    print("TEST 1: GET /api/coil-of-month - List all entries")
    result = test_endpoint("GET", "/coil-of-month")
    test_results.append(result)
    
    # Test 2: GET /api/coil-of-month/current - Get current featured entry
    print("\n" + "="*80)
    print("TEST 2: GET /api/coil-of-month/current - Get current featured entry")
    result = test_endpoint("GET", "/coil-of-month/current")
    test_results.append(result)
    
    # Test 3: POST /api/coil-of-month - Create entry (admin-only)
    print("\n" + "="*80)
    print("TEST 3: POST /api/coil-of-month - Create entry (admin-only)")
    admin_entry_data = {
        "email": "alonzo.cotton@blueboxair.com",
        "title": "Test Coil",
        "description": "A short test description.",
        "media": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
        "media_type": "photo",
        "unit_name": "RTU-002",
        "created_by_name": "Alonzo Cotton"
    }
    result = test_endpoint("POST", "/coil-of-month", data=admin_entry_data)
    test_results.append(result)
    
    # Extract entry ID for subsequent tests
    if result.get("success") and result.get("data", {}).get("success"):
        entry_data = result.get("data", {}).get("entry", {})
        created_entry_id = entry_data.get("_id")
        print(f"Created entry ID: {created_entry_id}")
    
    # Test 4: POST /api/coil-of-month - Non-admin should get 403
    print("\n" + "="*80)
    print("TEST 4: POST /api/coil-of-month - Non-admin should get 403")
    non_admin_entry_data = {
        "email": "john@test.com",
        "title": "Test Coil",
        "description": "A short test description.",
        "media": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
        "media_type": "photo",
        "unit_name": "RTU-002",
        "created_by_name": "John Doe"
    }
    result = test_endpoint("POST", "/coil-of-month", data=non_admin_entry_data, expected_status=403)
    test_results.append(result)
    
    # Test 5: POST /api/coil-of-month/{id}/love - Toggle love (first time)
    if created_entry_id:
        print("\n" + "="*80)
        print("TEST 5: POST /api/coil-of-month/{id}/love - Toggle love (first time)")
        love_data = {"email": "user@test.com"}
        result = test_endpoint("POST", f"/coil-of-month/{created_entry_id}/love", data=love_data)
        test_results.append(result)
        
        # Test 6: POST /api/coil-of-month/{id}/love - Toggle love (second time - should unlove)
        print("\n" + "="*80)
        print("TEST 6: POST /api/coil-of-month/{id}/love - Toggle love (second time - should unlove)")
        result = test_endpoint("POST", f"/coil-of-month/{created_entry_id}/love", data=love_data)
        test_results.append(result)
    else:
        print("\n❌ Skipping love tests - no entry ID available")
        test_results.append({"success": False, "error": "No entry ID for love test", "endpoint": "/coil-of-month/{id}/love", "method": "POST"})
        test_results.append({"success": False, "error": "No entry ID for love test", "endpoint": "/coil-of-month/{id}/love", "method": "POST"})
    
    # Test 7: POST /api/coil-of-month/{id}/comments - Add comment
    if created_entry_id:
        print("\n" + "="*80)
        print("TEST 7: POST /api/coil-of-month/{id}/comments - Add comment")
        comment_data = {
            "email": "user@test.com",
            "name": "Test User",
            "text": "Looks great!"
        }
        result = test_endpoint("POST", f"/coil-of-month/{created_entry_id}/comments", data=comment_data)
        test_results.append(result)
        
        # Test 8: POST /api/coil-of-month/{id}/comments - Comment too long (>25 words)
        print("\n" + "="*80)
        print("TEST 8: POST /api/coil-of-month/{id}/comments - Comment too long (>25 words)")
        long_comment_data = {
            "email": "user@test.com",
            "name": "Test User",
            "text": "This is a very long comment that exceeds the twenty five word limit that is enforced by the backend API validation rules for comments on coil of the month entries"
        }
        result = test_endpoint("POST", f"/coil-of-month/{created_entry_id}/comments", data=long_comment_data, expected_status=400)
        test_results.append(result)
    else:
        print("\n❌ Skipping comment tests - no entry ID available")
        test_results.append({"success": False, "error": "No entry ID for comment test", "endpoint": "/coil-of-month/{id}/comments", "method": "POST"})
        test_results.append({"success": False, "error": "No entry ID for comment test", "endpoint": "/coil-of-month/{id}/comments", "method": "POST"})
    
    # Test 9: POST /api/auth/login - Login regression test
    print("\n" + "="*80)
    print("TEST 9: POST /api/auth/login - Login regression test")
    login_data = {
        "username": "test",
        "password": "test"
    }
    result = test_endpoint("POST", "/auth/login", data=login_data)
    test_results.append(result)
    
    # Test 10: GET /api/projects - Projects regression test
    print("\n" + "="*80)
    print("TEST 10: GET /api/projects - Projects regression test")
    result = test_endpoint("GET", "/projects")
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