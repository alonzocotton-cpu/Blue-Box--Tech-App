#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air - Salesforce Opportunity Sync and Notifications
Testing 6 specific endpoints as requested in the review.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_endpoint(method, endpoint, data=None, params=None, headers=None):
    """Helper function to test an endpoint and return response details"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, headers=headers, timeout=10)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, params=params, headers=headers, timeout=10)
        else:
            return {"error": f"Unsupported method: {method}"}
        
        return {
            "status_code": response.status_code,
            "response": response.json() if response.headers.get('content-type', '').startswith('application/json') else response.text,
            "success": True
        }
    except requests.exceptions.RequestException as e:
        return {"error": str(e), "success": False}
    except json.JSONDecodeError as e:
        return {"error": f"JSON decode error: {e}", "response_text": response.text, "success": False}

def main():
    print("=" * 80)
    print("BLUE BOX AIR - SALESFORCE OPPORTUNITY SYNC & NOTIFICATIONS API TESTING")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print()
    
    test_results = []
    
    # Test 1: GET /api/salesforce/sync-opportunities (no token) — Should return 401 "Access token required"
    print("1. Testing GET /api/salesforce/sync-opportunities (no token)")
    print("   Expected: 401 'Access token required'")
    result1 = test_endpoint("GET", "/salesforce/sync-opportunities")
    print(f"   Result: Status {result1.get('status_code')}, Response: {result1.get('response')}")
    
    expected_401 = result1.get('status_code') == 401 and 'Access token required' in str(result1.get('response', ''))
    test_results.append({
        "test": "GET /api/salesforce/sync-opportunities (no token)",
        "expected": "401 'Access token required'",
        "actual": f"Status {result1.get('status_code')}, Response: {result1.get('response')}",
        "passed": expected_401
    })
    print(f"   ✅ PASSED" if expected_401 else f"   ❌ FAILED")
    print()
    
    # Test 2: GET /api/salesforce/projects — Should return {"projects": [...], "total": N}
    print("2. Testing GET /api/salesforce/projects")
    print("   Expected: {'projects': [...], 'total': N} (may be 0 if no SF sync yet)")
    result2 = test_endpoint("GET", "/salesforce/projects")
    print(f"   Result: Status {result2.get('status_code')}, Response: {result2.get('response')}")
    
    projects_valid = (result2.get('status_code') == 200 and 
                     isinstance(result2.get('response'), dict) and
                     'projects' in result2.get('response', {}) and
                     'total' in result2.get('response', {}))
    test_results.append({
        "test": "GET /api/salesforce/projects",
        "expected": "200 with {'projects': [...], 'total': N}",
        "actual": f"Status {result2.get('status_code')}, Response: {result2.get('response')}",
        "passed": projects_valid
    })
    print(f"   ✅ PASSED" if projects_valid else f"   ❌ FAILED")
    print()
    
    # Test 3: GET /api/salesforce/equipment/TestAccount — Should return {"equipment": [], "total": 0}
    print("3. Testing GET /api/salesforce/equipment/TestAccount")
    print("   Expected: {'equipment': [], 'total': 0}")
    result3 = test_endpoint("GET", "/salesforce/equipment/TestAccount")
    print(f"   Result: Status {result3.get('status_code')}, Response: {result3.get('response')}")
    
    equipment_valid = (result3.get('status_code') == 200 and 
                      isinstance(result3.get('response'), dict) and
                      'equipment' in result3.get('response', {}) and
                      'total' in result3.get('response', {}))
    test_results.append({
        "test": "GET /api/salesforce/equipment/TestAccount",
        "expected": "200 with {'equipment': [], 'total': 0}",
        "actual": f"Status {result3.get('status_code')}, Response: {result3.get('response')}",
        "passed": equipment_valid
    })
    print(f"   ✅ PASSED" if equipment_valid else f"   ❌ FAILED")
    print()
    
    # Test 4: GET /api/notifications — Should return {"notifications": [...], "unread_count": N}
    print("4. Testing GET /api/notifications")
    print("   Expected: {'notifications': [...], 'unread_count': N}")
    result4 = test_endpoint("GET", "/notifications")
    print(f"   Result: Status {result4.get('status_code')}, Response: {result4.get('response')}")
    
    notifications_valid = (result4.get('status_code') == 200 and 
                          isinstance(result4.get('response'), dict) and
                          'notifications' in result4.get('response', {}) and
                          'unread_count' in result4.get('response', {}))
    test_results.append({
        "test": "GET /api/notifications",
        "expected": "200 with {'notifications': [...], 'unread_count': N}",
        "actual": f"Status {result4.get('status_code')}, Response: {result4.get('response')}",
        "passed": notifications_valid
    })
    print(f"   ✅ PASSED" if notifications_valid else f"   ❌ FAILED")
    print()
    
    # Test 5: GET /api/notifications?unread_only=true — Should return only unread notifications
    print("5. Testing GET /api/notifications?unread_only=true")
    print("   Expected: Only unread notifications returned")
    result5 = test_endpoint("GET", "/notifications", params={"unread_only": "true"})
    print(f"   Result: Status {result5.get('status_code')}, Response: {result5.get('response')}")
    
    unread_valid = (result5.get('status_code') == 200 and 
                   isinstance(result5.get('response'), dict) and
                   'notifications' in result5.get('response', {}) and
                   'unread_count' in result5.get('response', {}))
    test_results.append({
        "test": "GET /api/notifications?unread_only=true",
        "expected": "200 with unread notifications only",
        "actual": f"Status {result5.get('status_code')}, Response: {result5.get('response')}",
        "passed": unread_valid
    })
    print(f"   ✅ PASSED" if unread_valid else f"   ❌ FAILED")
    print()
    
    # Test 6: POST /api/notifications/read-all — Should mark all as read, return {"success": true}
    print("6. Testing POST /api/notifications/read-all")
    print("   Expected: {'success': true}")
    result6 = test_endpoint("POST", "/notifications/read-all")
    print(f"   Result: Status {result6.get('status_code')}, Response: {result6.get('response')}")
    
    read_all_valid = (result6.get('status_code') == 200 and 
                     isinstance(result6.get('response'), dict) and
                     result6.get('response', {}).get('success') == True)
    test_results.append({
        "test": "POST /api/notifications/read-all",
        "expected": "200 with {'success': true}",
        "actual": f"Status {result6.get('status_code')}, Response: {result6.get('response')}",
        "passed": read_all_valid
    })
    print(f"   ✅ PASSED" if read_all_valid else f"   ❌ FAILED")
    print()
    
    # Summary
    print("=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    
    passed_count = sum(1 for result in test_results if result['passed'])
    total_count = len(test_results)
    
    for i, result in enumerate(test_results, 1):
        status = "✅ PASSED" if result['passed'] else "❌ FAILED"
        print(f"{i}. {result['test']}: {status}")
    
    print()
    print(f"OVERALL RESULT: {passed_count}/{total_count} tests passed ({passed_count/total_count*100:.1f}%)")
    
    if passed_count == total_count:
        print("🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("⚠️  SOME TESTS FAILED - See details above")
        return 1

if __name__ == "__main__":
    sys.exit(main())