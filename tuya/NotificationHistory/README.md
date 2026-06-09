# Slomins Notification History — Control4 Driver

## Overview

Complete Control4 driver for viewing notification history from all Slomins devices (cameras, locks, doorbells, etc.) with video playback, device filtering, and automatic updates.

**Version:** 1  
**Package:** NotificationHistory.c4z  
**Minimum Control4 OS:** 3.3.2+  
**Created:** June 8, 2026

---

## Features

### ✅ Notification History
- View up to 20 most recent notifications across all devices
- Display device name, event type, timestamp, and thumbnail
- Automatic polling every 10 seconds for new events
- Formatted timestamps (e.g., "6/5/2026, 2:30 PM")

### ✅ Video Playback
- HTML5 video player with full controls (play/pause, seek, volume)
- AWS S3 pre-signed URLs (auto-refreshed)
- Direct playback in Control4 interface
- Thumbnail preview for each notification

### ✅ Device Filtering
- Dropdown to filter notifications by device
- Shows device name and type (e.g., "Outdoor Camera(Solar)")
- "All Devices" option to view complete history
- Filter persists during automatic updates

### ✅ MAC Address Validation
- Validates Control4 MAC address against Slomins API
- Secures account access to authorized systems only
- Auto-sets MAC on driver installation
- Re-authenticates when MAC or email changes

### ✅ Modern UI
- Dark theme matching Control4 interface
- Responsive design for touch panels and mobile
- Real-time updates every 10 seconds
- Professional video player controls

---

## Requirements

- **Control4 Composer Pro** (for driver installation)
- **Control4 OS** 3.3.2 or newer
- **Slomins Account** with registered devices
- **Network Access** to api.arpha-tech.com and AWS S3
- **Valid MAC Address** registered with Slomins

---

## Installation

### 1. Install Driver Package

1. Open **Control4 Composer Pro**
2. Go to **Drivers** menu → **Add Driver** → **Install From File**
3. Select `NotificationHistory.c4z`
4. Click **Install**
5. Driver will appear in available drivers list

### 2. Add Device to Project

1. Go to **Project** view
2. Select a room
3. Click **Add Device**
4. Search for "Notification History"
5. Add to room

### 3. Configure Properties

The driver auto-configures most settings. Only set if needed:

**Required (Auto-Set):**
- **MacAddress**: Auto-detected from Control4 system
- **Base API URL**: `https://api.arpha-tech.com` (pre-configured)
- **Account**: Default account email (pre-configured)

**Optional:**
- **Shieldlink Account Email**: Set your Slomins account email to override default

**Security:**
- **Validation API URL**: MAC validation endpoint (pre-configured)

---

## Quick Start Guide

### First Use

```
1. Install driver → Driver auto-initializes
   ↓
2. MAC address validated automatically
   ↓
3. Driver authenticates with API
   ↓
4. Devices fetched automatically
   ↓
5. Notification history loads
   ↓
6. Access from Control4 Navigator/Touch Panels
```

### Accessing Notification History

1. Navigate to the room where driver is installed
2. Find **Notification History** device
3. Click to open
4. WebView UI displays with notification list
5. Use dropdown to filter by device (optional)
6. Click thumbnail to play video

---

## Using the Interface

### Notification List

Each notification shows:
- **Thumbnail**: Preview image of event
- **Device Name**: "Outdoor Camera(Solar)", "Video Lock(Wi-Fi)", etc.
- **Event Type**: Motion, Person, Doorbell, etc.
- **Timestamp**: When event occurred
- **Video Duration**: Length of video clip (if available)

### Playing Videos

1. Click notification thumbnail
2. Video player opens with controls:
   - Play/Pause button
   - Timeline scrubber
   - Volume control
   - Current time / Total duration
3. Video loads from AWS S3
4. Full-screen support (browser dependent)

### Filtering by Device

1. Click **"Filter by Device"** dropdown (top of list)
2. Select device name or "All Devices"
3. List updates to show only selected device
4. Filter persists during auto-refresh

---

## Available Actions

Access via: **Device → Actions → Select action → Execute**

### Testing
- **Test: Fetch Clips** - Manually fetch notification history

---

## Driver Properties

| Property | Type | Description |
|----------|------|-------------|
| **MacAddress** | STRING | Control4 system MAC (auto-set, validated) |
| **Shieldlink Account Email** | STRING | Your Slomins account email (triggers re-auth) |
| **Validation API URL** | STRING | MAC validation endpoint |
| **Base API URL** | STRING | CldBus API base URL |
| **Account** | STRING | Account email for authentication |
| **ClientID** | STRING | Auto-generated UUID for this driver |
| **Public Key** | STRING | RSA public key from init API |
| **Auth Token** | STRING | Bearer token for API requests (secured) |
| **AppId** | STRING | Application identifier (cldbus) |
| **AppSecret** | STRING | Application secret (password protected) |
| **Status** | STRING | Current driver status (read-only) |

---

## How It Works

### Initialization Flow

1. **OnDriverInit()**
   - Loads properties
   - Connects to TCP server (tuyadev.slomins.net:8081)
   - Schedules camera initialization

2. **OnDriverLateInit()**
   - Sets MAC address from Control4 system
   - Validates MAC with Slomins API
   - Clears data if validation fails

3. **InitializeCamera()**
   - Generates ClientID (UUID)
   - Calls `/api/v3/openapi/init`
   - Retrieves RSA public key
   - Proceeds to login

4. **LoginOrRegister()**
   - Encrypts account with RSA-OAEP
   - Authenticates via `/api/v3/openapi/auth/login-or-register`
   - Stores auth token
   - Sends token to distribution server

5. **TCP Token Receive**
   - Receives encrypted AppId and AppSecret
   - Decrypts with AES-256-CBC
   - Updates properties

6. **GET_DEVICES()**
   - Fetches device list from `/api/v3/openapi/devices-v2`
   - Builds device array
   - Sends device list to UI

7. **FETCH_NOTIFICATION_HISTORY()**
   - Queries `/api/v3/openapi/notifications/query`
   - Fetches 20 most recent notifications
   - Sends to UI
   - Starts 10-second polling timer

### Data Flow

```
Driver (Lua) → ICON_CHANGED + UPDATE_UI → WebView (JavaScript)
                                              ↓
                                    onDataToUi() receives data
                                              ↓
                                    Routes by data.type:
                                    - "history" → Update notifications
                                    - "device_list" → Update dropdown
```

### Polling Strategy

- **Interval**: 10 seconds
- **Protection**: In-flight guard prevents overlapping requests
- **Auto-refresh**: UI updates automatically without reload
- **Filter persistence**: Selected device filter maintained

---

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v3/openapi/init` | POST | Get RSA public key |
| `/api/v3/openapi/auth/login-or-register` | POST | Authenticate user |
| `/api/v3/openapi/devices-v2` | GET | List all devices |
| `/api/v3/openapi/notifications/query` | POST | Fetch notification history |

**External Services:**
- `http://54.90.205.243:5000/lndu-encrypt` - RSA encryption API
- `http://54.90.205.243:3000/send-to-control4` - Token distribution

---

## Troubleshooting

### No Notifications Showing

**Check:**
1. MAC address validated (Status: "MAC address validated")
2. Account email correct
3. Auth Token populated in properties
4. At least one device in account
5. Network can reach api.arpha-tech.com

**Action:**
1. Check Composer logs for: `📹 VIDEO CLIPS FOUND: X`
2. Run **Test: Fetch Clips** action
3. Verify `Total devices fetched: X` in logs

### MAC Validation Failed

**Check:**
1. MacAddress property contains valid MAC
2. Validation API accessible
3. MAC registered with Slomins
4. Network allows HTTPS to qa2.slomins.com

**Action:**
1. Verify MAC in properties
2. Check logs for validation errors
3. Contact Slomins support to register MAC

### Device Filter Empty

**Check:**
1. Auth Token valid
2. GET_DEVICES() called (check logs)
3. Devices exist in account
4. WebView received device data

**Action:**
1. Reload notification history UI
2. Check logs: `Total devices fetched: X`
3. Verify: `✅ Sent device list to UI`

### Video Won't Play

**Check:**
1. Video URL valid (not expired)
2. Network can reach AWS S3
3. Video file exists for notification

**Action:**
1. Wait 10 seconds for URL refresh
2. Check if thumbnail loads
3. Test video URL in browser
4. Verify notification has video_url field

### Polling Stopped

**Check:**
1. Driver running (no crashes)
2. Auth token still valid
3. Network connection stable

**Action:**
1. Reload driver
2. Check logs for: `Polling notifications...`
3. Verify no API errors
4. Re-initialize if needed

### Authentication Failed

**Check:**
1. Account email valid
2. Public Key retrieved
3. Encryption API accessible (port 5000)
4. Network can reach external service

**Action:**
1. Check logs: `Camera initialized successfully`
2. Verify: `Public key received: [KEY]`
3. Check: `Login succeeded`
4. Verify Auth Token filled

---

## Advanced Configuration

### Change Polling Interval

Edit `driver.lua` line ~237:
```lua
local POLL_INTERVAL = 10000  -- milliseconds
```

Change to:
- `5000` for 5 seconds (more frequent)
- `30000` for 30 seconds (less frequent)

### Increase Notification Count

Edit `FETCH_NOTIFICATION_HISTORY()` line ~314:
```lua
local body = {
  page = 1,
  page_size = 20,  -- Change to 50
  vids = vids
}
```

### Customize Event Labels

Edit `www/contents/index.html` event type mapping:
```javascript
function getEventTypeLabel(type) {
  return {
    'motion_detected': 'Motion',
    'human_detected': 'Person',
    'doorbell': 'Doorbell',
    // Add custom types
  }[type] || type;
}
```

---

## Technical Details

### Video URL Expiration
- AWS S3 URLs valid for 15 minutes
- Auto-refreshed every 10 seconds via polling
- Continuous playback maintained

### TCP Communication
- **Server**: tuyadev.slomins.net:8081
- **Protocol**: TCP with AES-256-CBC encryption
- **Purpose**: Receive auth tokens and secrets
- **Delimiter**: `0d0a` (CRLF)

### UI Communication Pattern
Uses Control4 WebView pattern:
```javascript
// Subscribe to driver updates
C4.subscribeToDataToUi(false);

// Receive data
function onDataToUi(value) {
  var data = JSON.parse(JSON.parse(value).icon_description);
  // Process data
}
```

### Lua JSON Encoding Quirk
Lua tables encoded as objects, converted to arrays in JavaScript:
```javascript
function convertToArray(obj) {
  var arr = [];
  for (var key in obj) {
    if (obj.hasOwnProperty(key)) {
      arr.push(obj[key]);
    }
  }
  return arr;
}
```

---

## Developer Notes

### Debugging

1. **Composer Lua Output** - Detailed driver logs
2. **Browser Console** (F12) - WebView JavaScript errors
3. **Network Tab** - API request/response monitoring

### Key Log Messages

```
📹 VIDEO CLIPS FOUND: 20
Total devices fetched: 5
✅ Sent notification data to UI via UPDATE_UI
✅ Sent device list to UI via ICON_CHANGED
Polling notifications... (every 10 seconds)
```

### File Structure

```
NotificationHistory/
├── driver.lua           # Main driver logic
├── driver.xml           # Driver manifest
├── README.md            # This file
├── README.html          # HTML documentation
├── CldBusApi/           # Helper libraries
│   ├── dkjson.lua
│   ├── http.lua
│   ├── transport_c4.lua
│   ├── util.lua
│   └── auth.lua
└── www/
    └── contents/
        └── index.html   # WebView UI
```

---

## Support

For issues or questions:
- Check Composer Lua Output for error messages
- Verify all prerequisites met
- Review troubleshooting section
- Contact Slomins support with:
  - Driver version
  - Control4 OS version
  - Error messages from logs
  - MAC address (for validation)

---

## Version History

**1** (June 8, 2026)
- Initial release
- MAC address validation with Slomins API
- Device filtering dropdown
- Video playback with HTML5 player
- Auto-refresh every 10 seconds
- View up to 20 notifications across all devices
- Re-authentication on property change

---

**© 2026 Slomins, LLC. All Rights Reserved.**
