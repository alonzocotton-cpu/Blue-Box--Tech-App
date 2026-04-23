#!/usr/bin/env python3
"""
Backend API Testing Script for Blue Box Air Support Tickets API
Tests all Support Tickets API endpoints as specified in the review request.
"""

import requests
import json
import sys
from datetime import datetime

# Backend URL from environment
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"

def test_endpoint(method, endpoint, data=None, params=None, expected_status=200):
    """Test an API endpoint and return the response"""
    url = f"{BACKEND_URL}{endpoint}"
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=30)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=30)
        elif method.upper() == "PUT":
            response = requests.put(url, json=data, timeout=30)
        else:
            print(f"❌ Unsupported method: {method}")
            return None
            
        print(f"📡 {method} {endpoint}")
        print(f"   Status: {response.status_code}")
        
        if response.status_code == expected_status:
            try:
                result = response.json()
                print(f"   ✅ Success: {json.dumps(result, indent=2)[:200]}...")
                return result
            except:
                print(f"   ✅ Success: {response.text[:200]}...")
                return {"text": response.text}
        else:
            try:
                error = response.json()
                print(f"   ❌ Error: {error}")
            except:
                print(f"   ❌ Error: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Request failed: {str(e)}")
        return None

def main():
    """Test all Support Tickets API endpoints"""
    print("🚀 Starting Support Tickets API Testing")
    print("=" * 60)
    
    # Test data
    test_ticket_data = {
        "email": "testuser@example.com",
        "name": "Test User", 
        "subject": "Login issue",
        "description": "Cannot login with Salesforce",
        "category": "login"
    }
    
    admin_email = "alonzo.cotton@blueboxair.com"
    heather_admin_email = "heather@blueboxair.com"
    
    # Store ticket ID for later tests
    ticket_id = None
    
    print("\n1️⃣ Testing POST /api/support/tickets - Create support ticket")
    result = test_endpoint("POST", "/support/tickets", data=test_ticket_data)
    if result and result.get("success"):
        ticket_id = result.get("ticket", {}).get("_id")
        ticket_number = result.get("ticket", {}).get("ticket_number")
        print(f"   📝 Created ticket ID: {ticket_id}")
        print(f"   📝 Ticket number: {ticket_number}")
    else:
        print("   ❌ Failed to create ticket")
        
    print("\n2️⃣ Testing GET /api/support/tickets?email=alonzo.cotton@blueboxair.com - Admin sees all tickets")
    result = test_endpoint("GET", "/support/tickets", params={"email": admin_email})
    if result and "tickets" in result:
        print(f"   📊 Admin sees {len(result['tickets'])} tickets")
    else:
        print("   ❌ Failed to get tickets for admin")
        
    print("\n3️⃣ Testing GET /api/support/stats?email=alonzo.cotton@blueboxair.com - Admin dashboard stats")
    result = test_endpoint("GET", "/support/stats", params={"email": admin_email})
    if result and "tickets" in result and "users" in result:
        print(f"   📊 Stats: {result['tickets']['total']} total tickets, {result['users']['salesforce_profiles']} SF users")
    else:
        print("   ❌ Failed to get support stats")
        
    if ticket_id:
        print(f"\n4️⃣ Testing PUT /api/support/tickets/{ticket_id} - Update ticket status and add response")
        update_data = {
            "admin_email": admin_email,
            "status": "in_progress", 
            "response": "We are looking into this.",
            "admin_name": "Alonzo Cotton"
        }
        result = test_endpoint("PUT", f"/support/tickets/{ticket_id}", data=update_data)
        if result and result.get("success"):
            print("   ✅ Ticket updated successfully")
        else:
            print("   ❌ Failed to update ticket")
    else:
        print("\n4️⃣ ⚠️ Skipping ticket update test - no ticket ID available")
        
    print(f"\n5️⃣ Testing GET /api/admin/check?email={heather_admin_email} - Verify Heather is admin")
    result = test_endpoint("GET", "/admin/check", params={"email": heather_admin_email})
    if result and result.get("is_admin") == True:
        print("   ✅ Heather confirmed as admin")
    else:
        print("   ❌ Heather admin check failed")
        
    print("\n6️⃣ Testing POST /api/auth/login - Regression test with demo credentials")
    login_data = {
        "username": "demo@blueboxair.com",
        "password": "BBAReview2025!"
    }
    result = test_endpoint("POST", "/auth/login", data=login_data)
    if result and result.get("success"):
        print("   ✅ Demo login still working")
    else:
        print("   ❌ Demo login regression failure")
        
    print("\n7️⃣ Testing GET /api/support/tickets?email=testuser@example.com - Non-admin should only see own tickets")
    result = test_endpoint("GET", "/support/tickets", params={"email": "testuser@example.com"})
    if result and "tickets" in result:
        user_tickets = [t for t in result['tickets'] if t.get('email') == 'testuser@example.com']
        print(f"   📊 Non-admin user sees {len(result['tickets'])} tickets (should only be their own)")
        if len(user_tickets) == len(result['tickets']):
            print("   ✅ Non-admin correctly sees only their own tickets")
        else:
            print("   ⚠️ Non-admin may be seeing other users' tickets")
    else:
        print("   ❌ Failed to get tickets for non-admin user")
        
    print("\n" + "=" * 60)
    print("🏁 Support Tickets API Testing Complete")

if __name__ == "__main__":
    main()