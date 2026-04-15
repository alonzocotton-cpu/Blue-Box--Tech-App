#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air Technician App
Testing new Kanban and Equipment endpoints
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200):
    """Test an API endpoint and return response"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, json=data, timeout=30)
        else:
            return {"error": f"Unsupported method: {method}"}
        
        print(f"\n{method.upper()} {endpoint}")
        if params:
            print(f"Params: {params}")
        if data:
            print(f"Data: {json.dumps(data, indent=2)}")
        print(f"Status: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                result = response.json()
                print(f"Response: {json.dumps(result, indent=2)}")
                return {"success": True, "data": result, "status": response.status_code}
            except:
                print(f"Response (text): {response.text}")
                return {"success": True, "data": response.text, "status": response.status_code}
        else:
            print(f"❌ Expected status {expected_status}, got {response.status_code}")
            try:
                error_data = response.json()
                print(f"Error: {json.dumps(error_data, indent=2)}")
                return {"success": False, "error": error_data, "status": response.status_code}
            except:
                print(f"Error (text): {response.text}")
                return {"success": False, "error": response.text, "status": response.status_code}
                
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return {"success": False, "error": str(e)}

def main():
    """Test the new Kanban and Equipment endpoints"""
    print("=" * 80)
    print("TESTING NEW KANBAN AND EQUIPMENT ENDPOINTS")
    print("=" * 80)
    
    test_results = []
    
    # Test 1: GET /api/projects/kanban - Basic kanban view
    print("\n" + "="*50)
    print("TEST 1: GET /api/projects/kanban")
    print("="*50)
    result = test_endpoint("GET", "/projects/kanban")
    test_results.append(("GET /api/projects/kanban", result["success"]))
    
    if result["success"]:
        data = result["data"]
        # Verify structure
        required_fields = ["kanban", "counts", "total", "is_admin"]
        kanban_fields = ["in_progress", "completed", "not_completed"]
        
        missing_fields = [f for f in required_fields if f not in data]
        if missing_fields:
            print(f"❌ Missing required fields: {missing_fields}")
        else:
            print("✅ All required top-level fields present")
            
        if "kanban" in data:
            missing_kanban = [f for f in kanban_fields if f not in data["kanban"]]
            if missing_kanban:
                print(f"❌ Missing kanban fields: {missing_kanban}")
            else:
                print("✅ All kanban fields present")
                print(f"   - In Progress: {len(data['kanban']['in_progress'])} projects")
                print(f"   - Completed: {len(data['kanban']['completed'])} projects")
                print(f"   - Not Completed: {len(data['kanban']['not_completed'])} projects")
                print(f"   - Total: {data['total']} projects")
                print(f"   - Is Admin: {data['is_admin']}")
    
    # Test 2: GET /api/projects/kanban?email=alonzo.cotton@blueboxair.com&view_all=true - Admin user
    print("\n" + "="*50)
    print("TEST 2: GET /api/projects/kanban (Admin User)")
    print("="*50)
    params = {"email": "alonzo.cotton@blueboxair.com", "view_all": "true"}
    result = test_endpoint("GET", "/projects/kanban", params=params)
    test_results.append(("GET /api/projects/kanban (admin)", result["success"]))
    
    if result["success"]:
        data = result["data"]
        if data.get("is_admin") == True:
            print("✅ Admin user correctly identified (is_admin: true)")
        else:
            print(f"❌ Admin user not identified correctly (is_admin: {data.get('is_admin')})")
    
    # Test 3: GET /api/projects/kanban?email=random@test.com&view_all=true - Non-admin user
    print("\n" + "="*50)
    print("TEST 3: GET /api/projects/kanban (Non-Admin User)")
    print("="*50)
    params = {"email": "random@test.com", "view_all": "true"}
    result = test_endpoint("GET", "/projects/kanban", params=params)
    test_results.append(("GET /api/projects/kanban (non-admin)", result["success"]))
    
    if result["success"]:
        data = result["data"]
        if data.get("is_admin") == False:
            print("✅ Non-admin user correctly identified (is_admin: false)")
        else:
            print(f"❌ Non-admin user incorrectly identified (is_admin: {data.get('is_admin')})")
    
    # Test 4: GET /api/admin/list - Should return 4 admins
    print("\n" + "="*50)
    print("TEST 4: GET /api/admin/list")
    print("="*50)
    result = test_endpoint("GET", "/admin/list")
    test_results.append(("GET /api/admin/list", result["success"]))
    
    if result["success"]:
        data = result["data"]
        admins = data.get("admins", [])
        total = data.get("total", 0)
        
        print(f"Total admins: {total}")
        
        expected_admins = [
            "alonzo.cotton@blueboxair.com",
            "jim@blueboxair.com", 
            "linh.matthews@blueboxair.com",
            "noah.ward@blueboxair.com"
        ]
        
        admin_emails = [admin.get("email", "") for admin in admins]
        print(f"Admin emails found: {admin_emails}")
        
        if total == 4:
            print("✅ Correct number of admins (4)")
        else:
            print(f"❌ Expected 4 admins, found {total}")
            
        missing_admins = [email for email in expected_admins if email not in admin_emails]
        if missing_admins:
            print(f"❌ Missing expected admins: {missing_admins}")
        else:
            print("✅ All expected admins present")
    
    # Test 5: Regression test - POST /api/auth/login
    print("\n" + "="*50)
    print("TEST 5: POST /api/auth/login (Regression Test)")
    print("="*50)
    login_data = {"username": "test", "password": "test"}
    result = test_endpoint("POST", "/auth/login", data=login_data)
    test_results.append(("POST /api/auth/login (regression)", result["success"]))
    
    if result["success"]:
        data = result["data"]
        if data.get("success") == True:
            print("✅ Login still working correctly")
            print(f"   - Technician: {data.get('technician', {}).get('full_name', 'Unknown')}")
            print(f"   - Source: {data.get('source', 'Unknown')}")
        else:
            print(f"❌ Login failed: {data}")
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, success in test_results if success)
    total_tests = len(test_results)
    
    for test_name, success in test_results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\nResults: {passed}/{total_tests} tests passed ({passed/total_tests*100:.1f}%)")
    
    if passed == total_tests:
        print("\n🎉 ALL TESTS PASSED! New Kanban and Equipment endpoints working correctly.")
        return True
    else:
        print(f"\n⚠️  {total_tests - passed} test(s) failed. Please review the failures above.")
        return False

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)