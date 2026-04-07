#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air Salesforce Profile and User Sync Endpoints
Tests the new Salesforce profile and user sync API endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200, description=""):
    """Test a single endpoint and return results"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        else:
            return {"success": False, "error": f"Unsupported method: {method}"}
        
        success = response.status_code == expected_status
        
        try:
            response_data = response.json()
        except:
            response_data = response.text
        
        result = {
            "success": success,
            "status_code": response.status_code,
            "expected_status": expected_status,
            "response": response_data,
            "description": description,
            "url": url
        }
        
        return result
        
    except requests.exceptions.RequestException as e:
        return {
            "success": False,
            "error": str(e),
            "description": description,
            "url": url
        }

def main():
    """Run all Salesforce profile and user sync endpoint tests"""
    print("=" * 80)
    print("BLUE BOX AIR - SALESFORCE PROFILE & USER SYNC API TESTING")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print()
    
    # Test cases based on review request
    test_cases = [
        {
            "name": "1. Salesforce Sync Profile - No Token",
            "method": "GET",
            "endpoint": "/salesforce/sync-profile",
            "expected_status": 401,
            "description": "Should return 401 'Access token required'"
        },
        {
            "name": "2. Salesforce Sync Profile - Invalid Token",
            "method": "GET", 
            "endpoint": "/salesforce/sync-profile",
            "params": {"token": "invalid"},
            "expected_status": 401,
            "description": "Should return 401 'Invalid or expired Salesforce session'"
        },
        {
            "name": "3. Salesforce Sync Users - No Token",
            "method": "GET",
            "endpoint": "/salesforce/sync-users",
            "expected_status": 401,
            "description": "Should return 401 'Access token required'"
        },
        {
            "name": "4. Salesforce Sync Users - Invalid Token",
            "method": "GET",
            "endpoint": "/salesforce/sync-users", 
            "params": {"token": "invalid"},
            "expected_status": 401,
            "description": "Should return 401 'Invalid or expired Salesforce session'"
        },
        {
            "name": "5. Salesforce Users List",
            "method": "GET",
            "endpoint": "/salesforce/users",
            "expected_status": 200,
            "description": "Should return {'users': [], 'total': 0} (empty since no SF sync has happened yet)"
        },
        {
            "name": "6. Salesforce Debug Configuration",
            "method": "GET",
            "endpoint": "/auth/salesforce/debug",
            "expected_status": 200,
            "description": "Should return configuration info including pkce_enabled: true"
        },
        {
            "name": "7. Auth Profile",
            "method": "GET",
            "endpoint": "/auth/profile",
            "expected_status": 200,
            "description": "Should return technician profile data"
        },
        {
            "name": "8. Auth Login - Regression Test",
            "method": "POST",
            "endpoint": "/auth/login",
            "data": {"username": "test", "password": "test"},
            "expected_status": 200,
            "description": "Should still work (no regression) - mock login"
        }
    ]
    
    results = []
    passed = 0
    failed = 0
    
    for i, test_case in enumerate(test_cases, 1):
        print(f"Testing {test_case['name']}...")
        
        result = test_endpoint(
            method=test_case["method"],
            endpoint=test_case["endpoint"],
            data=test_case.get("data"),
            params=test_case.get("params"),
            expected_status=test_case["expected_status"],
            description=test_case["description"]
        )
        
        results.append({**test_case, **result})
        
        if result["success"]:
            print(f"✅ PASS: {test_case['name']}")
            passed += 1
        else:
            print(f"❌ FAIL: {test_case['name']}")
            print(f"   Expected: {test_case['expected_status']}, Got: {result.get('status_code', 'ERROR')}")
            if 'error' in result:
                print(f"   Error: {result['error']}")
            failed += 1
        
        print()
    
    # Detailed Results Analysis
    print("=" * 80)
    print("DETAILED TEST RESULTS")
    print("=" * 80)
    
    for i, result in enumerate(results, 1):
        print(f"\n{i}. {result['name']}")
        print(f"   URL: {result.get('url', 'N/A')}")
        print(f"   Status: {'✅ PASS' if result['success'] else '❌ FAIL'}")
        print(f"   Expected: {result['expected_status']}, Got: {result.get('status_code', 'ERROR')}")
        
        if result['success']:
            # Analyze specific responses for validation
            response = result.get('response', {})
            
            if result['name'].startswith("1.") or result['name'].startswith("3."):
                # Check for "Access token required" message
                if isinstance(response, dict) and "Access token required" in str(response):
                    print(f"   ✅ Correct error message: Access token required")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("2.") or result['name'].startswith("4."):
                # Check for "Invalid or expired Salesforce session" message
                if isinstance(response, dict) and "Invalid or expired Salesforce session" in str(response):
                    print(f"   ✅ Correct error message: Invalid or expired Salesforce session")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("5."):
                # Check for empty users list
                if isinstance(response, dict) and response.get('users') == [] and response.get('total') == 0:
                    print(f"   ✅ Correct empty response: users=[], total=0")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("6."):
                # Check for PKCE enabled
                if isinstance(response, dict) and response.get('pkce_enabled') is True:
                    print(f"   ✅ PKCE enabled: {response.get('pkce_enabled')}")
                    print(f"   ✅ Client ID configured: {response.get('client_id_set')}")
                    print(f"   ✅ Client Secret configured: {response.get('client_secret_set')}")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("7."):
                # Check for technician profile data
                if isinstance(response, dict) and response.get('full_name'):
                    print(f"   ✅ Profile data: {response.get('full_name')} ({response.get('email', 'No email')})")
                    print(f"   ✅ Skills: {response.get('skills', [])}")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("8."):
                # Check for successful login
                if isinstance(response, dict) and response.get('success') is True:
                    print(f"   ✅ Login successful: {response.get('message', '')}")
                    print(f"   ✅ Technician: {response.get('technician', {}).get('full_name', 'Unknown')}")
                    print(f"   ✅ Source: {response.get('source', 'Unknown')}")
                else:
                    print(f"   ⚠️  Response: {response}")
        else:
            if 'error' in result:
                print(f"   ❌ Error: {result['error']}")
            else:
                print(f"   ❌ Response: {result.get('response', 'No response')}")
    
    # Summary
    print("\n" + "=" * 80)
    print("TEST SUMMARY")
    print("=" * 80)
    print(f"Total Tests: {len(test_cases)}")
    print(f"Passed: {passed}")
    print(f"Failed: {failed}")
    print(f"Success Rate: {(passed/len(test_cases)*100):.1f}%")
    
    if failed == 0:
        print("\n🎉 ALL TESTS PASSED! Salesforce profile and user sync endpoints are working correctly.")
    else:
        print(f"\n⚠️  {failed} test(s) failed. Please review the failed endpoints.")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)