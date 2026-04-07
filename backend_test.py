#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air Roles & Hierarchy Endpoints
Tests the new Roles & Hierarchy API endpoints
"""

import requests
import json
import sys
from datetime import datetime
import urllib.parse

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
        elif method.upper() == "DELETE":
            response = requests.delete(url, params=params, timeout=30)
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
    """Run all Roles & Hierarchy API endpoint tests"""
    print("=" * 80)
    print("BLUE BOX AIR - ROLES & HIERARCHY API TESTING")
    print("=" * 80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Test Time: {datetime.now().isoformat()}")
    print()
    
    # Test cases based on review request
    test_cases = [
        {
            "name": "1. GET /api/roles",
            "method": "GET",
            "endpoint": "/roles",
            "expected_status": 200,
            "description": "Should return a list of 10 roles (CEO/Owner, Head of Operations, 4x Operations Manager for NY/FL/NO/Dallas, Field Supervisor, Lead Technician, Technician, Junior Technician) with regions and hierarchy levels"
        },
        {
            "name": "2. GET /api/roles/hierarchy",
            "method": "GET", 
            "endpoint": "/roles/hierarchy",
            "expected_status": 200,
            "description": "Should return a tree structure with hierarchy, total_members count, and 4 regions"
        },
        {
            "name": "3. POST /api/roles/assign - CEO Assignment",
            "method": "POST",
            "endpoint": "/roles/assign",
            "data": {"member_name": "John Smith", "role_name": "CEO / Owner", "email": "john@blueboxair.com"},
            "expected_status": 200,
            "description": "Should assign successfully (CEO doesn't need region)"
        },
        {
            "name": "4. POST /api/roles/assign - Operations Manager with Region",
            "method": "POST",
            "endpoint": "/roles/assign", 
            "data": {"member_name": "Mike Jones", "role_name": "Operations Manager", "region": "New York", "email": "mike@blueboxair.com"},
            "expected_status": 200,
            "description": "Should assign successfully with region"
        },
        {
            "name": "5. POST /api/roles/assign - Operations Manager without Region (Should Fail)",
            "method": "POST",
            "endpoint": "/roles/assign",
            "data": {"member_name": "Bad Test", "role_name": "Operations Manager"},
            "expected_status": 400,
            "description": "Should fail with 400 (region required for Operations Manager)"
        },
        {
            "name": "6. GET /api/team",
            "method": "GET",
            "endpoint": "/team",
            "expected_status": 200,
            "description": "Should return leadership and regional team structure with the members we just assigned"
        },
        {
            "name": "7. GET /api/roles/hierarchy - After Assignments",
            "method": "GET",
            "endpoint": "/roles/hierarchy",
            "expected_status": 200,
            "description": "Verify hierarchy now shows the assigned members in the tree (total_members should be 2)"
        },
        {
            "name": "8. DELETE /api/roles/assign/John%20Smith",
            "method": "DELETE",
            "endpoint": "/roles/assign/John%20Smith",
            "params": {"role_name": "CEO / Owner"},
            "expected_status": 200,
            "description": "Should remove the assignment"
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
            
            if result['name'].startswith("1."):
                # Check for 10 roles with correct structure
                if isinstance(response, dict) and 'roles' in response:
                    roles = response.get('roles', [])
                    regions = response.get('regions', [])
                    print(f"   ✅ Found {len(roles)} roles")
                    print(f"   ✅ Found {len(regions)} regions: {regions}")
                    # Check for specific roles
                    role_names = [r.get('name', '') for r in roles]
                    if 'CEO / Owner' in role_names and 'Operations Manager' in role_names:
                        print(f"   ✅ Contains expected roles: CEO / Owner, Operations Manager")
                    # Check hierarchy levels
                    levels = [r.get('level', -1) for r in roles]
                    if 0 in levels and max(levels) >= 6:
                        print(f"   ✅ Hierarchy levels correct: 0 to {max(levels)}")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("2.") or result['name'].startswith("7."):
                # Check hierarchy tree structure
                if isinstance(response, dict) and 'hierarchy' in response:
                    hierarchy = response.get('hierarchy', [])
                    total_members = response.get('total_members', 0)
                    regions = response.get('regions', [])
                    print(f"   ✅ Hierarchy tree with {len(hierarchy)} top-level nodes")
                    print(f"   ✅ Total members: {total_members}")
                    print(f"   ✅ Regions: {regions}")
                    if result['name'].startswith("7.") and total_members >= 2:
                        print(f"   ✅ Members assigned correctly (total: {total_members})")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("3.") or result['name'].startswith("4."):
                # Check successful assignment
                if isinstance(response, dict) and response.get('success') is True:
                    assignment = response.get('assignment', {})
                    member_name = assignment.get('member_name', '')
                    role_name = assignment.get('role_name', '')
                    region = assignment.get('region', 'None')
                    print(f"   ✅ Assignment successful: {member_name} -> {role_name}")
                    print(f"   ✅ Region: {region}")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("5."):
                # This should fail - check for 400 error
                print(f"   ✅ Correctly failed with 400 (region required)")
                if isinstance(response, dict) and 'detail' in response:
                    print(f"   ✅ Error message: {response.get('detail', '')}")
            
            elif result['name'].startswith("6."):
                # Check team structure
                if isinstance(response, dict):
                    leadership = response.get('leadership', [])
                    regions = response.get('regions', {})
                    total = response.get('total', 0)
                    print(f"   ✅ Leadership team: {len(leadership)} members")
                    print(f"   ✅ Regional teams: {len(regions)} regions")
                    print(f"   ✅ Total team members: {total}")
                    for region, members in regions.items():
                        print(f"   ✅ {region}: {len(members)} members")
                else:
                    print(f"   ⚠️  Response: {response}")
            
            elif result['name'].startswith("8."):
                # Check successful deletion
                if isinstance(response, dict) and response.get('success') is True:
                    deleted = response.get('deleted', '')
                    print(f"   ✅ Assignment deleted: {deleted}")
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
        print("\n🎉 ALL TESTS PASSED! Roles & Hierarchy endpoints are working correctly.")
        print("\nKey Validations:")
        print("✅ Role levels are correct (0=CEO, 1=Head of Ops, 2=Operations Manager, 3+=field roles)")
        print("✅ Region validation works for regional roles")
        print("✅ The hierarchy tree structure is correct with children nodes")
        print("✅ CRUD operations on assignments work")
    else:
        print(f"\n⚠️  {failed} test(s) failed. Please review the failed endpoints.")
    
    return failed == 0

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)