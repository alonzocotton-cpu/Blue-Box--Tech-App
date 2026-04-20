#!/usr/bin/env python3
"""
Backend API Testing for BBA Tech - Google Auth and Face ID Endpoints
Testing the specific endpoints mentioned in the review request.
"""

import requests
import json
import sys
from typing import Dict, Any

# Backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_endpoint(method: str, endpoint: str, data: Dict[Any, Any] = None, expected_status: int = 200, description: str = "") -> bool:
    """Test a single endpoint and return success status"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        else:
            print(f"❌ UNSUPPORTED METHOD: {method}")
            return False
            
        print(f"\n{'='*60}")
        print(f"TEST: {description}")
        print(f"URL: {url}")
        print(f"Method: {method}")
        if data:
            print(f"Body: {json.dumps(data, indent=2)}")
        print(f"Expected Status: {expected_status}")
        print(f"Actual Status: {response.status_code}")
        
        try:
            response_json = response.json()
            print(f"Response: {json.dumps(response_json, indent=2)}")
        except:
            print(f"Response (text): {response.text[:500]}...")
            
        if response.status_code == expected_status:
            print(f"✅ PASS: Status code matches expected {expected_status}")
            return True
        else:
            print(f"❌ FAIL: Expected {expected_status}, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"TEST: {description}")
        print(f"❌ ERROR: {str(e)}")
        return False

def main():
    """Run all the tests specified in the review request"""
    print("🚀 Starting BBA Tech Backend API Testing")
    print(f"Backend URL: {BACKEND_URL}")
    
    tests_passed = 0
    tests_total = 0
    
    # Test 1: POST /api/auth/google/session - Missing session_id
    tests_total += 1
    if test_endpoint(
        "POST", 
        "/auth/google/session",
        {},
        400,
        "POST /api/auth/google/session - Missing session_id"
    ):
        tests_passed += 1
    
    # Test 2: POST /api/auth/google/session - Invalid session_id
    tests_total += 1
    if test_endpoint(
        "POST",
        "/auth/google/session", 
        {"session_id": "invalid-test-123"},
        401,
        "POST /api/auth/google/session - Invalid session_id"
    ):
        tests_passed += 1
    
    # Test 3: POST /api/auth/google/session - Valid structure check (should not return 404/500)
    tests_total += 1
    response_test = test_endpoint(
        "POST",
        "/auth/google/session",
        {"session_id": "test-structure-check"},
        401,  # Expecting 401 for invalid session, not 404/500
        "POST /api/auth/google/session - Valid structure check"
    )
    if response_test:
        tests_passed += 1
    
    # Test 4: POST /api/auth/login - Regression: Demo account
    tests_total += 1
    if test_endpoint(
        "POST",
        "/auth/login",
        {"username": "demo@blueboxair.com", "password": "BBAReview2025!"},
        200,
        "POST /api/auth/login - Demo account regression test"
    ):
        tests_passed += 1
    
    # Test 5: GET /api/auth/salesforce/init - Regression
    tests_total += 1
    if test_endpoint(
        "GET",
        "/auth/salesforce/init",
        None,
        200,
        "GET /api/auth/salesforce/init - Regression test"
    ):
        tests_passed += 1
    
    # Test 6: GET /api/support - Regression (was returning 500 before)
    tests_total += 1
    if test_endpoint(
        "GET",
        "/support",
        None,
        200,
        "GET /api/support - Regression test"
    ):
        tests_passed += 1
    
    # Test 7: GET /api/privacy-policy - Regression
    tests_total += 1
    if test_endpoint(
        "GET",
        "/privacy-policy",
        None,
        200,
        "GET /api/privacy-policy - Regression test"
    ):
        tests_passed += 1
    
    # Summary
    print(f"\n{'='*60}")
    print(f"🏁 TESTING COMPLETE")
    print(f"Tests Passed: {tests_passed}/{tests_total}")
    print(f"Success Rate: {(tests_passed/tests_total)*100:.1f}%")
    
    if tests_passed == tests_total:
        print("🎉 ALL TESTS PASSED!")
        return True
    else:
        print("⚠️  SOME TESTS FAILED")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)