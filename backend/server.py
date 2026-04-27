from fastapi import FastAPI, APIRouter, HTTPException, Depends, Query, Body, UploadFile, File, Form
from fastapi.responses import RedirectResponse, FileResponse, HTMLResponse
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
import io
import tempfile

# PDF generation
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER, TA_RIGHT

# Salesforce integration
from salesforce_service import salesforce, sf_config, get_salesforce_status, FIELD_MAPPINGS

# Claude AI integration
import anthropic
from emergentintegrations.llm.chat import LlmChat, UserMessage

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env', override=False)

# Configure logging properly so all log messages appear in supervisor output
logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s:     %(message)s",
    force=True,
)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'technician_app')]

# Create the main app
app = FastAPI(title="Blue Box Air Tech API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# === App Store Screenshot Gallery ===
SCREENSHOTS_BASE = Path(__file__).parent / "static" / "screenshots"

@api_router.get("/screenshots")
async def screenshots_gallery():
    """HTML gallery of all App Store screenshots with download links"""
    if not SCREENSHOTS_BASE.exists():
        return HTMLResponse(content="<h1>No screenshots generated yet</h1>", status_code=404)

    devices = {
        "iphone_67": "iPhone 6.7\" (1290×2796)",
        "iphone_65": "iPhone 6.5\" (1284×2778)",
        "iphone_55": "iPhone 5.5\" (1242×2208)",
        "ipad_129": "iPad 12.9\" (2048×2732)",
        "ipad_11": "iPad 11\" (1668×2388)",
    }

    html_sections = ""
    total_count = 0
    for device_key, device_label in devices.items():
        device_dir = SCREENSHOTS_BASE / device_key
        if not device_dir.exists():
            continue

        files = sorted([f for f in os.listdir(device_dir) if f.endswith('.png')])
        total_count += len(files)
        images_html = ""
        for f in files:
            screen_name = f.replace('.png', '').split('_', 1)[-1].replace('_', ' ').title() if '_' in f else f.replace('.png','')
            images_html += f'''
            <div style="display:inline-block;margin:10px;text-align:center;vertical-align:top;">
                <a href="/api/screenshots/{device_key}/{f}" target="_blank">
                    <img src="/api/screenshots/{device_key}/{f}" style="height:280px;border-radius:12px;border:2px solid #2d4a6f;cursor:pointer;" loading="lazy" />
                </a>
                <div style="color:#94a3b8;font-size:12px;margin-top:6px;">{screen_name}</div>
                <a href="/api/screenshots/{device_key}/{f}" download="{device_key}_{f}" 
                   style="display:inline-block;margin-top:4px;padding:4px 12px;background:#c5d93d;color:#0f2744;border-radius:6px;font-size:11px;font-weight:700;text-decoration:none;">
                    Download
                </a>
            </div>'''

        html_sections += f'''
        <div style="margin-bottom:30px;">
            <h2 style="color:#c5d93d;font-size:18px;border-bottom:1px solid #2d4a6f;padding-bottom:8px;">{device_label}</h2>
            <div style="overflow-x:auto;white-space:nowrap;padding:10px 0;">{images_html}</div>
        </div>'''

    html = f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>BBA Tech - App Store Screenshots</title></head>
<body style="background:#0f2744;color:white;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:20px;margin:0;">
<div style="max-width:1400px;margin:0 auto;">
    <div style="text-align:center;margin-bottom:30px;">
        <h1 style="color:#c5d93d;font-size:28px;margin:0;">BBA Tech — App Store Screenshots</h1>
        <p style="color:#94a3b8;margin-top:8px;">Click any image to view full size. Click "Download" to save. All at exact Apple-required pixel dimensions.</p>
    </div>
    {html_sections}
    <div style="text-align:center;color:#64748b;font-size:12px;margin-top:30px;padding-top:20px;border-top:1px solid #2d4a6f;">
        Blue Box Air, Inc. • {total_count} screenshots • 5 device sizes • 6 screens each
    </div>
</div>
</body></html>'''
    return HTMLResponse(content=html)

@api_router.get("/screenshots/{device}/{filename}")
async def download_screenshot(device: str, filename: str):
    """Download a specific screenshot file"""
    filepath = SCREENSHOTS_BASE / device / filename
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(str(filepath), filename=f"{device}_{filename}", media_type="image/png")
# === End Screenshot Gallery ===

# === Privacy Policy & Terms ===
@api_router.api_route("/privacy-policy", methods=["GET", "HEAD"])
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
    <p>&copy; 2025–2026 Blue Box Air, Inc. All rights reserved.</p>
    <p>BBA Tech v1.0</p>
</div>

</div>
</body></html>'''
    return HTMLResponse(content=html)

@api_router.api_route("/terms", methods=["GET", "HEAD"])
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
    <p>&copy; 2025–2026 Blue Box Air, Inc. All rights reserved.</p>
    <p>BBA Tech v1.0</p>
</div>

</div>
</body></html>'''
    return HTMLResponse(content=html)

@api_router.api_route("/support", methods=["GET", "HEAD"])
async def support_page():
    """Public support page for App Store compliance"""
    from fastapi.responses import HTMLResponse
    html = '''<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>BBA Tech Support</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;margin:0;padding:0;background:#0f2744;color:#e2e8f0;}
.container{max-width:700px;margin:0 auto;padding:24px 20px;}
.header{text-align:center;padding:32px 0 24px;border-bottom:2px solid #c5d93d;}
.header h1{color:#c5d93d;font-size:28px;margin:0 0 4px;}
.header p{color:#94a3b8;font-size:14px;margin:0;}
h2{color:#c5d93d;font-size:18px;margin:28px 0 12px;padding-bottom:6px;border-bottom:1px solid #1e3a5f;}
p,li{line-height:1.7;font-size:15px;color:#cbd5e1;}
a{color:#c5d93d;text-decoration:none;}
a:hover{text-decoration:underline;}
.card{background:#1a365d;border-radius:12px;padding:20px;margin:16px 0;}
.card h3{color:#ffffff;margin:0 0 8px;font-size:16px;}
.card p{margin:0;font-size:14px;}
.footer{text-align:center;padding:24px 0;margin-top:32px;border-top:1px solid #1e3a5f;color:#64748b;font-size:12px;}
</style></head><body><div class="container">
<div class="header">
    <h1>BBA Tech Support</h1>
    <p>Blue Box Air, Inc. — Coil Management Solutions</p>
</div>

<h2>Contact Us</h2>
<div class="card">
    <h3>Email Support</h3>
    <p>For technical issues, account questions, or general inquiries:</p>
    <p style="margin-top:8px;"><a href="mailto:support@blueboxair.com">support@blueboxair.com</a></p>
</div>

<div class="card">
    <h3>Phone</h3>
    <p>Available Monday – Friday, 8:00 AM – 5:00 PM EST</p>
    <p style="margin-top:8px;"><a href="tel:+1800000000">Contact Blue Box Air</a></p>
</div>

<h2>Frequently Asked Questions</h2>

<div class="card">
    <h3>How do I log in?</h3>
    <p>BBA Tech uses your company Salesforce credentials. Tap "Login with Salesforce" on the login screen and enter your Salesforce username and password.</p>
</div>

<div class="card">
    <h3>How do I record equipment readings?</h3>
    <p>Navigate to a project, select an equipment unit, then use the Readings tab to enter Pre and Post service values for Differential Pressure (inWC) and Airflow (FPM).</p>
</div>

<div class="card">
    <h3>How do I generate a service report?</h3>
    <p>Open a project, go to the Report tab, and tap "Generate &amp; Share Report." The report will be uploaded to Salesforce and can be shared via email.</p>
</div>

<div class="card">
    <h3>I forgot my password</h3>
    <p>Since BBA Tech uses Salesforce authentication, please reset your password through your company's Salesforce portal or contact your administrator.</p>
</div>

<div class="card">
    <h3>The app isn't loading my projects</h3>
    <p>Ensure you have an active internet connection and a valid Salesforce session. Try logging out and back in. If the issue persists, contact support.</p>
</div>

<h2>App Information</h2>
<p>Version: 1.0</p>
<p>Developer: Blue Box Air, Inc.</p>
<p>Website: <a href="https://www.blueboxair.com">www.blueboxair.com</a></p>

<div class="footer">
    <p>&copy; 2025–2026 Blue Box Air, Inc. All rights reserved.</p>
    <p>BBA Tech v1.0</p>
</div>

</div></body></html>'''
    return HTMLResponse(content=html)
# === Support Tickets API ===

@api_router.post("/support/tickets")
async def create_ticket(data: dict):
    """Create a support ticket (any authenticated user)"""
    email = data.get("email", "").strip().lower()
    name = data.get("name", "").strip()
    subject = data.get("subject", "").strip()
    description = data.get("description", "").strip()
    category = data.get("category", "general").strip()

    if not email or not subject or not description:
        raise HTTPException(status_code=400, detail="Email, subject, and description are required")

    ticket = {
        "ticket_number": f"BBA-TKT-{int(datetime.utcnow().timestamp())}",
        "email": email,
        "name": name,
        "subject": subject,
        "description": description,
        "category": category,  # general, login, technical, account, feature_request
        "status": "open",  # open, in_progress, resolved, closed
        "priority": data.get("priority", "normal"),  # low, normal, high, urgent
        "created_at": datetime.utcnow().isoformat(),
        "updated_at": datetime.utcnow().isoformat(),
        "responses": [],
    }

    result = await db.support_tickets.insert_one(ticket)
    ticket["_id"] = str(result.inserted_id)
    return {"success": True, "ticket": serialize_doc(ticket)}

@api_router.get("/support/tickets")
async def list_tickets(email: str = "", status: str = "", category: str = ""):
    """List support tickets. Admins see all, regular users see only their own."""
    query = {}
    is_admin_user = await is_admin(email) if email else False

    if not is_admin_user and email:
        query["email"] = email.lower()
    elif not is_admin_user and not email:
        return {"tickets": [], "total": 0}

    if status:
        query["status"] = status
    if category:
        query["category"] = category

    tickets = []
    async for t in db.support_tickets.find(query).sort("created_at", -1):
        tickets.append(serialize_doc(t))

    return {"tickets": tickets, "total": len(tickets)}

@api_router.get("/support/tickets/{ticket_id}")
async def get_ticket(ticket_id: str):
    """Get a single support ticket by ID"""
    try:
        ticket = await db.support_tickets.find_one({"_id": ObjectId(ticket_id)})
    except Exception:
        ticket = await db.support_tickets.find_one({"ticket_number": ticket_id})

    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"ticket": serialize_doc(ticket)}

@api_router.put("/support/tickets/{ticket_id}")
async def update_ticket(ticket_id: str, data: dict):
    """Update ticket status or add a response (admin only)"""
    admin_email = data.get("admin_email", "").strip().lower()
    if not admin_email or not await is_admin(admin_email):
        raise HTTPException(status_code=403, detail="Only admins can update tickets")

    update_fields = {"updated_at": datetime.utcnow().isoformat()}

    if "status" in data:
        update_fields["status"] = data["status"]

    if "priority" in data:
        update_fields["priority"] = data["priority"]

    try:
        oid = ObjectId(ticket_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid ticket ID")

    # Add admin response if provided
    if data.get("response"):
        response_obj = {
            "admin_email": admin_email,
            "admin_name": data.get("admin_name", admin_email),
            "message": data["response"],
            "created_at": datetime.utcnow().isoformat(),
        }
        await db.support_tickets.update_one(
            {"_id": oid},
            {"$push": {"responses": response_obj}, "$set": update_fields}
        )
    else:
        await db.support_tickets.update_one({"_id": oid}, {"$set": update_fields})

    updated = await db.support_tickets.find_one({"_id": oid})
    if not updated:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {"success": True, "ticket": serialize_doc(updated)}

@api_router.get("/support/stats")
async def support_stats(email: str = ""):
    """Admin support dashboard stats"""
    if not email or not await is_admin(email):
        raise HTTPException(status_code=403, detail="Admin access required")

    total = await db.support_tickets.count_documents({})
    open_count = await db.support_tickets.count_documents({"status": "open"})
    in_progress = await db.support_tickets.count_documents({"status": "in_progress"})
    resolved = await db.support_tickets.count_documents({"status": "resolved"})
    closed = await db.support_tickets.count_documents({"status": "closed"})

    # Get registered user count
    total_users = await db.salesforce_profiles.count_documents({})
    registered_users = await db.registered_users.count_documents({})

    return {
        "tickets": {"total": total, "open": open_count, "in_progress": in_progress, "resolved": resolved, "closed": closed},
        "users": {"salesforce_profiles": total_users, "registered_accounts": registered_users},
    }

@api_router.get("/support/users")
async def list_all_users(email: str = ""):
    """Admin: list all registered users and Salesforce profiles"""
    if not email or not await is_admin(email):
        raise HTTPException(status_code=403, detail="Admin access required")

    users = []
    # Get registered users
    async for u in db.registered_users.find().sort("created_at", -1):
        doc = serialize_doc(u)
        doc["account_type"] = "registered"
        users.append(doc)

    # Get Salesforce profiles
    async for u in db.salesforce_profiles.find().sort("synced_at", -1).limit(50):
        doc = serialize_doc(u)
        doc["account_type"] = "salesforce"
        users.append(doc)

    return {"users": users, "total": len(users)}

@api_router.put("/support/users/{user_id}/status")
async def update_user_status(user_id: str, data: dict):
    """Admin: activate or deactivate a user account"""
    admin_email = data.get("admin_email", "").strip().lower()
    if not admin_email or not await is_admin(admin_email):
        raise HTTPException(status_code=403, detail="Admin access required")

    new_status = data.get("is_active", True)
    try:
        oid = ObjectId(user_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid user ID")

    # Try registered users first, then salesforce profiles
    result = await db.registered_users.update_one({"_id": oid}, {"$set": {"is_active": new_status}})
    if result.matched_count == 0:
        result = await db.salesforce_profiles.update_one({"_id": oid}, {"$set": {"is_active": new_status}})

    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="User not found")

    return {"success": True, "is_active": new_status}

# === End Support Tickets API ===

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

# In-memory store for PKCE verifiers (keyed by state) with timestamps for cleanup
_pkce_store: Dict[str, str] = {}
_pkce_timestamps: Dict[str, float] = {}
_pkce_mobile_redirect: Dict[str, str] = {}  # Store mobile redirect URIs per state
PKCE_TTL_SECONDS = 600  # 10 minutes

def _cleanup_pkce_store():
    """Remove expired PKCE entries"""
    import time
    now = time.time()
    expired = [k for k, t in _pkce_timestamps.items() if now - t > PKCE_TTL_SECONDS]
    for k in expired:
        _pkce_store.pop(k, None)
        _pkce_timestamps.pop(k, None)
        _pkce_mobile_redirect.pop(k, None)
    if expired:
        logging.info(f"Cleaned up {len(expired)} expired PKCE entries")

# ============ Admin Access Control ============

# Admin users list (seeded on startup)
DEFAULT_ADMINS = [
    {"email": "alonzo.cotton@blueboxair.com", "name": "Alonzo Cotton", "granted_by": "system"},
    {"email": "heather@blueboxair.com", "name": "Heather", "granted_by": "system"},
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
    """Login with Salesforce username/password or local profile match"""
    sf = get_sf_config()
    
    # Try real Salesforce OAuth (password grant) with short timeout
    # Note: Many Salesforce orgs block password grant (requires MFA disabled, security token appended)
    sf_login_success = False
    if sf["client_id"] and sf["client_secret"]:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client_http:
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
                    
                    sf_login_success = True
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
                    # Fall through to local profile lookup
                    
        except httpx.TimeoutException:
            logging.warning("Salesforce password login timed out, falling through to local auth")
        except Exception as e:
            logging.error(f"Salesforce OAuth error: {e}")
            # Fall through to local auth
    
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
    
    # ─── Registered User Login ───
    password_hash = hashlib.sha256(credentials.password.encode()).hexdigest()
    reg_user = await db.registered_users.find_one({
        "email": login_name.lower(),
        "password_hash": password_hash,
        "is_active": True,
    })
    if reg_user:
        technician = {
            "id": reg_user.get("user_id", str(reg_user.get("_id", ""))),
            "salesforce_id": "",
            "username": reg_user.get("email", ""),
            "email": reg_user.get("email", ""),
            "full_name": reg_user.get("full_name", ""),
            "first_name": reg_user.get("first_name", ""),
            "last_name": reg_user.get("last_name", ""),
            "phone": reg_user.get("phone", ""),
            "title": reg_user.get("title", "Field Technician"),
            "department": reg_user.get("department", ""),
            "company": reg_user.get("company", "Blue Box Air, Inc."),
            "role": reg_user.get("role", "Technician"),
            "sf_profile_name": "",
            "profile_photo": reg_user.get("profile_photo", ""),
            "skills": reg_user.get("skills", ["Coil Management", "Air Quality"]),
            "source": "registered",
            "is_admin": reg_user.get("is_admin", False),
            "profile_completed": reg_user.get("profile_completed", False),
        }
        return {
            "success": True,
            "message": f"Welcome back, {technician['first_name']}!",
            "technician": technician,
            "token": f"reg-{uuid.uuid4()}",
            "source": "registered",
        }

    # Final fallback: No valid login found
    raise HTTPException(
        status_code=401,
        detail="Invalid credentials. Please check your email and password, or create a new account."
    )


# ============ APPLE SIGN IN ============

@api_router.post("/auth/apple")
async def apple_auth(data: dict = Body(...)):
    """
    Handle Apple Sign In. Grants full access to Apple-authenticated users.
    This allows Apple reviewers to test the complete app experience.
    """
    apple_user_id = data.get("apple_user_id")
    apple_email = data.get("email")
    full_name = data.get("full_name")

    if not apple_user_id:
        raise HTTPException(status_code=400, detail="Apple user ID is required")

    # Check if we've seen this Apple user before
    existing = await db.apple_users.find_one({"apple_user_id": apple_user_id})

    if existing:
        # Update name/email if Apple provided them (only on first sign-in)
        if apple_email and not existing.get("email"):
            await db.apple_users.update_one(
                {"apple_user_id": apple_user_id},
                {"$set": {"email": apple_email}}
            )
            existing["email"] = apple_email
        if full_name and not existing.get("full_name"):
            await db.apple_users.update_one(
                {"apple_user_id": apple_user_id},
                {"$set": {"full_name": full_name}}
            )
            existing["full_name"] = full_name
    else:
        # Create new Apple user entry
        existing = {
            "apple_user_id": apple_user_id,
            "email": apple_email or f"apple-user-{apple_user_id[:8]}@privaterelay.appleid.com",
            "full_name": full_name or "Apple User",
            "created_at": datetime.utcnow().isoformat(),
            "source": "apple",
            "is_active": True,
        }
        await db.apple_users.insert_one(existing)

    # Generate auth token
    token = f"apple-token-{str(uuid.uuid4())}"
    user_email = existing.get("email", "apple@user.com")
    user_name = existing.get("full_name", "Apple User")

    # Create technician profile with full access (same data as demo account)
    technician = {
        "id": f"apple-{apple_user_id[:12]}",
        "technician_id": f"APPLE-{apple_user_id[:8].upper()}",
        "first_name": user_name.split()[0] if user_name else "Apple",
        "last_name": user_name.split()[-1] if user_name and len(user_name.split()) > 1 else "User",
        "full_name": user_name,
        "email": user_email,
        "title": "Technician",
        "company": "Blue Box Air, Inc.",
        "skills": ["HVAC Systems", "Coil Cleaning", "Air Quality Testing"],
        "certifications": ["EPA 608", "OSHA 30"],
        "source": "apple",
    }

    # Store the session
    await db.sessions.update_one(
        {"token": token},
        {"$set": {
            "token": token,
            "email": user_email,
            "technician": technician,
            "source": "apple",
            "created_at": datetime.utcnow().isoformat(),
        }},
        upsert=True
    )

    return {
        "success": True,
        "token": token,
        "technician": technician,
        "source": "apple",
    }

# ============ GOOGLE AUTH (via Emergent Auth) → SALESFORCE SYNC ============

@api_router.post("/auth/google/session")
async def google_auth_session(data: dict = Body(...)):
    """
    Process Google OAuth session from Emergent Auth.
    Gets user email from Google, matches to Salesforce profile, creates session.
    """
    session_id = data.get("session_id", "")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id is required")

    # Step 1: Exchange session_id with Emergent Auth for user data (with retry)
    google_user = None
    max_retries = 3
    retry_delay = 1.0  # seconds
    last_error_msg = ""
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client_http:
            for attempt in range(max_retries):
                auth_resp = await client_http.get(
                    "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
                    headers={"X-Session-ID": session_id},
                )
                if auth_resp.status_code == 200:
                    google_user = auth_resp.json()
                    break
                
                last_error_msg = auth_resp.text
                logging.warning(f"Emergent Auth attempt {attempt+1}/{max_retries} failed: {auth_resp.status_code} {last_error_msg}")
                
                if attempt < max_retries - 1:
                    import asyncio
                    await asyncio.sleep(retry_delay)
                    retry_delay *= 1.5  # exponential backoff
            
            if not google_user:
                logging.error(f"Emergent Auth session-data failed after {max_retries} attempts: {last_error_msg}")
                raise HTTPException(
                    status_code=401, 
                    detail="Google session expired. Please try signing in with Google again."
                )

            google_email = google_user.get("email", "").strip().lower()
            google_name = google_user.get("name", "")
            google_picture = google_user.get("picture", "")
            emergent_session_token = google_user.get("session_token", "")

            if not google_email:
                raise HTTPException(status_code=401, detail="No email received from Google.")

            logging.info(f"Google Auth SUCCESS: {google_email} ({google_name})")

    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Emergent Auth error: {e}")
        raise HTTPException(status_code=500, detail="Failed to verify Google authentication. Please try again.")

    # Step 2: Match Google email to a Salesforce profile in our DB
    sf_profile = await db.profiles.find_one({
        "$or": [
            {"email": {"$regex": f"^{google_email}$", "$options": "i"}},
            {"username": {"$regex": f"^{google_email}$", "$options": "i"}},
        ],
        "source": "salesforce",
        "is_active": True,
    })

    # Step 3: If no local SF profile found, try to trigger a Salesforce sync
    if not sf_profile:
        # Check if we have any SF session to sync users
        session = await db.sf_sessions.find_one({}, sort=[("updated_at", -1)])
        if session and session.get("access_token"):
            try:
                logging.info(f"Google Auth: No local profile for {google_email}, attempting SF sync...")
                sync_result = await sync_all_salesforce_users(token=session["access_token"])
                if sync_result.get("success"):
                    # Retry the profile lookup after sync
                    sf_profile = await db.profiles.find_one({
                        "$or": [
                            {"email": {"$regex": f"^{google_email}$", "$options": "i"}},
                            {"username": {"$regex": f"^{google_email}$", "$options": "i"}},
                        ],
                        "source": "salesforce",
                        "is_active": True,
                    })
            except Exception as sync_err:
                logging.warning(f"SF sync during Google auth failed: {sync_err}")

    # Step 4: Build the technician object
    if sf_profile:
        # Found in Salesforce - use their full SF profile
        technician = {
            "id": str(sf_profile.get("_id", "")),
            "salesforce_id": sf_profile.get("salesforce_id", ""),
            "username": sf_profile.get("username", ""),
            "email": sf_profile.get("email", google_email),
            "full_name": sf_profile.get("full_name", google_name),
            "first_name": sf_profile.get("first_name", ""),
            "last_name": sf_profile.get("last_name", ""),
            "phone": sf_profile.get("phone", ""),
            "title": sf_profile.get("title", ""),
            "department": sf_profile.get("department", ""),
            "company": sf_profile.get("company", "") or "Blue Box Air, Inc.",
            "role": sf_profile.get("role", ""),
            "sf_profile_name": sf_profile.get("sf_profile_name", ""),
            "profile_photo": google_picture or sf_profile.get("profile_photo", ""),
            "skills": ["Coil Management", "Air Quality"],
            "source": "google_salesforce",
            "is_admin": await is_admin(sf_profile.get("email", google_email)),
        }

        # Check profile completion
        completed = await db.profiles.find_one({"email": technician["email"], "profile_completed": True})
        technician["profile_completed"] = completed is not None

        logging.info(f"Google Auth: Matched {google_email} to SF profile: {technician['full_name']}")
    else:
        # Not found in Salesforce - create a basic profile from Google data
        name_parts = google_name.split(" ", 1) if google_name else ["User", ""]
        technician = {
            "id": f"google-{uuid.uuid4().hex[:8]}",
            "salesforce_id": "",
            "username": google_email,
            "email": google_email,
            "full_name": google_name or google_email.split("@")[0],
            "first_name": name_parts[0],
            "last_name": name_parts[1] if len(name_parts) > 1 else "",
            "phone": "",
            "title": "Field Technician",
            "department": "",
            "company": "Blue Box Air, Inc.",
            "role": "Technician",
            "sf_profile_name": "",
            "profile_photo": google_picture,
            "skills": ["Coil Management", "Air Quality"],
            "source": "google",
            "is_admin": await is_admin(google_email),
            "profile_completed": False,
        }

        # Save the Google-authenticated profile to DB
        await db.profiles.update_one(
            {"email": google_email},
            {"$set": {
                **technician,
                "technician_id": technician["id"],
                "updated_at": datetime.utcnow().isoformat(),
            }},
            upsert=True,
        )

        logging.info(f"Google Auth: New profile created for {google_email} (no SF match)")

    # Step 5: Store the Emergent session
    auth_token = f"google-{uuid.uuid4()}"
    await db.google_sessions.update_one(
        {"email": google_email},
        {"$set": {
            "email": google_email,
            "google_name": google_name,
            "google_picture": google_picture,
            "emergent_session_token": emergent_session_token,
            "auth_token": auth_token,
            "created_at": datetime.utcnow().isoformat(),
            "expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
        }},
        upsert=True,
    )

    return {
        "success": True,
        "message": f"Welcome, {technician['full_name']}!",
        "technician": technician,
        "token": auth_token,
        "source": technician.get("source", "google"),
        "salesforce_linked": bool(sf_profile),
    }


# ============ USER REGISTRATION ============

@api_router.post("/auth/register")
async def register_user(data: dict = Body(...)):
    """Register a new user account within the app."""
    email = (data.get("email") or "").strip().lower()
    password = data.get("password", "")
    full_name = (data.get("full_name") or "").strip()
    phone = (data.get("phone") or "").strip()

    # Validation
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="A valid email address is required.")
    if len(password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters.")
    if not full_name:
        raise HTTPException(status_code=400, detail="Full name is required.")

    # Check if email already exists
    existing = await db.registered_users.find_one({"email": email})
    if existing:
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in.")

    # Hash the password
    password_hash = hashlib.sha256(password.encode()).hexdigest()

    # Create the user
    name_parts = full_name.split(" ", 1)
    user_id = f"reg-{uuid.uuid4().hex[:12]}"
    user_doc = {
        "user_id": user_id,
        "email": email,
        "password_hash": password_hash,
        "full_name": full_name,
        "first_name": name_parts[0],
        "last_name": name_parts[1] if len(name_parts) > 1 else "",
        "phone": phone,
        "title": "Field Technician",
        "department": "",
        "company": "Blue Box Air, Inc.",
        "role": "Technician",
        "profile_photo": "",
        "skills": ["Coil Management", "Air Quality"],
        "source": "registered",
        "is_active": True,
        "is_admin": False,
        "profile_completed": False,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.registered_users.insert_one(user_doc)

    # Also create a profile entry
    await db.profiles.update_one(
        {"email": email},
        {"$set": {
            **user_doc,
            "technician_id": user_id,
            "updated_at": datetime.utcnow().isoformat(),
        }},
        upsert=True,
    )

    # Generate auth token
    auth_token = f"reg-{uuid.uuid4()}"

    technician = {
        "id": user_id,
        "salesforce_id": "",
        "username": email,
        "email": email,
        "full_name": full_name,
        "first_name": name_parts[0],
        "last_name": name_parts[1] if len(name_parts) > 1 else "",
        "phone": phone,
        "title": "Field Technician",
        "department": "",
        "company": "Blue Box Air, Inc.",
        "role": "Technician",
        "sf_profile_name": "",
        "profile_photo": "",
        "skills": ["Coil Management", "Air Quality"],
        "source": "registered",
        "is_admin": False,
        "profile_completed": False,
    }

    logging.info(f"New user registered: {email} ({full_name})")

    return {
        "success": True,
        "message": f"Welcome to BBA Tech, {name_parts[0]}!",
        "technician": technician,
        "token": auth_token,
        "source": "registered",
    }

@api_router.get("/auth/salesforce/init")
async def salesforce_oauth_init(redirect_uri: str = "", mobile_redirect: str = ""):
    """Initialize Salesforce OAuth flow - returns the authorization URL with PKCE
    
    Args:
        mobile_redirect: If provided, the callback will redirect to this URI instead of the web frontend.
                        Used by native mobile apps (Expo Go, standalone builds) to capture the OAuth result.
    """
    sf = get_sf_config()
    if not sf["client_id"]:
        raise HTTPException(status_code=500, detail="Salesforce not configured")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Clean up expired PKCE entries first
    _cleanup_pkce_store()
    
    # Generate PKCE pair
    import time
    code_verifier, code_challenge = generate_pkce_pair()
    state_key = f"init-{secrets.token_urlsafe(16)}"
    _pkce_store[state_key] = code_verifier
    _pkce_timestamps[state_key] = time.time()
    
    # Store mobile redirect URI if provided (native app flow)
    if mobile_redirect:
        _pkce_mobile_redirect[state_key] = mobile_redirect
        logging.info(f"SF Init: mobile redirect stored for state={state_key}: {mobile_redirect}")
    
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
    
    return {"auth_url": auth_url, "callback_url": callback_url, "state": state_key}

# ============ Polling-based Mobile Auth Flow ============
# This avoids deep links which don't work in Expo Go.
# Flow: App creates a poll token → opens browser → polls for result → backend fills result on callback

_auth_poll_store: Dict[str, dict] = {}  # poll_token -> {"status": "pending"|"success"|"error", "data": {...}, "created_at": float}

@api_router.post("/auth/salesforce/init-mobile")
async def salesforce_oauth_init_mobile():
    """Initialize Salesforce OAuth for mobile - returns auth URL and a poll token.
    
    The app opens the auth URL in the system browser, then polls /api/auth/poll/{poll_token}
    until the callback completes. No deep links needed.
    """
    import time
    sf = get_sf_config()
    if not sf["client_id"]:
        raise HTTPException(status_code=500, detail="Salesforce not configured")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    _cleanup_pkce_store()
    
    # Generate PKCE pair
    code_verifier, code_challenge = generate_pkce_pair()
    state_key = f"mobile-{secrets.token_urlsafe(16)}"
    _pkce_store[state_key] = code_verifier
    _pkce_timestamps[state_key] = time.time()
    
    # Create a poll token the app will use to check for the auth result
    poll_token = secrets.token_urlsafe(32)
    _auth_poll_store[poll_token] = {
        "status": "pending",
        "data": None,
        "created_at": time.time(),
    }
    # Store poll_token with the PKCE state so the callback can find it
    _pkce_mobile_redirect[state_key] = f"poll:{poll_token}"
    
    logging.info(f"SF Mobile Init: state={state_key}, poll_token={poll_token[:8]}...")
    
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
    
    return {
        "auth_url": auth_url,
        "poll_token": poll_token,
        "callback_url": callback_url,
    }

@api_router.get("/auth/poll/{poll_token}")
async def auth_poll(poll_token: str):
    """Poll for mobile auth result. Returns pending/success/error status.
    
    The app calls this repeatedly after opening the auth browser until status != 'pending'.
    """
    import time
    # Clean up old poll entries (> 10 min)
    expired = [k for k, v in _auth_poll_store.items() if time.time() - v["created_at"] > 600]
    for k in expired:
        _auth_poll_store.pop(k, None)
    
    entry = _auth_poll_store.get(poll_token)
    if not entry:
        raise HTTPException(status_code=404, detail="Poll token not found or expired")
    
    if entry["status"] == "pending":
        return {"status": "pending"}
    
    # Return the result and clean up
    result = entry.copy()
    _auth_poll_store.pop(poll_token, None)
    return result

@api_router.get("/auth/salesforce/redirect")
async def salesforce_oauth_redirect():
    """Redirect user to Salesforce login page (browser-based flow) with PKCE"""
    sf = get_sf_config()
    if not sf["client_id"]:
        raise HTTPException(status_code=500, detail="Salesforce not configured")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Clean up expired PKCE entries
    _cleanup_pkce_store()
    
    # Generate PKCE pair
    import time
    code_verifier, code_challenge = generate_pkce_pair()
    state_key = f"redirect-{secrets.token_urlsafe(16)}"
    _pkce_store[state_key] = code_verifier
    _pkce_timestamps[state_key] = time.time()
    
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

@api_router.get("/auth/diagnostics")
async def auth_diagnostics():
    """Diagnostics endpoint: check health of all auth providers"""
    results = {}
    
    # 1. Check Salesforce config
    sf = get_sf_config()
    results["salesforce"] = {
        "configured": bool(sf["client_id"] and sf["client_secret"]),
        "login_url": sf["login_url"],
        "callback_url": sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback",
    }
    
    # 2. Check Emergent Auth reachability
    try:
        async with httpx.AsyncClient(timeout=5.0) as client_http:
            resp = await client_http.get("https://auth.emergentagent.com/")
            results["google_auth"] = {
                "emergent_auth_reachable": resp.status_code < 500,
                "status": resp.status_code,
            }
    except Exception as e:
        results["google_auth"] = {"emergent_auth_reachable": False, "error": str(e)}
    
    # 3. Check active SF sessions
    active_sessions = await db.sf_sessions.count_documents({})
    results["sf_sessions"] = {"active_count": active_sessions}
    
    # 4. Demo account
    results["demo_login"] = {"available": True, "username": "demo@blueboxair.com"}
    
    # 5. Registered users count
    reg_count = await db.registered_users.count_documents({"is_active": True})
    results["registered_users"] = {"count": reg_count}
    
    return results


@api_router.get("/auth/salesforce/callback")
async def salesforce_oauth_callback(code: str = "", state: str = "", error: str = "", error_description: str = ""):
    """Handle Salesforce OAuth callback"""
    sf = get_sf_config()
    frontend_url = sf["redirect_uri"].replace("/api/auth/salesforce/callback", "") if sf["redirect_uri"] else sf["app_url"]
    
    logging.info(f"SF Callback received: code={'YES' if code else 'NO'}, state={state}, error={error}, error_desc={error_description}")
    
    if error:
        logging.warning(f"SF Callback error: {error} - {error_description}")
        # Check if there's a mobile redirect for this state
        mobile_redirect_err = _pkce_mobile_redirect.pop(state, None) if state else None
        _pkce_store.pop(state, None)
        _pkce_timestamps.pop(state, None)
        
        # If this was a mobile poll-based flow, store the error result
        if mobile_redirect_err and mobile_redirect_err.startswith("poll:"):
            poll_token = mobile_redirect_err.replace("poll:", "")
            if poll_token in _auth_poll_store:
                _auth_poll_store[poll_token]["status"] = "error"
                _auth_poll_store[poll_token]["data"] = {"error": error_description or error}
            # Show a "return to app" page
            return HTMLResponse(content=f"""
            <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
            <title>BBA Tech</title>
            <style>body{{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a1628;color:white;text-align:center;}}
            .box{{padding:40px;max-width:400px;}}.icon{{font-size:48px;margin-bottom:16px;}}h2{{color:#ff6b6b;}}p{{color:#8899aa;line-height:1.6;}}</style></head>
            <body><div class="box"><div class="icon">⚠️</div><h2>Login Failed</h2><p>{error_description or error}</p><p>Please return to the BBA Tech app and try again.</p></div></body></html>
            """, status_code=200)
        
        redirect_base = mobile_redirect_err if mobile_redirect_err else frontend_url
        separator = "&" if "?" in redirect_base else "?"
        return RedirectResponse(url=f"{redirect_base}{separator}sf_error={urllib.parse.quote(error_description or error)}")
    
    if not code:
        raise HTTPException(status_code=400, detail="No authorization code received")
    
    callback_url = sf["redirect_uri"] or f"{sf['app_url']}/api/auth/salesforce/callback"
    
    # Retrieve PKCE code_verifier from store
    _cleanup_pkce_store()  # Clean up expired entries first
    code_verifier = _pkce_store.pop(state, None)
    _pkce_timestamps.pop(state, None)
    mobile_redirect = _pkce_mobile_redirect.pop(state, None)
    logging.info(f"SF Callback: PKCE verifier found={code_verifier is not None}, state={state}, mobile_redirect={mobile_redirect}")
    
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
            
            # If this was a mobile poll-based flow, store the result for polling
            if mobile_redirect and mobile_redirect.startswith("poll:"):
                poll_token = mobile_redirect.replace("poll:", "")
                if poll_token in _auth_poll_store:
                    _auth_poll_store[poll_token]["status"] = "success"
                    _auth_poll_store[poll_token]["data"] = {
                        "success": True,
                        "technician": technician,
                        "token": access_token,
                        "source": "salesforce",
                    }
                    logging.info(f"SF Callback: Poll result stored for token={poll_token[:8]}...")
                # Show a "return to app" success page
                return HTMLResponse(content=f"""
                <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
                <title>BBA Tech - Login Successful</title>
                <style>body{{font-family:-apple-system,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#0a1628;color:white;text-align:center;}}
                .box{{padding:40px;max-width:400px;}}.icon{{font-size:64px;margin-bottom:16px;}}h2{{color:#76c043;}}p{{color:#8899aa;line-height:1.6;}}</style></head>
                <body><div class="box"><div class="icon">✅</div><h2>Login Successful!</h2><p>Welcome, {technician.get('full_name', 'Technician')}!</p><p>Return to the <strong>BBA Tech</strong> app — you'll be logged in automatically.</p></div></body></html>
                """, status_code=200)
            
            # Standard web redirect flow
            redirect_base = mobile_redirect if mobile_redirect else frontend_url
            separator = "&" if "?" in redirect_base else "?"
            return RedirectResponse(
                url=f"{redirect_base}{separator}sf_token={access_token}&sf_user={tech_json}&sf_success=true"
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
    {"name": "CFO", "level": 1, "parent": "CEO/Founder", "region": None, "color": "#3b82f6", "icon": "wallet"},
    {"name": "Head of Operations", "level": 1, "parent": "CEO/Founder", "region": None, "color": "#8b5cf6", "icon": "briefcase"},
    # One Operations Manager per region
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "New York", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "Florida", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "New Orleans", "color": "#3b82f6", "icon": "business"},
    {"name": "Operations Manager", "level": 2, "parent": "Head of Operations", "region": "Dallas", "color": "#3b82f6", "icon": "business"},
    # Per-region field roles — Operations Manager → Senior Technician → Junior Technician
    {"name": "Senior Technician", "level": 3, "parent": "Operations Manager", "region": None, "color": "#22c55e", "icon": "shield-checkmark"},
    {"name": "Junior Technician", "level": 4, "parent": "Senior Technician", "region": None, "color": "#94a3b8", "icon": "construct"},
]

# Default team members to seed
DEFAULT_TEAM_MEMBERS = [
    {"member_name": "Jim Metropoulos", "role_name": "CEO/Founder", "region": None, "email": "", "phone": "", "level": 0, "color": "#f59e0b", "icon": "star"},
    {"member_name": "Noah Ward", "role_name": "CFO", "region": None, "email": "", "phone": "", "level": 1, "color": "#3b82f6", "icon": "wallet"},
    {"member_name": "Alonzo Cotton", "role_name": "Head of Operations", "region": None, "email": "alonzo.cotton@blueboxair.com", "phone": "", "level": 1, "color": "#8b5cf6", "icon": "briefcase"},
]

async def seed_roles():
    """Seed default roles and initial team members if the collections are empty"""
    # Check if we need to update roles (check for Senior Technician as indicator of new schema)
    has_senior_tech = await db.roles.count_documents({"name": "Senior Technician"})
    
    if not has_senior_tech:
        # Drop old roles and re-seed with updated hierarchy
        await db.roles.delete_many({})
        for role in DEFAULT_ROLES:
            role_doc = {**role, "created_at": datetime.utcnow().isoformat()}
            await db.roles.insert_one(role_doc)
        logging.info(f"Seeded {len(DEFAULT_ROLES)} roles with updated hierarchy (Ops Manager → Sr Tech → Jr Tech)")
    
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
            
            # All level 1 roles (CFO, Head of Operations, etc.)
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
    """Update a team member's role, name, and/or email (admin-only)"""
    requester_email = data.get("requester_email", "").strip()
    if not await is_admin(requester_email):
        raise HTTPException(status_code=403, detail="Only administrators can update roles")
    
    old_role = data.get("old_role_name", "").strip()
    old_region = data.get("old_region", "").strip() or None
    new_role_name = data.get("new_role_name", "").strip()
    new_region = data.get("new_region", "").strip() or None
    new_name = data.get("new_name", "").strip()
    new_email = data.get("new_email", "").strip()
    
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
    
    # Update name if provided and changed
    if new_name and new_name != member_name:
        update_data["member_name"] = new_name
    
    # Update email if provided
    if new_email is not None:
        update_data["email"] = new_email
    
    result = await db.team_assignments.update_one(query, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    display_name = new_name if new_name and new_name != member_name else member_name
    return {"success": True, "message": f"Updated {display_name} — {new_role_name}"}



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

@api_router.get("/team/members")
async def get_team_members_list(search: str = ""):
    """Get a flat list of all team members for assignment pickers.
    Returns members with their role, region, and email — used when assigning techs to projects.
    """
    query = {}
    if search:
        query["$or"] = [
            {"member_name": {"$regex": search, "$options": "i"}},
            {"email": {"$regex": search, "$options": "i"}},
            {"role_name": {"$regex": search, "$options": "i"}},
        ]
    
    members = []
    async for m in db.team_assignments.find(query).sort([("level", 1), ("member_name", 1)]):
        members.append({
            "id": str(m.get("_id", "")),
            "name": m.get("member_name", ""),
            "email": m.get("email", ""),
            "role": m.get("role_name", ""),
            "region": m.get("region", ""),
            "level": m.get("level", 99),
            "color": m.get("color", "#94a3b8"),
            "icon": m.get("icon", "person"),
        })
    
    return {"members": members, "total": len(members)}

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
async def upload_media(media_data: dict = Body(...)):
    """Upload photo or video media to a project (JSON base64 method)"""
    media_uri = media_data.get("media_uri", "")
    
    # If it's a base64 data URI, save to file
    saved_path = ""
    if media_uri.startswith("data:"):
        try:
            import base64 as b64mod
            header, data = media_uri.split(",", 1)
            ext = "jpg"
            if "png" in header:
                ext = "png"
            elif "video" in header or "mp4" in header:
                ext = "mp4"
            elif "webm" in header:
                ext = "webm"
            
            filename = f"{uuid.uuid4().hex[:12]}.{ext}"
            filepath = f"/app/backend/uploads/{filename}"
            with open(filepath, "wb") as f:
                f.write(b64mod.b64decode(data))
            saved_path = f"/api/uploads/{filename}"
            logging.info(f"Saved media file: {filepath} ({os.path.getsize(filepath)} bytes)")
        except Exception as e:
            logging.error(f"Failed to save base64 media: {e}")
            saved_path = ""
    
    media = {
        "id": f"media-{uuid.uuid4().hex[:8]}",
        "project_id": media_data.get("project_id"),
        "equipment_id": media_data.get("equipment_id"),
        "media_type": media_data.get("media_type", "photo"),
        "media_uri": saved_path if saved_path else media_uri,
        "original_uri": media_uri[:100] if len(media_uri) > 100 else media_uri,
        "thumbnail": media_data.get("thumbnail", ""),
        "caption": media_data.get("caption", ""),
        "duration": media_data.get("duration"),
        "file_size": media_data.get("file_size"),
        "technician_id": media_data.get("technician_id", "unknown"),
        "technician_email": media_data.get("technician_email", ""),
        "created_at": datetime.utcnow().isoformat(),
    }
    
    await db.media.insert_one(media)
    media = serialize_doc(media)
    return {"success": True, "media": media}


@api_router.post("/media/upload")
async def upload_media_file(
    file: UploadFile = File(...),
    project_id: str = Form(...),
    equipment_id: str = Form(default=""),
    media_type: str = Form(default="photo"),
    technician_id: str = Form(default="unknown"),
    technician_email: str = Form(default=""),
    caption: str = Form(default=""),
):
    """Upload media file via multipart form (for large files)"""
    try:
        # Determine extension
        ext = file.filename.split(".")[-1].lower() if file.filename else "jpg"
        if ext not in ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm", "avi"]:
            ext = "jpg"
        
        filename = f"{uuid.uuid4().hex[:12]}.{ext}"
        filepath = f"/app/backend/uploads/{filename}"
        
        # Save file in chunks
        file_size = 0
        with open(filepath, "wb") as f:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                f.write(chunk)
                file_size += len(chunk)
        
        saved_path = f"/api/uploads/{filename}"
        logging.info(f"Uploaded media file: {filepath} ({file_size} bytes)")
        
        # Detect media type from extension
        video_exts = ["mp4", "mov", "webm", "avi"]
        if ext in video_exts:
            media_type = "video"
        
        media = {
            "id": f"media-{uuid.uuid4().hex[:8]}",
            "project_id": project_id,
            "equipment_id": equipment_id,
            "media_type": media_type,
            "media_uri": saved_path,
            "thumbnail": "",
            "caption": caption,
            "duration": None,
            "file_size": file_size,
            "technician_id": technician_id,
            "technician_email": technician_email,
            "created_at": datetime.utcnow().isoformat(),
        }
        
        await db.media.insert_one(media)
        media = serialize_doc(media)
        return {"success": True, "media": media}
        
    except Exception as e:
        logging.error(f"File upload error: {e}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")


@api_router.get("/media/{project_id}")
async def get_project_media(project_id: str):
    """Get all media (photos & videos) for a project"""
    media = await db.media.find({"project_id": project_id}).sort("created_at", -1).to_list(200)
    media = serialize_doc(media)
    return {"media": media}

@api_router.delete("/media/{media_id}")
async def delete_media(media_id: str):
    """Delete a media item and its file"""
    item = await db.media.find_one({"id": media_id})
    if item and item.get("media_uri", "").startswith("/api/uploads/"):
        # Delete the file
        filename = item["media_uri"].split("/")[-1]
        filepath = f"/app/backend/uploads/{filename}"
        try:
            if os.path.exists(filepath):
                os.remove(filepath)
                logging.info(f"Deleted media file: {filepath}")
        except Exception as e:
            logging.warning(f"Failed to delete file {filepath}: {e}")
    
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
        if not custom:
            # Also try by _id (ObjectId)
            try:
                custom = await db.custom_projects.find_one({"_id": ObjectId(project_id)})
            except Exception:
                pass
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

# ============ Delete Account ============

@api_router.delete("/account/delete")
async def delete_account(data: dict = Body(...)):
    """Permanently delete a user account and all associated data"""
    email = data.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Email is required")

    deleted_collections = {}

    # Delete from profiles
    r = await db.profiles.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["profiles"] = r.deleted_count

    # Delete from registered_users
    r = await db.registered_users.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["registered_users"] = r.deleted_count

    # Delete from google_sessions
    r = await db.google_sessions.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["google_sessions"] = r.deleted_count

    # Delete from apple_users
    r = await db.apple_users.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["apple_users"] = r.deleted_count

    # Delete from sessions
    r = await db.sessions.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["sessions"] = r.deleted_count

    # Delete from admins
    r = await db.admins.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["admins"] = r.deleted_count

    # Delete support tickets by this user
    r = await db.support_tickets.delete_many({"user_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["support_tickets"] = r.deleted_count

    # Delete from team_assignments
    r = await db.team_assignments.delete_many({"technician_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["team_assignments"] = r.deleted_count

    # Delete push tokens
    r = await db.push_tokens.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["push_tokens"] = r.deleted_count

    # Delete AI chat history
    r = await db.ai_chats.delete_many({"user_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["ai_chats"] = r.deleted_count

    # Delete signatures by this technician
    r = await db.signatures.delete_many({"technician_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["signatures"] = r.deleted_count

    # Delete time entries by this technician
    r = await db.time_entries.delete_many({"technician_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["time_entries"] = r.deleted_count

    # Delete photos uploaded by this user
    r = await db.photos.delete_many({"uploaded_by": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["photos"] = r.deleted_count

    # Delete readings by this user
    r = await db.readings.delete_many({"technician_email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["readings"] = r.deleted_count

    # Delete notifications for this user
    r = await db.notifications.delete_many({"email": {"$regex": f"^{email}$", "$options": "i"}})
    deleted_collections["notifications"] = r.deleted_count

    total_deleted = sum(deleted_collections.values())
    logging.info(f"Account deleted for {email}: {deleted_collections}")

    return {
        "success": True,
        "email": email,
        "total_records_deleted": total_deleted,
        "details": deleted_collections,
    }


# ============ Signature Capture ============

@api_router.post("/signatures")
async def save_signature(data: dict = Body(...)):
    """Save a technician signature for a project service sign-off"""
    project_id = data.get("project_id")
    technician_name = data.get("technician_name", "Unknown")
    technician_email = data.get("technician_email", "")
    signature_data = data.get("signature_data")  # base64 PNG
    notes = data.get("notes", "")

    if not project_id or not signature_data:
        raise HTTPException(status_code=400, detail="project_id and signature_data are required")

    signature_doc = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "technician_name": technician_name,
        "technician_email": technician_email,
        "signature_data": signature_data,
        "notes": notes,
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.signatures.insert_one(signature_doc)

    return {"success": True, "signature_id": signature_doc["id"]}


@api_router.get("/signatures/{project_id}")
async def get_signatures(project_id: str):
    """Get all signatures for a project"""
    sigs = await db.signatures.find({"project_id": project_id}).sort("created_at", -1).to_list(50)
    # Don't return the full base64 data in list view for performance
    result = []
    for s in sigs:
        s.pop("_id", None)
        result.append(s)
    return {"signatures": result}


@api_router.delete("/signatures/{signature_id}")
async def delete_signature(signature_id: str):
    """Delete a signature"""
    result = await db.signatures.delete_one({"id": signature_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Signature not found")
    return {"success": True}


# ============ Time Tracking ============

@api_router.post("/time-entries")
async def create_time_entry(data: dict = Body(...)):
    """Create a time entry (clock in) for a project"""
    project_id = data.get("project_id")
    technician_name = data.get("technician_name", "Unknown")
    technician_email = data.get("technician_email", "")
    notes = data.get("notes", "")
    clock_in = data.get("clock_in")  # ISO string or None for now

    if not project_id:
        raise HTTPException(status_code=400, detail="project_id is required")

    entry = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "technician_name": technician_name,
        "technician_email": technician_email,
        "clock_in": clock_in or datetime.utcnow().isoformat(),
        "clock_out": None,
        "duration_minutes": None,
        "notes": notes,
        "status": "active",  # active or completed
        "created_at": datetime.utcnow().isoformat(),
    }
    await db.time_entries.insert_one(entry)

    return {"success": True, "entry": {k: v for k, v in entry.items() if k != "_id"}}


@api_router.put("/time-entries/{entry_id}")
async def update_time_entry(entry_id: str, data: dict = Body(...)):
    """Update a time entry (clock out or edit notes)"""
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")

    update_fields = {}

    # Clock out
    clock_out = data.get("clock_out")
    if clock_out:
        update_fields["clock_out"] = clock_out
        update_fields["status"] = "completed"
        # Calculate duration
        try:
            cin = datetime.fromisoformat(entry["clock_in"].replace("Z", "+00:00").replace("+00:00", ""))
            cout = datetime.fromisoformat(clock_out.replace("Z", "+00:00").replace("+00:00", ""))
            duration = (cout - cin).total_seconds() / 60
            update_fields["duration_minutes"] = round(duration, 1)
        except Exception as e:
            logging.warning(f"Duration calc error: {e}")

    # Update notes
    if "notes" in data:
        update_fields["notes"] = data["notes"]

    if update_fields:
        await db.time_entries.update_one({"id": entry_id}, {"$set": update_fields})

    updated = await db.time_entries.find_one({"id": entry_id})
    updated.pop("_id", None)
    return {"success": True, "entry": updated}


@api_router.get("/time-entries/{project_id}")
async def get_time_entries(project_id: str):
    """Get all time entries for a project"""
    entries = await db.time_entries.find({"project_id": project_id}).sort("created_at", -1).to_list(100)
    result = []
    total_minutes = 0
    for e in entries:
        e.pop("_id", None)
        if e.get("duration_minutes"):
            total_minutes += e["duration_minutes"]
        result.append(e)

    return {
        "entries": result,
        "total_minutes": round(total_minutes, 1),
        "total_hours": round(total_minutes / 60, 2) if total_minutes > 0 else 0,
    }


@api_router.delete("/time-entries/{entry_id}")
async def delete_time_entry(entry_id: str):
    """Delete a time entry"""
    # Check if it looks like a project_id (prevent confusion with GET)
    entry = await db.time_entries.find_one({"id": entry_id})
    if not entry:
        raise HTTPException(status_code=404, detail="Time entry not found")
    await db.time_entries.delete_one({"id": entry_id})
    return {"success": True}


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
        original_id = ce.get("id", "")
        mongo_id = str(ce["_id"])
        del ce["_id"]
        ce["id"] = original_id or mongo_id
        ce["_mongo_id"] = mongo_id
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
        eq_ids = {eq.get("id", ""), eq.get("_mongo_id", ""), eq.get("salesforce_id", "")}
        eq_ids.discard("")
        eq_readings = [r for r in all_readings if r.get("equipment_id") in eq_ids]
        
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


# ============ REPORT GENERATION & SALESFORCE UPLOAD ============

def _build_report_pdf(
    project: dict,
    equipment_reports: list,
    unit_averages: list,
    overall_averages: dict,
    technician_name: str,
    technician_email: str,
    generated_at: str,
) -> bytes:
    """Generate a professional Blue Box Air branded PDF report and return as bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        topMargin=0.5 * inch,
        bottomMargin=0.5 * inch,
        leftMargin=0.6 * inch,
        rightMargin=0.6 * inch,
    )

    # Colors
    navy = HexColor("#0f2744")
    navy_light = HexColor("#1a365d")
    lime = HexColor("#c5d93d")
    white = HexColor("#ffffff")
    gray = HexColor("#94a3b8")
    dark_bg = HexColor("#0d2137")

    # Styles
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="BrandTitle", fontSize=22, fontName="Helvetica-Bold",
        textColor=white, alignment=TA_CENTER, spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        name="BrandTagline", fontSize=10, fontName="Helvetica",
        textColor=lime, alignment=TA_CENTER, spaceAfter=12,
    ))
    styles.add(ParagraphStyle(
        name="ReportTitle", fontSize=16, fontName="Helvetica-Bold",
        textColor=white, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="ReportMeta", fontSize=9, fontName="Helvetica",
        textColor=gray, spaceAfter=2,
    ))
    styles.add(ParagraphStyle(
        name="SectionHead", fontSize=13, fontName="Helvetica-Bold",
        textColor=lime, spaceBefore=16, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        name="BodyText2", fontSize=10, fontName="Helvetica",
        textColor=white, spaceAfter=4,
    ))
    styles.add(ParagraphStyle(
        name="FooterText", fontSize=8, fontName="Helvetica",
        textColor=gray, alignment=TA_CENTER, spaceBefore=16,
    ))

    elements = []

    # ---- Brand Header ----
    elements.append(Paragraph("BLUE BOX AIR, INC.", styles["BrandTitle"]))
    elements.append(Paragraph("Coil Management Solutions", styles["BrandTagline"]))
    elements.append(Spacer(1, 8))

    # ---- Report Meta ----
    elements.append(Paragraph(f"<b>{project.get('name', 'Service Report')}</b>", styles["ReportTitle"]))
    elements.append(Paragraph(f"Client: {project.get('client_name', 'N/A')}", styles["ReportMeta"]))
    if project.get("address"):
        elements.append(Paragraph(f"Location: {project['address']}", styles["ReportMeta"]))
    elements.append(Paragraph(f"Status: {project.get('status', 'N/A')}", styles["ReportMeta"]))
    elements.append(Spacer(1, 4))
    elements.append(Paragraph(f"Prepared by: {technician_name} ({technician_email})", styles["ReportMeta"]))
    elements.append(Paragraph(f"Date Completed: {generated_at}", styles["ReportMeta"]))
    elements.append(Spacer(1, 12))

    # ---- Per-Unit Averages Table ----
    elements.append(Paragraph("AVERAGE READINGS PER UNIT", styles["SectionHead"]))

    if unit_averages:
        header = ["Unit Name", "Avg DP Drop (inWC)", "Avg Airflow Increase (FPM)"]
        table_data = [header]
        for ua in unit_averages:
            dp_val = f"{ua['avg_pressure_drop']:.2f}" if ua["avg_pressure_drop"] is not None else "—"
            af_val = f"{ua['avg_airflow_increase']:.2f}" if ua["avg_airflow_increase"] is not None else "—"
            table_data.append([ua["equipment_name"], dp_val, af_val])

        t = Table(table_data, colWidths=[3.0 * inch, 2.0 * inch, 2.2 * inch])
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), navy_light),
            ("TEXTCOLOR", (0, 0), (-1, 0), lime),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, 0), 9),
            ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
            ("FONTSIZE", (0, 1), (-1, -1), 9),
            ("TEXTCOLOR", (0, 1), (-1, -1), white),
            ("BACKGROUND", (0, 1), (-1, -1), dark_bg),
            ("ALIGN", (1, 0), (-1, -1), "CENTER"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, navy_light),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [dark_bg, navy]),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
        ]))
        elements.append(t)
    else:
        elements.append(Paragraph("No equipment readings recorded.", styles["BodyText2"]))

    elements.append(Spacer(1, 16))

    # ---- Overall Averages ----
    elements.append(Paragraph("OVERALL PROJECT AVERAGES", styles["SectionHead"]))

    overall_dp = overall_averages.get("avg_pressure_drop")
    overall_af = overall_averages.get("avg_airflow_increase")

    overall_data = [
        ["Metric", "Value"],
        [
            "Avg Decrease in Differential Pressure (all units)",
            f"{overall_dp:.2f} inWC" if overall_dp is not None else "No data",
        ],
        [
            "Avg Increase in Airflow (all units)",
            f"{overall_af:.2f} FPM" if overall_af is not None else "No data",
        ],
    ]
    ot = Table(overall_data, colWidths=[4.5 * inch, 2.7 * inch])
    ot.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), navy_light),
        ("TEXTCOLOR", (0, 0), (-1, 0), lime),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 10),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 1), (-1, -1), 10),
        ("TEXTCOLOR", (0, 1), (-1, -1), white),
        ("BACKGROUND", (0, 1), (-1, -1), dark_bg),
        ("ALIGN", (1, 0), (-1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.5, navy_light),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
    ]))
    elements.append(ot)

    elements.append(Spacer(1, 16))

    # ---- Detailed Equipment Breakdown ----
    elements.append(Paragraph("DETAILED EQUIPMENT READINGS", styles["SectionHead"]))

    for eq_report in equipment_reports:
        eq = eq_report.get("equipment", {})
        eq_name = eq.get("name", "Unknown")
        eq_type = eq.get("equipment_type", "")
        eq_loc = eq.get("location", "N/A")

        elements.append(Paragraph(
            f"<b>{eq_name}</b> — {eq_type} • {eq_loc}",
            styles["BodyText2"],
        ))

        if eq_report.get("has_data"):
            detail_header = ["Metric", "Pre", "Post", "Change"]
            detail_data = [detail_header]
            for comp in eq_report.get("comparisons", []):
                if not comp.get("pre") and not comp.get("post"):
                    continue
                pre_str = f"{comp['pre']['value']}" if comp.get("pre") else "—"
                post_str = f"{comp['post']['value']}" if comp.get("post") else "—"
                diff = comp.get("difference")
                if diff is not None:
                    sign = "+" if diff > 0 else ""
                    change_str = f"{sign}{diff} {comp.get('unit', '')}"
                else:
                    change_str = "—"
                detail_data.append([
                    f"{comp['reading_type']} ({comp.get('unit', '')})",
                    pre_str, post_str, change_str,
                ])

            if len(detail_data) > 1:
                dt = Table(detail_data, colWidths=[2.8 * inch, 1.3 * inch, 1.3 * inch, 1.8 * inch])
                dt.setStyle(TableStyle([
                    ("BACKGROUND", (0, 0), (-1, 0), navy_light),
                    ("TEXTCOLOR", (0, 0), (-1, 0), lime),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, 0), 8),
                    ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
                    ("FONTSIZE", (0, 1), (-1, -1), 8),
                    ("TEXTCOLOR", (0, 1), (-1, -1), white),
                    ("BACKGROUND", (0, 1), (-1, -1), dark_bg),
                    ("ALIGN", (1, 0), (-1, -1), "CENTER"),
                    ("GRID", (0, 0), (-1, -1), 0.5, navy_light),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
                    ("TOPPADDING", (0, 0), (-1, -1), 6),
                ]))
                elements.append(dt)
        else:
            elements.append(Paragraph("No readings recorded for this unit.", styles["ReportMeta"]))

        elements.append(Spacer(1, 10))

    # ---- Footer ----
    elements.append(Spacer(1, 20))
    elements.append(Paragraph("BLUE BOX AIR, INC. — Coil Management Solutions", styles["FooterText"]))
    elements.append(Paragraph(f"Report auto-generated on {generated_at}", styles["FooterText"]))
    elements.append(Paragraph("© 2025–2026 Blue Box Air, Inc. All rights reserved.", styles["FooterText"]))

    # Build
    doc.build(elements)
    return buffer.getvalue()


async def _upload_pdf_to_salesforce(
    pdf_bytes: bytes,
    filename: str,
    title: str,
    opportunity_id: str,
) -> dict:
    """Upload a PDF to Salesforce as a ContentVersion and link it to the Opportunity."""
    # Find the most recent SF session
    session = await db.sf_sessions.find_one({}, sort=[("updated_at", -1)])
    if not session:
        return {"success": False, "error": "No Salesforce session found. Please login via Salesforce first."}

    access_token = session.get("access_token", "")
    instance_url = session.get("instance_url", "")
    if not access_token or not instance_url:
        return {"success": False, "error": "Invalid Salesforce session."}

    api_version = os.environ.get("SALESFORCE_API_VERSION", "v59.0")
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    try:
        async with httpx.AsyncClient(timeout=60.0) as client_http:
            # Step 1: Create ContentVersion
            cv_payload = {
                "Title": title,
                "PathOnClient": filename,
                "VersionData": pdf_b64,
            }
            cv_resp = await client_http.post(
                f"{instance_url}/services/data/{api_version}/sobjects/ContentVersion/",
                json=cv_payload,
                headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
            )

            if cv_resp.status_code not in (200, 201):
                logging.error(f"SF ContentVersion create failed: {cv_resp.status_code} {cv_resp.text}")
                return {"success": False, "error": f"Salesforce file upload failed: {cv_resp.text[:200]}"}

            cv_data = cv_resp.json()
            content_version_id = cv_data.get("id", "")

            # Step 2: Get the ContentDocumentId from the ContentVersion
            cv_query_resp = await client_http.get(
                f"{instance_url}/services/data/{api_version}/sobjects/ContentVersion/{content_version_id}",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if cv_query_resp.status_code != 200:
                logging.error(f"SF ContentVersion query failed: {cv_query_resp.status_code}")
                return {
                    "success": True,
                    "content_version_id": content_version_id,
                    "warning": "File uploaded but could not link to Opportunity",
                }

            content_document_id = cv_query_resp.json().get("ContentDocumentId", "")

            # Step 3: Link ContentDocument to the Opportunity
            if content_document_id and opportunity_id:
                link_payload = {
                    "ContentDocumentId": content_document_id,
                    "LinkedEntityId": opportunity_id,
                    "ShareType": "V",
                    "Visibility": "AllUsers",
                }
                link_resp = await client_http.post(
                    f"{instance_url}/services/data/{api_version}/sobjects/ContentDocumentLink/",
                    json=link_payload,
                    headers={"Authorization": f"Bearer {access_token}", "Content-Type": "application/json"},
                )
                if link_resp.status_code not in (200, 201):
                    logging.warning(f"SF ContentDocumentLink create warning: {link_resp.status_code} {link_resp.text}")
                    return {
                        "success": True,
                        "content_version_id": content_version_id,
                        "content_document_id": content_document_id,
                        "warning": f"File uploaded but linking failed: {link_resp.text[:200]}",
                    }

            logging.info(f"PDF uploaded to Salesforce: ContentVersion={content_version_id}, ContentDocument={content_document_id}")
            return {
                "success": True,
                "content_version_id": content_version_id,
                "content_document_id": content_document_id,
                "linked_to_opportunity": opportunity_id,
            }

    except Exception as e:
        logging.error(f"Salesforce PDF upload error: {e}")
        return {"success": False, "error": str(e)}


@api_router.post("/projects/{project_id}/generate-report")
async def generate_and_upload_report(project_id: str, data: dict = Body(...)):
    """
    Generate a PDF report with:
    - Average differential pressure drop per unit
    - Average airflow increase per unit
    - Overall average decrease in differential pressure
    - Overall average increase in airflow
    Then upload the PDF to Salesforce Opportunity files and return it for sharing.
    """
    technician_name = data.get("technician_name", "Unknown Technician")
    technician_email = data.get("technician_email", "")

    # ---- Fetch project (same logic as existing generate_report) ----
    project = None
    try:
        project = await db.sf_projects.find_one({"_id": ObjectId(project_id)})
    except Exception:
        project = await db.sf_projects.find_one({"salesforce_id": project_id})

    if not project:
        try:
            custom = await db.custom_projects.find_one({"_id": ObjectId(project_id)})
        except Exception:
            custom = await db.custom_projects.find_one({"id": project_id})
        if custom:
            project = custom

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    project = serialize_doc(project)
    if "_id" in project:
        project["id"] = str(project.pop("_id"))

    # ---- Fetch equipment ----
    equipment_list = []
    account_name = project.get("client_name", "")
    if account_name:
        async for e in db.sf_equipment.find({"account_name": account_name}):
            eq_doc = serialize_doc(e)
            eq_doc["id"] = str(eq_doc.get("_id", eq_doc.get("salesforce_id", "")))
            equipment_list.append(eq_doc)

    custom_equipment = await db.equipment.find({"project_id": project_id}).to_list(100)
    for ce in custom_equipment:
        original_id = ce.get("id", "")  # Preserve the custom UUID id
        mongo_id = str(ce["_id"])
        del ce["_id"]
        ce["id"] = original_id or mongo_id  # Prefer custom id, fallback to mongo _id
        ce["_mongo_id"] = mongo_id  # Keep mongo id for fallback matching
        equipment_list.append(ce)

    # ---- Fetch all readings ----
    all_readings = await db.readings.find({"project_id": project_id}).to_list(500)
    all_readings = serialize_doc(all_readings)

    # ---- Calculate per-unit and overall averages ----
    reading_types = ["Differential Pressure", "Airflow", "Temperature", "Humidity"]
    unit_map = {"Differential Pressure": "inWC", "Airflow": "FPM", "Temperature": "°F", "Humidity": "%"}

    equipment_reports = []
    unit_averages = []

    # Accumulators for overall averages
    all_pressure_drops = []
    all_airflow_increases = []

    for eq in equipment_list:
        # Match readings by equipment id (try both custom id and mongo _id)
        eq_ids = {eq.get("id", ""), eq.get("_mongo_id", ""), eq.get("salesforce_id", "")}
        eq_ids.discard("")
        eq_readings = [r for r in all_readings if r.get("equipment_id") in eq_ids]

        comparisons = []
        eq_pressure_drops = []
        eq_airflow_increases = []

        for rt in reading_types:
            type_readings = [r for r in eq_readings if r.get("reading_type") == rt]
            pre_readings = sorted(
                [r for r in type_readings if r.get("reading_phase") == "Pre"],
                key=lambda r: r.get("captured_at", r.get("timestamp", "")),
            )
            post_readings = sorted(
                [r for r in type_readings if r.get("reading_phase") == "Post"],
                key=lambda r: r.get("captured_at", r.get("timestamp", "")),
            )

            # Get the latest pre and post
            latest_pre = pre_readings[-1] if pre_readings else None
            latest_post = post_readings[-1] if post_readings else None

            difference = None
            percent_change = None
            if latest_pre and latest_post:
                difference = round(latest_post["value"] - latest_pre["value"], 2)
                if latest_pre["value"] != 0:
                    percent_change = round((difference / latest_pre["value"]) * 100, 1)

                # Collect for averages
                if rt == "Differential Pressure":
                    # Pressure DROP = Pre - Post (positive means drop)
                    drop = round(latest_pre["value"] - latest_post["value"], 2)
                    eq_pressure_drops.append(drop)
                    all_pressure_drops.append(drop)
                elif rt == "Airflow":
                    # Airflow INCREASE = Post - Pre (positive means increase)
                    increase = round(latest_post["value"] - latest_pre["value"], 2)
                    eq_airflow_increases.append(increase)
                    all_airflow_increases.append(increase)

            comparisons.append({
                "reading_type": rt,
                "unit": unit_map.get(rt, ""),
                "pre": {"value": latest_pre["value"], "captured_at": latest_pre.get("captured_at")} if latest_pre else None,
                "post": {"value": latest_post["value"], "captured_at": latest_post.get("captured_at")} if latest_post else None,
                "difference": difference,
                "percent_change": percent_change,
            })

        # Per-unit averages
        avg_dp = round(sum(eq_pressure_drops) / len(eq_pressure_drops), 2) if eq_pressure_drops else None
        avg_af = round(sum(eq_airflow_increases) / len(eq_airflow_increases), 2) if eq_airflow_increases else None

        unit_averages.append({
            "equipment_name": eq.get("name", "Unknown"),
            "equipment_id": eq["id"],
            "avg_pressure_drop": avg_dp,
            "avg_airflow_increase": avg_af,
        })

        equipment_reports.append({
            "equipment": eq,
            "comparisons": comparisons,
            "has_data": any(c["pre"] or c["post"] for c in comparisons),
        })

    # Overall averages across all units
    overall_averages = {
        "avg_pressure_drop": round(sum(all_pressure_drops) / len(all_pressure_drops), 2) if all_pressure_drops else None,
        "avg_airflow_increase": round(sum(all_airflow_increases) / len(all_airflow_increases), 2) if all_airflow_increases else None,
    }

    # ---- Generate PDF ----
    now_str = datetime.utcnow().strftime("%B %d, %Y %I:%M %p")
    project_name = project.get("name", "Service Report")

    pdf_bytes = _build_report_pdf(
        project=project,
        equipment_reports=equipment_reports,
        unit_averages=unit_averages,
        overall_averages=overall_averages,
        technician_name=technician_name,
        technician_email=technician_email,
        generated_at=now_str,
    )

    # ---- Upload to Salesforce ----
    sf_result = {"success": False, "error": "Not attempted"}
    salesforce_id = project.get("salesforce_id", project.get("id", ""))
    if salesforce_id:
        safe_name = project_name.replace(" ", "_").replace("/", "-")[:50]
        filename = f"BBA_Report_{safe_name}_{datetime.utcnow().strftime('%Y%m%d')}.pdf"
        title = f"Service Report - {project_name}"
        sf_result = await _upload_pdf_to_salesforce(pdf_bytes, filename, title, salesforce_id)

    # ---- Return PDF as base64 + metadata ----
    pdf_b64 = base64.b64encode(pdf_bytes).decode("utf-8")

    return {
        "success": True,
        "pdf_base64": pdf_b64,
        "filename": f"BBA_Report_{project_name.replace(' ', '_')[:30]}_{datetime.utcnow().strftime('%Y%m%d')}.pdf",
        "salesforce_upload": sf_result,
        "report_data": {
            "unit_averages": unit_averages,
            "overall_averages": overall_averages,
            "equipment_count": len(equipment_list),
            "readings_count": len(all_readings),
        },
        "generated_at": now_str,
    }


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

# Mount static files for screenshots
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

# Mount uploads directory for media files
uploads_dir = Path(__file__).parent / "uploads"
uploads_dir.mkdir(exist_ok=True)
app.mount("/api/uploads", StaticFiles(directory=str(uploads_dir)), name="uploads")
