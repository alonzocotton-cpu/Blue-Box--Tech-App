#!/usr/bin/env python3
"""
Backend API Testing Script for Blue Box Air Technician App
Tests signature capture, time tracking, and existing APIs
"""

import requests
import json
import sys
from datetime import datetime, timedelta

# Backend URL from frontend .env
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_api_endpoint(method, endpoint, data=None, expected_status=200, description=""):
    """Test a single API endpoint"""
    url = f"{BACKEND_URL}{endpoint}"
    print(f"\n🧪 Testing {method} {endpoint}")
    if description:
        print(f"   Description: {description}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=10)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=10)
        elif method == "PUT":
            response = requests.put(url, json=data, timeout=10)
        elif method == "DELETE":
            response = requests.delete(url, timeout=10)
        else:
            print(f"❌ Unsupported method: {method}")
            return False
            
        print(f"   Status: {response.status_code}")
        
        if response.status_code != expected_status:
            print(f"❌ Expected {expected_status}, got {response.status_code}")
            print(f"   Response: {response.text[:500]}")
            return False
            
        try:
            response_data = response.json()
            print(f"✅ Success - Response keys: {list(response_data.keys())}")
            return response_data
        except:
            print(f"✅ Success - Non-JSON response: {response.text[:100]}")
            return True
            
    except requests.exceptions.RequestException as e:
        print(f"❌ Request failed: {e}")
        return False

def main():
    print("🚀 Starting Backend API Tests for Blue Box Air Technician App")
    print(f"Backend URL: {BACKEND_URL}")
    
    test_results = []
    
    # ============ SIGNATURE CAPTURE APIs ============
    print("\n" + "="*60)
    print("🖊️  SIGNATURE CAPTURE API TESTS")
    print("="*60)
    
    # Test 1: Create a signature
    signature_data = {
        "project_id": "test-proj-1",
        "technician_name": "John Doe",
        "technician_email": "john@test.com",
        "signature_data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "notes": "Service sign-off"
    }
    
    result = test_api_endpoint(
        "POST", "/signatures", 
        data=signature_data,
        description="Create a signature for project test-proj-1"
    )
    
    signature_id = None
    if result and isinstance(result, dict) and result.get("success"):
        signature_id = result.get("signature_id")
        print(f"   Created signature ID: {signature_id}")
        test_results.append(("POST /signatures", "✅ PASS"))
    else:
        test_results.append(("POST /signatures", "❌ FAIL"))
    
    # Test 2: Get signatures for project
    result = test_api_endpoint(
        "GET", "/signatures/test-proj-1",
        description="Get all signatures for project test-proj-1"
    )
    
    if result and isinstance(result, dict) and "signatures" in result:
        signatures = result["signatures"]
        print(f"   Found {len(signatures)} signatures")
        if len(signatures) > 0:
            print(f"   First signature: {signatures[0].get('technician_name', 'Unknown')}")
        test_results.append(("GET /signatures/{project_id}", "✅ PASS"))
    else:
        test_results.append(("GET /signatures/{project_id}", "❌ FAIL"))
    
    # Test 3: Delete signature (if we created one)
    if signature_id:
        result = test_api_endpoint(
            "DELETE", f"/signatures/{signature_id}",
            description=f"Delete signature {signature_id}"
        )
        
        if result and isinstance(result, dict) and result.get("success"):
            test_results.append(("DELETE /signatures/{signature_id}", "✅ PASS"))
        else:
            test_results.append(("DELETE /signatures/{signature_id}", "❌ FAIL"))
    else:
        test_results.append(("DELETE /signatures/{signature_id}", "⚠️  SKIP - No signature ID"))
    
    # ============ TIME TRACKING APIs ============
    print("\n" + "="*60)
    print("⏰ TIME TRACKING API TESTS")
    print("="*60)
    
    # Test 4: Clock in (create time entry)
    time_entry_data = {
        "project_id": "test-proj-1",
        "technician_name": "John Doe",
        "technician_email": "john@test.com"
    }
    
    result = test_api_endpoint(
        "POST", "/time-entries",
        data=time_entry_data,
        description="Clock in for project test-proj-1"
    )
    
    entry_id = None
    if result and isinstance(result, dict) and result.get("success"):
        entry = result.get("entry", {})
        entry_id = entry.get("id")
        print(f"   Created time entry ID: {entry_id}")
        print(f"   Clock in time: {entry.get('clock_in')}")
        print(f"   Status: {entry.get('status')}")
        test_results.append(("POST /time-entries", "✅ PASS"))
    else:
        test_results.append(("POST /time-entries", "❌ FAIL"))
    
    # Test 5: Get time entries for project
    result = test_api_endpoint(
        "GET", "/time-entries/test-proj-1",
        description="Get time entries for project test-proj-1"
    )
    
    if result and isinstance(result, dict):
        entries = result.get("entries", [])
        total_minutes = result.get("total_minutes", 0)
        total_hours = result.get("total_hours", 0)
        print(f"   Found {len(entries)} time entries")
        print(f"   Total minutes: {total_minutes}")
        print(f"   Total hours: {total_hours}")
        test_results.append(("GET /time-entries/{project_id}", "✅ PASS"))
    else:
        test_results.append(("GET /time-entries/{project_id}", "❌ FAIL"))
    
    # Test 6: Clock out (update time entry)
    if entry_id:
        # Use a time 2 hours after now for testing
        clock_out_time = (datetime.utcnow() + timedelta(hours=2)).isoformat()
        clock_out_data = {
            "clock_out": clock_out_time,
            "notes": "Finished HVAC work"
        }
        
        result = test_api_endpoint(
            "PUT", f"/time-entries/{entry_id}",
            data=clock_out_data,
            description=f"Clock out time entry {entry_id}"
        )
        
        if result and isinstance(result, dict) and result.get("success"):
            entry = result.get("entry", {})
            duration = entry.get("duration_minutes")
            status = entry.get("status")
            print(f"   Duration calculated: {duration} minutes")
            print(f"   Status: {status}")
            test_results.append(("PUT /time-entries/{entry_id}", "✅ PASS"))
        else:
            test_results.append(("PUT /time-entries/{entry_id}", "❌ FAIL"))
    else:
        test_results.append(("PUT /time-entries/{entry_id}", "⚠️  SKIP - No entry ID"))
    
    # Test 7: Delete time entry
    if entry_id:
        result = test_api_endpoint(
            "DELETE", f"/time-entries/{entry_id}",
            description=f"Delete time entry {entry_id}"
        )
        
        if result and isinstance(result, dict) and result.get("success"):
            test_results.append(("DELETE /time-entries/{entry_id}", "✅ PASS"))
        else:
            test_results.append(("DELETE /time-entries/{entry_id}", "❌ FAIL"))
    else:
        test_results.append(("DELETE /time-entries/{entry_id}", "⚠️  SKIP - No entry ID"))
    
    # ============ EXISTING API SANITY CHECKS ============
    print("\n" + "="*60)
    print("🔍 EXISTING API SANITY CHECKS")
    print("="*60)
    
    # Test 8: Get projects list
    result = test_api_endpoint(
        "GET", "/projects",
        description="Get list of all projects"
    )
    
    if result and isinstance(result, dict) and "projects" in result:
        projects = result["projects"]
        total = result.get("total", 0)
        print(f"   Found {len(projects)} projects (total: {total})")
        if len(projects) > 0:
            print(f"   First project: {projects[0].get('name', 'Unknown')}")
        test_results.append(("GET /projects", "✅ PASS"))
    else:
        test_results.append(("GET /projects", "❌ FAIL"))
    
    # Test 9: Get specific project (the one mentioned in review request)
    result = test_api_endpoint(
        "GET", "/projects/69d42c46ed575b4fa15b3265",
        description="Get specific project details (recent fix verification)"
    )
    
    if result and isinstance(result, dict):
        project_name = result.get("name", "Unknown")
        client_name = result.get("client_name", "Unknown")
        print(f"   Project: {project_name}")
        print(f"   Client: {client_name}")
        test_results.append(("GET /projects/{specific_id}", "✅ PASS"))
    else:
        test_results.append(("GET /projects/{specific_id}", "❌ FAIL"))
    
    # ============ ERROR HANDLING TESTS ============
    print("\n" + "="*60)
    print("🚨 ERROR HANDLING TESTS")
    print("="*60)
    
    # Test 10: POST signature with missing required fields
    result = test_api_endpoint(
        "POST", "/signatures",
        data={"project_id": "test"},  # Missing signature_data
        expected_status=400,
        description="Test signature creation with missing required fields"
    )
    
    if result is not False:  # Any response (even error) is expected
        test_results.append(("POST /signatures (missing fields)", "✅ PASS"))
    else:
        test_results.append(("POST /signatures (missing fields)", "❌ FAIL"))
    
    # Test 11: POST time entry with missing required fields
    result = test_api_endpoint(
        "POST", "/time-entries",
        data={"technician_name": "Test"},  # Missing project_id
        expected_status=400,
        description="Test time entry creation with missing required fields"
    )
    
    if result is not False:  # Any response (even error) is expected
        test_results.append(("POST /time-entries (missing fields)", "✅ PASS"))
    else:
        test_results.append(("POST /time-entries (missing fields)", "❌ FAIL"))
    
    # ============ FINAL RESULTS ============
    print("\n" + "="*80)
    print("📊 FINAL TEST RESULTS")
    print("="*80)
    
    passed = 0
    failed = 0
    skipped = 0
    
    for test_name, result in test_results:
        print(f"{result} {test_name}")
        if "✅" in result:
            passed += 1
        elif "❌" in result:
            failed += 1
        else:
            skipped += 1
    
    print(f"\n📈 Summary: {passed} passed, {failed} failed, {skipped} skipped")
    
    if failed > 0:
        print("❌ Some tests failed - check the details above")
        sys.exit(1)
    else:
        print("✅ All critical tests passed!")
        sys.exit(0)

if __name__ == "__main__":
    main()