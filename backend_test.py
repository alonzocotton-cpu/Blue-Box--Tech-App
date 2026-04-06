#!/usr/bin/env python3
"""
Backend API Testing for Blue Box Air App - Reports Endpoint Focus
Testing the project reports endpoint as requested in the review.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com"
API_BASE = f"{BACKEND_URL}/api"

def test_endpoint(method, endpoint, data=None, expected_status=200, description=""):
    """Test an API endpoint and return the response"""
    url = f"{API_BASE}{endpoint}"
    print(f"\n🧪 Testing {method} {endpoint}")
    if description:
        print(f"   Description: {description}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=30)
        elif method == "DELETE":
            response = requests.delete(url, timeout=30)
        else:
            print(f"❌ Unsupported method: {method}")
            return None
            
        print(f"   Status: {response.status_code}")
        
        if response.status_code == expected_status:
            print(f"   ✅ Expected status {expected_status}")
        else:
            print(f"   ❌ Expected {expected_status}, got {response.status_code}")
            
        # Try to parse JSON response
        try:
            json_response = response.json()
            print(f"   Response size: {len(str(json_response))} chars")
            return json_response
        except:
            print(f"   Response (text): {response.text[:200]}...")
            return response.text
            
    except requests.exceptions.RequestException as e:
        print(f"   ❌ Request failed: {e}")
        return None

def main():
    """Run the backend API tests focusing on reports endpoints"""
    print("=" * 80)
    print("🔬 BLUE BOX AIR - BACKEND API TESTING")
    print("Focus: Project Reports Endpoint Testing")
    print("=" * 80)
    
    # Test results tracking
    tests_passed = 0
    tests_failed = 0
    
    # Test 1: GET /api/reports/proj-001 - Should return report with James Wilson contact
    print("\n" + "="*50)
    print("TEST 1: GET /api/reports/proj-001")
    print("="*50)
    
    response = test_endpoint("GET", "/reports/proj-001", 
                           description="Should return report with project details, primary_contact (James Wilson), equipment_reports array, summary stats")
    
    if response and isinstance(response, dict):
        # Check for required fields
        required_fields = ["project", "primary_contact", "equipment_reports", "summary"]
        missing_fields = [field for field in required_fields if field not in response]
        
        if not missing_fields:
            print("   ✅ All required fields present")
            
            # Check primary_contact details
            primary_contact = response.get("primary_contact", {})
            if primary_contact and primary_contact.get("name") == "James Wilson":
                print(f"   ✅ Primary contact is James Wilson")
                print(f"   📞 Phone: {primary_contact.get('phone', 'N/A')}")
                print(f"   📧 Email: {primary_contact.get('email', 'N/A')}")
                tests_passed += 1
            else:
                print(f"   ❌ Primary contact issue. Expected James Wilson, got: {primary_contact.get('name', 'None')}")
                tests_failed += 1
                
            # Check equipment_reports array
            equipment_reports = response.get("equipment_reports", [])
            print(f"   📊 Equipment reports count: {len(equipment_reports)}")
            
            # Check summary stats
            summary = response.get("summary", {})
            print(f"   📈 Summary stats: {summary}")
            
        else:
            print(f"   ❌ Missing required fields: {missing_fields}")
            tests_failed += 1
    else:
        print("   ❌ Invalid response format")
        tests_failed += 1
    
    # Test 2: GET /api/reports/proj-002 - Should return Metro Hospital project with Dr. Sarah Mitchell
    print("\n" + "="*50)
    print("TEST 2: GET /api/reports/proj-002")
    print("="*50)
    
    response = test_endpoint("GET", "/reports/proj-002",
                           description="Should return report for Metro Hospital project with primary_contact (Dr. Sarah Mitchell)")
    
    if response and isinstance(response, dict):
        primary_contact = response.get("primary_contact", {})
        project = response.get("project", {})
        
        if primary_contact and primary_contact.get("name") == "Dr. Sarah Mitchell":
            print(f"   ✅ Primary contact is Dr. Sarah Mitchell")
            print(f"   🏥 Project: {project.get('name', 'N/A')}")
            print(f"   📞 Phone: {primary_contact.get('phone', 'N/A')}")
            tests_passed += 1
        else:
            print(f"   ❌ Primary contact issue. Expected Dr. Sarah Mitchell, got: {primary_contact.get('name', 'None')}")
            tests_failed += 1
    else:
        print("   ❌ Invalid response format")
        tests_failed += 1
    
    # Test 3: GET /api/reports/nonexistent - Should return 404
    print("\n" + "="*50)
    print("TEST 3: GET /api/reports/nonexistent")
    print("="*50)
    
    response = test_endpoint("GET", "/reports/nonexistent", expected_status=404,
                           description="Should return 404 for non-existent project")
    
    if response is not None:
        tests_passed += 1
    else:
        tests_failed += 1
    
    # Test 4: GET /api/projects - Verify projects are returned
    print("\n" + "="*50)
    print("TEST 4: GET /api/projects")
    print("="*50)
    
    response = test_endpoint("GET", "/projects",
                           description="Verify projects are returned (should include custom projects from DB too)")
    
    if response and isinstance(response, dict) and "projects" in response:
        projects = response.get("projects", [])
        print(f"   ✅ Projects returned: {len(projects)} projects")
        
        # Check if proj-001 and proj-002 are in the list
        project_ids = [p.get("id") for p in projects]
        if "proj-001" in project_ids and "proj-002" in project_ids:
            print("   ✅ Both proj-001 and proj-002 found in projects list")
            tests_passed += 1
        else:
            print(f"   ❌ Missing expected projects. Found IDs: {project_ids}")
            tests_failed += 1
            
        # Show project details
        for proj in projects[:3]:  # Show first 3 projects
            print(f"   📋 Project: {proj.get('id')} - {proj.get('name', 'N/A')}")
            if proj.get('primary_contact'):
                print(f"      Contact: {proj['primary_contact'].get('name', 'N/A')}")
    else:
        print("   ❌ Invalid projects response")
        tests_failed += 1
    
    # Test 5: POST /api/projects + GET /api/reports/{new_id} - Create custom project and test its report
    print("\n" + "="*50)
    print("TEST 5: POST /api/projects + GET /api/reports/{new_id}")
    print("="*50)
    
    # Create a new project
    new_project_data = {
        "name": "Test Report Project",
        "client_name": "Test Corp",
        "address": "456 Test Ave",
        "contact_name": "John Doe",
        "contact_phone": "(555) 999-0000"
    }
    
    create_response = test_endpoint("POST", "/projects", data=new_project_data,
                                  description="Create a custom project")
    
    if create_response and isinstance(create_response, dict) and create_response.get("success"):
        new_project = create_response.get("project", {})
        new_project_id = new_project.get("id")
        
        if new_project_id:
            print(f"   ✅ Project created with ID: {new_project_id}")
            print(f"   📋 Project name: {new_project.get('name')}")
            
            # Now test the report for this new project
            print(f"\n   Testing GET /api/reports/{new_project_id}")
            report_response = test_endpoint("GET", f"/reports/{new_project_id}",
                                          description=f"Should return 200 with report for custom project {new_project_id}")
            
            if report_response and isinstance(report_response, dict):
                project_in_report = report_response.get("project", {})
                primary_contact = report_response.get("primary_contact", {})
                
                if project_in_report.get("name") == "Test Report Project":
                    print("   ✅ Report contains correct project name")
                    
                if primary_contact and primary_contact.get("name") == "John Doe":
                    print("   ✅ Report contains correct primary contact (John Doe)")
                    print(f"   📞 Contact phone: {primary_contact.get('phone', 'N/A')}")
                    tests_passed += 1
                else:
                    print(f"   ❌ Primary contact issue. Expected John Doe, got: {primary_contact.get('name', 'None')}")
                    tests_failed += 1
                    
                # Check report structure
                if "summary" in report_response and "equipment_reports" in report_response:
                    print("   ✅ Report has required structure (summary, equipment_reports)")
                else:
                    print("   ❌ Report missing required structure")
                    
            else:
                print("   ❌ Failed to get report for new project")
                tests_failed += 1
        else:
            print("   ❌ No project ID returned from creation")
            tests_failed += 1
    else:
        print("   ❌ Failed to create project")
        tests_failed += 1
    
    # Final Results
    print("\n" + "="*80)
    print("🏁 TESTING COMPLETE")
    print("="*80)
    print(f"✅ Tests Passed: {tests_passed}")
    print(f"❌ Tests Failed: {tests_failed}")
    print(f"📊 Success Rate: {(tests_passed/(tests_passed+tests_failed)*100):.1f}%" if (tests_passed+tests_failed) > 0 else "No tests run")
    
    if tests_failed == 0:
        print("\n🎉 ALL TESTS PASSED! Reports endpoint is working correctly.")
        return 0
    else:
        print(f"\n⚠️  {tests_failed} test(s) failed. Check the issues above.")
        return 1

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)