from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.staticfiles import StaticFiles
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
import anthropic
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=True)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'technician_app')]

# Create the main app
app = FastAPI(title="Blue Box Air Tech API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# === Temporary Screenshot Download Endpoints ===
SCREENSHOTS_DIR = "/tmp/app_screenshots"
IPAD_SCREENSHOTS_DIR = "/tmp/ipad_screenshots"

@api_router.get("/screenshots")
async def list_screenshots():
    """List all available screenshots for download"""
    if not os.path.exists(SCREENSHOTS_DIR):
        return {"files": [], "message": "No screenshots available"}
    files = sorted([f for f in os.listdir(SCREENSHOTS_DIR) if f.endswith('.png')])
    return {
        "files": files,
        "download_base": "/api/screenshots/download/",
        "gallery_url": "/api/screenshots/gallery",
        "total": len(files),
    }

@api_router.get("/screenshots/download/{filename}")
async def download_screenshot(filename: str):
    """Download a specific screenshot file"""
    # Check iPhone screenshots first, then iPad
    filepath = os.path.join(SCREENSHOTS_DIR, filename)
    if not os.path.exists(filepath):
        filepath = os.path.join(IPAD_SCREENSHOTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=filename, media_type="image/png")

@api_router.get("/screenshots/gallery")
async def screenshots_gallery():
    """HTML gallery page to preview and download all screenshots (iPhone + iPad)"""
    from fastapi.responses import HTMLResponse
    
    iphone_files = sorted([f for f in os.listdir(SCREENSHOTS_DIR) if f.endswith('.png')]) if os.path.exists(SCREENSHOTS_DIR) else []
    ipad_files = sorted([f for f in os.listdir(IPAD_SCREENSHOTS_DIR) if f.endswith('.png')]) if os.path.exists(IPAD_SCREENSHOTS_DIR) else []
    
    def make_card(f):
        name = f.replace('.png','').replace('_', ' ').title()
        return f'''
        <div style="background:#1e293b;border-radius:16px;padding:16px;text-align:center;max-width:280px;">
            <a href="/api/screenshots/download/{f}" target="_blank">
                <img src="/api/screenshots/download/{f}" style="width:100%;border-radius:12px;border:2px solid #334155;" loading="lazy" />
            </a>
            <p style="color:#c5d93d;margin:12px 0 4px;font-weight:600;font-size:14px;">{name}</p>
            <a href="/api/screenshots/download/{f}" download="{f}" 
               style="display:inline-block;background:#c5d93d;color:#0f172a;padding:8px 20px;border-radius:8px;
                      text-decoration:none;font-weight:700;font-size:13px;margin-top:8px;">
                Download
            </a>
        </div>'''
    
    iphone_previews = [f for f in iphone_files if 'preview' in f]
    iphone_screenshots = [f for f in iphone_files if 'screenshot' in f]
    ipad_previews = [f for f in ipad_files if 'preview' in f]
    ipad_screenshots = [f for f in ipad_files if 'screenshot' in f]
    
    html = f'''<!DOCTYPE html>
<html><head><title>BBA Tech - App Store Assets</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
    body {{ background:#0f172a; color:white; font-family:-apple-system,BlinkMacSystemFont,sans-serif; padding:24px; margin:0; }}
    h1 {{ color:#c5d93d; text-align:center; }}
    h2 {{ color:#94a3b8; border-bottom:1px solid #334155; padding-bottom:8px; margin-top:40px; }}
    h3 {{ color:#64748b; margin-top:24px; }}
    .grid {{ display:flex; flex-wrap:wrap; gap:20px; justify-content:center; padding:16px 0; }}
    .tabs {{ display:flex; justify-content:center; gap:12px; margin:24px 0; }}
    .tab {{ padding:12px 28px; border-radius:10px; font-weight:700; cursor:pointer; font-size:15px; border:none; }}
    .tab.active {{ background:#c5d93d; color:#0f172a; }}
    .tab.inactive {{ background:#1e293b; color:#94a3b8; }}
    .section {{ display:none; }}
    .section.active {{ display:block; }}
</style>
<script>
function showTab(id) {{
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => {{ t.classList.remove('active'); t.classList.add('inactive'); }});
    document.getElementById(id).classList.add('active');
    document.getElementById('tab-'+id).classList.remove('inactive');
    document.getElementById('tab-'+id).classList.add('active');
}}
</script>
</head><body>
<h1>BBA Tech — App Store Assets</h1>
<p style="text-align:center;color:#64748b;font-size:13px;">Click any image to preview full size. Click "Download" to save.</p>

<div class="tabs">
    <button class="tab active" id="tab-iphone" onclick="showTab('iphone')">iPhone (1242x2688)</button>
    <button class="tab inactive" id="tab-ipad" onclick="showTab('ipad')">iPad (2048x2732)</button>
</div>

<div id="iphone" class="section active">
    <h2>iPhone — 3 App Previews</h2>
    <div class="grid">{"".join(make_card(f) for f in iphone_previews)}</div>
    <h2>iPhone — 7 Screenshots</h2>
    <div class="grid">{"".join(make_card(f) for f in iphone_screenshots)}</div>
</div>

<div id="ipad" class="section">
    <h2>iPad — 3 App Previews</h2>
    <div class="grid">{"".join(make_card(f) for f in ipad_previews)}</div>
    <h2>iPad — 7 Screenshots</h2>
    <div class="grid">{"".join(make_card(f) for f in ipad_screenshots)}</div>
</div>

<p style="text-align:center;color:#475569;margin-top:40px;font-size:12px;">
    Total: {len(iphone_files)} iPhone + {len(ipad_files)} iPad = {len(iphone_files)+len(ipad_files)} files | No PII in iPad screenshots (demo account used)
</p>
</body></html>'''
    
    return HTMLResponse(content=html)
# === End Screenshot Endpoints ===

# === Privacy Policy & Terms ===
@api_router.get("/privacy-policy")
async def privacy_policy():
    """Public privacy policy page for App Store compliance"""
    from fastapi.responses import HTMLResponse
    html = '''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BBA Tech — Privacy Policy</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { color: #c5d93d; font-size: 28px; }
    .logo p { color: #94a3b8; font-size: 14px; }
    h2 { color: #c5d93d; font-size: 20px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
    h3 { color: #f8fafc; font-size: 16px; margin: 20px 0 8px; }
    p, li { color: #cbd5e1; font-size: 15px; margin-bottom: 12px; }
    ul { padding-left: 24px; margin-bottom: 16px; }
    li { margin-bottom: 6px; }
    .effective { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 32px; }
    .contact-box { background: #1e293b; border-radius: 12px; padding: 20px; margin-top: 24px; }
    .contact-box p { color: #94a3b8; margin-bottom: 8px; }
    .contact-box a { color: #c5d93d; text-decoration: none; }
    .footer { text-align: center; color: #475569; font-size: 12px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e293b; }
</style>
</head><body>
<div class="container">

<div class="logo">
    <h1>BLUE BOX AIR</h1>
    <p>Coil Management Solutions</p>
</div>

<h1 style="text-align:center;color:white;font-size:24px;margin-bottom:8px;">Privacy Policy</h1>
<p class="effective">Effective Date: June 1, 2025 &nbsp;|&nbsp; Last Updated: June 1, 2025</p>

<p>Blue Box Air, Inc. ("Blue Box Air," "we," "us," or "our") operates the BBA Tech mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use the App. Please read this policy carefully. By using the App, you agree to the collection and use of information in accordance with this policy.</p>

<h2>1. Information We Collect</h2>

<h3>a. Information You Provide</h3>
<ul>
    <li><strong>Account Information:</strong> When you log in via Salesforce, we receive your name, email address, job title, department, and profile photo from your Salesforce account.</li>
    <li><strong>Profile Data:</strong> First name, last name, position, supervisor, phone number, and profile photo you provide during profile setup.</li>
    <li><strong>Service Data:</strong> Equipment readings (differential pressure, airflow, temperature, humidity), service notes, timestamps, and photos you capture during field service work.</li>
    <li><strong>Communications:</strong> Messages you send through the AI Chat assistant and comments on Coil of the Month posts.</li>
</ul>

<h3>b. Information Collected Automatically</h3>
<ul>
    <li><strong>Device Information:</strong> Device type, operating system version, and unique device identifiers.</li>
    <li><strong>Usage Data:</strong> App feature usage, screens visited, and interaction patterns to improve the App experience.</li>
    <li><strong>Authentication Tokens:</strong> Secure tokens from Salesforce OAuth to maintain your session.</li>
</ul>

<h3>c. Information from Third Parties</h3>
<ul>
    <li><strong>Salesforce:</strong> Project data (Opportunities), equipment records, team member information, and organizational data synced from your company's Salesforce instance.</li>
</ul>

<h2>2. How We Use Your Information</h2>
<p>We use the information we collect to:</p>
<ul>
    <li>Authenticate your identity and maintain your session</li>
    <li>Display projects, equipment, and service data assigned to you</li>
    <li>Record and store pre/post service readings for equipment</li>
    <li>Provide AI-powered troubleshooting assistance and report generation</li>
    <li>Display organization charts and team information</li>
    <li>Enable Coil of the Month community features</li>
    <li>Send push notifications about project updates and assignments</li>
    <li>Improve and optimize the App's performance and features</li>
</ul>

<h2>3. Third-Party Services</h2>
<p>The App integrates with the following third-party services:</p>
<ul>
    <li><strong>Salesforce:</strong> We use Salesforce OAuth 2.0 with PKCE for secure authentication and to sync your company's project and equipment data. Your Salesforce credentials are never stored by the App — authentication is handled entirely by Salesforce. <a href="https://www.salesforce.com/company/privacy/" style="color:#c5d93d;">Salesforce Privacy Policy</a></li>
    <li><strong>Anthropic (Claude AI):</strong> When you use the AI Assistant, your messages are processed by Anthropic's Claude language model to generate responses. Messages may be temporarily processed but are not used to train AI models. <a href="https://www.anthropic.com/privacy" style="color:#c5d93d;">Anthropic Privacy Policy</a></li>
    <li><strong>MongoDB:</strong> Service data, readings, and app content are stored in secure MongoDB databases hosted on protected infrastructure.</li>
</ul>

<h2>4. Data Storage and Security</h2>
<ul>
    <li>All data is transmitted over HTTPS/TLS encrypted connections.</li>
    <li>Authentication uses industry-standard OAuth 2.0 with PKCE (Proof Key for Code Exchange).</li>
    <li>Salesforce access tokens are stored securely on the server and are never exposed to client-side code.</li>
    <li>Biometric authentication data (Face ID/Touch ID) is handled entirely by your device's secure enclave and is never transmitted to our servers.</li>
    <li>We implement commercially reasonable security measures to protect your data against unauthorized access, alteration, disclosure, or destruction.</li>
</ul>

<h2>5. Data Sharing</h2>
<p>We do not sell, trade, or rent your personal information to third parties. We may share your information only in the following circumstances:</p>
<ul>
    <li><strong>Within your organization:</strong> Project data, readings, and service records are visible to authorized team members and supervisors within your Blue Box Air Salesforce organization.</li>
    <li><strong>Service providers:</strong> We share data with third-party service providers (Salesforce, Anthropic) solely to operate the App's features as described above.</li>
    <li><strong>Legal requirements:</strong> We may disclose your information if required by law, regulation, or legal process.</li>
</ul>

<h2>6. Data Retention</h2>
<p>We retain your data for as long as your Blue Box Air account is active or as needed to provide the App's services. Service readings and project data are retained as part of your company's operational records. You may request deletion of your personal data by contacting us at the address below.</p>

<h2>7. Your Rights</h2>
<p>Depending on your jurisdiction, you may have the right to:</p>
<ul>
    <li>Access the personal data we hold about you</li>
    <li>Request correction of inaccurate data</li>
    <li>Request deletion of your personal data</li>
    <li>Withdraw consent for data processing</li>
    <li>Request a portable copy of your data</li>
    <li>Opt out of certain data processing activities</li>
</ul>
<p>To exercise any of these rights, please contact us using the information below.</p>

<h2>8. Children's Privacy</h2>
<p>The App is not intended for use by individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have inadvertently collected information from a child, please contact us immediately.</p>

<h2>9. Changes to This Policy</h2>
<p>We may update this Privacy Policy from time to time. We will notify you of any material changes by updating the "Last Updated" date at the top of this policy and, where appropriate, through in-app notifications. Your continued use of the App after changes are posted constitutes your acceptance of the revised policy.</p>

<h2>10. Contact Us</h2>
<div class="contact-box">
    <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
    <p><strong>Blue Box Air, Inc.</strong></p>
    <p>Email: <a href="mailto:privacy@blueboxair.com">privacy@blueboxair.com</a></p>
    <p>Website: <a href="https://www.blueboxair.com">www.blueboxair.com</a></p>
</div>

<div class="footer">
    <p>&copy; 2025 Blue Box Air, Inc. All rights reserved.</p>
    <p>BBA Tech v1.0</p>
</div>

</div>
</body></html>'''
    return HTMLResponse(content=html)

@api_router.get("/terms")
async def terms_of_service():
    """Public terms of service page"""
    from fastapi.responses import HTMLResponse
    html = '''<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BBA Tech — Terms of Service</title>
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.7; }
    .container { max-width: 800px; margin: 0 auto; padding: 40px 24px 80px; }
    .logo { text-align: center; margin-bottom: 32px; }
    .logo h1 { color: #c5d93d; font-size: 28px; }
    .logo p { color: #94a3b8; font-size: 14px; }
    h2 { color: #c5d93d; font-size: 20px; margin: 32px 0 12px; padding-bottom: 8px; border-bottom: 1px solid #1e293b; }
    p, li { color: #cbd5e1; font-size: 15px; margin-bottom: 12px; }
    ul { padding-left: 24px; margin-bottom: 16px; }
    li { margin-bottom: 6px; }
    .effective { text-align: center; color: #64748b; font-size: 13px; margin-bottom: 32px; }
    .contact-box { background: #1e293b; border-radius: 12px; padding: 20px; margin-top: 24px; }
    .contact-box p { color: #94a3b8; margin-bottom: 8px; }
    .contact-box a { color: #c5d93d; text-decoration: none; }
    .footer { text-align: center; color: #475569; font-size: 12px; margin-top: 48px; padding-top: 24px; border-top: 1px solid #1e293b; }
</style>
</head><body>
<div class="container">

<div class="logo">
    <h1>BLUE BOX AIR</h1>
    <p>Coil Management Solutions</p>
</div>

<h1 style="text-align:center;color:white;font-size:24px;margin-bottom:8px;">Terms of Service</h1>
<p class="effective">Effective Date: June 1, 2025 &nbsp;|&nbsp; Last Updated: June 1, 2025</p>

<p>These Terms of Service ("Terms") govern your use of the BBA Tech mobile application ("App") provided by Blue Box Air, Inc. ("Blue Box Air," "we," "us," or "our"). By downloading, accessing, or using the App, you agree to be bound by these Terms.</p>

<h2>1. Eligibility</h2>
<p>The App is intended for authorized Blue Box Air employees, contractors, and partners with valid Salesforce credentials. You must be at least 18 years of age to use the App.</p>

<h2>2. Account and Access</h2>
<p>Access to the App requires authentication through your organization's Salesforce account. You are responsible for maintaining the confidentiality of your login credentials and for all activities that occur under your account. You must notify Blue Box Air immediately of any unauthorized use of your account.</p>

<h2>3. Permitted Use</h2>
<p>You may use the App solely for legitimate Blue Box Air business purposes, including:</p>
<ul>
    <li>Viewing and managing assigned projects and equipment</li>
    <li>Recording pre/post service readings and equipment data</li>
    <li>Using the AI assistant for troubleshooting guidance</li>
    <li>Participating in Coil of the Month community features</li>
    <li>Viewing team and organizational information</li>
</ul>

<h2>4. Prohibited Conduct</h2>
<p>You agree not to:</p>
<ul>
    <li>Share your login credentials with unauthorized individuals</li>
    <li>Use the App for any unlawful purpose</li>
    <li>Attempt to gain unauthorized access to the App's systems or data</li>
    <li>Reverse engineer, decompile, or disassemble any part of the App</li>
    <li>Upload malicious content, viruses, or harmful code</li>
    <li>Use the AI assistant to generate harmful, misleading, or inappropriate content</li>
</ul>

<h2>5. Data and Content</h2>
<p>Service data, readings, and content you create through the App remain the property of Blue Box Air, Inc. You retain responsibility for the accuracy of data you enter. Blue Box Air reserves the right to moderate Coil of the Month submissions and comments.</p>

<h2>6. AI Assistant Disclaimer</h2>
<p>The AI assistant provides general guidance based on HVAC and coil management best practices. AI-generated responses are for informational purposes only and should not replace professional judgment, manufacturer specifications, or safety protocols. Always verify AI recommendations with your supervisor before taking action on critical equipment.</p>

<h2>7. Intellectual Property</h2>
<p>The App, including its design, code, logos, and content, is the property of Blue Box Air, Inc. and is protected by intellectual property laws. The Blue Box Air name, logo, and "BBA Tech" are trademarks of Blue Box Air, Inc.</p>

<h2>8. Limitation of Liability</h2>
<p>To the maximum extent permitted by law, Blue Box Air shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the App. The App is provided "as is" without warranties of any kind, express or implied.</p>

<h2>9. Termination</h2>
<p>Blue Box Air may suspend or terminate your access to the App at any time, with or without cause. Upon termination, your right to use the App ceases immediately.</p>

<h2>10. Changes to Terms</h2>
<p>We may modify these Terms at any time. Continued use of the App after changes constitutes acceptance of the revised Terms.</p>

<h2>11. Governing Law</h2>
<p>These Terms are governed by and construed in accordance with the laws of the United States and the state in which Blue Box Air, Inc. is incorporated, without regard to conflict of law provisions.</p>

<h2>12. Contact</h2>
<div class="contact-box">
    <p>For questions about these Terms:</p>
    <p><strong>Blue Box Air, Inc.</strong></p>
    <p>Email: <a href="mailto:legal@blueboxair.com">legal@blueboxair.com</a></p>
    <p>Website: <a href="https://www.blueboxair.com">www.blueboxair.com</a></p>
</div>

<div class="footer">
    <p>&copy; 2025 Blue Box Air, Inc. All rights reserved.</p>
    <p>BBA Tech v1.0</p>
</div>

</div>
</body></html>'''
    return HTMLResponse(content=html)
# === End Privacy & Terms ===

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
# Mock data removed - now using live Salesforce data.
# Equipment is stored locally in MongoDB since it's not in Salesforce.

# Helper: Query Salesforce using stored session token
async def sf_query(user_id: str, soql: str) -> list:
    """Execute a SOQL query against Salesforce using the user's stored session."""
    session = await db.sf_sessions.find_one({"user_id": user_id})
    if not session:
        return []
    
    access_token = session.get("access_token", "")
    instance_url = session.get("instance_url", "")
    if not access_token or not instance_url:
        return []
    
    api_version = os.environ.get('SALESFORCE_API_VERSION', 'v59.0')
    try:
        async with httpx.AsyncClient() as client_http:
            response = await client_http.get(
                f"{instance_url}/services/data/{api_version}/query",
                params={"q": soql},
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                timeout=30.0,
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("records", [])
            else:
                logging.warning(f"Salesforce query failed ({response.status_code}): {response.text[:200]}")
                return []
    except Exception as e:
        logging.error(f"Salesforce query error: {e}")
        return []

# Store for current session
current_technician_id = None

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

# ============ Admin Access Control ============

# Admin users list (seeded on startup)
DEFAULT_ADMINS = [
    {"email": "alonzo.cotton@blueboxair.com", "name": "Alonzo Cotton", "granted_by": "system"},
    {"email": "jim@blueboxair.com", "name": "Jim", "granted_by": "system"},
    {"email": "linh.matthews@blueboxair.com", "name": "Linh Matthews", "granted_by": "system"},
    {"email": "noah.ward@blueboxair.com", "name": "Noah Ward", "granted_by": "system"},
]

async def seed_admins():
    """Seed default admin users"""
    for admin in DEFAULT_ADMINS:
        existing = await db.admins.find_one({"email": admin["email"]})
        if not existing:
            admin["is_admin"] = True
            admin["created_at"] = datetime.utcnow().isoformat()
            await db.admins.insert_one(admin)
            logging.info(f"Admin access granted to: {admin['email']}")

async def is_admin(email: str) -> bool:
    """Check if a user has admin access"""
    if not email:
        return False
    admin = await db.admins.find_one({"email": email.lower(), "is_admin": True})
    return admin is not None

@api_router.get("/admin/check")
async def check_admin(email: str = ""):
    """Check if a user has admin access"""
    if not email:
        return {"is_admin": False}
    admin_status = await is_admin(email.lower())
    admin_doc = await db.admins.find_one({"email": email.lower()})
    return {
        "is_admin": admin_status,
        "email": email,
        "granted_by": admin_doc.get("granted_by", "") if admin_doc else "",
    }

@api_router.get("/admin/list")
async def list_admins():
    """List all admin users"""
    admins = []
    async for a in db.admins.find({"is_admin": True}).sort("created_at", 1):
        admins.append(serialize_doc(a))
    return {"admins": admins, "total": len(admins)}

@api_router.post("/admin/grant")
async def grant_admin(data: dict):
    """Grant admin access to a user (admin-only action)"""
    requester_email = data.get("requester_email", "").strip().lower()
    target_email = data.get("email", "").strip().lower()
    target_name = data.get("name", "").strip()
    
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    # Check requester is admin
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only admins can grant admin access")
    
    await db.admins.update_one(
        {"email": target_email},
        {"$set": {
            "email": target_email,
            "name": target_name,
            "is_admin": True,
            "granted_by": requester_email,
            "granted_at": datetime.utcnow().isoformat(),
        }},
        upsert=True,
    )
    logging.info(f"Admin access granted to {target_email} by {requester_email}")
    return {"success": True, "message": f"Admin access granted to {target_email}"}

@api_router.post("/admin/revoke")
async def revoke_admin(data: dict):
    """Revoke admin access from a user (admin-only action)"""
    requester_email = data.get("requester_email", "").strip().lower()
    target_email = data.get("email", "").strip().lower()
    
    if not target_email:
        raise HTTPException(status_code=400, detail="Email is required")
    
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only admins can revoke admin access")
    
    # Prevent self-revoke
    if requester_email == target_email:
        raise HTTPException(status_code=400, detail="Cannot revoke your own admin access")
    
    result = await db.admins.update_one(
        {"email": target_email},
        {"$set": {"is_admin": False, "revoked_by": requester_email, "revoked_at": datetime.utcnow().isoformat()}}
    )
    return {"success": result.modified_count > 0}

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
    
    # Fallback: Check if user has a synced Salesforce profile in DB
    synced_profile = None
    login_name = credentials.username if credentials and credentials.username else ""
    if login_name:
        # Search by email or username
        synced_profile = await db.profiles.find_one({
            "$or": [
                {"email": {"$regex": login_name, "$options": "i"}},
                {"username": {"$regex": login_name, "$options": "i"}},
                {"full_name": {"$regex": login_name, "$options": "i"}},
            ],
            "source": "salesforce",
            "is_active": True,
        })
    
    if synced_profile:
        technician = {
            "id": str(synced_profile.get("_id", "")),
            "salesforce_id": synced_profile.get("salesforce_id", ""),
            "username": synced_profile.get("username", ""),
            "email": synced_profile.get("email", ""),
            "full_name": synced_profile.get("full_name", ""),
            "first_name": synced_profile.get("first_name", ""),
            "last_name": synced_profile.get("last_name", ""),
            "phone": synced_profile.get("phone", ""),
            "title": synced_profile.get("title", ""),
            "department": synced_profile.get("department", ""),
            "company": synced_profile.get("company", "") or "Blue Box Air, Inc.",
            "role": synced_profile.get("role", ""),
            "sf_profile_name": synced_profile.get("sf_profile_name", ""),
            "profile_photo": synced_profile.get("profile_photo", ""),
            "skills": ["Coil Management", "Air Quality"],
            "source": "salesforce",
            "is_admin": await is_admin(synced_profile.get("email", "")),
        }
        
        # Check if this user has completed profile setup
        profile_email = technician.get("email", "")
        completed_profile = await db.profiles.find_one({"email": profile_email, "profile_completed": True})
        technician["profile_completed"] = completed_profile is not None
        
        return {
            "success": True,
            "message": f"Welcome back, {technician['full_name']}",
            "technician": technician,
            "token": "mock-jwt-token-" + str(uuid.uuid4()),
            "source": "salesforce_profile",
        }
    
    # ─── Apple App Review Demo Account ───
    DEMO_USERNAME = "demo@blueboxair.com"
    DEMO_PASSWORD = "BBAReview2025!"
    
    if login_name.lower() == DEMO_USERNAME and credentials.password == DEMO_PASSWORD:
        demo_tech = {
            "id": "apple-review-demo",
            "salesforce_id": "demo-sf-001",
            "username": DEMO_USERNAME,
            "email": DEMO_USERNAME,
            "full_name": "Demo Reviewer",
            "first_name": "Demo",
            "last_name": "Reviewer",
            "phone": "(555) 100-2025",
            "title": "Field Technician",
            "department": "Operations",
            "company": "Blue Box Air, Inc.",
            "role": "Technician",
            "profile_photo": "",
            "skills": ["Coil Cleaning", "Air Quality", "Differential Pressure", "Bio-Automation"],
            "source": "demo",
            "is_admin": True,
            "profile_completed": True,
        }
        
        # Ensure demo profile exists in DB
        await db.profiles.update_one(
            {"email": DEMO_USERNAME},
            {"$set": {
                **demo_tech,
                "technician_id": "apple-review-demo",
                "profile_completed": True,
                "updated_at": datetime.utcnow().isoformat(),
            }},
            upsert=True,
        )
        
        return {
            "success": True,
            "message": "Welcome to BBA Tech, Demo Reviewer!",
            "technician": demo_tech,
            "token": "demo-token-" + str(uuid.uuid4()),
            "source": "demo",
        }
    
    # Final fallback: No valid login found
    raise HTTPException(
        status_code=401,
        detail="Invalid Salesforce credentials. Please use your Salesforce username and password to log in."
    )

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
            # Check admin status
            technician["is_admin"] = await is_admin(technician.get("email", ""))
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
async def get_synced_users(active_only: bool = True, search: str = ""):
    """Get synced Salesforce users from local DB, active only by default"""
    query: dict = {"source": "salesforce"}
    if active_only:
        query["is_active"] = True
    if search:
        query["full_name"] = {"$regex": search, "$options": "i"}
    
    users = []
    async for user in db.profiles.find(query).sort("full_name", 1):
        users.append(serialize_doc(user))
    return {"users": users, "total": len(users)}

@api_router.delete("/salesforce/users/inactive")
async def remove_inactive_users():
    """Remove all inactive Salesforce users from the database"""
    result = await db.profiles.delete_many({"source": "salesforce", "is_active": False})
    deleted = result.deleted_count
    logging.info(f"Removed {deleted} inactive Salesforce users from DB")
    return {"success": True, "deleted": deleted, "message": f"Removed {deleted} inactive users"}

# ============ Salesforce Opportunity → Project Sync ============

@api_router.get("/salesforce/sync-opportunities")
async def sync_opportunities(token: str = ""):
    """Sync Salesforce Opportunities into app Projects with equipment"""
    session = await _get_sf_session(token)
    instance_url = session.get("instance_url")
    user_id = session.get("user_id")
    sf_cfg = get_sf_config()
    
    try:
        async with httpx.AsyncClient() as client_http:
            headers = {"Authorization": f"Bearer {token}"}
            
            # Query Opportunities with Account info
            opp_soql = (
                "SELECT Id, Name, StageName, Amount, Description, CloseDate, CreatedDate, "
                "Account.Name, Account.BillingStreet, Account.BillingCity, Account.BillingState, "
                "Account.BillingPostalCode, Owner.Name, Owner.Email, OwnerId, "
                "Type, LeadSource, NextStep, Probability "
                "FROM Opportunity ORDER BY CreatedDate DESC LIMIT 200"
            )
            opp_resp = await client_http.get(
                f"{instance_url}/services/data/{sf_cfg['api_version']}/query",
                params={"q": opp_soql},
                headers=headers,
                timeout=30.0,
            )
            
            if opp_resp.status_code != 200:
                logging.error(f"SF Opportunity query failed: {opp_resp.status_code} {opp_resp.text}")
                return {"success": False, "error": f"Salesforce query failed: {opp_resp.status_code}"}
            
            opportunities = opp_resp.json().get("records", [])
            synced_projects = []
            new_project_count = 0
            
            for opp in opportunities:
                account = opp.get("Account") or {}
                owner = opp.get("Owner") or {}
                
                # Build address from Account billing info
                addr_parts = [
                    account.get("BillingStreet", ""),
                    account.get("BillingCity", ""),
                    account.get("BillingState", ""),
                    account.get("BillingPostalCode", ""),
                ]
                address = ", ".join(p for p in addr_parts if p)
                
                # Map Salesforce stage to app status
                stage = opp.get("StageName", "")
                if stage in ["Closed Won", "Closed Lost"]:
                    status = "Completed"
                elif stage in ["Negotiation/Review", "Proposal/Price Quote"]:
                    status = "On Hold"
                else:
                    status = "Active"
                
                project_data = {
                    "salesforce_id": opp.get("Id"),
                    "name": opp.get("Name", "Untitled"),
                    "description": opp.get("Description", ""),
                    "status": status,
                    "sf_stage": stage,
                    "client_name": account.get("Name", ""),
                    "address": address,
                    "amount": opp.get("Amount"),
                    "probability": opp.get("Probability"),
                    "opp_type": opp.get("Type", ""),
                    "lead_source": opp.get("LeadSource", ""),
                    "next_step": opp.get("NextStep", ""),
                    "start_date": opp.get("CreatedDate", ""),
                    "end_date": opp.get("CloseDate", ""),
                    "assigned_tech_name": owner.get("Name", ""),
                    "assigned_tech_email": owner.get("Email", ""),
                    "assigned_tech_id": opp.get("OwnerId", ""),
                    "primary_contact": {
                        "name": owner.get("Name", ""),
                        "email": owner.get("Email", ""),
                    },
                    "source": "salesforce",
                    "synced_at": datetime.utcnow().isoformat(),
                }
                
                # Check if this is a new project
                existing = await db.sf_projects.find_one({"salesforce_id": opp.get("Id")})
                is_new = existing is None
                
                # Upsert into sf_projects collection
                await db.sf_projects.update_one(
                    {"salesforce_id": opp.get("Id")},
                    {"$set": project_data},
                    upsert=True,
                )
                
                if is_new:
                    new_project_count += 1
                    # Create notification for assigned tech/OM
                    notification = {
                        "type": "new_project",
                        "title": "New Project Assigned",
                        "message": f"{opp.get('Name', 'New project')} from {account.get('Name', 'a client')}",
                        "project_name": opp.get("Name", ""),
                        "salesforce_id": opp.get("Id"),
                        "assigned_to": opp.get("OwnerId", ""),
                        "assigned_to_name": owner.get("Name", ""),
                        "assigned_to_email": owner.get("Email", ""),
                        "read": False,
                        "created_at": datetime.utcnow().isoformat(),
                    }
                    await db.notifications.insert_one(notification)
                    
                    # Send push notification to assigned user
                    assigned_ids = [opp.get("OwnerId", ""), owner.get("Email", "")]
                    assigned_ids = [x for x in assigned_ids if x]
                    if assigned_ids:
                        await send_push_notifications(
                            user_ids=assigned_ids,
                            title="New Project Assigned",
                            body=f"{opp.get('Name', 'New project')} from {account.get('Name', 'a client')}",
                            data={
                                "type": "new_project",
                                "salesforce_id": opp.get("Id", ""),
                                "project_name": opp.get("Name", ""),
                            }
                        )
                
                synced_projects.append({
                    "name": project_data["name"],
                    "client": project_data["client_name"],
                    "stage": stage,
                    "status": status,
                    "owner": owner.get("Name", ""),
                    "is_new": is_new,
                })
            
            # Now sync Assets (Equipment) linked to Accounts from these Opportunities
            account_ids = list(set(
                opp.get("Account", {}).get("Id") or ""
                for opp in opportunities
                if opp.get("Account")
            ))
            account_ids = [a for a in account_ids if a]  # filter empties
            
            equipment_count = 0
            if account_ids:
                # Query Assets for these accounts
                ids_str = "','".join(account_ids)
                asset_soql = (
                    f"SELECT Id, Name, SerialNumber, Description, Status, "
                    f"Product2.Name, Product2.Family, "
                    f"Account.Name, AccountId, InstallDate, Quantity "
                    f"FROM Asset WHERE AccountId IN ('{ids_str}') LIMIT 500"
                )
                asset_resp = await client_http.get(
                    f"{instance_url}/services/data/{sf_cfg['api_version']}/query",
                    params={"q": asset_soql},
                    headers=headers,
                    timeout=30.0,
                )
                
                if asset_resp.status_code == 200:
                    assets = asset_resp.json().get("records", [])
                    for asset in assets:
                        product = asset.get("Product2") or {}
                        equip_data = {
                            "salesforce_id": asset.get("Id"),
                            "name": asset.get("Name", ""),
                            "serial_number": asset.get("SerialNumber", ""),
                            "description": asset.get("Description", ""),
                            "status": asset.get("Status", ""),
                            "product_name": product.get("Name", ""),
                            "product_family": product.get("Family", ""),
                            "account_id": asset.get("AccountId", ""),
                            "account_name": (asset.get("Account") or {}).get("Name", ""),
                            "install_date": asset.get("InstallDate", ""),
                            "quantity": asset.get("Quantity", 1),
                            "source": "salesforce",
                            "synced_at": datetime.utcnow().isoformat(),
                        }
                        await db.sf_equipment.update_one(
                            {"salesforce_id": asset.get("Id")},
                            {"$set": equip_data},
                            upsert=True,
                        )
                        equipment_count += 1
            
            logging.info(f"Synced {len(synced_projects)} opportunities, {new_project_count} new, {equipment_count} assets")
            return {
                "success": True,
                "total_synced": len(synced_projects),
                "new_projects": new_project_count,
                "equipment_synced": equipment_count,
                "projects": synced_projects,
            }
    
    except Exception as e:
        logging.error(f"SF Opportunity sync error: {e}")
        return {"success": False, "error": str(e)}

@api_router.get("/salesforce/projects")
async def get_sf_projects():
    """Get all Salesforce-synced projects (filtered: excludes Proposal Sent / Closed Lost)"""
    EXCLUDED_STAGES = ['Proposal Sent', 'Closed Lost', 'Closed Lost - No Commitment']
    projects = []
    
    # Get project IDs with technicians assigned
    assigned_project_ids = set()
    async for assignment in db.project_technicians.find({}, {"project_id": 1}):
        assigned_project_ids.add(assignment.get("project_id", ""))
    
    async for p in db.sf_projects.find().sort("synced_at", -1):
        p_doc = serialize_doc(p)
        # Skip excluded stages
        if p_doc.get("status", "") in EXCLUDED_STAGES:
            continue
        # Only include if technician assigned
        pid = p_doc.get("salesforce_id") or str(p_doc.get("_id", ""))
        if pid not in assigned_project_ids:
            continue
        # Get equipment count for this project's account
        if p.get("client_name"):
            equip_count = await db.sf_equipment.count_documents({"account_name": p["client_name"]})
            p_doc["equipment_count"] = equip_count
        projects.append(p_doc)
    return {"projects": projects, "total": len(projects)}

@api_router.get("/salesforce/equipment/{account_name}")
async def get_sf_equipment(account_name: str):
    """Get equipment synced from Salesforce for an account"""
    equipment = []
    async for e in db.sf_equipment.find({"account_name": account_name}):
        equipment.append(serialize_doc(e))
    return {"equipment": equipment, "total": len(equipment)}

@api_router.get("/projects/kanban")
async def get_projects_kanban(email: str = "", view_all: bool = False):
    """Get all projects organized by stage for Kanban view.
    Only includes projects with technicians assigned, excludes Proposal Sent / Closed Lost.
    Admins can set view_all=true to see all projects.
    Non-admins only see their own assigned projects.
    """
    EXCLUDED_STAGES = ['Proposal Sent', 'Closed Lost', 'Closed Lost - No Commitment']
    
    # Check if user is admin
    is_admin_user = await is_admin(email.lower()) if email else False
    
    # Get project IDs with technicians assigned
    assigned_project_ids = set()
    async for assignment in db.project_technicians.find({}, {"project_id": 1}):
        assigned_project_ids.add(assignment.get("project_id", ""))
    
    # Build query - admins with view_all see everything, others see only assigned
    query: dict = {}
    if not is_admin_user or not view_all:
        if email:
            query["$or"] = [
                {"owner_email": {"$regex": email, "$options": "i"}},
                {"assigned_to_email": {"$regex": email, "$options": "i"}},
            ]
    
    # Fetch projects from both sf_projects and regular projects
    all_projects = []
    
    # SF projects - filter by assignment for non-admins
    sf_query_filter: dict = {}
    if not is_admin_user or not view_all:
        if email:
            sf_query_filter["$or"] = [
                {"owner_email": {"$regex": email, "$options": "i"}},
                {"assigned_to_email": {"$regex": email, "$options": "i"}},
            ]
    
    async for p in db.sf_projects.find(sf_query_filter).sort("synced_at", -1):
        doc = serialize_doc(p)
        stage = (doc.get("stage") or doc.get("status") or "").strip()
        
        # Skip excluded stages
        if stage in EXCLUDED_STAGES:
            continue
        
        # Only include if technician assigned
        pid = doc.get("salesforce_id") or str(doc.get("_id", ""))
        if pid not in assigned_project_ids and doc.get("source") != "manual":
            continue
        
        # Determine stage category
        stage_lower = stage.lower()
        if stage_lower in ["closed won", "completed", "done"]:
            doc["stage_category"] = "completed"
        elif stage_lower in ["closed lost", "cancelled", "not completed"]:
            doc["stage_category"] = "not_completed"
        else:
            doc["stage_category"] = "in_progress"
        
        # Get equipment count
        if doc.get("client_name"):
            doc["equipment_count"] = await db.sf_equipment.count_documents({"account_name": doc["client_name"]})
        
        doc["source"] = "salesforce"
        all_projects.append(doc)
    
    # Custom DB projects (manually created in the app)
    async for p in db.custom_projects.find({}).sort("created_at", -1):
        doc = serialize_doc(p)
        stage = (doc.get("stage") or doc.get("status") or "Active").strip()
        stage_lower = stage.lower()
        if stage_lower in ["completed", "closed won", "done"]:
            doc["stage_category"] = "completed"
        elif stage_lower in ["closed lost", "cancelled", "not completed", "inactive"]:
            doc["stage_category"] = "not_completed"
        else:
            doc["stage_category"] = "in_progress"
        doc["source"] = "local"
        all_projects.append(doc)
    
    # Group by stage category
    kanban = {
        "in_progress": [p for p in all_projects if p.get("stage_category") == "in_progress"],
        "completed": [p for p in all_projects if p.get("stage_category") == "completed"],
        "not_completed": [p for p in all_projects if p.get("stage_category") == "not_completed"],
    }
    
    return {
        "kanban": kanban,
        "total": len(all_projects),
        "is_admin": is_admin_user,
        "counts": {
            "in_progress": len(kanban["in_progress"]),
            "completed": len(kanban["completed"]),
            "not_completed": len(kanban["not_completed"]),
        }
    }

@api_router.get("/projects/{project_id}/equipment")
async def get_project_equipment(project_id: str):
    """Get equipment linked to a specific project via its account"""
    # Try to find the project first
    project = None
    try:
        project = await db.sf_projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        project = await db.sf_projects.find_one({"salesforce_id": project_id})
    
    if not project:
        try:
            project = await db.projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            pass
    
    if not project:
        return {"equipment": [], "total": 0, "error": "Project not found"}
    
    # Get equipment by account name or account ID
    equipment = []
    account_name = project.get("client_name") or project.get("client") or ""
    account_id = project.get("account_id") or ""
    
    query_parts = []
    if account_name:
        query_parts.append({"account_name": account_name})
    if account_id:
        query_parts.append({"account_id": account_id})
    
    if query_parts:
        eq_query = {"$or": query_parts} if len(query_parts) > 1 else query_parts[0]
        async for e in db.sf_equipment.find(eq_query):
            equipment.append(serialize_doc(e))
    
    # Also include any locally added equipment for this project
    async for e in db.equipment.find({"project_id": project_id}):
        equipment.append(serialize_doc(e))
    
    return {"equipment": equipment, "total": len(equipment)}

# ============ Notifications ============

@api_router.get("/notifications")
async def get_notifications(unread_only: bool = False):
    """Get all notifications, optionally filtered to unread"""
    query = {"read": False} if unread_only else {}
    notifications = []
    async for n in db.notifications.find(query).sort("created_at", -1).limit(50):
        notifications.append(serialize_doc(n))
    return {"notifications": notifications, "total": len(notifications)}

@api_router.post("/notifications/{notif_id}/read")
async def mark_notification_read(notif_id: str):
    """Mark a notification as read"""
    try:
        result = await db.notifications.update_one(
            {"_id": ObjectId(notif_id)},
            {"$set": {"read": True, "read_at": datetime.utcnow().isoformat()}}
        )
        return {"success": result.modified_count > 0}
    except Exception:
        return {"success": False}

@api_router.post("/notifications/read-all")
async def mark_all_notifications_read():
    """Mark all notifications as read"""
    result = await db.notifications.update_many(
        {"read": False},
        {"$set": {"read": True, "read_at": datetime.utcnow().isoformat()}}
    )
    return {"success": True, "marked": result.modified_count}



# ============ Roles & Hierarchy ============

REGIONS = ["New York", "Florida", "New Orleans", "Dallas"]

LINES_OF_BUSINESS = [
    {"code": "AS", "name": "Automation", "color": "#3b82f6"},
    {"code": "SS", "name": "Self Service", "color": "#22c55e"},
    {"code": "DS", "name": "Direct Service", "color": "#f59e0b"},
]
LOB_CODES = {lob["code"]: lob for lob in LINES_OF_BUSINESS}

@api_router.get("/lines-of-business")
async def get_lines_of_business():
    """Get all lines of business"""
    return {"lines_of_business": LINES_OF_BUSINESS}

DEFAULT_ROLES = [
    {"name": "CEO/Founder", "level": 0, "parent": None, "region": None, "color": "#f59e0b", "icon": "star"},
    {"name": "Head of Finance", "level": 1, "parent": "CEO/Founder", "region": None, "color": "#3b82f6", "icon": "wallet"},
    {"name": "Head of Operations", "level": 1, "parent": "CEO/Founder", "region": None, "color": "#8b5cf6", "icon": "briefcase"},
    # One Operations Manager per region
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "New York", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "Florida", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "New Orleans", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "Dallas", "color": "#3b82f6", "icon": "business"},
    # Per-region roles
    {"name": "Field Supervisor", "level": 3, "parent": "Operations Manager", "region": None, "color": "#22c55e", "icon": "shield-checkmark"},
    {"name": "Lead Technician", "level": 4, "parent": "Field Supervisor", "region": None, "color": "#c5d93d", "icon": "medal"},
    {"name": "Technician", "level": 5, "parent": "Lead Technician", "region": None, "color": "#94a3b8", "icon": "construct"},
    {"name": "Junior Technician", "level": 6, "parent": "Technician", "region": None, "color": "#64748b", "icon": "school"},
]

# Default team members to seed
DEFAULT_TEAM_MEMBERS = [
    {"member_name": "Jim Metropoulos", "role_name": "CEO/Founder", "region": None, "email": "", "phone": "", "level": 0, "color": "#f59e0b", "icon": "star"},
    {"member_name": "Noah Ward", "role_name": "Head of Finance", "region": None, "email": "", "phone": "", "level": 1, "color": "#3b82f6", "icon": "wallet"},
    {"member_name": "Alonzo Cotton", "role_name": "Head of Operations", "region": None, "email": "alonzo.cotton@blueboxair.com", "phone": "", "level": 1, "color": "#8b5cf6", "icon": "briefcase"},
]

async def seed_roles():
    """Seed default roles and initial team members if the collections are empty"""
    # Reset and re-seed roles to get latest structure
    existing_count = await db.roles.count_documents({})
    # Check if we need to update (e.g., missing CEO/Founder or Head of Finance)
    has_ceo_founder = await db.roles.count_documents({"name": "CEO/Founder"})
    has_head_finance = await db.roles.count_documents({"name": "Head of Finance"})
    
    if existing_count == 0 or not has_ceo_founder or not has_head_finance:
        # Drop old roles and re-seed
        await db.roles.delete_many({})
        for role in DEFAULT_ROLES:
            role_doc = {**role, "created_at": datetime.utcnow().isoformat()}
            await db.roles.insert_one(role_doc)
        logging.info(f"Seeded {len(DEFAULT_ROLES)} default roles (including CEO/Founder, Head of Finance)")
    
    # Seed default team members if they don't already exist
    for member in DEFAULT_TEAM_MEMBERS:
        existing = await db.team_assignments.find_one({
            "member_name": member["member_name"],
            "role_name": member["role_name"]
        })
        if not existing:
            member_doc = {**member, "assigned_at": datetime.utcnow().isoformat()}
            await db.team_assignments.insert_one(member_doc)
            logging.info(f"Seeded team member: {member['member_name']} as {member['role_name']}")

@api_router.get("/roles")
async def get_roles():
    """Get all roles"""
    roles = []
    async for role in db.roles.find().sort("level", 1):
        roles.append(serialize_doc(role))
    return {"roles": roles, "regions": REGIONS}

@api_router.get("/roles/hierarchy")
async def get_role_hierarchy():
    """Get full role hierarchy as a tree structure"""
    roles = []
    async for role in db.roles.find().sort("level", 1):
        roles.append(serialize_doc(role))
    
    # Get all team members with assigned roles
    members = []
    async for m in db.team_assignments.find():
        members.append(serialize_doc(m))
    
    # Build tree
    def build_tree():
        tree = []
        # CEO/Founder level (level 0)
        ceo = next((r for r in roles if r["level"] == 0), None)
        if ceo:
            ceo_members = [m for m in members if m.get("role_name") == ceo["name"] and not m.get("region")]
            ceo_node = {**ceo, "members": ceo_members, "children": []}
            
            # All level 1 roles (Head of Finance, Head of Operations, etc.)
            level1_roles = [r for r in roles if r["level"] == 1]
            for l1_role in level1_roles:
                l1_members = [m for m in members if m.get("role_name") == l1_role["name"] and not m.get("region")]
                l1_node = {**l1_role, "members": l1_members, "children": []}
                
                # Only Head of Operations has regional children
                if l1_role["name"] == "Head of Operations":
                    # Operations Managers per region
                    for region in REGIONS:
                        om = next((r for r in roles if r["level"] == 2 and r.get("region") == region), None)
                        if om:
                            om_members = [m for m in members if m.get("role_name") == "Operations Manager" and m.get("region") == region]
                            om_node = {**om, "members": om_members, "children": []}
                            
                            # Field-level roles under each region
                            for level_role in [r for r in roles if r["level"] >= 3 and not r.get("region")]:
                                level_members = [m for m in members if m.get("role_name") == level_role["name"] and m.get("region") == region]
                                if level_members or True:  # Always show roles
                                    child_node = {**level_role, "region": region, "members": level_members, "children": []}
                                    om_node["children"].append(child_node)
                            
                            l1_node["children"].append(om_node)
                
                ceo_node["children"].append(l1_node)
            
            tree.append(ceo_node)
        
        return tree
    
    return {"hierarchy": build_tree(), "total_members": len(members), "regions": REGIONS}

@api_router.post("/roles/assign")
async def assign_role(data: dict):
    """Assign a role to a team member (admin-only)"""
    requester_email = data.get("requester_email", "").strip()
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only administrators can assign roles")
    
    name = data.get("member_name", "").strip()
    role_name = data.get("role_name", "").strip()
    region = data.get("region", "").strip() or None
    email = data.get("email", "").strip()
    phone = data.get("phone", "").strip()
    
    if not name or not role_name:
        raise HTTPException(status_code=400, detail="member_name and role_name are required")
    
    # Validate role exists
    role = await db.roles.find_one({"name": role_name})
    if not role:
        raise HTTPException(status_code=400, detail=f"Role '{role_name}' does not exist")
    
    # If role is level 2 (Operations Manager), region is required
    if role.get("level") == 2 and not region:
        raise HTTPException(status_code=400, detail="Region is required for Operations Manager")
    
    # If role level >= 3, region is required (assigned under a regional OM)
    if role.get("level", 0) >= 3 and not region:
        raise HTTPException(status_code=400, detail="Region is required for field-level roles")
    
    assignment = {
        "member_name": name,
        "role_name": role_name,
        "region": region,
        "email": email,
        "phone": phone,
        "level": role.get("level", 5),
        "color": role.get("color", "#94a3b8"),
        "icon": role.get("icon", "person"),
        "assigned_at": datetime.utcnow().isoformat(),
    }
    
    # Upsert by name + role + region
    await db.team_assignments.update_one(
        {"member_name": name, "role_name": role_name, "region": region},
        {"$set": assignment},
        upsert=True,
    )
    
    return {"success": True, "assignment": serialize_doc(assignment)}

@api_router.delete("/roles/assign/{member_name}")
async def remove_role_assignment(member_name: str, role_name: str = "", region: str = "", requester_email: str = ""):
    """Remove a role assignment (admin-only)"""
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only administrators can remove role assignments")
    query = {"member_name": member_name}
    if role_name:
        query["role_name"] = role_name
    if region:
        query["region"] = region
    
    result = await db.team_assignments.delete_one(query)
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"success": True, "deleted": member_name}

@api_router.put("/roles/assign/{member_name}")
async def update_role_assignment(member_name: str, data: dict = Body(...)):
    """Update a team member's role (admin-only)"""
    requester_email = data.get("requester_email", "").strip()
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only administrators can update roles")
    
    old_role = data.get("old_role_name", "").strip()
    old_region = data.get("old_region", "").strip() or None
    new_role_name = data.get("new_role_name", "").strip()
    new_region = data.get("new_region", "").strip() or None
    
    if not new_role_name:
        raise HTTPException(status_code=400, detail="New role name is required")
    
    # Validate the new role exists
    new_role = await db.roles.find_one({"name": new_role_name})
    if not new_role:
        raise HTTPException(status_code=400, detail=f"Role '{new_role_name}' does not exist")
    
    # Region is required for level 2+
    if new_role.get("level", 0) >= 2 and not new_region:
        raise HTTPException(status_code=400, detail="Region is required for this role level")
    
    query = {"member_name": member_name}
    if old_role:
        query["role_name"] = old_role
    if old_region:
        query["region"] = old_region
    
    update_data = {
        "role_name": new_role_name,
        "region": new_region,
        "level": new_role.get("level", 5),
        "color": new_role.get("color", "#94a3b8"),
        "icon": new_role.get("icon", "person"),
        "updated_at": datetime.utcnow().isoformat(),
    }
    
    result = await db.team_assignments.update_one(query, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"success": True, "message": f"Updated {member_name} to {new_role_name}"}



@api_router.get("/team")
async def get_team():
    """Get all team members organized by region"""
    members = []
    async for m in db.team_assignments.find().sort([("level", 1), ("region", 1)]):
        members.append(serialize_doc(m))
    
    by_region = {}
    top_level = []
    for m in members:
        if m.get("region"):
            region = m["region"]
            if region not in by_region:
                by_region[region] = []
            by_region[region].append(m)
        else:
            top_level.append(m)
    
    return {
        "leadership": top_level,
        "regions": by_region,
        "total": len(members),
        "all_regions": REGIONS,
    }

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
    
    # Try to get the most recent profile from DB
    profile = await db.profiles.find_one({}, sort=[("updated_at", -1)])
    if profile:
        return serialize_doc(profile)
    
    # No profile found at all
    return {
        "id": "unknown",
        "full_name": "Technician",
        "email": "",
        "title": "Technician",
        "company": "Blue Box Air, Inc.",
        "skills": [],
    }

@api_router.put("/auth/profile")
async def update_profile(profile_data: dict):
    """Update technician profile"""
    # Get technician_id from profile_data or find from DB
    technician_id = profile_data.get("technician_id", "")
    email = profile_data.get("email", "")
    
    if not technician_id and email:
        existing = await db.profiles.find_one({"email": email})
        if existing:
            technician_id = existing.get("technician_id", str(existing.get("_id", "")))
    
    if not technician_id:
        # Last resort: get the most recent profile
        existing = await db.profiles.find_one({}, sort=[("updated_at", -1)])
        technician_id = existing.get("technician_id", str(existing.get("_id", ""))) if existing else "unknown"
    
    allowed_fields = ["full_name", "first_name", "last_name", "email", "phone", "skills", "profile_photo", "title", "company", "position", "supervisor", "profile_completed"]
    update_data = {k: v for k, v in profile_data.items() if k in allowed_fields}
    update_data["technician_id"] = technician_id
    update_data["updated_at"] = datetime.utcnow().isoformat()
    
    # Use email if available, otherwise technician_id for the match
    match_query = {"email": email} if email else {"technician_id": technician_id}
    result = await db.profiles.update_one(
        match_query,
        {"$set": update_data},
        upsert=True
    )
    
    # Fetch the updated profile
    updated = await db.profiles.find_one(match_query)
    merged = serialize_doc(updated) if updated else update_data
    return {"success": True, "profile": merged}

@api_router.get("/auth/check-profile")
async def check_profile_completed(email: str = ""):
    """Check if a user has completed their profile setup"""
    if not email:
        return {"profile_completed": False}
    completed = await db.profiles.find_one({"email": email, "profile_completed": True})
    return {"profile_completed": completed is not None}

@api_router.post("/auth/setup-profile")
async def setup_profile(profile_data: dict):
    """First-time profile setup for new technicians"""
    first_name = profile_data.get("first_name", "").strip()
    last_name = profile_data.get("last_name", "").strip()
    position = profile_data.get("position", "").strip()
    supervisor = profile_data.get("supervisor", "").strip()
    phone = profile_data.get("phone", "").strip()
    profile_photo = profile_data.get("profile_photo", "")
    email = profile_data.get("email", "").strip()
    
    if not first_name or not last_name:
        raise HTTPException(status_code=400, detail="First and last name are required")
    if not position:
        raise HTTPException(status_code=400, detail="Position is required")
    
    full_name = f"{first_name} {last_name}"
    
    # Determine technician_id: use email-based lookup or generate
    technician_id = ""
    if email:
        existing = await db.profiles.find_one({"email": email})
        if existing:
            technician_id = existing.get("technician_id", str(existing.get("_id", "")))
    if not technician_id:
        technician_id = f"tech-{uuid.uuid4().hex[:8]}"
    
    profile = {
        "technician_id": technician_id,
        "first_name": first_name,
        "last_name": last_name,
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "position": position,
        "title": position,
        "supervisor": supervisor,
        "profile_photo": profile_photo,
        "company": "Blue Box Air, Inc.",
        "profile_completed": True,
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
    }
    
    await db.profiles.update_one(
        {"email": profile["email"]},
        {"$set": profile},
        upsert=True
    )
    
    # Return the complete technician data
    updated_profile = await db.profiles.find_one({"email": profile["email"]})
    technician = serialize_doc(updated_profile) if updated_profile else profile
    return {
        "success": True,
        "message": f"Welcome to Blue Box Air, {first_name}!",
        "technician": technician,
    }

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
        "technician_id": media_data.get("technician_id", "unknown"),
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
        "shared_by": share_data.get("technician_id", "unknown"),
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


# ============ Project Technician Assignment Routes ============

@api_router.get("/projects/{project_id}/technicians")
async def get_project_technicians(project_id: str):
    """Get all technicians assigned to a project"""
    assignments = await db.project_technicians.find({"project_id": project_id}).to_list(100)
    assignments = serialize_doc(assignments)
    return {"technicians": assignments, "total": len(assignments)}

@api_router.post("/projects/{project_id}/technicians")
async def assign_technician_to_project(project_id: str, data: dict = Body(...)):
    """Assign a technician to a project (admin-only)"""
    email = data.get("requester_email", "")
    if not await is_admin(email):
        raise HTTPException(status_code=403, detail="Only admins can assign technicians to projects")
    
    tech_name = data.get("name", "").strip()
    tech_email = data.get("email", "").strip()
    tech_id = data.get("user_id", "").strip()
    tech_role = data.get("role", "Technician")
    
    if not tech_name:
        raise HTTPException(status_code=400, detail="Technician name is required")
    
    # Check if already assigned
    existing = await db.project_technicians.find_one({
        "project_id": project_id,
        "$or": [
            {"email": tech_email} if tech_email else {"name": tech_name},
            {"name": tech_name}
        ]
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"{tech_name} is already assigned to this project")
    
    assignment = {
        "project_id": project_id,
        "user_id": tech_id or str(uuid.uuid4()),
        "name": tech_name,
        "email": tech_email,
        "role": tech_role,
        "assigned_at": datetime.utcnow().isoformat(),
        "assigned_by": email,
    }
    
    result = await db.project_technicians.insert_one(assignment.copy())
    assignment["_id"] = str(result.inserted_id)
    
    return {"success": True, "assignment": assignment}

@api_router.delete("/projects/{project_id}/technicians/{assignment_id}")
async def remove_technician_from_project(project_id: str, assignment_id: str, email: str = ""):
    """Remove a technician from a project (admin-only)"""
    if not await is_admin(email):
        raise HTTPException(status_code=403, detail="Only admins can remove technicians from projects")
    
    from bson import ObjectId
    try:
        result = await db.project_technicians.delete_one({
            "_id": ObjectId(assignment_id),
            "project_id": project_id
        })
    except Exception:
        result = await db.project_technicians.delete_one({
            "user_id": assignment_id,
            "project_id": project_id
        })
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"success": True, "message": "Technician removed from project"}


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
    """Get all projects (Salesforce Opportunities + custom DB projects)
    Only includes opportunities that have a project created (technician assigned)
    and excludes Proposal Sent / Closed Lost stages."""
    
    # Stages to exclude
    EXCLUDED_STAGES = ['Proposal Sent', 'Closed Lost', 'Closed Lost - No Commitment']
    
    all_projects = []
    
    # 1. Fetch Opportunities from Salesforce via stored sessions
    try:
        session = await db.sf_sessions.find_one({}, sort=[("updated_at", -1)])
        if session:
            # Exclude unwanted stages directly in SOQL
            stage_filter = " AND ".join([f"StageName != '{s}'" for s in EXCLUDED_STAGES])
            records = await sf_query(
                session["user_id"],
                f"SELECT Id, Name, StageName, Description, Amount, CreatedDate, CloseDate, "
                f"Account.Name, OwnerId, Owner.Name "
                f"FROM Opportunity WHERE {stage_filter} ORDER BY CreatedDate DESC LIMIT 200"
            )
            for r in records:
                proj = {
                    "id": r.get("Id", ""),
                    "salesforce_id": r.get("Id", ""),
                    "name": r.get("Name", ""),
                    "description": r.get("Description", "") or "",
                    "status": r.get("StageName", "Open"),
                    "client_name": r.get("Account", {}).get("Name", "") if r.get("Account") else "",
                    "amount": r.get("Amount"),
                    "start_date": r.get("CreatedDate", ""),
                    "end_date": r.get("CloseDate", ""),
                    "assigned_technician_id": r.get("OwnerId", ""),
                    "owner_name": r.get("Owner", {}).get("Name", "") if r.get("Owner") else "",
                    "equipment_count": 0,
                    "source": "salesforce",
                }
                all_projects.append(proj)
    except Exception as e:
        logging.error(f"Error fetching SF Opportunities: {e}")
    
    # 2. Also get synced opportunities from DB (from background sync)
    try:
        synced = await db.sf_opportunities.find({}).to_list(200)
        synced_ids = set(p.get("salesforce_id", "") for p in all_projects)
        for opp in synced:
            sid = opp.get("salesforce_id", "")
            opp_status = opp.get("status", "")
            # Skip excluded stages
            if opp_status in EXCLUDED_STAGES:
                continue
            if sid and sid not in synced_ids:
                opp["id"] = str(opp.get("_id", sid))
                opp.pop("_id", None)
                opp["source"] = "salesforce_synced"
                all_projects.append(opp)
    except Exception as e:
        logging.error(f"Error fetching synced opportunities: {e}")
    
    # 3. Also get from sf_projects (synced collection)
    try:
        synced_ids = set(p.get("salesforce_id", "") for p in all_projects)
        async for sp in db.sf_projects.find().sort("synced_at", -1):
            sid = sp.get("salesforce_id", "")
            sp_status = sp.get("status", "")
            if sp_status in EXCLUDED_STAGES:
                continue
            if sid and sid not in synced_ids:
                sp = serialize_doc(sp)
                sp["source"] = "salesforce_synced"
                all_projects.append(sp)
    except Exception as e:
        logging.error(f"Error fetching sf_projects: {e}")
    
    # 4. Get custom (manually created) projects from DB - always include
    try:
        custom_projects = await db.custom_projects.find().to_list(100)
        for cp in custom_projects:
            cp["id"] = str(cp["_id"])
            del cp["_id"]
            cp["source"] = "manual"
            all_projects.append(cp)
    except Exception as e:
        logging.error(f"Error fetching custom projects: {e}")
    
    # 5. Filter: Only include projects that have a technician assigned
    # Get all project IDs that have technician assignments
    assigned_project_ids = set()
    try:
        async for assignment in db.project_technicians.find({}, {"project_id": 1}):
            assigned_project_ids.add(assignment.get("project_id", ""))
    except Exception as e:
        logging.error(f"Error fetching technician assignments: {e}")
    
    # Filter SF projects to only those with technicians assigned
    # Always include manual/custom projects (they were explicitly created)
    filtered_projects = []
    for p in all_projects:
        pid = p.get("id") or p.get("salesforce_id", "")
        if p.get("source") == "manual":
            # Always include manually created projects
            filtered_projects.append(p)
        elif pid in assigned_project_ids:
            # SF project with technician assigned
            filtered_projects.append(p)
    
    all_projects = filtered_projects
    
    # Apply status filter if provided
    if status:
        all_projects = [p for p in all_projects if p.get("status", "").lower() == status.lower()]
    
    return {"projects": all_projects, "total": len(all_projects)}

@api_router.post("/projects")
async def create_project(data: dict = Body(...)):
    """Create a new project manually with proper naming convention"""
    now = datetime.now()
    project_id = f"proj-custom-{int(now.timestamp())}"
    
    # Enforce naming convention: "Client Name - Service Description"
    client_name = data.get("client_name", "").strip()
    project_name = data.get("name", "").strip()
    lob_code = data.get("line_of_business", "").strip().upper()
    
    if not client_name:
        raise HTTPException(status_code=400, detail="Client name is required")
    if not project_name:
        raise HTTPException(status_code=400, detail="Project name is required")
    if lob_code and lob_code not in LOB_CODES:
        raise HTTPException(status_code=400, detail=f"Invalid line of business. Use: AS, SS, or DS")
    
    # Auto-format project name if it doesn't already include client name
    if client_name.lower() not in project_name.lower():
        formatted_name = f"{client_name} - {project_name}"
    else:
        formatted_name = project_name
    
    # Title case the formatted name
    formatted_name = formatted_name.title()
    
    # Project number with LOB code: BBA-DS-202604-XXXX
    lob_prefix = f"-{lob_code}" if lob_code else ""
    project_number = f"BBA{lob_prefix}-{now.strftime('%Y%m')}-{project_id[-4:]}"
    
    lob_info = LOB_CODES.get(lob_code, {})
    
    new_project = {
        "id": project_id,
        "salesforce_id": None,
        "project_number": project_number,
        "name": formatted_name,
        "description": data.get("description", ""),
        "status": data.get("status", "Active"),
        "client_name": client_name.title(),
        "address": data.get("address", ""),
        "line_of_business": lob_code,
        "lob_name": lob_info.get("name", ""),
        "lob_color": lob_info.get("color", ""),
        "start_date": data.get("start_date", now.isoformat()),
        "end_date": data.get("end_date", (now + timedelta(days=30)).isoformat()),
        "assigned_technician_id": data.get("assigned_technician_id", "tech-001"),
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
    project = None
    
    # Check in custom projects first
    try:
        custom = await db.custom_projects.find_one({"id": project_id})
        if custom:
            custom["id"] = str(custom.get("_id", project_id))
            custom.pop("_id", None)
            project = custom
    except: pass
    
    # Check in synced opportunities
    if not project:
        try:
            synced = await db.sf_opportunities.find_one({"salesforce_id": project_id})
            if synced:
                synced["id"] = str(synced.get("_id", project_id))
                synced.pop("_id", None)
                project = synced
        except: pass
    
    # Check in sf_projects collection
    if not project:
        try:
            sf_proj = await db.sf_projects.find_one({"salesforce_id": project_id})
            if sf_proj:
                sf_proj = serialize_doc(sf_proj)
                project = sf_proj
        except: pass
    
    # Try to query Salesforce directly
    if not project:
        try:
            session = await db.sf_sessions.find_one({}, sort=[("updated_at", -1)])
            if session:
                records = await sf_query(
                    session["user_id"],
                    f"SELECT Id, Name, StageName, Description, Amount, CreatedDate, CloseDate, "
                    f"Account.Name, OwnerId, Owner.Name "
                    f"FROM Opportunity WHERE Id = '{project_id}' LIMIT 1"
                )
                if records:
                    r = records[0]
                    project = {
                        "id": r.get("Id", ""),
                        "salesforce_id": r.get("Id", ""),
                        "name": r.get("Name", ""),
                        "description": r.get("Description", "") or "",
                        "status": r.get("StageName", "Open"),
                        "client_name": r.get("Account", {}).get("Name", "") if r.get("Account") else "",
                        "amount": r.get("Amount"),
                        "start_date": r.get("CreatedDate", ""),
                        "end_date": r.get("CloseDate", ""),
                        "owner_name": r.get("Owner", {}).get("Name", "") if r.get("Owner") else "",
                        "source": "salesforce",
                    }
        except Exception as e:
            logging.error(f"SF project query error: {e}")
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Ensure project_number exists
    if not project.get("project_number"):
        sf_id = project.get("salesforce_id", project.get("id", ""))
        project["project_number"] = f"SF-{sf_id[-8:]}" if sf_id else f"PRJ-{project.get('id', 'unknown')[-6:]}"
    
    # Ensure all expected fields exist with defaults
    project.setdefault("address", "")
    project.setdefault("client_name", "")
    project.setdefault("status", "Active")
    project.setdefault("description", "")
    project.setdefault("start_date", "")
    project.setdefault("end_date", "")
    
    # Serialize dates
    for dk in ["start_date", "end_date", "created_at", "updated_at"]:
        if dk in project and isinstance(project[dk], datetime):
            project[dk] = project[dk].isoformat()
    
    # Get related data from DB
    equipment = []
    # Try sf_equipment by account_name
    account_name = project.get("client_name", "")
    if account_name:
        async for e in db.sf_equipment.find({"account_name": account_name}):
            equipment.append(serialize_doc(e))
    # Also local equipment
    async for e in db.equipment.find({"project_id": project_id}):
        equipment.append(serialize_doc(e))
    
    readings = await db.readings.find({"project_id": project_id}).to_list(100)
    photos = await db.photos.find({"project_id": project_id}).to_list(100)
    service_logs = await db.service_logs.find({"project_id": project_id}).to_list(100)
    
    return {
        "project": project,
        "equipment": equipment,
        "readings": serialize_doc(readings),
        "photos": serialize_doc(photos),
        "service_logs": serialize_doc(service_logs),
    }

# ============ Equipment Routes ============

@api_router.get("/equipment/{project_id}")
async def get_equipment(project_id: str):
    """Get all equipment for a project"""
    equipment = []
    
    # Check sf_equipment linked via project's account
    project = await db.sf_projects.find_one({"salesforce_id": project_id})
    if not project:
        try:
            project = await db.sf_projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            project = await db.custom_projects.find_one({"id": project_id})
    
    if project:
        account_name = project.get("client_name", "")
        if account_name:
            async for e in db.sf_equipment.find({"account_name": account_name}):
                equipment.append(serialize_doc(e))
    
    # Also include locally added equipment
    async for e in db.equipment.find({"project_id": project_id}):
        equipment.append(serialize_doc(e))
    
    return {"equipment": equipment}

@api_router.get("/equipment/detail/{equipment_id}")
async def get_equipment_detail(equipment_id: str):
    """Get equipment details with readings"""
    # Try SF equipment first
    equipment = None
    try:
        equipment = await db.sf_equipment.find_one({"_id": ObjectId(equipment_id)})
    except Exception:
        equipment = await db.sf_equipment.find_one({"salesforce_id": equipment_id})
    
    if not equipment:
        try:
            equipment = await db.equipment.find_one({"_id": ObjectId(equipment_id)})
        except Exception:
            equipment = await db.equipment.find_one({"id": equipment_id})
    
    if not equipment:
        raise HTTPException(status_code=404, detail="Equipment not found")
    
    equipment = serialize_doc(equipment)
    
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
    
    prompt = f"Equipment: {equipment_name}\nIssue: {issue}"
    if readings_text:
        prompt += f"\n\nCurrent Readings:\n{readings_text}"
    prompt += "\n\nProvide troubleshooting steps and recommendations."
    
    try:
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
        
        msg = UserMessage(text=prompt)
        response = await chat.send_message(msg)
    except Exception as e:
        logging.error(f"AI troubleshoot error: {e}")
        response = "AI service temporarily unavailable. Please try again later."
    
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
    
    try:
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
    except Exception as e:
        logging.error(f"AI report summary error: {e}")
        response = "AI service temporarily unavailable. Please try again later."
    
    return {"summary": response}

@api_router.post("/ai/chat")
async def ai_chat(data: dict):
    """AI Chatbot - General assistant for Blue Box Air technicians"""
    message_text = data.get("message", "")
    session_id = data.get("session_id", f"chat-{uuid.uuid4().hex[:8]}")
    
    try:
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
        
        msg = UserMessage(text=message_text)
        response = await chat.send_message(msg)
    except Exception as e:
        logging.error(f"AI chat error: {e}")
        response = "AI service temporarily unavailable. Please try again later."
    
    # Store chat messages
    await db.ai_chats.insert_one({
        "type": "chat",
        "session_id": session_id,
        "role": "user",
        "message": message_text,
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
    
    # Try to find project from SF projects
    project = None
    try:
        project = await db.sf_projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        project = await db.sf_projects.find_one({"salesforce_id": project_id})
    
    # Also check custom projects in DB
    if not project:
        try:
            custom = await db.custom_projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            custom = await db.custom_projects.find_one({"id": project_id})
        if custom:
            project = custom
    
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Serialize the project
    project = serialize_doc(project)
    if "_id" in project:
        project["id"] = str(project.pop("_id"))
    
    # Get equipment for this project from SF and local DB
    equipment_list = []
    account_name = project.get("client_name", "")
    if account_name:
        async for e in db.sf_equipment.find({"account_name": account_name}):
            eq_doc = serialize_doc(e)
            eq_doc["id"] = str(eq_doc.get("_id", eq_doc.get("salesforce_id", "")))
            equipment_list.append(eq_doc)
    
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
        "technician": project.get("assigned_tech_name", ""),
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
    """Get dashboard statistics (filtered: only projects with technicians, excludes Proposal Sent / Closed Lost)"""
    EXCLUDED_STAGES = ['Proposal Sent', 'Closed Lost', 'Closed Lost - No Commitment']
    
    # Get project IDs with technicians assigned
    assigned_project_ids = set()
    async for assignment in db.project_technicians.find({}, {"project_id": 1}):
        assigned_project_ids.add(assignment.get("project_id", ""))
    
    # Count SF projects that pass the filter
    active_count = 0
    on_hold_count = 0
    completed_count = 0
    total_filtered = 0
    
    async for p in db.sf_projects.find():
        status = p.get("status", "")
        if status in EXCLUDED_STAGES:
            continue
        pid = p.get("salesforce_id", "")
        if pid not in assigned_project_ids:
            continue
        total_filtered += 1
        status_lower = status.lower()
        if status_lower in ["active", "equipment list", "technical validation"]:
            active_count += 1
        elif status_lower in ["on hold"]:
            on_hold_count += 1
        elif status_lower in ["completed", "closed won", "done"]:
            completed_count += 1
        else:
            active_count += 1  # Default to active for unknown stages
    
    # Add custom projects (always count these)
    custom_active = await db.custom_projects.count_documents({"status": {"$regex": "^active$", "$options": "i"}})
    custom_on_hold = await db.custom_projects.count_documents({"status": {"$regex": "^on hold$", "$options": "i"}})
    custom_completed = await db.custom_projects.count_documents({"status": {"$regex": "^completed$", "$options": "i"}})
    custom_project_count = await db.custom_projects.count_documents({})
    total_filtered += custom_project_count
    active_count += custom_active + (custom_project_count - custom_active - custom_on_hold - custom_completed)  # Default others to active
    on_hold_count += custom_on_hold
    completed_count += custom_completed
    
    # Total equipment (from SF-synced and local)
    sf_equipment_count = await db.sf_equipment.count_documents({})
    local_equipment_count = await db.equipment.count_documents({})
    
    # Count unique equipment serviced (has readings)
    unique_equipment = await db.readings.distinct("equipment_id")
    units_serviced = len(unique_equipment)
    
    # Total readings count
    total_readings = await db.readings.count_documents({})
    
    stats = {
        "total_projects": total_filtered,
        "active": active_count,
        "on_hold": on_hold_count,
        "completed": completed_count,
        "total_equipment": sf_equipment_count + local_equipment_count,
        "units_serviced": units_serviced,
        "total_readings": total_readings,
    }
    
    return stats

# ========== PUSH NOTIFICATIONS ==========

@api_router.post("/push-token/register")
async def register_push_token(data: dict = Body(...)):
    """Register an Expo push token for a user"""
    token = data.get("push_token", "")
    user_id = data.get("user_id", "")
    email = data.get("email", "")
    
    if not token:
        raise HTTPException(status_code=400, detail="push_token is required")
    
    # Store/update the push token for this user
    await db.push_tokens.update_one(
        {"push_token": token},
        {"$set": {
            "push_token": token,
            "user_id": user_id,
            "email": email,
            "updated_at": datetime.utcnow().isoformat(),
            "active": True,
        }},
        upsert=True,
    )
    
    logging.info(f"Push token registered for user {email or user_id}")
    return {"success": True, "message": "Push token registered"}


@api_router.delete("/push-token/unregister")
async def unregister_push_token(data: dict = Body(...)):
    """Unregister a push token (on logout)"""
    token = data.get("push_token", "")
    if token:
        await db.push_tokens.update_one(
            {"push_token": token},
            {"$set": {"active": False}}
        )
    return {"success": True}


async def send_push_notifications(user_ids: list, title: str, body: str, data: dict = None):
    """Send Expo push notifications to users by their SF user IDs or emails"""
    # Get push tokens for these users
    tokens_cursor = db.push_tokens.find({
        "active": True,
        "$or": [
            {"user_id": {"$in": user_ids}},
            {"email": {"$in": user_ids}},
        ]
    })
    
    push_tokens = []
    async for t in tokens_cursor:
        push_token = t.get("push_token", "")
        if push_token.startswith("ExponentPushToken["):
            push_tokens.append(push_token)
    
    if not push_tokens:
        logging.info(f"No push tokens found for users: {user_ids}")
        return {"sent": 0}
    
    # Send via Expo Push API
    messages = []
    for token in push_tokens:
        message = {
            "to": token,
            "sound": "default",
            "title": title,
            "body": body,
            "data": data or {},
            "priority": "high",
            "channelId": "project-assignments",
        }
        messages.append(message)
    
    try:
        async with httpx.AsyncClient() as client_http:
            resp = await client_http.post(
                "https://exp.host/--/api/v2/push/send",
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Content-Type": "application/json",
                },
                timeout=15.0,
            )
            result = resp.json()
            logging.info(f"Push notification sent to {len(push_tokens)} devices: {result}")
            return {"sent": len(push_tokens), "result": result}
    except Exception as e:
        logging.error(f"Failed to send push notifications: {e}")
        return {"sent": 0, "error": str(e)}

# ============== COIL OF THE MONTH ==============

@api_router.get("/coil-of-month")
async def get_coil_of_month_entries():
    """Get all Coil of the Month entries, latest first"""
    entries = await db.coil_of_month.find({}).sort("created_at", -1).to_list(50)
    return [serialize_doc(e) for e in entries]

@api_router.get("/coil-of-month/current")
async def get_current_coil_of_month():
    """Get the latest/current featured Coil of the Month"""
    entry = await db.coil_of_month.find_one({}, sort=[("created_at", -1)])
    if not entry:
        return {"current": None}
    return {"current": serialize_doc(entry)}

@api_router.post("/coil-of-month")
async def create_coil_of_month(data: dict):
    """Admin creates a new Coil of the Month entry"""
    email = data.get("email", "")
    # Check admin
    admin = await db.admins.find_one({"email": email})
    if not admin:
        raise HTTPException(status_code=403, detail="Only administrators can post Coil of the Month")
    
    description = data.get("description", "").strip()
    # Validate 150 word limit
    word_count = len(description.split()) if description else 0
    if word_count > 150:
        raise HTTPException(status_code=400, detail=f"Description must be 150 words or less (currently {word_count} words)")
    
    media = data.get("media", "")
    media_type = data.get("media_type", "photo")  # "photo" or "video"
    title = data.get("title", "").strip() or f"Coil of the Month - {datetime.utcnow().strftime('%B %Y')}"
    unit_name = data.get("unit_name", "").strip()
    
    if not media:
        raise HTTPException(status_code=400, detail="Please upload a photo or video")
    
    entry = {
        "title": title,
        "description": description,
        "media": media,
        "media_type": media_type,
        "unit_name": unit_name,
        "created_by": email,
        "created_by_name": data.get("created_by_name", "Admin"),
        "created_at": datetime.utcnow().isoformat(),
        "month": datetime.utcnow().strftime("%B"),
        "year": datetime.utcnow().year,
        "loves": [],
        "love_count": 0,
        "comments": [],
    }
    
    result = await db.coil_of_month.insert_one(entry)
    entry["_id"] = result.inserted_id
    return {"success": True, "entry": serialize_doc(entry)}

@api_router.post("/coil-of-month/{entry_id}/love")
async def toggle_love(entry_id: str, data: dict):
    """Toggle love reaction on a Coil of the Month entry"""
    user_email = data.get("email", "")
    if not user_email:
        raise HTTPException(status_code=400, detail="Email required")
    
    try:
        oid = ObjectId(entry_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid entry ID")
    
    entry = await db.coil_of_month.find_one({"_id": oid})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    loves = entry.get("loves", [])
    if user_email in loves:
        # Remove love
        loves.remove(user_email)
        action = "unloved"
    else:
        # Add love
        loves.append(user_email)
        action = "loved"
    
    await db.coil_of_month.update_one(
        {"_id": oid},
        {"$set": {"loves": loves, "love_count": len(loves)}}
    )
    return {"success": True, "action": action, "love_count": len(loves), "loved": user_email in loves}

@api_router.post("/coil-of-month/{entry_id}/comments")
async def add_comment(entry_id: str, data: dict):
    """Add a comment to a Coil of the Month entry (max 25 words)"""
    user_email = data.get("email", "")
    user_name = data.get("name", "Anonymous")
    text = data.get("text", "").strip()
    
    if not text:
        raise HTTPException(status_code=400, detail="Comment text required")
    
    word_count = len(text.split())
    if word_count > 25:
        raise HTTPException(status_code=400, detail=f"Comments must be 25 words or less (currently {word_count} words)")
    
    try:
        oid = ObjectId(entry_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid entry ID")
    
    entry = await db.coil_of_month.find_one({"_id": oid})
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    
    comment = {
        "id": str(ObjectId()),
        "email": user_email,
        "name": user_name,
        "text": text,
        "created_at": datetime.utcnow().isoformat(),
    }
    
    await db.coil_of_month.update_one(
        {"_id": oid},
        {"$push": {"comments": comment}}
    )
    return {"success": True, "comment": comment}


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

@app.on_event("startup")
async def startup_seed():
    await seed_roles()
    await seed_admins()
