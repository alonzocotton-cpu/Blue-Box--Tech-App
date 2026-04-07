#!/usr/bin/env python3
"""
Enhanced Backend API Testing Script for DELETE /api/salesforce/users/inactive
This script creates test inactive users to properly test the deletion functionality
"""

import asyncio
import httpx
import json
import logging
from datetime import datetime
from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Load environment
load_dotenv('/app/backend/.env')

# Backend URL and DB connection
BACKEND_URL = "https://techservice-app-2.preview.emergentagent.com/api"
mongo_url = os.environ['MONGO_URL']

class EnhancedBackendTester:
    def __init__(self):
        self.client = httpx.AsyncClient(timeout=30.0)
        self.db_client = AsyncIOMotorClient(mongo_url)
        self.db = self.db_client[os.environ.get('DB_NAME', 'technician_app')]
        self.test_results = []
        self.created_test_users = []
        
    async def close(self):
        await self.client.aclose()
        await self.cleanup_test_users()
        self.db_client.close()
    
    def log_test(self, test_name: str, success: bool, details: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        logger.info(f"{status}: {test_name}")
        if details:
            logger.info(f"   Details: {details}")
        self.test_results.append({
            "test": test_name,
            "success": success,
            "details": details,
            "timestamp": datetime.now().isoformat()
        })
    
    async def create_test_inactive_users(self):
        """Create some test inactive users for testing deletion"""
        try:
            test_users = [
                {
                    "salesforce_id": "test_inactive_1",
                    "username": "test.inactive1@test.com",
                    "email": "test.inactive1@test.com",
                    "full_name": "Test Inactive User 1",
                    "first_name": "Test",
                    "last_name": "User1",
                    "phone": "+1-555-0001",
                    "title": "Test Technician",
                    "department": "Test Department",
                    "company": "Test Company",
                    "source": "salesforce",
                    "is_active": False,  # This is the key - inactive user
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                },
                {
                    "salesforce_id": "test_inactive_2",
                    "username": "test.inactive2@test.com",
                    "email": "test.inactive2@test.com",
                    "full_name": "Test Inactive User 2",
                    "first_name": "Test",
                    "last_name": "User2",
                    "phone": "+1-555-0002",
                    "title": "Test Technician",
                    "department": "Test Department",
                    "company": "Test Company",
                    "source": "salesforce",
                    "is_active": False,  # This is the key - inactive user
                    "created_at": datetime.utcnow().isoformat(),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            ]
            
            # Insert test users
            result = await self.db.profiles.insert_many(test_users)
            self.created_test_users = [str(id) for id in result.inserted_ids]
            
            logger.info(f"Created {len(test_users)} test inactive users for testing")
            return len(test_users)
            
        except Exception as e:
            logger.error(f"Failed to create test inactive users: {e}")
            return 0
    
    async def cleanup_test_users(self):
        """Clean up any remaining test users"""
        try:
            if self.created_test_users:
                from bson import ObjectId
                result = await self.db.profiles.delete_many({
                    "_id": {"$in": [ObjectId(id) for id in self.created_test_users]}
                })
                logger.info(f"Cleaned up {result.deleted_count} test users")
        except Exception as e:
            logger.error(f"Error cleaning up test users: {e}")
    
    async def test_auth_login_regression(self):
        """Test POST /api/auth/login - regression test to ensure it still works"""
        try:
            response = await self.client.post(
                f"{BACKEND_URL}/auth/login",
                json={"username": "test", "password": "test"}
            )
            
            if response.status_code == 200:
                data = response.json()
                if (data.get("success") and 
                    data.get("technician") and 
                    data.get("token")):
                    technician = data["technician"]
                    self.log_test(
                        "POST /api/auth/login regression test",
                        True,
                        f"Login successful, technician: {technician.get('full_name', 'Unknown')}, source: {data.get('source', 'Unknown')}"
                    )
                    return True
                else:
                    self.log_test(
                        "POST /api/auth/login regression test",
                        False,
                        f"Missing required fields in response: {data}"
                    )
                    return False
            else:
                self.log_test(
                    "POST /api/auth/login regression test",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_test(
                "POST /api/auth/login regression test",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_get_salesforce_users_before(self):
        """Test GET /api/salesforce/users before deletion to see current state"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/salesforce/users?active_only=false")
            
            if response.status_code == 200:
                data = response.json()
                users = data.get("users", [])
                total = data.get("total", 0)
                
                # Count active and inactive users
                active_count = sum(1 for user in users if user.get("is_active", True))
                inactive_count = total - active_count
                
                self.log_test(
                    "GET /api/salesforce/users (before deletion)",
                    True,
                    f"Total users: {total}, Active: {active_count}, Inactive: {inactive_count}"
                )
                return {"total": total, "active": active_count, "inactive": inactive_count, "users": users}
            else:
                self.log_test(
                    "GET /api/salesforce/users (before deletion)",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return None
                
        except Exception as e:
            self.log_test(
                "GET /api/salesforce/users (before deletion)",
                False,
                f"Exception: {str(e)}"
            )
            return None
    
    async def test_delete_inactive_users(self):
        """Test DELETE /api/salesforce/users/inactive - main test"""
        try:
            response = await self.client.delete(f"{BACKEND_URL}/salesforce/users/inactive")
            
            if response.status_code == 200:
                data = response.json()
                if (data.get("success") and 
                    "deleted" in data and 
                    "message" in data):
                    deleted_count = data.get("deleted", 0)
                    message = data.get("message", "")
                    self.log_test(
                        "DELETE /api/salesforce/users/inactive",
                        True,
                        f"Deleted {deleted_count} inactive users. Message: {message}"
                    )
                    return deleted_count
                else:
                    self.log_test(
                        "DELETE /api/salesforce/users/inactive",
                        False,
                        f"Missing required fields in response: {data}"
                    )
                    return None
            else:
                self.log_test(
                    "DELETE /api/salesforce/users/inactive",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return None
                
        except Exception as e:
            self.log_test(
                "DELETE /api/salesforce/users/inactive",
                False,
                f"Exception: {str(e)}"
            )
            return None
    
    async def test_get_salesforce_users_after(self, expected_deleted: int = None):
        """Test GET /api/salesforce/users after deletion to verify only active users remain"""
        try:
            # Test with active_only=false to see all users
            response = await self.client.get(f"{BACKEND_URL}/salesforce/users?active_only=false")
            
            if response.status_code == 200:
                data = response.json()
                users = data.get("users", [])
                total = data.get("total", 0)
                
                # Count inactive users
                inactive_users = [user for user in users if not user.get("is_active", True)]
                
                if len(inactive_users) == 0:
                    self.log_test(
                        "GET /api/salesforce/users (after deletion - all users)",
                        True,
                        f"No inactive users found in {total} total users. Deletion successful."
                    )
                    return True
                else:
                    self.log_test(
                        "GET /api/salesforce/users (after deletion - all users)",
                        False,
                        f"Found {len(inactive_users)} inactive users still in results: {[u.get('full_name', 'Unknown') for u in inactive_users]}"
                    )
                    return False
            else:
                self.log_test(
                    "GET /api/salesforce/users (after deletion - all users)",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_test(
                "GET /api/salesforce/users (after deletion - all users)",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def test_get_salesforce_users_with_active_filter(self):
        """Test GET /api/salesforce/users?active_only=true to ensure filter still works"""
        try:
            response = await self.client.get(f"{BACKEND_URL}/salesforce/users?active_only=true")
            
            if response.status_code == 200:
                data = response.json()
                users = data.get("users", [])
                total = data.get("total", 0)
                
                # Verify all returned users are active
                inactive_users = [user for user in users if not user.get("is_active", True)]
                
                if len(inactive_users) == 0:
                    self.log_test(
                        "GET /api/salesforce/users?active_only=true",
                        True,
                        f"Active filter working correctly. {total} active users returned."
                    )
                    return True
                else:
                    self.log_test(
                        "GET /api/salesforce/users?active_only=true",
                        False,
                        f"Active filter not working. Found {len(inactive_users)} inactive users in results."
                    )
                    return False
            else:
                self.log_test(
                    "GET /api/salesforce/users?active_only=true",
                    False,
                    f"HTTP {response.status_code}: {response.text}"
                )
                return False
                
        except Exception as e:
            self.log_test(
                "GET /api/salesforce/users?active_only=true",
                False,
                f"Exception: {str(e)}"
            )
            return False
    
    async def run_all_tests(self):
        """Run all tests in sequence"""
        logger.info("=" * 80)
        logger.info("ENHANCED BACKEND API TESTS - DELETE INACTIVE SALESFORCE USERS")
        logger.info("=" * 80)
        
        # Setup: Create test inactive users
        created_count = await self.create_test_inactive_users()
        if created_count == 0:
            logger.warning("Failed to create test inactive users. Tests may not be comprehensive.")
        
        # Test 1: Regression test - ensure login still works
        await self.test_auth_login_regression()
        
        # Test 2: Get current state of users (including inactive)
        before_state = await self.test_get_salesforce_users_before()
        
        # Test 3: Delete inactive users (main test)
        deleted_count = await self.test_delete_inactive_users()
        
        # Test 4: Verify only active users remain
        await self.test_get_salesforce_users_after(deleted_count)
        
        # Test 5: Test active_only filter still works
        await self.test_get_salesforce_users_with_active_filter()
        
        # Summary
        logger.info("=" * 80)
        logger.info("TEST SUMMARY")
        logger.info("=" * 80)
        
        passed = sum(1 for result in self.test_results if result["success"])
        total = len(self.test_results)
        
        logger.info(f"Tests passed: {passed}/{total}")
        
        if passed == total:
            logger.info("🎉 ALL TESTS PASSED!")
        else:
            logger.info("⚠️  SOME TESTS FAILED")
            for result in self.test_results:
                if not result["success"]:
                    logger.info(f"   ❌ {result['test']}: {result['details']}")
        
        return passed == total

async def main():
    """Main test runner"""
    tester = EnhancedBackendTester()
    try:
        success = await tester.run_all_tests()
        return success
    finally:
        await tester.close()

if __name__ == "__main__":
    success = asyncio.run(main())
    exit(0 if success else 1)