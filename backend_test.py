#!/usr/bin/env python3
"""
BBA Tech Backend API Testing
Tests the new report generation endpoint and regression tests
"""

import requests
import json
import base64
import sys
from urllib.parse import quote
from datetime import datetime

# Backend URL - using external URL as specified in review request
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_report_generation():
    """Test the main report generation endpoint with expected calculations"""
    print("🧪 Testing POST /api/projects/{project_id}/generate-report...")
    
    project_id = "69d42c46ed575b4fa15b3265"
    url = f"{BACKEND_URL}/projects/{project_id}/generate-report"
    
    payload = {
        "technician_name": "Jim Metropoulos",
        "technician_email": "jim@blueboxair.com"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            
            # Check required fields
            required_fields = ["success", "pdf_base64", "filename", "report_data"]
            missing_fields = [field for field in required_fields if field not in data]
            if missing_fields:
                print(f"   ❌ Missing required fields: {missing_fields}")
                return False
                
            # Check success
            if not data.get("success"):
                print(f"   ❌ Success is False")
                return False
                
            # Check PDF base64 is non-empty
            pdf_base64 = data.get("pdf_base64", "")
            if not pdf_base64:
                print(f"   ❌ PDF base64 is empty")
                return False
                
            # Check filename contains "BBA_Report"
            filename = data.get("filename", "")
            if "BBA_Report" not in filename:
                print(f"   ❌ Filename doesn't contain 'BBA_Report': {filename}")
                return False
                
            # Check report_data structure
            report_data = data.get("report_data", {})
            if "unit_averages" not in report_data or "overall_averages" not in report_data:
                print(f"   ❌ Missing unit_averages or overall_averages in report_data")
                return False
                
            unit_averages = report_data["unit_averages"]
            overall_averages = report_data["overall_averages"]
            
            # Check we have 2 equipment entries
            if len(unit_averages) != 2:
                print(f"   ❌ Expected 2 unit averages, got {len(unit_averages)}")
                print(f"   📊 Unit averages: {json.dumps(unit_averages, indent=2)}")
                return False
                
            # Verify calculations (allowing for small floating point differences)
            def check_value(actual, expected, name):
                if actual is None:
                    print(f"   ❌ {name} is None, expected {expected}")
                    return False
                if abs(actual - expected) > 0.1:
                    print(f"   ❌ {name}: expected {expected}, got {actual}")
                    return False
                return True
                
            # Check Equipment 1 (AHU-01 Roof Unit): DP Drop = 1.3 inWC, Airflow Increase = 230.0 FPM
            eq1 = unit_averages[0]
            if not check_value(eq1.get("avg_pressure_drop"), 1.3, "Equipment 1 avg_pressure_drop"):
                return False
            if not check_value(eq1.get("avg_airflow_increase"), 230.0, "Equipment 1 avg_airflow_increase"):
                return False
                
            # Check Equipment 2 (RTU-02 West Wing): DP Drop = 1.5 inWC, Airflow Increase = 250.0 FPM  
            eq2 = unit_averages[1]
            if not check_value(eq2.get("avg_pressure_drop"), 1.5, "Equipment 2 avg_pressure_drop"):
                return False
            if not check_value(eq2.get("avg_airflow_increase"), 250.0, "Equipment 2 avg_airflow_increase"):
                return False
                
            # Check Overall: Avg DP Drop = 1.4 inWC, Avg Airflow Increase = 240.0 FPM
            if not check_value(overall_averages.get("avg_pressure_drop"), 1.4, "Overall avg_pressure_drop"):
                return False
            if not check_value(overall_averages.get("avg_airflow_increase"), 240.0, "Overall avg_airflow_increase"):
                return False
                
            print(f"   ✅ Report generation successful with correct calculations")
            print(f"   📊 Equipment 1: DP Drop={eq1.get('avg_pressure_drop')}, Airflow Increase={eq1.get('avg_airflow_increase')}")
            print(f"   📊 Equipment 2: DP Drop={eq2.get('avg_pressure_drop')}, Airflow Increase={eq2.get('avg_airflow_increase')}")
            print(f"   📊 Overall: DP Drop={overall_averages.get('avg_pressure_drop')}, Airflow Increase={overall_averages.get('avg_airflow_increase')}")
            
            return True
            
        else:
            print(f"   ❌ Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return False

def test_report_generation_404():
    """Test 404 for missing project"""
    print("🧪 Testing POST /api/projects/nonexistent/generate-report...")
    
    url = f"{BACKEND_URL}/projects/nonexistent/generate-report"
    payload = {
        "technician_name": "Test",
        "technician_email": "test@test.com"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 404:
            print(f"   ✅ Correctly returns 404 for nonexistent project")
            return True
        else:
            print(f"   ❌ Expected 404, got {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return False

def test_auth_login_regression():
    """Regression test for auth login"""
    print("🧪 Testing POST /api/auth/login (regression)...")
    
    url = f"{BACKEND_URL}/auth/login"
    payload = {
        "username": "demo@blueboxair.com",
        "password": "BBAReview2025!"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get("success"):
                print(f"   ✅ Login successful")
                return True
            else:
                print(f"   ❌ Login failed: {data}")
                return False
        else:
            print(f"   ❌ Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return False

def test_projects_list_regression():
    """Regression test for projects list"""
    print("🧪 Testing GET /api/projects (regression)...")
    
    url = f"{BACKEND_URL}/projects"
    
    try:
        response = requests.get(url, timeout=10)
        print(f"   Status: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if isinstance(data, dict) and "projects" in data:
                projects = data["projects"]
                if isinstance(projects, list):
                    print(f"   ✅ Projects list returned {len(projects)} projects")
                    return True
                else:
                    print(f"   ❌ Expected projects array, got: {type(projects)}")
                    return False
            elif isinstance(data, list):
                print(f"   ✅ Projects list returned {len(data)} projects")
                return True
            else:
                print(f"   ❌ Expected array or dict with projects key, got: {type(data)}")
                return False
        else:
            print(f"   ❌ Expected 200, got {response.status_code}")
            print(f"   Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return False

def test_pdf_content_validation():
    """Validate PDF content from report generation"""
    print("🧪 Testing PDF Content Validation...")
    
    project_id = "69d42c46ed575b4fa15b3265"
    url = f"{BACKEND_URL}/projects/{project_id}/generate-report"
    
    payload = {
        "technician_name": "Jim Metropoulos",
        "technician_email": "jim@blueboxair.com"
    }
    
    try:
        response = requests.post(url, json=payload, timeout=30)
        
        if response.status_code == 200:
            data = response.json()
            pdf_base64 = data.get("pdf_base64", "")
            
            if not pdf_base64:
                print(f"   ❌ No PDF base64 data")
                return False
                
            # Decode base64
            try:
                pdf_bytes = base64.b64decode(pdf_base64)
            except Exception as e:
                print(f"   ❌ Failed to decode base64: {e}")
                return False
                
            # Check if it's a valid PDF (starts with %PDF)
            if not pdf_bytes.startswith(b'%PDF'):
                print(f"   ❌ PDF doesn't start with %PDF header")
                return False
                
            # Check non-zero size
            if len(pdf_bytes) == 0:
                print(f"   ❌ PDF has zero size")
                return False
                
            print(f"   ✅ PDF validation successful - {len(pdf_bytes)} bytes, valid PDF header")
            return True
            
        else:
            print(f"   ❌ Failed to get PDF for validation: {response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Exception: {e}")
        return False

def main():
    """Run all tests"""
    print("🚀 Starting BBA Tech Backend API Tests")
    print("=" * 60)
    
    tests = [
        ("Report Generation", test_report_generation),
        ("Report Generation 404", test_report_generation_404),
        ("Auth Login Regression", test_auth_login_regression),
        ("Projects List Regression", test_projects_list_regression),
        ("PDF Content Validation", test_pdf_content_validation),
    ]
    
    results = []
    
    for test_name, test_func in tests:
        print(f"\n📋 {test_name}")
        print("-" * 40)
        success = test_func()
        results.append((test_name, success))
        
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    passed = 0
    failed = 0
    
    for test_name, success in results:
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status:10} {test_name}")
        if success:
            passed += 1
        else:
            failed += 1
            
    print("-" * 60)
    print(f"Total: {len(results)} | Passed: {passed} | Failed: {failed}")
    
    if failed > 0:
        print(f"\n❌ {failed} test(s) failed")
        return False
    else:
        print(f"\n✅ All tests passed!")
        return True

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)