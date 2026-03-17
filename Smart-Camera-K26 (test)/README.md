# Slomins K26-SL Solar Outdoor Camera — Control4 Driver

## Overview

Complete Control4 driver for Slomins K26-SL Solar-Powered Outdoor Camera with CldBus API integration, MQTT event streaming, RTSP video streaming, battery management, and wake-on-demand support.
# Smart-Camera-K26 — README (technical)

Purpose: Control4 driver for K26-based Tuya cameras with CldBus API integration, MQTT events, and notification handling.

Key files
- `driver.lua` — main driver: init, auth flows, MQTT, device events, notification flow, URL generation.
- `mqtt_manager.lua` — MQTT helper for connections and message handling.
- `driver.xml` — driver manifest and properties.
- `CldBusApi/*` — helper libs: `dkjson.lua`, `http.lua`, `transport_c4.lua`, `util.lua`, `sha256.lua`, `auth.lua`.

Default camera settings (defined in `driver.lua` via `CameraDefaultProps`)
- HTTP Port: 8080
- RTSP Port: 8554
- Main Stream path: stream0
- Sub Stream path: stream1
- Snapshot path: tmp/snap.jpeg

Initialization flow
1. `OnDriverInit()` populates `_props` and initializes MQTT helper.
2. `InitializeCamera()` calls the remote init endpoint to fetch the public key.
3. `LoginOrRegister()` encrypts credentials (RSA-OAEP via external helper) and stores tokens.
4. `OnDriverLateInit()` pushes camera IP/port/auth to Camera Proxy and generates `Main Stream URL` / `Sub Stream URL` for the Control4 UI.

Notifications
- Events are processed by `HANDLE_JSON_EVENT()`; images are located via `GetImageForEvent()` and normalized with `normalize_http_url()`.
- Notification queue uses `NOTIFICATION_URLS` and `NOTIFICATION_QUEUE` to provide attachments to Control4.

Auth & MQTT
- `APPLY_MQTT_INFO()` requests broker details and credentials then calls `MQTT.connect()`.
- Tokens may be received via TCP; `UpdateAuthToken()` stores them and updates properties.

Maintainer notes
- Remove camera-specific properties from `driver.xml` if you want the driver to rely solely on `CameraDefaultProps`.
- Keep `transport.execute(req, callback)` usage consistent when editing network calls.
- Use `normalize_http_url()` when decoding signed/escaped URLs from API responses.

Quick dev commands (PowerShell)
```powershell
git status
git add Smart-Camera-K26/driver.lua Smart-Camera-K26/README.md
git commit -m "Fix driver runtime errors; rely on CameraDefaultProps; update README"
```

If you want, I can run a further pass to tidy spacing, remove unused variables, or inline small helpers.
| Stop HTTP Polling | Stop HTTP polling |

### Utility Actions
| Action | Description |
|--------|-------------|
| Test Push Notification | Send test notification |
| Get Camera Properties | Retrieve camera properties |
| Update UI Properties | Update Control4 UI |

---

## Events

The driver triggers Control4 events for automation:

| Event ID | Event Name | Description |
|----------|------------|-------------|
| 1 | Motion Detected | Camera detected motion (alert, with snapshot) |
| 2 | Human Detected | Person identified in frame |
| 3 | Face Detected | Face detected (known or unknown) |
| 5 | Stranger Detected | Unknown face detected |
| 6 | Camera Online | Camera came online |
| 7 | Camera Offline | Camera went offline |
| 8 | Camera Restarted | Camera rebooted |
| 9| Battery Low | Battery below 20% |

**Event Automation Examples:**
Use Control4 programming to:
- Turn on outdoor lights when motion detected
- Send push notification on human detection
- Display snapshot on TVs when stranger detected
- Alert when battery low
- Trigger security system on line crossing

---

## Troubleshooting

### Camera Not Waking Up

**Check:**
1. Camera has sufficient battery charge (check **Battery Level** property)
2. Solar panel receiving adequate sunlight
3. Camera is online and reachable on network
4. SDDP discovery working (test with **Discover Cameras (SDDP)**)

**Action:**
1. Run **Wake Camera (SDDP)** action
2. Wait full 7 seconds before accessing stream
3. Check battery level - charge if below 20%
4. Verify camera online status

### No Video Stream

**Check:**
1. Camera is awake (7-second wake delay required)
2. RTSP port 8554 is open and accessible
3. Main/Sub Stream URL properties are populated
4. Battery level is sufficient (above 20%)
5. Network bandwidth is adequate

**Action:**
1. Run **Wake Camera (SDDP)** first
2. Wait 7 seconds
3. Run **Test Main Stream** or **Test Sub Stream**
4. Check generated RTSP URL in logs
5. Verify network connectivity to camera

### Camera Not Initializing

**Check:**
1. IP address is correct and camera is reachable
2. Account credentials are valid
3. VID matches the actual device
4. Camera is powered on (check battery level)
5. Wi-Fi connection is stable

**Action:** Run **Initialize** action and check logs

### MQTT Events Not Working

**Check:**
1. **Enable MQTT** property is set to **True**
2. MQTT broker info is retrieved (Host, Port, Client ID, Secret)
3. Port 8884 is accessible
4. Network firewall allows MQTT over SSL

**Action:**
1. Run **Get MQTT Info** to populate MQTT settings
2. Run **Connect MQTT** to establish connection
3. Check **MQTT Host** and **MQTT Port** properties are filled
4. Verify in logs: "MQTT Connected"

### Battery Draining Too Fast

**Check:**
1. Solar panel receiving direct sunlight (4+ hours/day minimum)
2. Too many streaming requests (each wake drains battery)
3. Event interval too short (increase from 5000ms)
4. MQTT generating too many events

**Solution:**
1. Reposition camera for better solar exposure
2. Reduce unnecessary streaming
3. Increase event interval to 10000ms or higher
4. Use HTTP polling instead of MQTT if too many events
5. Disable info notifications, keep only alerts

### Snapshot Not Capturing

**Check:**
1. Camera is awake (run **Wake Camera (SDDP)** first)
2. HTTP Port 8080 is accessible
3. Authentication credentials are correct
4. Battery level sufficient

**Action:**
1. Wake camera and wait 7 seconds
2. Run **Test Snapshot** action
3. Check **Last Snapshot URL** property
4. Test URL in browser: `http://[YOUR_CAMERA_IP]:8080/tmp/snap.jpeg`

### Discovery Not Finding Camera

**HTTP Scan:**
- Ensure camera IP is within scan range
- Adjust **IP Scan Range End** property
- Camera must respond to HTTP on port 8080
- Camera may be asleep (use SDDP instead)

**SDDP:**
- Camera must support SDDP protocol (K26-SL does)
- Multicast must be enabled on network
- Check firewall allows multicast traffic
- SDDP also wakes sleeping cameras

### Authentication Failures

**Check:**
1. **Account** property has valid CldBus email
2. **Public Key** is retrieved from API
3. **Base API URL** is correct (https://api.arpha-tech.com)
4. Network can reach API endpoint

**Action:**
1. Run **Login/Register** action
2. Check for "Authentication successful" in logs
3. Verify **Temp Token** property is populated

### Camera Shows Offline

**Check:**
1. Battery is charged (check **Battery Level** property)
2. Solar panel working (check physical condition)
3. Wi-Fi signal strength is sufficient
4. Network has not changed (SSID/password)
5. Camera hasn't been reset

**Solution:**
1. Charge battery via USB if solar insufficient
2. Verify Wi-Fi connection on camera
3. Run **Get Camera Properties** action
4. Check **Online** property in driver

### Solar Panel Not Charging

**Check:**
1. Panel clean and unobstructed
2. Direct sunlight exposure (not shaded)
3. Panel cable connected properly
4. Battery not damaged (check voltage)

**Solution:**
1. Clean solar panel surface
2. Reposition camera for better sun exposure
3. Verify physical connections
4. Replace battery if damaged

---

## Technical Notes

### RTSP URL Format

The driver generates RTSP URLs in the format:
```
rtsp://[IP]:[PORT]/streamtype=[TYPE]
```

- **IP:** Camera IP address
- **PORT:** RTSP port (default 8554)
- **TYPE:**
  - `0` = Sub stream (low quality, low bandwidth)
  - `1` = Main stream (high quality, higher bandwidth)

**Example URLs:**
- Main: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=1`
- Sub: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=0`

### CldBus API Authentication Flow

1. **Initialize Camera:**
   - GET `/v1/init` → Retrieve RSA public key

2. **Login/Register:**
   - Encrypt account with RSA-OAEP-SHA256
   - POST `/v1/LoginOrRegisterUser` → Get temporary token

3. **Get Temp Token:**
   - Generate HMAC-SHA256 signature
   - GET `/v1/TempTokenGet` → Verify temp token

4. **Exchange Token:**
   - POST `/v1/TempTokenExchange` → Get exchange token

5. **Bind Device:**
   - POST `/v1/BindDeviceToUser` → Associate VID with account

6. **Ongoing API Calls:**
   - Use `Authorization: Bearer [auth_token]` header
   - HMAC signature on each request

### MQTT Event Format

Events received on MQTT topic: `{VID}/events`

**Motion Detection Example:**
```json
{
  "event": "motion",
  "timestamp": 1708300000,
  "snapshot_url": "http://[CAMERA_IP]:8080/snapshot/12345.jpg",
  "device_id": "[YOUR_DEVICE_VID]",
  "battery_level": 75
}
```

**Human Detection Example:**
```json
{
  "event": "human",
  "timestamp": 1708300000,
  "snapshot_url": "http://[CAMERA_IP]:8080/snapshot/12346.jpg",
  "device_id": "[YOUR_DEVICE_VID]"
}
```

**Battery Alert Example:**
```json
{
  "event": "battery_low",
  "timestamp": 1708300000,
  "battery_level": 15,
  "device_id": "[YOUR_DEVICE_VID]"
}
```

Driver parses events and triggers corresponding Control4 events.

### Connection Types

The driver maintains multiple connections:

1. **Camera Connection (5001):**
   - Type: CAMERA
   - Facing: 6 (bidirectional)
   - Purpose: Control4 camera proxy interface
   - Hidden: True

2. **Network/MQTT Connection (6001):**
   - Type: TCP
   - Ports: 3333 (API), 8554 (RTSP), 8884 (MQTT SSL)
   - Purpose: Network communication

3. **Keep-Alive Connection (7001):**
   - Type: TCP
   - Port: 8081
   - Features: Auto-connect, keep-alive, connection monitoring
   - Purpose: Persistent connection to camera

### Battery & Power Management

**Solar Charging:**
- Built-in solar panel continuously charges battery
- Requires 4+ hours direct sunlight per day
- Optimal: 6-8 hours full sun exposure
- Battery: Rechargeable lithium 5000mAh (typical)

**Wake-on-Demand:**
- Camera sleeps when inactive to save battery
- 7-second wake delay when accessing
- Auto-wake on streaming requests
- Auto-wake on initialization
- SDDP wake command supported

**Battery Conservation Tips:**
- Minimize streaming frequency
- Use sub stream instead of main stream
- Increase event interval (10000ms+)
- Disable info notifications (keep only alerts)
- Ensure good solar panel exposure

### Encryption Level 2

Driver uses encryption level 2 for source code protection:
- `<devicedata encryption="2">` in driver.xml
- `<script file="driver.lua" encryption="2"/>` in driver.xml
- Protects driver.lua source code in .c4z package
- Prevents unauthorized modification

### Video Codec Support

- **H.264 (Recommended):** Widely compatible, lower bandwidth
- **H.265 (HEVC):** Better compression, higher quality, requires more CPU
- Control4 prefers H.264 for maximum compatibility

---

## Integration Examples

### Example 1: Motion-Activated Lights

**Scenario:** Turn on outdoor lights when motion detected

**Programming:**
```
When: Slomins K26-SL → Motion Detected
Then: 
  - Outdoor Lights → Turn On
  - Wait 5 minutes
  - Outdoor Lights → Turn Off
```

### Example 2: Security Alert on Human Detection

**Scenario:** Alert when person detected at night

**Programming:**
```
When: Slomins K26-SL → Human Detected
If: Time is between 10:00 PM and 6:00 AM
Then:
  - Send notification "Person detected outside"
  - Turn on: All Outdoor Lights
  - Start recording: NVR Camera Group
  - Send snapshot to mobile app
```



### Example 3: Battery Low Alert

**Scenario:** Notify when battery needs attention

**Programming:**
```
When: Slomins K26-SL → Battery Low
Then:
  - Send notification "K26 camera battery low - check solar panel"
  - Log: System event
```

**Programming:**
```
When: Slomins K26-SL → Line Crossing
If: Security System → State is "Armed"
Then:
  - Send notification "Perimeter breach detected"
  - Turn on: Perimeter Lights
  - Start recording for 5 minutes
  - Display snapshot on security panel
```

---

## Support

For driver support, camera issues, or feature requests:

**Slomins Support:**
- Website: www.slomins.com
- Email: support@slomins.com
- Phone: Customer service hotline

**CldBus API Issues:**
- API Endpoint: https://api.arpha-tech.com
- Contact: API support via Slomins

**Control4 Integration:**
- Requires Control4 Composer Pro for installation
- Compatible with Control4 OS 3.3.2 and newer
- Camera automation programming available

---

## Building the Driver

### Files Structure

```
Slomins-outdoor-K26/
├── driver.lua              # Main driver logic
├── driver.xml              # Configuration & metadata
├── mqtt_manager.lua        # MQTT event streaming & broker management
├── README.md               # This documentation
├── CldBusApi/              # API helper libraries
│   ├── auth.lua
│   ├── dkjson.lua
│   ├── http.lua
│   ├── sha256.lua
│   ├── transport_c4.lua
│   └── util.lua
└── build-c4z.ps1           # Build script
```

### Build Package

Run in PowerShell:
```powershell
.\build-c4z.ps1
```

This creates `Slomins-outdoor-K26-v1.1.0.c4z` ready for installation.

### Manual Build

```powershell
# Zip driver files
$files = @(
    "driver.lua",
    "driver.xml",
    "mqtt_manager.lua",
    "README.md",
    "CldBusApi\*.lua"
)

Compress-Archive -Path $files -DestinationPath "temp.zip"
Rename-Item "temp.zip" "Slomins-outdoor-K26.c4z"
```

---

## Version History

**v1.1.0** (Current)
- CldBus API integration (api.arpha-tech.com)
- RTSP streaming support (streamtype=0/1 format)
- Battery management and monitoring
- Solar power support
- Wake-on-demand (7-second delay)
- MQTT event streaming over SSL (port 8884)
- Real-time detection (motion, human, face, stranger)
- SDDP discovery and wake command
- HTTP polling mode
- Snapshot capture with wake support
- PTZ controls with presets
- Encryption level 2 for driver protection
- Multi-device support via VID

---

## License

Copyright © 2025 Slomins. All Rights Reserved.

This driver is proprietary software provided by Slomins for use with Slomins branded solar cameras and Control4 home automation systems. Unauthorized distribution, modification, or reverse engineering is prohibited.

---

## Appendix: Quick Reference

### Default Ports
- **HTTP:** 8080
- **RTSP:** 8554
- **TCP:** 3333, 8081
- **MQTT:** 8884 (SSL)

### Example Device
- **Model:** K26-SL (solar_box_cam)
- **IP:** Assigned by your router (DHCP)
- **VID:** Unique per device
- **Wake Delay:** 7 seconds

### RTSP URLs
- **Main:** rtsp://[YOUR_CAMERA_IP]:8554/streamtype=1
- **Sub:** rtsp://[YOUR_CAMERA_IP]:8554/streamtype=0

### Snapshot URL
- http://[YOUR_CAMERA_IP]:8080/tmp/snap.jpeg

### Primary Events
- **Motion Detected** - Movement in frame
- **Human Detected** - Person identified
- **Face Detected** - Face recognition
- **Stranger Detected** - Unknown person
- **Battery Low** - Battery below 20%
- **Camera Offline** - Connectivity lost

## 🔔 Real-Time Event Detection
 
The driver supports **MQTT-based real-time event streaming over SSL (port 8884)** and provides notifications for the following events:
 
* Doorbell ring notifications with snapshot
* Motion detection with snapshot attachment
* Human detection
* Face detection
* Stranger detection
* Camera online/offline status monitoring
 
---
 
## MQTT Configuration
 
### Default Behavior
 
MQTT is **enabled automatically by the driver after authentication**.
 
The driver will automatically:
 
1. Enable MQTT
2. Fetch MQTT credentials
3. Connect to the MQTT broker
4. Subscribe to camera event topics
 
You normally **do not need to enable MQTT manually**.
 
---
 
## CldBus App Motion Detection Settings
 
To receive **Motion Detection** and **Human Detection** events, detection must be enabled in the **CldBus mobile app**.
 
### Steps
 
1. Open the **CldBus App**
2. Select your **camera device**
3. Tap **Settings**
4. Navigate to:
 
```
Settings → Motion Detection
```
 
5. Under **Detection Type**, select one of the following:
 
| Detection Type | Description |
|----------------|-------------|
| **All Detections** | All movement events will trigger notifications. This includes general motion detection. |
| **Human Detection** | Only human movement will trigger events. Non-human motion will be ignored. |
 
 
## Push Notification Configuration
 
### 1. Create Push Notification
 
1. Open **Composer Pro**
2. Navigate to:
 
```
Agents → Push Notification
```
 
3. Click **Add Notification** then enter a name for the notification.
 
Configure the following:
 
| Setting  | Value           |
| -------- | --------------- |
| Category | Cameras         |
| Severity | Info / Critical |
| Subject  | Camera Event    |
 
Click **Save**.
 
---
 
### 2. Enable Snapshot Attachment
 
Edit the created notification and set:
 
```
Attachment Type = Snapshot URL
```
 
This allows push notifications to include the **camera snapshot image**.
 
---
 
### Mapping Push Notifications in Programming
 
1. In **Composer Pro**, open **Programming**.

2. Select the **Camera Driver** from the device list.

3. In the **Events** section, choose the event you want to trigger the notification (for example **Motion Detected**).
 
On the **right-side panel**:
 
4. Click **Push Notifications**.

5. From the dropdown list, select the **notification you created earlier**.

6. Drag and drop the notification into the programming area **or double-click the green arrow** to add it.
 
This maps the camera event to the push notification.
 
Example:
 
 
WHEN Motion Detected

THEN Send Push Notification
 
## Notification Flow
 
```
Camera Event (MQTT)
        ↓
Driver Receives Event
        ↓
Driver Processes Event
        ↓
Control4 Event Triggered
        ↓
Push Notification Agent
        ↓
Mobile Notification Sent
        ↓
Snapshot Image Attached
```
 
---
 
 
 
 
 
 
 
### Battery Tips
- Ensure 4+ hours direct sunlight daily
- Keep solar panel clean
- Minimize streaming frequency
- Use sub stream to save battery
- Monitor battery level regularly

---

**End of Documentation**