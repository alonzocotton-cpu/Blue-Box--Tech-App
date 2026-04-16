"""
Salesforce Integration Service for Blue Box Air Technician App

This module provides the integration layer with Salesforce CRM.
It handles OAuth authentication, data synchronization, and CRUD operations
for Projects, Equipment, Readings, and Service Reports.

CONFIGURATION:
  Set the following environment variables in backend/.env:
    SALESFORCE_CLIENT_ID=your_connected_app_client_id
    SALESFORCE_CLIENT_SECRET=your_connected_app_client_secret
    SALESFORCE_INSTANCE_URL=https://your-instance.salesforce.com
    SALESFORCE_API_VERSION=v59.0
    SALESFORCE_REDIRECT_URI=https://your-app-url/api/auth/salesforce/callback

SALESFORCE SETUP REQUIRED:
  1. Create a Connected App in Salesforce Setup
  2. Enable OAuth with scopes: api, refresh_token, offline_access
  3. Set the callback URL to your app's /api/auth/salesforce/callback
  4. Create custom objects (or use standard objects) for:
     - Projects (custom object or Opportunity)
     - Equipment (custom object)
     - Readings (custom object)
     - Service Reports (custom object or Case)
"""

import os
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import httpx

logger = logging.getLogger(__name__)


class SalesforceConfig:
    """Salesforce connection configuration loaded from environment variables."""
    
    def __init__(self):
        self.client_id = os.environ.get('SALESFORCE_CLIENT_ID', '')
        self.client_secret = os.environ.get('SALESFORCE_CLIENT_SECRET', '')
        self.instance_url = os.environ.get('SALESFORCE_INSTANCE_URL', 'https://login.salesforce.com')
        self.api_version = os.environ.get('SALESFORCE_API_VERSION', 'v59.0')
        self.redirect_uri = os.environ.get('SALESFORCE_REDIRECT_URI', '')
        self.login_url = os.environ.get('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com')
    
    @property
    def is_configured(self) -> bool:
        """Check if Salesforce credentials are properly configured."""
        return bool(self.client_id and self.client_secret)
    
    @property
    def auth_url(self) -> str:
        """Build the OAuth authorization URL."""
        return (
            f"{self.login_url}/services/oauth2/authorize"
            f"?response_type=code"
            f"&client_id={self.client_id}"
            f"&redirect_uri={self.redirect_uri}"
            f"&scope=api+refresh_token+offline_access"
        )
    
    @property
    def token_url(self) -> str:
        return f"{self.login_url}/services/oauth2/token"
    
    @property
    def api_base_url(self) -> str:
        return f"{self.instance_url}/services/data/{self.api_version}"


# ============ Salesforce Field Mappings ============
# Maps our internal field names to Salesforce API field names.
# Update these to match your Salesforce org's custom object/field API names.

FIELD_MAPPINGS = {
    "Project": {
        "sf_object": "Opportunity",  # Standard Salesforce Opportunity
        "fields": {
            "id": "Id",
            "salesforce_id": "Id",
            "name": "Name",
            "description": "Description",
            "status": "StageName",
            "client_name": "Account.Name",
            "start_date": "CreatedDate",
            "end_date": "CloseDate",
            "assigned_technician_id": "OwnerId",
            "amount": "Amount",
        }
    },
    "Technician": {
        "sf_object": "User",  # Standard Salesforce User
        "fields": {
            "id": "Id",
            "salesforce_id": "Id",
            "username": "Username",
            "email": "Email",
            "full_name": "Name",
            "first_name": "FirstName",
            "last_name": "LastName",
            "phone": "Phone",
            "title": "Title",
            "department": "Department",
            "is_active": "IsActive",
            "profile_photo": "SmallPhotoUrl",
        }
    },
    "Equipment": {
        "sf_object": "Equipment__c",  # Custom object - stored locally if not in Salesforce
        "fields": {
            "id": "Id",
            "salesforce_id": "Id",
            "project_id": "Project__c",
            "name": "Name",
            "model": "Model__c",
            "serial_number": "Serial_Number__c",
            "equipment_type": "Equipment_Type__c",
            "location": "Location__c",
            "status": "Status__c",
            "last_service_date": "Last_Service_Date__c",
        }
    },
    "Reading": {
        "sf_object": "Equipment_Reading__c",
        "fields": {
            "id": "Id",
            "equipment_id": "Equipment__c",
            "project_id": "Project__c",
            "technician_id": "Technician__c",
            "reading_type": "Reading_Type__c",
            "reading_phase": "Phase__c",
            "value": "Value__c",
            "unit": "Unit__c",
            "captured_at": "Captured_Date_Time__c",
            "notes": "Notes__c",
        }
    },
    "ServiceReport": {
        "sf_object": "Service_Report__c",
        "fields": {
            "id": "Id",
            "project_id": "Project__c",
            "technician_id": "Technician__c",
            "report_type": "Report_Type__c",
            "summary": "Summary__c",
            "status": "Status__c",
            "generated_at": "Generated_Date__c",
            "pdf_url": "PDF_URL__c",
        }
    },
    "Photo": {
        "sf_object": "ContentVersion",
        "fields": {
            "id": "Id",
            "project_id": "Project__c",
            "equipment_id": "Equipment__c",
            "image_data": "VersionData",
            "photo_type": "Photo_Type__c",
            "caption": "Description",
        }
    },
}


class SalesforceService:
    """
    Service class for all Salesforce API interactions.
    
    When Salesforce credentials are not configured, methods return None
    and the app falls back to local/mock data.
    """
    
    def __init__(self, config: SalesforceConfig):
        self.config = config
        self._access_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._instance_url: Optional[str] = None
    
    @property
    def is_connected(self) -> bool:
        return bool(self._access_token and self.config.is_configured)
    
    # ============ OAuth Authentication ============
    
    async def authenticate_with_code(self, auth_code: str) -> Optional[Dict[str, Any]]:
        """
        Exchange OAuth authorization code for access/refresh tokens.
        Called after user completes Salesforce login flow.
        
        Returns: { access_token, refresh_token, instance_url, user_info }
        """
        if not self.config.is_configured:
            logger.warning("Salesforce not configured - skipping authentication")
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.token_url,
                    data={
                        "grant_type": "authorization_code",
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "redirect_uri": self.config.redirect_uri,
                        "code": auth_code,
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data.get("access_token")
                    self._refresh_token = data.get("refresh_token")
                    self._instance_url = data.get("instance_url")
                    
                    # Fetch user info
                    user_info = await self._get_user_info()
                    
                    return {
                        "access_token": self._access_token,
                        "refresh_token": self._refresh_token,
                        "instance_url": self._instance_url,
                        "user_info": user_info,
                    }
                else:
                    logger.error(f"Salesforce auth failed: {response.status_code} - {response.text}")
                    return None
        except Exception as e:
            logger.error(f"Salesforce authentication error: {e}")
            return None
    
    async def refresh_access_token(self) -> bool:
        """Refresh the access token using the stored refresh token."""
        if not self._refresh_token or not self.config.is_configured:
            return False
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.config.token_url,
                    data={
                        "grant_type": "refresh_token",
                        "client_id": self.config.client_id,
                        "client_secret": self.config.client_secret,
                        "refresh_token": self._refresh_token,
                    }
                )
                
                if response.status_code == 200:
                    data = response.json()
                    self._access_token = data.get("access_token")
                    return True
                return False
        except Exception as e:
            logger.error(f"Token refresh error: {e}")
            return False
    
    async def _get_user_info(self) -> Optional[Dict]:
        """Get the authenticated user's profile from Salesforce."""
        if not self.is_connected:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self._instance_url}/services/oauth2/userinfo",
                    headers=self._auth_headers,
                )
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.error(f"User info fetch error: {e}")
        return None
    
    @property
    def _auth_headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self._access_token}",
            "Content-Type": "application/json",
        }
    
    # ============ SOQL Queries ============
    
    async def query(self, soql: str) -> Optional[List[Dict]]:
        """Execute a SOQL query against Salesforce."""
        if not self.is_connected:
            return None
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self._instance_url}/{self.config.api_base_url}/query",
                    params={"q": soql},
                    headers=self._auth_headers,
                )
                
                if response.status_code == 200:
                    data = response.json()
                    return data.get("records", [])
                elif response.status_code == 401:
                    # Token expired, try refresh
                    if await self.refresh_access_token():
                        return await self.query(soql)
                    
                logger.error(f"SOQL query failed: {response.status_code}")
                return None
        except Exception as e:
            logger.error(f"SOQL query error: {e}")
            return None
    
    # ============ Data Fetch Methods ============
    
    async def get_technician_projects(self, technician_sf_id: str) -> Optional[List[Dict]]:
        """
        Fetch all projects assigned to a technician from Salesforce.
        
        SOQL equivalent:
        SELECT Id, Name, Project_Number__c, Description__c, Status__c,
               Account__r.Name, Site_Address__c, Start_Date__c, End_Date__c,
               Equipment_Count__c
        FROM Project__c
        WHERE Assigned_Technician__c = :technician_sf_id
        ORDER BY Start_Date__c DESC
        """
        mapping = FIELD_MAPPINGS["Project"]
        sf_fields = ", ".join(mapping["fields"].values())
        soql = (
            f"SELECT {sf_fields} FROM {mapping['sf_object']} "
            f"WHERE {mapping['fields']['assigned_technician_id']} = '{technician_sf_id}' "
            f"ORDER BY {mapping['fields']['start_date']} DESC"
        )
        
        records = await self.query(soql)
        if records is None:
            return None
        
        return [self._map_sf_to_local(r, mapping["fields"]) for r in records]
    
    async def get_project_equipment(self, project_sf_id: str) -> Optional[List[Dict]]:
        """Fetch all equipment for a Salesforce project."""
        mapping = FIELD_MAPPINGS["Equipment"]
        sf_fields = ", ".join(mapping["fields"].values())
        soql = (
            f"SELECT {sf_fields} FROM {mapping['sf_object']} "
            f"WHERE {mapping['fields']['project_id']} = '{project_sf_id}'"
        )
        
        records = await self.query(soql)
        if records is None:
            return None
        
        return [self._map_sf_to_local(r, mapping["fields"]) for r in records]
    
    async def get_equipment_readings(self, equipment_sf_id: str) -> Optional[List[Dict]]:
        """Fetch all readings for a piece of equipment from Salesforce."""
        mapping = FIELD_MAPPINGS["Reading"]
        sf_fields = ", ".join(mapping["fields"].values())
        soql = (
            f"SELECT {sf_fields} FROM {mapping['sf_object']} "
            f"WHERE {mapping['fields']['equipment_id']} = '{equipment_sf_id}' "
            f"ORDER BY {mapping['fields']['captured_at']} DESC"
        )
        
        records = await self.query(soql)
        if records is None:
            return None
        
        return [self._map_sf_to_local(r, mapping["fields"]) for r in records]
    
    # ============ Data Push Methods ============
    
    async def create_reading(self, reading_data: Dict) -> Optional[str]:
        """
        Push a new equipment reading to Salesforce.
        Returns the Salesforce ID of the created record.
        """
        if not self.is_connected:
            return None
        
        mapping = FIELD_MAPPINGS["Reading"]
        sf_data = self._map_local_to_sf(reading_data, mapping["fields"])
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self._instance_url}/{self.config.api_base_url}/sobjects/{mapping['sf_object']}",
                    json=sf_data,
                    headers=self._auth_headers,
                )
                
                if response.status_code in (200, 201):
                    return response.json().get("id")
                    
                logger.error(f"Create reading failed: {response.status_code} - {response.text}")
                return None
        except Exception as e:
            logger.error(f"Create reading error: {e}")
            return None
    
    async def create_service_report(self, report_data: Dict) -> Optional[str]:
        """Push a service report to Salesforce."""
        if not self.is_connected:
            return None
        
        mapping = FIELD_MAPPINGS["ServiceReport"]
        sf_data = self._map_local_to_sf(report_data, mapping["fields"])
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self._instance_url}/{self.config.api_base_url}/sobjects/{mapping['sf_object']}",
                    json=sf_data,
                    headers=self._auth_headers,
                )
                
                if response.status_code in (200, 201):
                    return response.json().get("id")
                return None
        except Exception as e:
            logger.error(f"Create service report error: {e}")
            return None
    
    async def upload_photo(self, photo_data: Dict, linked_record_id: str) -> Optional[str]:
        """
        Upload a photo to Salesforce Files and link it to a record.
        Uses ContentVersion + ContentDocumentLink.
        """
        if not self.is_connected:
            return None
        
        try:
            # Create ContentVersion
            async with httpx.AsyncClient() as client:
                cv_data = {
                    "Title": photo_data.get("caption", "Equipment Photo"),
                    "PathOnClient": f"photo_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.jpg",
                    "VersionData": photo_data.get("image_data", "").replace("data:image/jpeg;base64,", ""),
                    "Description": photo_data.get("caption", ""),
                }
                
                response = await client.post(
                    f"{self._instance_url}/{self.config.api_base_url}/sobjects/ContentVersion",
                    json=cv_data,
                    headers=self._auth_headers,
                )
                
                if response.status_code in (200, 201):
                    cv_id = response.json().get("id")
                    # Now link it to the record
                    # First get the ContentDocumentId
                    cv_query = await self.query(
                        f"SELECT ContentDocumentId FROM ContentVersion WHERE Id = '{cv_id}'"
                    )
                    if cv_query and len(cv_query) > 0:
                        doc_id = cv_query[0].get("ContentDocumentId")
                        # Create ContentDocumentLink
                        await client.post(
                            f"{self._instance_url}/{self.config.api_base_url}/sobjects/ContentDocumentLink",
                            json={
                                "ContentDocumentId": doc_id,
                                "LinkedEntityId": linked_record_id,
                                "ShareType": "V",
                                "Visibility": "AllUsers",
                            },
                            headers=self._auth_headers,
                        )
                    return cv_id
                return None
        except Exception as e:
            logger.error(f"Photo upload error: {e}")
            return None
    
    # ============ Sync Methods ============
    
    async def sync_report_to_salesforce(self, report_data: Dict) -> Optional[str]:
        """
        Sync a generated report back to Salesforce.
        Creates or updates a Service_Report__c record.
        """
        sf_report_data = {
            "project_id": report_data.get("project", {}).get("salesforce_id"),
            "technician_id": report_data.get("technician", {}).get("salesforce_id"),
            "report_type": "Equipment Service Report",
            "summary": f"Report generated with {report_data.get('summary', {}).get('total_readings', 0)} readings across {report_data.get('summary', {}).get('total_equipment', 0)} equipment units",
            "status": "Generated",
            "generated_at": report_data.get("generated_at"),
        }
        
        return await self.create_service_report(sf_report_data)
    
    # ============ Helper Methods ============
    
    def _map_sf_to_local(self, sf_record: Dict, field_map: Dict) -> Dict:
        """Map Salesforce field names back to local field names."""
        local_record = {}
        reverse_map = {v: k for k, v in field_map.items()}
        
        for sf_field, value in sf_record.items():
            if sf_field in reverse_map:
                local_record[reverse_map[sf_field]] = value
            elif sf_field == "attributes":
                continue  # Skip Salesforce metadata
            else:
                local_record[sf_field] = value
        
        return local_record
    
    def _map_local_to_sf(self, local_data: Dict, field_map: Dict) -> Dict:
        """Map local field names to Salesforce API field names."""
        sf_data = {}
        for local_field, value in local_data.items():
            if local_field in field_map and local_field not in ('id', 'salesforce_id'):
                sf_field = field_map[local_field]
                if '__r.' not in sf_field:  # Skip relationship fields for create/update
                    sf_data[sf_field] = value
        return sf_data


# ============ Module-level Instance ============

sf_config = SalesforceConfig()
salesforce = SalesforceService(sf_config)


def get_salesforce_status() -> Dict[str, Any]:
    """Get current Salesforce connection status for the frontend."""
    return {
        "configured": sf_config.is_configured,
        "connected": salesforce.is_connected,
        "instance_url": sf_config.instance_url if sf_config.is_configured else None,
        "api_version": sf_config.api_version,
        "mode": "live" if salesforce.is_connected else "mock",
        "message": (
            "Connected to Salesforce" if salesforce.is_connected
            else "Using mock data - Configure Salesforce credentials in .env to enable live sync"
        ),
        "setup_instructions": {
            "step_1": "Create a Connected App in Salesforce Setup",
            "step_2": "Set SALESFORCE_CLIENT_ID in backend/.env",
            "step_3": "Set SALESFORCE_CLIENT_SECRET in backend/.env", 
            "step_4": "Set SALESFORCE_INSTANCE_URL in backend/.env",
            "step_5": "Set SALESFORCE_REDIRECT_URI in backend/.env",
            "step_6": "Restart the backend server",
        } if not sf_config.is_configured else None,
    }
