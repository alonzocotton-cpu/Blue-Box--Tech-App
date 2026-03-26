#!/usr/bin/env python3
"""
Blue Box Air Tech App - Backend API Test Suite
Tests the specific endpoints mentioned in the review request
"""

import requests
import json
from datetime import datetime
import sys
import time

class BlueBoxAirAPITester:
    def __init__(self):
        # Use the production URL from frontend/.env
        self.base_url = "https://techservice-app-2.preview.emergentagent.com/api"
        self.headers = {"Content-Type": "application/json"}
        self.auth_token = None
        self.test_results = {}
        self.total_tests = 0
        self.passed_tests = 0
        
    def log_result(self, test_name, success, message="", response_data=None):
        """Log test results"""
        self.total_tests += 1
        if success:
            self.passed_tests += 1
            status = "✅ PASS"
        else:
            status = "❌ FAIL"
            
        print(f"{status}: {test_name}")
        if message:
            print(f"    Message: {message}")
        if response_data and not success:
            print(f"    Response: {json.dumps(response_data, indent=2, default=str)}")
        print()
        
        self.test_results[test_name] = {
            "success": success,
            "message": message,
            "response": response_data
        }
    
    def make_request(self, method, endpoint, data=None):
        """Make HTTP request with error handling"""
        url = f"{self.base_url}{endpoint}"
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=self.headers, timeout=30)
            elif method.upper() == "POST":
                response = requests.post(url, headers=self.headers, json=data, timeout=30)
            elif method.upper() == "PATCH":
                response = requests.patch(url, headers=self.headers, json=data, timeout=30)
            else:
                raise ValueError(f"Unsupported method: {method}")
                
            return response
        except requests.exceptions.RequestException as e:
            print(f"Request error for {method} {endpoint}: {str(e)}")
            return None
    
    def test_auth_login(self):
        """Test POST /api/auth/login - Send {"username": "test", "password": "test"}"""
        test_name = "POST /api/auth/login"
        endpoint = "/auth/login"
        data = {"username": "test", "password": "test"}
        
        response = self.make_request("POST", endpoint, data)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if (response_data.get("success") and 
                    "technician" in response_data and 
                    "token" in response_data):
                    self.auth_token = response_data.get("token")
                    technician = response_data["technician"]
                    self.log_result(test_name, True, f"Login successful, technician: {technician.get('full_name', 'Unknown')}")
                    return True
                else:
                    self.log_result(test_name, False, "Missing required fields in response", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_dashboard_stats(self):
        """Test GET /api/dashboard/stats - Should return total_projects, active, total_equipment counts"""
        test_name = "GET /api/dashboard/stats"
        endpoint = "/dashboard/stats"
        
        response = self.make_request("GET", endpoint)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                required_fields = ["total_projects", "active", "total_equipment"]
                if all(field in response_data for field in required_fields):
                    stats = {k: response_data[k] for k in required_fields}
                    self.log_result(test_name, True, f"Dashboard stats: {stats}")
                    return True
                else:
                    missing_fields = [f for f in required_fields if f not in response_data]
                    self.log_result(test_name, False, f"Missing fields: {missing_fields}", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_projects_list(self):
        """Test GET /api/projects - Should return a list of 3 projects with primary_contact field"""
        test_name = "GET /api/projects"
        endpoint = "/projects"
        
        response = self.make_request("GET", endpoint)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if "projects" in response_data and "total" in response_data:
                    projects = response_data["projects"]
                    if isinstance(projects, list) and len(projects) == 3:
                        # Check if all projects have primary_contact field
                        all_have_contact = True
                        for project in projects:
                            if "primary_contact" not in project:
                                all_have_contact = False
                                break
                            contact = project["primary_contact"]
                            required_contact_fields = ["name", "title", "phone", "email"]
                            if not all(field in contact for field in required_contact_fields):
                                all_have_contact = False
                                break
                        
                        if all_have_contact:
                            self.log_result(test_name, True, f"Retrieved {len(projects)} projects, all with primary_contact")
                            return True
                        else:
                            self.log_result(test_name, False, "Some projects missing primary_contact or required contact fields", response_data)
                    else:
                        self.log_result(test_name, False, f"Expected 3 projects, got {len(projects) if isinstance(projects, list) else 'non-list'}", response_data)
                else:
                    self.log_result(test_name, False, "Missing required fields (projects, total)", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_project_detail(self):
        """Test GET /api/projects/proj-001 - Should return project details with primary_contact James Wilson"""
        test_name = "GET /api/projects/proj-001"
        endpoint = "/projects/proj-001"
        
        response = self.make_request("GET", endpoint)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if "project" in response_data:
                    project = response_data["project"]
                    if "primary_contact" in project:
                        contact = project["primary_contact"]
                        if (contact.get("name") == "James Wilson" and 
                            contact.get("phone") == "+1 (212) 555-0147"):
                            self.log_result(test_name, True, f"Project detail retrieved with correct primary contact: {contact['name']}")
                            return True
                        else:
                            self.log_result(test_name, False, f"Primary contact mismatch. Expected James Wilson with +1 (212) 555-0147, got {contact}", response_data)
                    else:
                        self.log_result(test_name, False, "Missing primary_contact field", response_data)
                else:
                    self.log_result(test_name, False, "Missing project field", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_ai_chat(self):
        """Test POST /api/ai/chat - Send message about differential pressure"""
        test_name = "POST /api/ai/chat"
        endpoint = "/ai/chat"
        data = {
            "message": "What is differential pressure?",
            "session_id": "test-session"
        }
        
        response = self.make_request("POST", endpoint, data)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if "response" in response_data and "session_id" in response_data:
                    ai_response = response_data["response"]
                    if ai_response and len(ai_response.strip()) > 0:
                        self.log_result(test_name, True, f"AI chat working, response length: {len(ai_response)} chars")
                        return True
                    else:
                        self.log_result(test_name, False, "Empty AI response", response_data)
                else:
                    self.log_result(test_name, False, "Missing response or session_id fields", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_readings_get(self):
        """Test GET /api/readings/eq-001 - Should return readings array"""
        test_name = "GET /api/readings/eq-001"
        endpoint = "/readings/eq-001"
        
        response = self.make_request("GET", endpoint)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if "readings" in response_data:
                    readings = response_data["readings"]
                    if isinstance(readings, list):
                        self.log_result(test_name, True, f"Retrieved {len(readings)} readings for eq-001")
                        return True
                    else:
                        self.log_result(test_name, False, "readings is not a list", response_data)
                else:
                    self.log_result(test_name, False, "Missing readings field", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def test_readings_create(self):
        """Test POST /api/readings - Create a new reading"""
        test_name = "POST /api/readings"
        endpoint = "/readings"
        data = {
            "equipment_id": "eq-001",
            "project_id": "proj-001",
            "reading_type": "Differential Pressure",
            "reading_phase": "Pre",
            "value": 1.5,
            "unit": "inWC"
        }
        
        response = self.make_request("POST", endpoint, data)
        
        if response is None:
            self.log_result(test_name, False, "Request failed - connection error")
            return False
        
        try:
            response_data = response.json()
            if response.status_code == 200:
                if response_data.get("success") and "reading" in response_data:
                    reading = response_data["reading"]
                    if (reading.get("equipment_id") == "eq-001" and 
                        reading.get("reading_type") == "Differential Pressure" and
                        reading.get("value") == 1.5):
                        self.log_result(test_name, True, "Reading created successfully")
                        return True
                    else:
                        self.log_result(test_name, False, "Reading data mismatch", response_data)
                else:
                    self.log_result(test_name, False, "Missing success or reading fields", response_data)
            else:
                self.log_result(test_name, False, f"HTTP {response.status_code}", response_data)
        except json.JSONDecodeError:
            self.log_result(test_name, False, f"Invalid JSON response. Status: {response.status_code}")
        
        return False
    
    def run_all_tests(self):
        """Run the specific test suite for Blue Box Air tech app"""
        print("=" * 80)
        print("BLUE BOX AIR TECH APP - BACKEND API TEST SUITE")
        print("=" * 80)
        print(f"Testing against: {self.base_url}")
        print()
        
        # Test the specific endpoints mentioned in the review request
        print("🔐 AUTHENTICATION TEST")
        print("-" * 40)
        self.test_auth_login()
        
        print("📊 DASHBOARD TEST")
        print("-" * 40)
        self.test_dashboard_stats()
        
        print("📋 PROJECTS TESTS")
        print("-" * 40)
        self.test_projects_list()
        self.test_project_detail()
        
        print("🤖 AI CHAT TEST")
        print("-" * 40)
        self.test_ai_chat()
        
        print("📊 READINGS TESTS")
        print("-" * 40)
        self.test_readings_get()
        self.test_readings_create()
        
        # Final summary
        print("=" * 80)
        print("TEST SUMMARY")
        print("=" * 80)
        print(f"Total tests: {self.total_tests}")
        print(f"Passed: {self.passed_tests}")
        print(f"Failed: {self.total_tests - self.passed_tests}")
        print(f"Success rate: {(self.passed_tests/self.total_tests*100):.1f}%")
        
        # List failed tests
        failed_tests = [name for name, result in self.test_results.items() if not result["success"]]
        if failed_tests:
            print("\n❌ FAILED TESTS:")
            for test in failed_tests:
                result = self.test_results[test]
                print(f"  - {test}: {result['message']}")
        
        print()
        return self.passed_tests == self.total_tests

def main():
    """Main test execution"""
    tester = BlueBoxAirAPITester()
    success = tester.run_all_tests()
    
    if success:
        print("🎉 All tests passed!")
        sys.exit(0)
    else:
        print("⚠️  Some tests failed. Check the results above.")
        sys.exit(1)

if __name__ == "__main__":
    main()