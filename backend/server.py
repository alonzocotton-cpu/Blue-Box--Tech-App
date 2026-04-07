from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
from bson import ObjectId
import json
import httpx
import urllib.parse
import hashlib
import base64
import secrets

# Salesforce integration
from salesforce_service import salesforce, sf_config, get_salesforce_status, FIELD_MAPPINGS

# Claude AI integration
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'technician_app')]

# Create the main app
app = FastAPI(title="Blue Box Air Tech API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper to convert MongoDB documents
def serialize_doc(doc):
    """Convert MongoDB document to JSON-serializable dict"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [serialize_doc(d) for d in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if isinstance(value, ObjectId):
                result[key] = str(value)
            elif isinstance(value, datetime):
                result[key] = value.isoformat()
            elif isinstance(value, dict):
                result[key] = serialize_doc(value)
            elif isinstance(value, list):
                result[key] = [serialize_doc(v) if isinstance(v, (dict, ObjectId)) else v for v in value]
            else:
                result[key] = value
        return result
    if isinstance(doc, ObjectId):
        return str(doc)
    return doc

# ============ Models ============

class TechnicianLogin(BaseModel):
    username: str
    password: str

class TechnicianProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    salesforce_id: str
    username: str
    email: str
    full_name: str
    phone: Optional[str] = None
    profile_image: Optional[str] = None
    skills: List[str] = []
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Project(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    salesforce_id: str
    project_number: str
    name: str
    description: Optional[str] = None
    status: str = "Active"  # Active, On Hold, Completed
    client_name: str
    address: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    assigned_technician_id: str
    equipment_count: int = 0
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class Equipment(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    salesforce_id: str
    project_id: str
    name: str
    model: Optional[str] = None
    serial_number: Optional[str] = None
    equipment_type: str = "Coil Management"  # Coil Management, Chiller, AHU, RTU, etc.
    location: Optional[str] = None
    status: str = "Active"
    last_service_date: Optional[datetime] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Reading(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    equipment_id: str
    project_id: str
    technician_id: str
    reading_type: str  # Differential Pressure, Airflow, Temperature, Humidity
    reading_phase: str = "Pre"  # Pre or Post
    value: float
    unit: str
    captured_at: datetime = Field(default_factory=datetime.utcnow)  # User-specified capture time
    notes: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)  # Record creation time

class ReadingCreate(BaseModel):
    equipment_id: str
    project_id: str
    reading_type: str
    reading_phase: str = "Pre"  # Pre or Post
    value: float
    unit: str
    captured_at: Optional[str] = None  # ISO format datetime string
    notes: Optional[str] = None

class Photo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    equipment_id: Optional[str] = None
    technician_id: str
    image_data: str  # Base64
    caption: Optional[str] = None
    photo_type: str = "General"  # Before, After, Issue, General
    created_at: datetime = Field(default_factory=datetime.utcnow)

class PhotoCreate(BaseModel):
    project_id: str
    equipment_id: Optional[str] = None
    image_data: str
    caption: Optional[str] = None
    photo_type: str = "General"

class ServiceLog(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    project_id: str
    equipment_id: str
    technician_id: str
    service_type: str  # Inspection, Maintenance, Repair, Cleaning
    description: str
    status: str = "Completed"
    duration_minutes: Optional[int] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class ServiceLogCreate(BaseModel):
    project_id: str
    equipment_id: str
    service_type: str
    description: str
    duration_minutes: Optional[int] = None

# ============ Mock Data Generator ============

def generate_mock_data():
    """Generate mock data simulating Salesforce data"""
    
    # Mock Technician
    mock_technician = {
        "id": "tech-001",
        "salesforce_id": "003Dn00000AbCdEF",
        "username": "john.smith",
        "email": "john.smith@blueboxair.com",
        "full_name": "John Smith",
        "phone": "(555) 123-4567",
        "skills": ["Coil Management", "Coil Cleaning", "Air Quality", "Bio-Automation Install", "Client Specialist", "Field Trainer", "Virtual Trainer", "Trouble Shoot Expert"],
        "profile_image": None
    }
    
    # Mock Projects (from Salesforce)
    now = datetime.utcnow()
    mock_projects = [
        {
            "id": "proj-001", 
            "salesforce_id": "a0B001", 
            "project_number": "PRJ-2024-001",
            "name": "Acme Corporate Tower - Coil Management",
            "description": "Annual coil cleaning and management for all 12 floors",
            "status": "Active",
            "client_name": "Acme Corporation",
            "address": "123 Main Street, New York, NY 10001",
            "start_date": now - timedelta(days=5),
            "end_date": now + timedelta(days=25),
            "assigned_technician_id": "tech-001",
            "equipment_count": 24,
            "primary_contact": {
                "name": "James Wilson",
                "title": "Facilities Manager",
                "phone": "+1 (212) 555-0147",
                "email": "j.wilson@acmecorp.com"
            }
        },
        {
            "id": "proj-002", 
            "salesforce_id": "a0B002", 
            "project_number": "PRJ-2024-002",
            "name": "Metro Hospital - Air Quality Assessment",
            "description": "Critical air quality inspection and coil treatment",
            "status": "Active",
            "client_name": "Metro Healthcare",
            "address": "789 Hospital Drive, Chicago, IL 60601",
            "start_date": now,
            "end_date": now + timedelta(days=10),
            "assigned_technician_id": "tech-001",
            "equipment_count": 36,
            "primary_contact": {
                "name": "Dr. Sarah Mitchell",
                "title": "Chief of Operations",
                "phone": "+1 (312) 555-0289",
                "email": "s.mitchell@metrohealthcare.com"
            }
        },
        {
            "id": "proj-003", 
            "salesforce_id": "a0B003", 
            "project_number": "PRJ-2024-003",
            "name": "Pacific Mall - Chiller Inspection",
            "description": "Quarterly chiller inspection and enzyme treatment",
            "status": "Active",
            "client_name": "Pacific Retail Group",
            "address": "321 Commerce Blvd, Seattle, WA 98101",
            "start_date": now + timedelta(days=3),
            "end_date": now + timedelta(days=7),
            "assigned_technician_id": "tech-001",
            "equipment_count": 8,
            "primary_contact": {
                "name": "Robert Chen",
                "title": "Property Manager",
                "phone": "+1 (206) 555-0193",
                "email": "r.chen@pacificretail.com"
            }
        },
    ]
    
    # Mock Equipment for projects
    mock_equipment = [
        # Project 1 equipment
        {"id": "eq-001", "salesforce_id": "a1E001", "project_id": "proj-001", "name": "AHU-01 Floor 1", "model": "Carrier 39M", "serial_number": "CR39M001", "equipment_type": "AHU", "location": "Floor 1 Mechanical Room", "status": "Active"},
        {"id": "eq-002", "salesforce_id": "a1E002", "project_id": "proj-001", "name": "AHU-02 Floor 2", "model": "Carrier 39M", "serial_number": "CR39M002", "equipment_type": "AHU", "location": "Floor 2 Mechanical Room", "status": "Active"},
        {"id": "eq-003", "salesforce_id": "a1E003", "project_id": "proj-001", "name": "RTU-01 Roof", "model": "Trane Voyager", "serial_number": "TV12345", "equipment_type": "RTU", "location": "Rooftop", "status": "Active"},
        {"id": "eq-004", "salesforce_id": "a1E004", "project_id": "proj-001", "name": "Chiller-01", "model": "York YCIV", "serial_number": "YK001", "equipment_type": "Chiller", "location": "Basement", "status": "Active"},
        # Project 2 equipment
        {"id": "eq-005", "salesforce_id": "a1E005", "project_id": "proj-002", "name": "OR-AHU-01", "model": "Carrier 39MN", "serial_number": "CR39MN001", "equipment_type": "AHU", "location": "OR Suite 1", "status": "Active"},
        {"id": "eq-006", "salesforce_id": "a1E006", "project_id": "proj-002", "name": "ICU-AHU-01", "model": "Carrier 39MN", "serial_number": "CR39MN002", "equipment_type": "AHU", "location": "ICU", "status": "Active"},
        # Project 3 equipment
        {"id": "eq-007", "salesforce_id": "a1E007", "project_id": "proj-003", "name": "Chiller-Main", "model": "Trane CVHF", "serial_number": "TCV001", "equipment_type": "Chiller", "location": "Central Plant", "status": "Active"},
        {"id": "eq-008", "salesforce_id": "a1E008", "project_id": "proj-003", "name": "Chiller-Backup", "model": "Trane CVHF", "serial_number": "TCV002", "equipment_type": "Chiller", "location": "Central Plant", "status": "Active"},
    ]
    
    return {
        "technician": mock_technician,
        "projects": mock_projects,
        "equipment": mock_equipment,
    }

# Store for current session
MOCK_DATA = generate_mock_data()
current_technician_id = "tech-001"

# ============ Auth Routes ============

# Salesforce OAuth configuration - read lazily to support deployed environments
def get_sf_config():
    """Get Salesforce config from environment (read at call time, not module load)"""
    return {
        "client_id": os.environ.get('SALESFORCE_CLIENT_ID', ''),
        "client_secret": os.environ.get('SALESFORCE_CLIENT_SECRET', ''),
        "login_url": os.environ.get('SALESFORCE_LOGIN_URL', 'https://login.salesforce.com'),
        "api_version": os.environ.get('SALESFORCE_API_VERSION', 'v59.0'),
        "redirect_uri": os.environ.get('SALESFORCE_REDIRECT_URI', ''),
        "app_url": os.environ.get('APP_URL', ''),
    }

# PKCE helpers for Salesforce OAuth
def generate_pkce_pair():
    """Generate a PKCE code_verifier and code_challenge pair"""
    code_verifier = secrets.token_urlsafe(64)[:128]  # 43-128 chars
    digest = hashlib.sha256(code_verifier.encode('ascii')).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
    return code_verifier, code_challenge

# In-memory store for PKCE verifiers (keyed by state)
_pkce_store: Dict[str, str] = {}

@api_router.post("/auth/login")
async def login(credentials: TechnicianLogin):
    """Login with Salesforce username/password (Resource Owner Password Flow)"""
    sf = get_sf_config()
    
    # Try real Salesforce OAuth first if credentials are configured
    if sf["client_id"] and sf["client_secret"]:
        try:
            async with httpx.AsyncClient() as client_http:
                token_response = await client_http.post(
                    f"{sf['login_url']}/services/oauth2/token",
                    data={
                        "grant_type": "password",
                        "client_id": sf["client_id"],
                        "client_secret": sf["client_secret"],
                        "username": credentials.username,
                        "password": credentials.password,
                    },
                    headers={"Content-Type": "application/x-www-form-urlencoded"},
                    timeout=30.0,
                )
                
                if token_response.status_code == 200:
                    sf_data = token_response.json()
                    access_token = sf_data.get("access_token")
                    instance_url = sf_data.get("instance_url")
                    
                    # Fetch user info from Salesforce
                    user_response = await client_http.get(
                        f"{instance_url}/services/oauth2/userinfo",
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=15.0,
                    )
                    
                    user_data = user_response.json() if user_response.status_code == 200 else {}
                    
                    # Build technician profile from Salesforce data
                    technician = {
                        "id": user_data.get("user_id", sf_data.get("id", "sf-user")),
                        "salesforce_id": user_data.get("user_id", ""),
                        "username": credentials.username,
                        "email": user_data.get("email", credentials.username),
                        "full_name": user_data.get("name", credentials.username.split("@")[0]),
                        "phone": user_data.get("phone", ""),
                        "title": user_data.get("title", "Technician"),
                        "company": user_data.get("organization_id", "Blue Box Air, Inc."),
                        "profile_photo": user_data.get("picture", ""),
                        "skills": ["Coil Cleaning", "Air Quality"],
                        "sf_instance_url": instance_url,
                    }
                    
                    # Save SF session to DB for later API calls
                    await db.sf_sessions.update_one(
                        {"user_id": technician["id"]},
                        {"$set": {
                            "access_token": access_token,
                            "instance_url": instance_url,
                            "refresh_token": sf_data.get("refresh_token", ""),
                            "updated_at": datetime.utcnow().isoformat(),
                        }},
                        upsert=True,
                    )
                    
                    # Also save/update the technician profile in DB
                    await db.profiles.update_one(
                        {"salesforce_id": technician["salesforce_id"]},
                        {"$set": {
                            **technician,
                            "technician_id": technician["id"],
                            "source": "salesforce",
                            "updated_at": datetime.utcnow().isoformat(),
                        }},
                        upsert=True,
                    )
                    
                    return {
                        "success": True,
                        "message": "Salesforce login successful",
                        "technician": technician,
                        "token": access_token,
                        "source": "salesforce",
                    }
                else:
                    sf_error = token_response.json()
                    error_desc = sf_error.get("error_description", "Invalid credentials")
                    error_code = sf_error.get("error", "unknown")
                    logging.warning(f"Salesforce password login failed: {error_code} - {error_desc}")
                    logging.warning(f"Salesforce full response: {token_response.text}")
                    
                    # Don't block login — fall through to mock so user can still use the app
                    
        except Exception as e:
            logging.error(f"Salesforce OAuth error: {e}")
            # Fall through to mock login
    
    # Fallback: Mock login for development
    technician = MOCK_DATA["technician"].copy()
    return {
        "success": True,
        "message": "Login successful (Demo mode - use Salesforce credentials for live access)",
        "technician": technician,
        "token": "mock-jwt-token-" + str(uuid.uuid4()),
        "source": "mock",
    }

@api_router.get("/auth/salesforce/init")
async def salesforce_oauth_init(redirect_uri: str = ""):
    """Initialize Salesforce OAuth flow - returns the authorization URL with PKCE"""
    sf = get_sf_config()
    if not sf["client_id"]:
        raise HTTPException(status_code=500, detail="Salesforce not configured")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Generate PKCE pair
    code_verifier, code_challenge = generate_pkce_pair()
    state_key = f"init-{secrets.token_urlsafe(16)}"
    _pkce_store[state_key] = code_verifier
    
    params = {
        "response_type": "code",
        "client_id": sf["client_id"],
        "redirect_uri": callback_url,
        "scope": "api refresh_token openid profile",
        "state": state_key,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    
    auth_url = f"{sf['login_url']}/services/oauth2/authorize?{urllib.parse.urlencode(params)}"
    
    return {"auth_url": auth_url, "callback_url": callback_url}

@api_router.get("/auth/salesforce/redirect")
async def salesforce_oauth_redirect():
    """Redirect user to Salesforce login page (browser-based flow) with PKCE"""
    sf = get_sf_config()
    if not sf["client_id"]:
        raise HTTPException(status_code=500, detail="Salesforce not configured")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Generate PKCE pair
    code_verifier, code_challenge = generate_pkce_pair()
    state_key = f"redirect-{secrets.token_urlsafe(16)}"
    _pkce_store[state_key] = code_verifier
    
    params = {
        "response_type": "code",
        "client_id": sf["client_id"],
        "redirect_uri": callback_url,
        "scope": "api refresh_token openid profile",
        "state": state_key,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    
    auth_url = f"{sf['login_url']}/services/oauth2/authorize?{urllib.parse.urlencode(params)}"
    logging.info(f"SF OAuth redirect: callback_url={callback_url}, state={state_key}")
    logging.info(f"SF OAuth redirect: full auth_url={auth_url[:200]}...")
    return RedirectResponse(url=auth_url)

@api_router.get("/auth/salesforce/debug")
async def salesforce_debug():
    """Debug endpoint - shows current Salesforce OAuth configuration"""
    sf = get_sf_config()
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    return {
        "configured": bool(sf["client_id"] and sf["client_secret"]),
        "client_id_set": bool(sf["client_id"]),
        "client_id_preview": sf["client_id"][:20] + "..." if sf["client_id"] else "NOT SET",
        "client_secret_set": bool(sf["client_secret"]),
        "login_url": sf["login_url"],
        "redirect_uri": sf["redirect_uri"],
        "callback_url_being_sent": callback_url,
        "app_url": sf["app_url"],
        "api_version": sf["api_version"],
        "pkce_enabled": True,
        "pkce_store_size": len(_pkce_store),
        "note": "Make sure the 'callback_url_being_sent' matches EXACTLY what is configured in your Salesforce Connected App's Callback URL field."
    }


@api_router.get("/auth/salesforce/callback")
async def salesforce_oauth_callback(code: str = "", state: str = "", error: str = "", error_description: str = ""):
    """Handle Salesforce OAuth callback"""
    sf = get_sf_config()
    frontend_url = sf["redirect_uri"].replace("/api/auth/salesforce/callback", "") if sf["redirect_uri"] else sf["app_url"]
    
    logging.info(f"SF Callback received: code={'YES' if code else 'NO'}, state={state}, error={error}, error_desc={error_description}")
    
    if error:
        logging.warning(f"SF Callback error: {error} - {error_description}")
        # Redirect to frontend with error
        return RedirectResponse(url=f"{frontend_url}/?sf_error={urllib.parse.quote(error_description or error)}")
    
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Retrieve PKCE code_verifier from store
    code_verifier = _pkce_store.pop(state, None)
    logging.info(f"SF Callback: PKCE verifier found={code_verifier is not None}, state={state}, stored_states={list(_pkce_store.keys())}")
    
    try:
        async with httpx.AsyncClient() as client_http:
            # Exchange code for tokens (with PKCE code_verifier)
            token_data = {
                "grant_type": "authorization_code",
                "code": code,
                "client_id": sf["client_id"],
                "client_secret": sf["client_secret"],
                "redirect_uri": callback_url,
            }
            if code_verifier:
                token_data["code_verifier"] = code_verifier
            
            logging.info(f"SF Token exchange: url={sf['login_url']}/services/oauth2/token, redirect_uri={callback_url}")
            
            token_response = await client_http.post(
                f"{sf['login_url']}/services/oauth2/token",
                data=token_data,
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30.0,
            )
            
            logging.info(f"SF Token exchange response: status={token_response.status_code}")
            
            if token_response.status_code != 200:
                error_msg = token_response.text
                logging.error(f"SF token exchange failed: {error_msg}")
                return RedirectResponse(url=f"{frontend_url}/?sf_error={urllib.parse.quote('Token exchange failed: ' + error_msg[:200])}")
            
            sf_data = token_response.json()
            access_token = sf_data.get("access_token")
            instance_url = sf_data.get("instance_url")
            
            # Fetch user info
            user_response = await client_http.get(
                f"{instance_url}/services/oauth2/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15.0,
            )
            
            user_data = user_response.json() if user_response.status_code == 200 else {}
            
            # Fetch detailed profile from Salesforce User object (role, title, department, photo)
            sf_user_id = user_data.get("user_id", "")
            detailed_profile = {}
            if sf_user_id:
                try:
                    sf_cfg = get_sf_config()
                    soql = (
                        f"SELECT Id, Name, FirstName, LastName, Email, Phone, MobilePhone, Title, "
                        f"Department, CompanyName, UserRoleId, UserRole.Name, Profile.Name, "
                        f"SmallPhotoUrl, FullPhotoUrl, IsActive, Username, AboutMe "
                        f"FROM User WHERE Id = '{sf_user_id}'"
                    )
                    detail_resp = await client_http.get(
                        f"{instance_url}/services/data/{sf_cfg['api_version']}/query",
                        params={"q": soql},
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=15.0,
                    )
                    if detail_resp.status_code == 200:
                        records = detail_resp.json().get("records", [])
                        if records:
                            detailed_profile = records[0]
                            logging.info(f"SF Profile synced: {detailed_profile.get('Name')} - Role: {detailed_profile.get('UserRole', {})}")
                except Exception as profile_err:
                    logging.warning(f"Could not fetch detailed SF profile: {profile_err}")
            
            # Build rich technician profile merging userinfo + detailed User object
            role_data = detailed_profile.get("UserRole") or {}
            technician = {
                "id": user_data.get("user_id", "sf-user"),
                "salesforce_id": user_data.get("user_id", ""),
                "username": detailed_profile.get("Username") or user_data.get("preferred_username", user_data.get("email", "")),
                "email": detailed_profile.get("Email") or user_data.get("email", ""),
                "full_name": detailed_profile.get("Name") or user_data.get("name", "Technician"),
                "first_name": detailed_profile.get("FirstName", ""),
                "last_name": detailed_profile.get("LastName", ""),
                "phone": detailed_profile.get("Phone") or detailed_profile.get("MobilePhone") or user_data.get("phone", ""),
                "mobile_phone": detailed_profile.get("MobilePhone", ""),
                "title": detailed_profile.get("Title") or "Technician",
                "department": detailed_profile.get("Department", ""),
                "company": detailed_profile.get("CompanyName") or "Blue Box Air, Inc.",
                "role": role_data.get("Name", ""),
                "role_id": detailed_profile.get("UserRoleId", ""),
                "sf_profile_name": (detailed_profile.get("Profile") or {}).get("Name", ""),
                "profile_photo": detailed_profile.get("FullPhotoUrl") or detailed_profile.get("SmallPhotoUrl") or user_data.get("picture", ""),
                "small_photo": detailed_profile.get("SmallPhotoUrl", ""),
                "about": detailed_profile.get("AboutMe", ""),
                "is_active": detailed_profile.get("IsActive", True),
                "skills": ["Coil Cleaning", "Air Quality"],
                "sf_instance_url": instance_url,
            }
            
            # Save session
            await db.sf_sessions.update_one(
                {"user_id": technician["id"]},
                {"$set": {
                    "access_token": access_token,
                    "instance_url": instance_url,
                    "refresh_token": sf_data.get("refresh_token", ""),
                    "updated_at": datetime.utcnow().isoformat(),
                }},
                upsert=True,
            )
            
            # Save profile
            await db.profiles.update_one(
                {"salesforce_id": technician["salesforce_id"]},
                {"$set": {
                    **technician,
                    "technician_id": technician["id"],
                    "source": "salesforce",
                    "updated_at": datetime.utcnow().isoformat(),
                }},
                upsert=True,
            )
            
            # Redirect to frontend with token and user data encoded in URL
            tech_json = urllib.parse.quote(json.dumps(technician))
            return RedirectResponse(
                url=f"{frontend_url}/?sf_token={access_token}&sf_user={tech_json}&sf_success=true"
            )
            
    except Exception as e:
        logging.error(f"Salesforce callback error: {e}")
        return RedirectResponse(url=f"{frontend_url}/?sf_error={urllib.parse.quote(str(e))}")

@api_router.get("/auth/salesforce/explore")
async def explore_salesforce_objects(token: str = ""):
    """Explore Salesforce org to discover available objects"""
    if not token:
        raise HTTPException(status_code=401, detail="Access token required")
    
    # Get session from DB
    session = await db.sf_sessions.find_one({"access_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    instance_url = session.get("instance_url")
    
    try:
        sf = get_sf_config()
        async with httpx.AsyncClient() as client_http:
            # Get global describe to see available objects
            describe_response = await client_http.get(
                f"{instance_url}/services/data/{sf['api_version']}/sobjects/",
                headers={"Authorization": f"Bearer {token}"},
                timeout=15.0,
            )
            
            if describe_response.status_code == 200:
                data = describe_response.json()
                objects = [
                    {
                        "name": obj["name"],
                        "label": obj["label"],
                        "custom": obj.get("custom", False),
                        "queryable": obj.get("queryable", False),
                    }
                    for obj in data.get("sobjects", [])
                    if obj.get("queryable") and (
                        obj.get("custom") or 
                        obj["name"] in ["Account", "Contact", "WorkOrder", "Case", "Asset", "ServiceAppointment", "ServiceResource"]
                    )
                ]
                return {"success": True, "objects": objects, "total": len(objects)}
            else:
                return {"success": False, "error": "Failed to fetch objects", "status": describe_response.status_code}
                
    except Exception as e:
        return {"success": False, "error": str(e)}

# ============ Salesforce Profile & User Sync ============

async def _get_sf_session(token: str):
    """Helper to validate token and get session with instance_url"""
    if not token:
        raise HTTPException(status_code=401, detail="Access token required")
    session = await db.sf_sessions.find_one({"access_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired Salesforce session")
    return session

@api_router.get("/salesforce/sync-profile")
async def sync_current_user_profile(token: str = ""):
    """Sync the currently logged-in user's full profile and role from Salesforce"""
    session = await _get_sf_session(token)
    instance_url = session.get("instance_url")
    user_id = session.get("user_id")
    sf_cfg = get_sf_config()
    
    try:
        async with httpx.AsyncClient() as client_http:
            soql = (
                f"SELECT Id, Name, FirstName, LastName, Email, Phone, MobilePhone, Title, "
                f"Department, CompanyName, UserRoleId, UserRole.Name, Profile.Name, "
                f"SmallPhotoUrl, FullPhotoUrl, IsActive, Username, AboutMe "
                f"FROM User WHERE Id = '{user_id}'"
            )
            resp = await client_http.get(
                f"{instance_url}/services/data/{sf_cfg['api_version']}/query",
                params={"q": soql},
                headers={"Authorization": f"Bearer {token}"},
                timeout=15.0,
            )
            
            if resp.status_code != 200:
                logging.error(f"SF sync-profile query failed: {resp.status_code} {resp.text}")
                return {"success": False, "error": f"Salesforce query failed: {resp.status_code}"}
            
            records = resp.json().get("records", [])
            if not records:
                return {"success": False, "error": "User not found in Salesforce"}
            
            sf_user = records[0]
            role_data = sf_user.get("UserRole") or {}
            profile_name = (sf_user.get("Profile") or {}).get("Name", "")
            
            profile = {
                "salesforce_id": sf_user.get("Id", ""),
                "username": sf_user.get("Username", ""),
                "email": sf_user.get("Email", ""),
                "full_name": sf_user.get("Name", ""),
                "first_name": sf_user.get("FirstName", ""),
                "last_name": sf_user.get("LastName", ""),
                "phone": sf_user.get("Phone", ""),
                "mobile_phone": sf_user.get("MobilePhone", ""),
                "title": sf_user.get("Title", ""),
                "department": sf_user.get("Department", ""),
                "company": sf_user.get("CompanyName", ""),
                "role": role_data.get("Name", ""),
                "role_id": sf_user.get("UserRoleId", ""),
                "sf_profile_name": profile_name,
                "profile_photo": sf_user.get("FullPhotoUrl", ""),
                "small_photo": sf_user.get("SmallPhotoUrl", ""),
                "about": sf_user.get("AboutMe", ""),
                "is_active": sf_user.get("IsActive", True),
                "source": "salesforce",
                "synced_at": datetime.utcnow().isoformat(),
            }
            
            # Upsert into DB
            await db.profiles.update_one(
                {"salesforce_id": profile["salesforce_id"]},
                {"$set": profile},
                upsert=True,
            )
            
            logging.info(f"Profile synced: {profile['full_name']} | Role: {profile['role']} | Title: {profile['title']}")
            return {"success": True, "profile": profile}
    
    except Exception as e:
        logging.error(f"SF sync-profile error: {e}")
        return {"success": False, "error": str(e)}

@api_router.get("/salesforce/sync-users")
async def sync_all_salesforce_users(token: str = ""):
    """Sync ALL active users from Salesforce with their profiles and roles"""
    session = await _get_sf_session(token)
    instance_url = session.get("instance_url")
    sf_cfg = get_sf_config()
    
    try:
        async with httpx.AsyncClient() as client_http:
            soql = (
                f"SELECT Id, Name, FirstName, LastName, Email, Phone, MobilePhone, Title, "
                f"Department, CompanyName, UserRoleId, UserRole.Name, Profile.Name, "
                f"SmallPhotoUrl, FullPhotoUrl, IsActive, Username, AboutMe "
                f"FROM User WHERE IsActive = true ORDER BY Name"
            )
            resp = await client_http.get(
                f"{instance_url}/services/data/{sf_cfg['api_version']}/query",
                params={"q": soql},
                headers={"Authorization": f"Bearer {token}"},
                timeout=30.0,
            )
            
            if resp.status_code != 200:
                logging.error(f"SF sync-users query failed: {resp.status_code} {resp.text}")
                return {"success": False, "error": f"Salesforce query failed: {resp.status_code}"}
            
            sf_users = resp.json().get("records", [])
            synced_users = []
            
            for sf_user in sf_users:
                role_data = sf_user.get("UserRole") or {}
                profile_name = (sf_user.get("Profile") or {}).get("Name", "")
                
                user_profile = {
                    "salesforce_id": sf_user.get("Id", ""),
                    "username": sf_user.get("Username", ""),
                    "email": sf_user.get("Email", ""),
                    "full_name": sf_user.get("Name", ""),
                    "first_name": sf_user.get("FirstName", ""),
                    "last_name": sf_user.get("LastName", ""),
                    "phone": sf_user.get("Phone", ""),
                    "mobile_phone": sf_user.get("MobilePhone", ""),
                    "title": sf_user.get("Title", ""),
                    "department": sf_user.get("Department", ""),
                    "company": sf_user.get("CompanyName", ""),
                    "role": role_data.get("Name", ""),
                    "role_id": sf_user.get("UserRoleId", ""),
                    "sf_profile_name": profile_name,
                    "profile_photo": sf_user.get("FullPhotoUrl", ""),
                    "small_photo": sf_user.get("SmallPhotoUrl", ""),
                    "about": sf_user.get("AboutMe", ""),
                    "is_active": sf_user.get("IsActive", True),
                    "source": "salesforce",
                    "synced_at": datetime.utcnow().isoformat(),
                }
                
                # Upsert each user into DB
                await db.profiles.update_one(
                    {"salesforce_id": user_profile["salesforce_id"]},
                    {"$set": user_profile},
                    upsert=True,
                )
                
                synced_users.append({
                    "name": user_profile["full_name"],
                    "email": user_profile["email"],
                    "role": user_profile["role"],
                    "title": user_profile["title"],
                    "department": user_profile["department"],
                    "sf_profile": profile_name,
                })
            
            logging.info(f"Synced {len(synced_users)} users from Salesforce")
            return {
                "success": True,
                "total_synced": len(synced_users),
                "users": synced_users,
            }
    
    except Exception as e:
        logging.error(f"SF sync-users error: {e}")
        return {"success": False, "error": str(e)}

@api_router.get("/salesforce/users")
async def get_synced_users():
    """Get all synced Salesforce users from local DB"""
    users = []
    async for user in db.profiles.find({"source": "salesforce"}).sort("full_name", 1):
        users.append(serialize_doc(user))
    return {"users": users, "total": len(users)}

@api_router.get("/auth/profile")
async def get_profile(token: str = ""):
    """Get current technician profile"""
    # Try to get profile from DB by SF data first
    if token:
        session = await db.sf_sessions.find_one({"access_token": token})
        if session:
            profile = await db.profiles.find_one({"salesforce_id": session.get("user_id", "")})
            if profile:
                return serialize_doc(profile)
    
    # Try to get profile from DB by technician_id
    profile = await db.profiles.find_one({"technician_id": MOCK_DATA["technician"]["id"]})
    if profile:
        profile = serialize_doc(profile)
        return profile
    return MOCK_DATA["technician"]

@api_router.put("/auth/profile")
async def update_profile(profile_data: dict):
    """Update technician profile"""
    technician_id = MOCK_DATA["technician"]["id"]
    
    allowed_fields = ["full_name", "email", "phone", "skills", "profile_photo", "title", "company"]
    update_data = {k: v for k, v in profile_data.items() if k in allowed_fields}
    update_data["technician_id"] = technician_id
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    result = await db.profiles.update_one(
        {"technician_id": technician_id},
        {"$set": update_data},
        upsert=True
    )
    
    # Merge with mock data for complete profile
    merged = {**MOCK_DATA["technician"], **update_data}
    return {"success": True, "profile": merged}

# ============ Media (Photos & Videos) ============

@api_router.post("/media")
async def upload_media(media_data: dict):
    """Upload photo or video media to a project"""
    media = {
        "id": f"media-{uuid.uuid4().hex[:8]}",
        "project_id": media_data.get("project_id"),
        "equipment_id": media_data.get("equipment_id"),
        "media_type": media_data.get("media_type", "photo"),  # photo or video
        "media_uri": media_data.get("media_uri", ""),
        "thumbnail": media_data.get("thumbnail", ""),
        "caption": media_data.get("caption", ""),
        "duration": media_data.get("duration"),  # for videos
        "technician_id": MOCK_DATA["technician"]["id"],
        "created_at": datetime.utcnow().isoformat(),
    }
    
    await db.media.insert_one(media)
    media = serialize_doc(media)
    return {"success": True, "media": media}

@api_router.get("/media/{project_id}")
async def get_project_media(project_id: str):
    """Get all media (photos & videos) for a project"""
    media = await db.media.find({"project_id": project_id}).sort("created_at", -1).to_list(200)
    media = serialize_doc(media)
    return {"media": media}

@api_router.delete("/media/{media_id}")
async def delete_media(media_id: str):
    """Delete a media item"""
    await db.media.delete_one({"id": media_id})
    return {"success": True}

# ============ Project Sharing ============

@api_router.get("/technicians")
async def list_technicians():
    """List all Blue Box Air technicians for sharing"""
    # Mock list of technicians in the company
    technicians = [
        {"id": "tech-001", "full_name": "John Smith", "email": "john@blueboxair.com", "title": "Lead Technician", "skills": ["Coil Cleaning", "Air Quality"]},
        {"id": "tech-002", "full_name": "Sarah Johnson", "email": "sarah@blueboxair.com", "title": "Senior Technician", "skills": ["Coil Management", "Diagnostics"]},
        {"id": "tech-003", "full_name": "Mike Davis", "email": "mike@blueboxair.com", "title": "Technician", "skills": ["Installation", "Repair"]},
        {"id": "tech-004", "full_name": "Emily Chen", "email": "emily@blueboxair.com", "title": "Technician", "skills": ["Coil Cleaning", "Maintenance"]},
        {"id": "tech-005", "full_name": "Carlos Rodriguez", "email": "carlos@blueboxair.com", "title": "Field Supervisor", "skills": ["Management", "Quality Assurance"]},
    ]
    return {"technicians": technicians}

@api_router.post("/projects/{project_id}/share")
async def share_project(project_id: str, share_data: dict):
    """Share a project with other technicians"""
    share_record = {
        "id": f"share-{uuid.uuid4().hex[:8]}",
        "project_id": project_id,
        "shared_by": MOCK_DATA["technician"]["id"],
        "shared_with": share_data.get("technician_ids", []),
        "message": share_data.get("message", ""),
        "shared_at": datetime.utcnow().isoformat(),
    }
    
    await db.shares.insert_one(share_record)
    share_record = serialize_doc(share_record)
    return {"success": True, "share": share_record}

@api_router.get("/projects/{project_id}/shares")
async def get_project_shares(project_id: str):
    """Get all share records for a project"""
    shares = await db.shares.find({"project_id": project_id}).to_list(100)
    shares = serialize_doc(shares)
    return {"shares": shares}

# ============ Salesforce Integration Routes ============

@api_router.get("/salesforce/status")
async def salesforce_status():
    """Get Salesforce connection status and configuration info."""
    return get_salesforce_status()

@api_router.get("/salesforce/auth-url")
async def salesforce_auth_url():
    """Get the Salesforce OAuth authorization URL for login."""
    if not sf_config.is_configured:
        return {
            "error": "Salesforce not configured",
            "message": "Set SALESFORCE_CLIENT_ID and SALESFORCE_CLIENT_SECRET in backend/.env",
            "auth_url": None
        }
    return {"auth_url": sf_config.auth_url}

# Note: /auth/salesforce/callback is already defined above with full Authorization Code Flow handling

@api_router.get("/salesforce/field-mappings")
async def get_field_mappings():
    """Get Salesforce object and field mappings for reference."""
    return {
        "mappings": FIELD_MAPPINGS,
        "note": "Update these in salesforce_service.py to match your Salesforce org's custom object/field API names"
    }

# ============ Projects Routes ============

@api_router.get("/projects")
async def get_projects(status: Optional[str] = None):
    """Get all projects assigned to the technician"""
    projects = MOCK_DATA["projects"].copy()
    
    # Convert datetime objects for JSON serialization
    for proj in projects:
        if proj.get("start_date"):
            proj["start_date"] = proj["start_date"].isoformat() if isinstance(proj["start_date"], datetime) else proj["start_date"]
        if proj.get("end_date"):
            proj["end_date"] = proj["end_date"].isoformat() if isinstance(proj["end_date"], datetime) else proj["end_date"]
    
    # Also get custom projects from DB
    custom_projects = await db.custom_projects.find().to_list(100)
    for cp in custom_projects:
        cp["id"] = str(cp["_id"])
        del cp["_id"]
        projects.append(cp)
    
    # Apply filters
    if status:
        projects = [p for p in projects if p.get("status") == status]
    
    return {"projects": projects, "total": len(projects)}

@api_router.post("/projects")
async def create_project(data: dict = Body(...)):
    """Create a new project manually"""
    now = datetime.now()
    project_id = f"proj-custom-{int(now.timestamp())}"
    
    new_project = {
        "id": project_id,
        "salesforce_id": None,
        "project_number": f"PRJ-{now.strftime('%Y')}-{project_id[-4:]}",
        "name": data.get("name", "Untitled Project"),
        "description": data.get("description", ""),
        "status": data.get("status", "Active"),
        "client_name": data.get("client_name", ""),
        "address": data.get("address", ""),
        "start_date": data.get("start_date", now.isoformat()),
        "end_date": data.get("end_date", (now + timedelta(days=30)).isoformat()),
        "assigned_technician_id": "tech-001",
        "equipment_count": 0,
        "primary_contact": {
            "name": data.get("contact_name", ""),
            "title": data.get("contact_title", ""),
            "phone": data.get("contact_phone", ""),
            "email": data.get("contact_email", ""),
        } if data.get("contact_name") else None,
        "source": "manual",
        "created_at": now.isoformat(),
    }
    
    result = await db.custom_projects.insert_one(new_project.copy())
    new_project["id"] = str(result.inserted_id)
    
    return {"success": True, "project": new_project}

@api_router.get("/projects/{project_id}")
async def get_project(project_id: str):
    """Get a specific project with all details"""
    project = next((p for p in MOCK_DATA["projects"] if p["id"] == project_id), None)
    
    # Also check custom projects in DB
    if not project:
        from bson import ObjectId
        try:
            custom = await db.custom_projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            custom = await db.custom_projects.find_one({"id": project_id})
        if custom:
            custom["id"] = str(custom["_id"])
            del custom["_id"]
            project = custom
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Convert datetime for JSON
    project = project.copy()
    if project.get("start_date"):
        project["start_date"] = project["start_date"].isoformat() if isinstance(project["start_date"], datetime) else project["start_date"]
    if project.get("end_date"):
        project["end_date"] = project["end_date"].isoformat() if isinstance(project["end_date"], datetime) else project["end_date"]
    
    # Get equipment for this project
    equipment = [eq for eq in MOCK_DATA["equipment"] if eq["project_id"] == project_id]
    
    # Get related data from DB
    readings = await db.readings.find({"project_id": project_id}).to_list(100)
    photos = await db.photos.find({"project_id": project_id}).to_list(100)
    service_logs = await db.service_logs.find({"project_id": project_id}).to_list(100)
    
    return {
        "project": project,
        "equipment": equipment,
        "readings": serialize_doc(readings),
        "photos": serialize_doc(photos),
        "service_logs": serialize_doc(service_logs)
    }

# ============ Equipment Routes ============

@api_router.get("/equipment/{project_id}")
async def get_equipment(project_id: str):
    """Get all equipment for a project"""
    equipment = [eq for eq in MOCK_DATA["equipment"] if eq["project_id"] == project_id]
    return {"equipment": equipment}

@api_router.get("/equipment/detail/{equipment_id}")
async def get_equipment_detail(equipment_id: str):
    """Get equipment details with readings"""
    equipment = next((eq for eq in MOCK_DATA["equipment"] if eq["id"] == equipment_id), None)
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    # Get readings for this equipment
    readings = await db.readings.find({"equipment_id": equipment_id}).sort("timestamp", -1).to_list(50)
    photos = await db.photos.find({"equipment_id": equipment_id}).to_list(50)
    service_logs = await db.service_logs.find({"equipment_id": equipment_id}).to_list(50)
    
    return {
        "equipment": equipment,
        "readings": serialize_doc(readings),
        "photos": serialize_doc(photos),
        "service_logs": serialize_doc(service_logs)
    }

# ============ Readings Routes ============

@api_router.post("/readings")
async def create_reading(reading: ReadingCreate):
    """Record a new reading (pressure, airflow, etc.) with Pre/Post phase"""
    # Parse captured_at if provided, otherwise use current time
    captured_at = datetime.utcnow()
    if reading.captured_at:
        try:
            captured_at = datetime.fromisoformat(reading.captured_at.replace('Z', '+00:00'))
        except:
            captured_at = datetime.utcnow()
    
    reading_obj = Reading(
        equipment_id=reading.equipment_id,
        project_id=reading.project_id,
        technician_id=current_technician_id,
        reading_type=reading.reading_type,
        reading_phase=reading.reading_phase,
        value=reading.value,
        unit=reading.unit,
        captured_at=captured_at,
        notes=reading.notes
    )
    await db.readings.insert_one(reading_obj.dict())
    return {"success": True, "reading": serialize_doc(reading_obj.dict())}

@api_router.get("/readings/{equipment_id}")
async def get_readings(equipment_id: str, phase: Optional[str] = None):
    """Get all readings for an equipment, optionally filtered by phase (Pre/Post)"""
    query = {"equipment_id": equipment_id}
    if phase:
        query["reading_phase"] = phase
    readings = await db.readings.find(query).sort("captured_at", -1).to_list(100)
    return {"readings": serialize_doc(readings)}

# ============ Photo Routes ============

@api_router.post("/photos")
async def upload_photo(photo: PhotoCreate):
    """Upload a photo"""
    photo_obj = Photo(
        **photo.dict(),
        technician_id=current_technician_id
    )
    await db.photos.insert_one(photo_obj.dict())
    return {"success": True, "photo_id": photo_obj.id}

@api_router.get("/photos/{project_id}")
async def get_photos(project_id: str):
    """Get all photos for a project"""
    photos = await db.photos.find({"project_id": project_id}).to_list(100)
    return {"photos": serialize_doc(photos)}

# ============ Service Log Routes ============

@api_router.post("/service-logs")
async def create_service_log(log: ServiceLogCreate):
    """Create a service log entry"""
    log_obj = ServiceLog(
        **log.dict(),
        technician_id=current_technician_id
    )
    await db.service_logs.insert_one(log_obj.dict())
    return {"success": True, "log_id": log_obj.id}

@api_router.get("/service-logs/{project_id}")
async def get_service_logs(project_id: str):
    """Get all service logs for a project"""
    logs = await db.service_logs.find({"project_id": project_id}).sort("created_at", -1).to_list(100)
    return {"service_logs": serialize_doc(logs)}

# ============ Claude AI Integration ============

LLM_KEY = os.environ.get("EMERGENT_LLM_KEY", "")

@api_router.post("/ai/troubleshoot")
async def ai_troubleshoot(data: dict):
    """AI Troubleshooting Assistant - Claude analyzes equipment issues and suggests fixes"""
    equipment_name = data.get("equipment_name", "")
    issue = data.get("issue", "")
    readings = data.get("readings", [])
    
    readings_text = ""
    for r in readings:
        readings_text += f"- {r.get('type','')}: Pre={r.get('pre','N/A')}, Post={r.get('post','N/A')}, Unit={r.get('unit','')}\n"
    
    session_id = f"troubleshoot-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=LLM_KEY,
        session_id=session_id,
        system_message="""You are a Blue Box Air, Inc. expert coil management technician assistant. 
You help field technicians troubleshoot equipment issues. You specialize in:
- Coil cleaning and management
- Differential pressure readings (inWC)
- Airflow measurements (FPM)
- Temperature and humidity diagnostics
- Bio-Automation systems

Provide clear, actionable troubleshooting steps. Be concise and practical. 
Format your response with numbered steps when giving instructions."""
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    
    prompt = f"Equipment: {equipment_name}\nIssue: {issue}"
    if readings_text:
        prompt += f"\n\nCurrent Readings:\n{readings_text}"
    prompt += "\n\nProvide troubleshooting steps and recommendations."
    
    msg = UserMessage(text=prompt)
    response = await chat.send_message(msg)
    
    # Store in DB for history
    await db.ai_chats.insert_one({
        "type": "troubleshoot",
        "equipment_name": equipment_name,
        "issue": issue,
        "response": response,
        "created_at": datetime.utcnow().isoformat(),
    })
    
    return {"response": response}

@api_router.post("/ai/report-summary")
async def ai_report_summary(data: dict):
    """Smart Report Summaries - Claude generates written summaries from readings data"""
    project_name = data.get("project_name", "")
    equipment_reports = data.get("equipment_reports", [])
    
    report_text = f"Project: {project_name}\n\n"
    for eq in equipment_reports:
        equip = eq.get("equipment", {})
        report_text += f"Equipment: {equip.get('name', 'Unknown')} ({equip.get('equipment_type', '')})\n"
        for comp in eq.get("comparisons", []):
            if comp.get("pre") or comp.get("post"):
                pre_val = comp["pre"]["value"] if comp.get("pre") else "N/A"
                post_val = comp["post"]["value"] if comp.get("post") else "N/A"
                diff = comp.get("difference", "N/A")
                pct = comp.get("percent_change", "N/A")
                report_text += f"  - {comp['reading_type']}: Pre={pre_val}, Post={post_val}, Change={diff} {comp.get('unit','')} ({pct}%)\n"
        report_text += "\n"
    
    session_id = f"report-{uuid.uuid4().hex[:8]}"
    chat = LlmChat(
        api_key=LLM_KEY,
        session_id=session_id,
        system_message="""You are a Blue Box Air, Inc. service report writer. Generate professional, concise service report summaries.
Include: overview of work performed, key findings from readings, improvements achieved, and recommendations.
Use a professional yet readable tone. Keep summaries under 200 words."""
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    
    msg = UserMessage(text=f"Generate a service report summary for this data:\n\n{report_text}")
    response = await chat.send_message(msg)
    
    return {"summary": response}

@api_router.post("/ai/chat")
async def ai_chat(data: dict):
    """AI Chatbot - General assistant for Blue Box Air technicians"""
    message = data.get("message", "")
    session_id = data.get("session_id", f"chat-{uuid.uuid4().hex[:8]}")
    
    # Load chat history from DB
    history = await db.ai_chats.find(
        {"session_id": session_id, "type": "chat"}
    ).sort("created_at", 1).to_list(50)
    
    chat = LlmChat(
        api_key=LLM_KEY,
        session_id=session_id,
        system_message="""You are the Blue Box Air, Inc. AI Assistant, specializing in coil management solutions.
You help technicians with:
- Equipment troubleshooting and diagnostics
- Coil cleaning procedures and best practices
- Reading interpretation (differential pressure inWC, airflow FPM, temperature, humidity)
- Bio-Automation installation guidance
- Pricing and service information
- FAQs about Blue Box Air processes

Be helpful, concise, and professional. If you don't know something specific to Blue Box Air, 
provide general HVAC/coil management guidance and note that the technician should verify with their supervisor."""
    ).with_model("anthropic", "claude-sonnet-4-5-20250929")
    
    msg = UserMessage(text=message)
    response = await chat.send_message(msg)
    
    # Store chat message
    await db.ai_chats.insert_one({
        "type": "chat",
        "session_id": session_id,
        "role": "user",
        "message": message,
        "created_at": datetime.utcnow().isoformat(),
    })
    await db.ai_chats.insert_one({
        "type": "chat",
        "session_id": session_id,
        "role": "assistant",
        "message": response,
        "created_at": datetime.utcnow().isoformat(),
    })
    
    return {"response": response, "session_id": session_id}

# ============ Dashboard Stats ============

@api_router.get("/reports/{project_id}")
async def generate_report(project_id: str):
    """Generate a project report with equipment readings comparison and photos link."""
    
    project = next((p for p in MOCK_DATA["projects"] if p["id"] == project_id), None)
    
    # Also check custom projects in DB
    if not project:
        from bson import ObjectId
        try:
            custom = await db.custom_projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            custom = await db.custom_projects.find_one({"id": project_id})
        if custom:
            custom["id"] = str(custom["_id"])
            del custom["_id"]
            project = custom
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Serialize project dates
    project = project.copy()
    if project.get("start_date"):
        project["start_date"] = project["start_date"].isoformat() if isinstance(project["start_date"], datetime) else project["start_date"]
    if project.get("end_date"):
        project["end_date"] = project["end_date"].isoformat() if isinstance(project["end_date"], datetime) else project["end_date"]
    
    # Get equipment - check both mock and custom
    equipment_list = [eq for eq in MOCK_DATA["equipment"] if eq["project_id"] == project_id]
    
    # Also check DB for custom equipment
    custom_equipment = await db.equipment.find({"project_id": project_id}).to_list(100)
    for ce in custom_equipment:
        ce["id"] = str(ce["_id"])
        del ce["_id"]
        equipment_list.append(ce)
    
    # Get all readings for this project
    all_readings = await db.readings.find({"project_id": project_id}).to_list(500)
    all_readings = serialize_doc(all_readings)
    
    # Get all photos
    photos = await db.photos.find({"project_id": project_id}).to_list(100)
    photos = serialize_doc(photos)
    
    # Get service logs
    service_logs = await db.service_logs.find({"project_id": project_id}).to_list(100)
    service_logs = serialize_doc(service_logs)
    
    # Build reading comparisons per equipment
    reading_types = ["Differential Pressure", "Airflow", "Temperature", "Humidity"]
    unit_map = {"Differential Pressure": "inWC", "Airflow": "FPM", "Temperature": "°F", "Humidity": "%"}
    
    equipment_reports = []
    for eq in equipment_list:
        eq_readings = [r for r in all_readings if r.get("equipment_id") == eq["id"]]
        
        comparisons = []
        for rt in reading_types:
            type_readings = [r for r in eq_readings if r.get("reading_type") == rt]
            pre_readings = [r for r in type_readings if r.get("reading_phase") == "Pre"]
            post_readings = [r for r in type_readings if r.get("reading_phase") == "Post"]
            
            # Get the latest pre and post
            latest_pre = None
            latest_post = None
            
            if pre_readings:
                latest_pre = max(pre_readings, key=lambda r: r.get("captured_at", r.get("timestamp", "")))
            if post_readings:
                latest_post = max(post_readings, key=lambda r: r.get("captured_at", r.get("timestamp", "")))
            
            difference = None
            percent_change = None
            if latest_pre and latest_post:
                difference = round(latest_post["value"] - latest_pre["value"], 2)
                if latest_pre["value"] != 0:
                    percent_change = round((difference / latest_pre["value"]) * 100, 1)
            
            comparisons.append({
                "reading_type": rt,
                "unit": unit_map.get(rt, ""),
                "pre": {
                    "value": latest_pre["value"] if latest_pre else None,
                    "captured_at": latest_pre.get("captured_at") if latest_pre else None,
                } if latest_pre else None,
                "post": {
                    "value": latest_post["value"] if latest_post else None,
                    "captured_at": latest_post.get("captured_at") if latest_post else None,
                } if latest_post else None,
                "difference": difference,
                "percent_change": percent_change,
            })
        
        equipment_reports.append({
            "equipment": eq,
            "comparisons": comparisons,
            "has_data": any(c["pre"] or c["post"] for c in comparisons),
        })
    
    # Build report
    report = {
        "report_id": f"RPT-{project_id[-8:]}-{datetime.utcnow().strftime('%Y%m%d%H%M%S')}",
        "generated_at": datetime.utcnow().isoformat(),
        "salesforce_sync_status": get_salesforce_status(),
        "project": project,
        "technician": MOCK_DATA["technician"],
        "primary_contact": project.get("primary_contact"),
        "summary": {
            "total_equipment": len(equipment_list),
            "equipment_with_readings": len([er for er in equipment_reports if er["has_data"]]),
            "total_readings": len(all_readings),
            "total_photos": len(photos),
            "total_service_logs": len(service_logs),
        },
        "equipment_reports": equipment_reports,
        "photos": [{"id": p.get("id"), "photo_type": p.get("photo_type", "General"), "created_at": p.get("created_at"), "equipment_id": p.get("equipment_id")} for p in photos],
        "service_logs": service_logs,
    }
    
    return report

@api_router.get("/dashboard/stats")
async def get_dashboard_stats():
    """Get dashboard statistics"""
    projects = MOCK_DATA["projects"]
    
    # Count unique equipment serviced (has readings)
    unique_equipment = await db.readings.distinct("equipment_id")
    units_serviced = len(unique_equipment)
    
    # Total readings count
    total_readings = await db.readings.count_documents({})
    
    stats = {
        "total_projects": len(projects),
        "active": len([p for p in projects if p["status"] == "Active"]),
        "on_hold": len([p for p in projects if p["status"] == "On Hold"]),
        "completed": len([p for p in projects if p["status"] == "Completed"]),
        "total_equipment": sum(p.get("equipment_count", 0) for p in projects),
        "units_serviced": units_serviced,
        "total_readings": total_readings,
    }
    
    return stats

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
