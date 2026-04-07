#!/usr/bin/env python3
"""
Backend API Testing Script for Blue Box Air Admin Access Control
Tests the 5 admin endpoints as specified in the review request
"""

import requests
import json
import sys
from typing import Dict, Any

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_admin_check_valid_admin():
    """Test 1: GET /api/admin/check?email=alonzo.cotton@blueboxair.com"""
    print("🔍 Test 1: Check admin status for alonzo.cotton@blueboxair.com")
    
    url = f"{BACKEND_URL}/admin/check"
    params = {"email": "alonzo.cotton@blueboxair.com"}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            # Verify expected response structure
            expected_fields = ["is_admin", "email", "granted_by"]
            if all(field in data for field in expected_fields):
                if data["is_admin"] == True and data["email"] == "alonzo.cotton@blueboxair.com" and data["granted_by"] == "system":
                    print("   ✅ PASS: Admin check returned correct admin status")
                    return True
                else:
                    print(f"   ❌ FAIL: Unexpected values - is_admin: {data.get('is_admin')}, email: {data.get('email')}, granted_by: {data.get('granted_by')}")
                    return False
            else:
                print(f"   ❌ FAIL: Missing expected fields. Got: {list(data.keys())}")
                return False
        else:
            print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_admin_check_non_admin():
    """Test 2: GET /api/admin/check?email=random@test.com"""
    print("\n🔍 Test 2: Check admin status for random@test.com")
    
    url = f"{BACKEND_URL}/admin/check"
    params = {"email": "random@test.com"}
    
    try:
        response = requests.get(url, params=params, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            if data.get("is_admin") == False:
                print("   ✅ PASS: Non-admin user correctly identified")
                return True
            else:
                print(f"   ❌ FAIL: Expected is_admin=false, got {data.get('is_admin')}")
                return False
        else:
            print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_admin_list():
    """Test 3: GET /api/admin/list"""
    print("\n🔍 Test 3: Get admin list")
    
    url = f"{BACKEND_URL}/admin/list"
    
    try:
        response = requests.get(url, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            if "admins" in data and "total" in data:
                admins = data["admins"]
                if len(admins) >= 1:
                    # Check if alonzo.cotton@blueboxair.com is in the list
                    alonzo_found = any(admin.get("email") == "alonzo.cotton@blueboxair.com" for admin in admins)
                    if alonzo_found:
                        print(f"   ✅ PASS: Admin list contains {len(admins)} admin(s) including alonzo.cotton@blueboxair.com")
                        return True
                    else:
                        print("   ❌ FAIL: alonzo.cotton@blueboxair.com not found in admin list")
                        return False
                else:
                    print("   ❌ FAIL: Admin list is empty")
                    return False
            else:
                print(f"   ❌ FAIL: Missing expected fields. Got: {list(data.keys())}")
                return False
        else:
            print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_admin_grant_success():
    """Test 4: POST /api/admin/grant with admin requester"""
    print("\n🔍 Test 4: Grant admin access (admin requester)")
    
    url = f"{BACKEND_URL}/admin/grant"
    payload = {
        "requester_email": "alonzo.cotton@blueboxair.com",
        "email": "test@blueboxair.com",
        "name": "Test User"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Payload: {json.dumps(payload, indent=2)}")
        
        if response.status_code == 200:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            if data.get("success") == True:
                print("   ✅ PASS: Admin access granted successfully")
                return True
            else:
                print(f"   ❌ FAIL: Expected success=true, got {data.get('success')}")
                return False
        else:
            print(f"   ❌ FAIL: Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def test_admin_grant_failure():
    """Test 5: POST /api/admin/grant with non-admin requester"""
    print("\n🔍 Test 5: Grant admin access (non-admin requester)")
    
    url = f"{BACKEND_URL}/admin/grant"
    payload = {
        "requester_email": "random@test.com",
        "email": "someone@test.com"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"   Status: {response.status_code}")
        print(f"   Payload: {json.dumps(payload, indent=2)}")
        
        if response.status_code == 403:
            data = response.json()
            print(f"   Response: {json.dumps(data, indent=2)}")
            
            if "Only admins can grant admin access" in data.get("detail", ""):
                print("   ✅ PASS: Non-admin requester correctly rejected with 403")
                return True
            else:
                print(f"   ❌ FAIL: Expected 'Only admins can grant admin access' error, got: {data.get('detail')}")
                return False
        else:
            print(f"   ❌ FAIL: Expected 403, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ ERROR: {str(e)}")
        return False

def main():
    """Run all admin access control tests"""
    print("🚀 Blue Box Air Admin Access Control API Testing")
    print(f"Backend URL: {BACKEND_URL}")
    print("=" * 60)
    
    tests = [
        test_admin_check_valid_admin,
        test_admin_check_non_admin,
        test_admin_list,
        test_admin_grant_success,
        test_admin_grant_failure
    ]
    
    results = []
    for test in tests:
        result = test()
        results.append(result)
    
    print("\n" + "=" * 60)
    print("📊 SUMMARY")
    print("=" * 60)
    
    passed = sum(results)
    total = len(results)
    
    for i, (test, result) in enumerate(zip(tests, results), 1):
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"Test {i}: {status} - {test.__doc__.split(':')[1].strip()}")
    
    print(f"\nOverall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    
    if passed == total:
        print("🎉 ALL TESTS PASSED!")
        return 0
    else:
        print("⚠️  SOME TESTS FAILED!")
        return 1

if __name__ == "__main__":
    sys.exit(main())