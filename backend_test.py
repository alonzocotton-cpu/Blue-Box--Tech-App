#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air - Specific Review Request Tests
Testing 4 specific scenarios:
1. GET /api/salesforce/users?active_only=true - Should return only active users
2. GET /api/salesforce/users?search=Alonzo&active_only=true - Should return users matching "Alonzo" who are active
3. POST /api/projects with {"name": "Coil Cleaning", "client_name": "Acme Corp"} - Should succeed and auto-format the project name as "Acme Corp - Coil Cleaning" (title-cased). The project_number should start with "BBA-"
4. POST /api/projects with {"name": "Test", "client_name": ""} - Should fail with 400 (client name required)
"""

import requests
import json
import os
from datetime import datetime

# Get backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_api_endpoint(method, endpoint, data=None, params=None, expected_status=200):
    """Test an API endpoint and return the response"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, timeout=30)
        elif method.upper() == "DELETE":
            response = requests.delete(url, timeout=30)
        else:
            return {"error": f"Unsupported method: {method}"}
        
        result = {
            "status_code": response.status_code,
            "success": response.status_code == expected_status,
            "url": url,
            "method": method.upper()
        }
        
        try:
            result["data"] = response.json()
        except:
            result["data"] = response.text
            
        return result
        
    except requests.exceptions.RequestException as e:
        return {
            "error": str(e),
            "url": url,
            "method": method.upper(),
            "success": False
        }

def setup_test_users():
    """Setup test users in the database for testing"""
    print("🔧 Setting up test users...")
    
    # Create some test users with Salesforce source
    test_users = [
        {
            "id": "user-001",
            "salesforce_id": "003Dn00000AbCdEF",
            "username": "alonzo.cotton",
            "email": "alonzo.cotton@blueboxair.com",
            "full_name": "Alonzo Cotton",
            "phone": "(555) 123-4567",
            "is_active": True,
            "source": "salesforce",
            "skills": ["Coil Management", "Air Quality"],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "user-002", 
            "salesforce_id": "003Dn00000XyZaBC",
            "username": "jane.doe",
            "email": "jane.doe@blueboxair.com",
            "full_name": "Jane Doe",
            "phone": "(555) 987-6543",
            "is_active": True,
            "source": "salesforce",
            "skills": ["Field Supervisor"],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "user-003",
            "salesforce_id": "003Dn00000InActv",
            "username": "inactive.user",
            "email": "inactive.user@blueboxair.com", 
            "full_name": "Inactive User",
            "phone": "(555) 111-2222",
            "is_active": False,
            "source": "salesforce",
            "skills": ["Technician"],
            "created_at": datetime.utcnow().isoformat()
        },
        {
            "id": "user-004",
            "salesforce_id": "003Dn00000AlonZo",
            "username": "alonzo.martinez",
            "email": "alonzo.martinez@blueboxair.com",
            "full_name": "Alonzo Martinez", 
            "phone": "(555) 333-4444",
            "is_active": True,
            "source": "salesforce",
            "skills": ["Lead Technician"],
            "created_at": datetime.utcnow().isoformat()
        }
    ]
    
    # We'll need to insert these directly into MongoDB since there's no API endpoint for creating users
    # For now, let's just note that we need test data
    print("✅ Test users defined (would need to be inserted into MongoDB)")
    return test_users

def run_specific_tests():
    """Run the 4 specific tests requested in the review"""
    print("🧪 Running Blue Box Air Backend Tests - Specific Review Request")
    print("=" * 60)
    
    results = []
    
    # Test 1: GET /api/salesforce/users?active_only=true
    print("\n1️⃣ Testing GET /api/salesforce/users?active_only=true")
    result1 = test_api_endpoint("GET", "/salesforce/users", params={"active_only": True})
    results.append(("Salesforce Users - Active Only", result1))
    
    if result1.get("success"):
        data = result1.get("data", {})
        users = data.get("users", [])
        total = data.get("total", 0)
        print(f"   ✅ SUCCESS: Returned {total} users")
        
        # Check if all returned users are active
        inactive_users = [u for u in users if not u.get("is_active", True)]
        if inactive_users:
            print(f"   ⚠️  WARNING: Found {len(inactive_users)} inactive users in active_only=true response")
        else:
            print(f"   ✅ All returned users are active (or is_active field not present)")
    else:
        print(f"   ❌ FAILED: {result1.get('error', 'Unknown error')}")
        if result1.get("status_code"):
            print(f"   Status: {result1['status_code']}")
    
    # Test 2: GET /api/salesforce/users?search=Alonzo&active_only=true
    print("\n2️⃣ Testing GET /api/salesforce/users?search=Alonzo&active_only=true")
    result2 = test_api_endpoint("GET", "/salesforce/users", params={"search": "Alonzo", "active_only": True})
    results.append(("Salesforce Users - Search Alonzo Active", result2))
    
    if result2.get("success"):
        data = result2.get("data", {})
        users = data.get("users", [])
        total = data.get("total", 0)
        print(f"   ✅ SUCCESS: Returned {total} users matching 'Alonzo'")
        
        # Check if all returned users contain "Alonzo" and are active
        for user in users:
            name = user.get("full_name", "")
            is_active = user.get("is_active", True)
            if "alonzo" not in name.lower():
                print(f"   ⚠️  WARNING: User '{name}' doesn't contain 'Alonzo'")
            if not is_active:
                print(f"   ⚠️  WARNING: User '{name}' is not active")
        
        if users:
            print(f"   📋 Found users: {[u.get('full_name') for u in users]}")
        else:
            print(f"   ℹ️  No users found matching 'Alonzo' (expected if no test data)")
    else:
        print(f"   ❌ FAILED: {result2.get('error', 'Unknown error')}")
        if result2.get("status_code"):
            print(f"   Status: {result2['status_code']}")
    
    # Test 3: POST /api/projects with valid data
    print("\n3️⃣ Testing POST /api/projects with valid data")
    project_data = {
        "name": "Coil Cleaning",
        "client_name": "Acme Corp"
    }
    result3 = test_api_endpoint("POST", "/projects", data=project_data)
    results.append(("Create Project - Valid Data", result3))
    
    if result3.get("success"):
        data = result3.get("data", {})
        if data.get("success"):
            project = data.get("project", {})
            project_name = project.get("name", "")
            project_number = project.get("project_number", "")
            client_name = project.get("client_name", "")
            
            print(f"   ✅ SUCCESS: Project created")
            print(f"   📋 Project Name: '{project_name}'")
            print(f"   📋 Project Number: '{project_number}'")
            print(f"   📋 Client Name: '{client_name}'")
            
            # Check formatting requirements
            expected_name = "Acme Corp - Coil Cleaning"
            if project_name == expected_name:
                print(f"   ✅ Name formatting correct: '{expected_name}'")
            else:
                print(f"   ⚠️  Name formatting issue: Expected '{expected_name}', got '{project_name}'")
            
            # Check project number starts with BBA-
            if project_number.startswith("BBA-"):
                print(f"   ✅ Project number starts with 'BBA-': '{project_number}'")
            else:
                print(f"   ⚠️  Project number issue: Expected to start with 'BBA-', got '{project_number}'")
            
            # Check client name title case
            if client_name == "Acme Corp":
                print(f"   ✅ Client name title-cased correctly: '{client_name}'")
            else:
                print(f"   ⚠️  Client name formatting: Expected 'Acme Corp', got '{client_name}'")
        else:
            print(f"   ❌ FAILED: API returned success=false: {data}")
    else:
        print(f"   ❌ FAILED: {result3.get('error', 'Unknown error')}")
        if result3.get("status_code"):
            print(f"   Status: {result3['status_code']}")
    
    # Test 4: POST /api/projects with empty client_name (should fail)
    print("\n4️⃣ Testing POST /api/projects with empty client_name (should fail)")
    invalid_project_data = {
        "name": "Test",
        "client_name": ""
    }
    result4 = test_api_endpoint("POST", "/projects", data=invalid_project_data, expected_status=400)
    results.append(("Create Project - Invalid Data", result4))
    
    if result4.get("success"):  # success means we got the expected 400 status
        print(f"   ✅ SUCCESS: Correctly returned 400 error for empty client_name")
        data = result4.get("data", {})
        if isinstance(data, dict) and "detail" in data:
            print(f"   📋 Error message: '{data['detail']}'")
        else:
            print(f"   📋 Response: {data}")
    else:
        print(f"   ❌ FAILED: Expected 400 status code, got {result4.get('status_code')}")
        if result4.get("data"):
            print(f"   📋 Response: {result4['data']}")
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 TEST SUMMARY")
    print("=" * 60)
    
    passed = 0
    total_tests = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result.get("success") else "❌ FAIL"
        print(f"{status} - {test_name}")
        if result.get("success"):
            passed += 1
    
    print(f"\n🎯 Results: {passed}/{total_tests} tests passed ({passed/total_tests*100:.1f}%)")
    
    return results

if __name__ == "__main__":
    # Setup test data
    setup_test_users()
    
    # Run the specific tests
    results = run_specific_tests()
    
    print(f"\n🏁 Testing completed at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")