"""Generate App Store screenshots at exact Apple dimensions"""
import asyncio
import os
from playwright.async_api import async_playwright

BASE_URL = "https://techservice-app-2.preview.emergentagent.com"
OUTPUT_DIR = "/app/backend/static/screenshots"

# Apple App Store required dimensions (logical pixels for viewport)
DEVICES = {
    "iphone_67": {"width": 430, "height": 932, "dpr": 3, "label": "iPhone 6.7\" (1290x2796)"},
    "iphone_65": {"width": 428, "height": 926, "dpr": 3, "label": "iPhone 6.5\" (1284x2778)"},
    "iphone_55": {"width": 414, "height": 736, "dpr": 3, "label": "iPhone 5.5\" (1242x2208)"},
    "ipad_129": {"width": 1024, "height": 1366, "dpr": 2, "label": "iPad 12.9\" (2048x2732)"},
    "ipad_11": {"width": 834, "height": 1194, "dpr": 2, "label": "iPad 11\" (1668x2388)"},
}

SCREENS = [
    {"name": "01_login", "url": "/", "needs_auth": False},
    {"name": "02_home", "url": "/(tabs)/home", "needs_auth": True},
    {"name": "03_projects", "url": "/(tabs)/projects", "needs_auth": True},
    {"name": "04_ai_chat", "url": "/(tabs)/chat", "needs_auth": True},
    {"name": "05_team", "url": "/(tabs)/team", "needs_auth": True},
    {"name": "06_profile", "url": "/(tabs)/profile", "needs_auth": True},
]

AUTH_SCRIPT = """
async () => {
    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo@blueboxair.com', password: 'BBAReview2025!' })
    });
    const data = await res.json();
    if (data.success) {
        localStorage.setItem('authToken', data.token || 'demo-token');
        localStorage.setItem('technician', JSON.stringify(data.technician));
        localStorage.setItem('loginSource', data.source || 'demo');
        localStorage.setItem('tutorialCompleted', 'true');
        localStorage.setItem('onboardingCompleted', 'true');
    }
    return data.success;
}
"""

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    async with async_playwright() as p:
        for device_key, device_cfg in DEVICES.items():
            device_dir = os.path.join(OUTPUT_DIR, device_key)
            os.makedirs(device_dir, exist_ok=True)
            
            browser = await p.chromium.launch()
            context = await browser.new_context(
                viewport={"width": device_cfg["width"], "height": device_cfg["height"]},
                device_scale_factor=device_cfg["dpr"]
            )
            page = await context.new_page()
            
            # First take login screenshot (no auth needed)
            await page.goto(BASE_URL, timeout=30000)
            await page.wait_for_timeout(6000)
            path = os.path.join(device_dir, "01_login.png")
            await page.screenshot(path=path, full_page=False)
            print(f"  ✅ {device_key}/01_login.png")
            
            # Now authenticate
            await page.evaluate(AUTH_SCRIPT)
            await page.wait_for_timeout(1000)
            
            # Take authenticated screenshots
            for screen in SCREENS:
                if not screen["needs_auth"]:
                    continue
                await page.goto(f"{BASE_URL}{screen['url']}", timeout=30000)
                await page.wait_for_timeout(5000)
                path = os.path.join(device_dir, f"{screen['name']}.png")
                await page.screenshot(path=path, full_page=False)
                print(f"  ✅ {device_key}/{screen['name']}.png")
            
            await browser.close()
            print(f"✅ {device_cfg['label']} complete")

    # Print summary
    total = 0
    for device_key in DEVICES:
        device_dir = os.path.join(OUTPUT_DIR, device_key)
        count = len([f for f in os.listdir(device_dir) if f.endswith('.png')])
        total += count
        print(f"  {device_key}: {count} screenshots")
    print(f"\nTotal: {total} screenshots saved to {OUTPUT_DIR}")

asyncio.run(main())
