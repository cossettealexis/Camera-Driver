# Slomins K26-SL Solar Outdoor Camera — Control4 Driver

## Overview

Complete Control4 driver for Slomins K26-SL Solar-Powered Outdoor Camera with CldBus API integration, MQTT event streaming, RTSP video streaming, battery management, and wake-on-demand support.

**Model:** K26-SL (solar_box_cam)  
**Version:** 1.1.0  
**Minimum Control4 OS:** 3.3.2+  
**Device Type:** Solar-Powered Outdoor Security Camera  
**Encryption:** Level 2 (Driver source code encrypted)

---

## Features

### 🔋 **Battery & Solar Power Management**
- Solar-powered with rechargeable battery
- Battery status monitoring
- Wake-on-demand (7-second wake delay for power conservation)
- Auto wake on initialization
- Wake before streaming to activate camera
- SDDP wake command support
- Sleep mode when inactive

### 🎥 **Video Streaming**
- RTSP streaming support (H.264/H.265)
- Main stream (high quality) and sub stream (low quality)
- Dynamic RTSP URL generation with authentication
- Format: `rtsp://IP:8554/streamtype=0` (sub) / `streamtype=1` (main)
- Snapshot capture via HTTP API
- 7-second wake delay before streaming starts

### 🚨 **Real-Time Event Detection**
- MQTT-based event streaming over SSL (port 8884)
- Motion detection with snapshot
- Human detection
- Face detection
- Stranger detection (unknown face)
- Intruder detection
- Line crossing detection
- Region intrusion detection
- Camera online/offline status
- Battery level alerts

### 🔐 **Security & Authentication**
- CldBus API integration with RSA-OAEP + SHA256 encryption
- HMAC-SHA256 signatures for API requests
- Secure token management (temp token, exchange token, auth token)
- MQTT over SSL/TLS (port 8884)
- OAuth-style authentication flow
- Driver encryption level 2 (source code protected)

### 🌐 **Network Discovery**
- HTTP scan-based camera discovery (IP range scanning)
- SDDP (Simple Device Discovery Protocol) multicast discovery
- SDDP wake command for battery-powered cameras
- Automatic device binding to CldBus API
- Multi-device support via VID (Virtual ID)

### 📊 **Advanced Features**
- Multiple connection types (Camera, Network/MQTT, Keep-alive TCP)
- Configurable event intervals (default: 5 seconds)
- Alert and info notifications (enable/disable)
- MQTT auto-connect and reconnection
- HTTP polling mode (alternative to MQTT)
- PTZ support (Pan/Tilt/Zoom with presets)
- Preset management (8 presets)
- Custom authentication types: BASIC, DIGEST, NONE

---

## Requirements

- **Control4 Composer Pro** (version compatible with OS 3.3.2+)
- **Control4 OS** 3.3.2 or newer (required for C4:Crypto() RSA encryption)
- **Network Access** to:
  - Camera on local LAN:
    - HTTP: 8080 (API, snapshots)
    - RTSP: 8554 (video streaming)
    - TCP: 3333 (device communication)
    - TCP: 8081 (keep-alive connection)
  - CldBus API: `https://api.arpha-tech.com`
  - MQTT Broker: Port 8884 (SSL/TLS)
- **Slomins K26-SL Solar Camera** with firmware supporting CldBus protocol
- **Account credentials** for CldBus API (default: pyabu@slomins.com)
- **Power:** Solar panel + rechargeable battery (no wiring required)

---

## Device Specifications

**K26-SL Solar Outdoor Camera**
- **Type:** Solar-powered outdoor security camera
- **Power:** Solar panel with rechargeable lithium battery
- **Battery Life:** Up to 6 months on full charge (depending on usage)
- **Solar Panel:** Built-in panel for continuous charging
- **Resolution:** 1920x1080 (1080p), 1280x720 (720p), 640x480 (VGA)
- **Video Codec:** H.264, H.265
- **Field of View:** 110° diagonal
- **Night Vision:** IR LEDs up to 30ft
- **Audio:** One-way audio (microphone)
- **Weatherproof:** IP65 rated
- **Network:** Wi-Fi 2.4GHz
- **Default IP:** DHCP assigned by router
- **VID:** Unique per device (obtained from CldBus API)
- **Wake Delay:** 7 seconds (battery conservation mode)
- **Ports:**
  - HTTP: 8080 (API, snapshots)
  - RTSP: 8554 (video streaming)
  - TCP: 3333 (device communication)
  - TCP: 8081 (keep-alive connection with auto-reconnect)
  - MQTT: 8884 (SSL/TLS events)

---

## Installation

### 1. Install Driver Package

1. Download `Slomins-outdoor-K26.c4z`
2. Open **Control4 Composer Pro**
3. Navigate to **System Design** > **Agents & Drivers**
4. Click **Add Driver** > **Browse** and select the `.c4z` file
5. Driver will appear as "Slomins K26-SL Solar Camera"

### 2. Add Camera to Project

1. In Composer Pro, drag "Slomins K26-SL Solar Camera" to your room (typically Outdoor/Driveway/Backyard)
2. The driver will auto-initialize and attempt connection
3. Check the driver properties for configuration

### 3. Configure Camera Settings

Navigate to driver **Properties** tab:

#### **Required Settings:**
- **IP Address:** Camera's local IP (DHCP assigned by router)
- **VID:** Camera's Virtual ID from CldBus API (unique per device)
- **Account:** CldBus account email (default: pyabu@slomins.com)

#### **Optional Settings:**
- **HTTP Port:** Default 8080
- **RTSP Port:** Default 8554
- **Authentication Type:** BASIC (default), DIGEST, or NONE
- **Username/Password:** If authentication required (default: SystemConnect/123456)
- **PTZ Enabled:** Yes/No (default: Yes)
- **Enable MQTT:** True/False (default: False, enable for real-time events)
- **Enable Alert Notifications:** True/False (default: True)
- **Enable Info Notifications:** True/False (default: True)
- **Event Interval:** 5000ms (default, 0-30000ms range)

#### **Advanced Settings:**
- **Base API URL:** https://api.arpha-tech.com (default)
- **ClientID:** OAuth client ID
- **Public Key:** RSA public key (auto-populated)

### 4. Initialize Camera

Use the **Actions** tab to initialize:

1. **Login/Register:** Authenticate with CldBus API
2. **Get Temp Token:** Retrieve temporary token
3. **Get Exchange Token:** Exchange for persistent token
4. **Get Devices:** List all devices on account
5. **Bind Device:** Bind camera to Control4 driver
6. **Initialize:** Complete initialization sequence

Or use the single action:
- **Initialize:** Runs full initialization sequence automatically

### 5. Test Streaming (Battery-Powered)

**Important:** K26-SL is battery-powered and requires 7-second wake delay before streaming.

Use **Actions** tab to test:

1. **Wake Camera (SDDP):** Send wake command to camera
2. Wait 7 seconds for camera to wake up
3. **Test Snapshot:** Verify snapshot URL generation
4. **Test Main Stream:** Test high-quality RTSP stream
5. **Test Sub Stream:** Test low-quality RTSP stream

Check the driver logs for RTSP URLs generated:
- Main: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=1`
- Sub: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=0`

### 6. Enable MQTT Events (Recommended)

For real-time motion, human, and intruder detection:

1. Set **Enable MQTT** property to **True**
2. Run action: **Get MQTT Info**
3. Run action: **Connect MQTT**
4. Verify connection in logs

Alternative: Use **HTTP Polling** for periodic status updates
- Action: **Start HTTP Polling**

### 7. Configure Control4 Automation

1. In Composer Pro, go to **Programming**
2. Create automation for camera events:
   - **When:** "Motion Detected" event
   - **Then:** Send notification, turn on lights, start recording, etc.
3. Use events for security automation

---

## Usage

### Wake-On-Demand (Battery Conservation)

K26-SL enters sleep mode to conserve battery. Before accessing video:

**Automatic Wake:**
- Driver auto-wakes camera when streaming requested
- Driver auto-wakes on initialization
- 7-second delay before video available

**Manual Wake:**
- Action: **Wake Camera (SDDP)**
- Wait 7 seconds before accessing stream

### Live Video Streaming

1. In Control4 app, navigate to camera
2. Tap camera to view live stream
3. Driver automatically wakes camera and generates RTSP URL
4. Wait 7 seconds for camera to wake
5. Video stream starts

**Manual RTSP Access:**
- Main Stream: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=1`
- Sub Stream: `rtsp://[YOUR_CAMERA_IP]:8554/streamtype=0`

### Event Notifications

When MQTT is enabled, driver receives real-time events:
- **Motion detected** → Alert with snapshot
- **Human detected** → Person identified alert
- **Face detected** → Face recognition alert
- **Stranger detected** → Unknown person alert
- **Intruder detected** → Security alert
- **Line crossing** → Perimeter breach alert
- **Region intrusion** → Zone violation alert
- **Camera online/offline** → Status updates
- **Battery low** → Battery alert

**Configure in Properties:**
- **Enable Alert Notifications:** Motion, human, intruder alerts
- **Enable Info Notifications:** Online/offline, restart, battery events

### Camera Discovery

**HTTP Scan Discovery:**
1. Action: **Discover Cameras (HTTP Scan)**
2. Scans IP range (e.g., 192.168.1.1 to 192.168.1.50)
3. Set **IP Scan Range End** property (default: 50)
4. Finds cameras on local network

**SDDP Discovery:**
1. Action: **Discover Cameras (SDDP)**
2. Sends multicast discovery packets
3. Cameras respond with device info
4. Faster than HTTP scan
5. Also wakes sleeping cameras

### Snapshot Capture

**Snapshot URL format:**
```
http://[YOUR_CAMERA_IP]:8080/tmp/snap.jpeg
```

**Note:** Camera must be awake to capture snapshot. Driver auto-wakes if needed.

Or use dynamic snapshot action:
- Action: **Test Snapshot**
- Checks **Last Snapshot URL** property for result

### PTZ Control

Use PTZ actions to control camera:
- **Pan Left/Right:** Horizontal movement
- **Tilt Up/Down:** Vertical movement
- **Zoom In/Out:** Digital zoom
- **Go to Preset:** Move to saved position (8 presets available)

**Note:** PTZ requires camera to be awake (7-second delay).

### Battery Status

Monitor battery level:
- Check **Battery Level** property (percentage)
- MQTT events for low battery alerts
- Solar panel continuously charges battery
- Optimal placement: Direct sunlight for 4+ hours/day

---

## Properties Reference

### Network Settings
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| IP Address | STRING | (DHCP assigned) | Camera's local IP address |
| HTTP Port | INTEGER | 8080 | Port for API and snapshots |
| RTSP Port | INTEGER | 8554 | Port for RTSP streaming |
| Authentication Type | LIST | BASIC | BASIC, DIGEST, or NONE |
| Username | STRING | SystemConnect | HTTP authentication username |
| Password | PASSWORD | 123456 | HTTP authentication password |

### Device Identification
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| VID | STRING | (unique per device) | Virtual device ID from CldBus |
| Product ID | STRING | solar_box_cam | Camera model identifier |
| Device Name | STRING | K26-SL | Friendly device name |
| Account | STRING | pyabu@slomins.com | CldBus account email |

### Streaming Settings
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Stream Path | STRING | stream1 | Legacy RTSP stream path |
| Snapshot URL Path | STRING | /GetSnapshot | Legacy snapshot path |
| Default Resolution | LIST | 1280x720 | 640x480, 1280x720, 1920x1080 |
| PTZ Enabled | LIST | Yes | Enable PTZ controls |

### API & Authentication
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Base API URL | STRING | https://api.arpha-tech.com | CldBus API endpoint |
| ClientID | STRING | (auto) | OAuth client ID |
| Public Key | STRING | (auto) | RSA public key from API |
| Temp Token | STRING | (auto) | Temporary authentication token |
| Exchange Token | STRING | (auto) | Exchange authentication token |
| Auth Token | STRING | (auto) | Persistent auth token |

### MQTT Settings
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Enable MQTT | LIST | False | Enable real-time MQTT events |
| MQTT Host | STRING | (auto) | MQTT broker hostname |
| MQTT Port | STRING | (auto) | MQTT broker port (8884) |
| MQTT Client ID | STRING | (auto) | Unique MQTT client ID |
| MQTT Secret | PASSWORD | (auto) | MQTT authentication secret |

### Event Configuration
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Event Interval (ms) | INTEGER | 5000 | Event polling interval (0-30000ms) |
| Enable Alert Notifications | LIST | True | Motion, human, intruder alerts |
| Enable Info Notifications | LIST | True | Online/offline, battery events |

### Status Properties (Read-Only)
| Property | Type | Description |
|----------|------|-------------|
| Status | STRING | Driver initialization status |
| Online | STRING | Camera online status (true/false) |
| Battery Level | STRING | Battery percentage (0-100%) |
| Main Stream URL | STRING | Generated main RTSP URL |
| Sub Stream URL | STRING | Generated sub RTSP URL |
| Last Motion | STRING | Last motion detection timestamp |
| Last Snapshot URL | STRING | Last captured snapshot URL |
| Last Clip URL | STRING | Last recorded video clip URL |

---

## Actions Reference

### Initialization Actions
| Action | Description |
|--------|-------------|
| Initialize | Run full initialization sequence |
| Login/Register | Authenticate with CldBus API |
| Get Temp Token | Retrieve temporary token |
| Get Exchange Token | Exchange for persistent token |
| Get Devices | List all devices on account |
| Bind Device | Bind camera to driver |

### Streaming Actions
| Action | Description |
|--------|-------------|
| Wake Camera (SDDP) | Send wake command (7-sec delay) |
| Test Snapshot | Test snapshot URL generation |
| Test Main Stream | Test high-quality RTSP stream |
| Test Sub Stream | Test low-quality RTSP stream |

### Discovery Actions
| Action | Description |
|--------|-------------|
| Discover Cameras (HTTP Scan) | Scan IP range for cameras |
| Discover Cameras (SDDP) | Multicast SDDP discovery + wake |

### MQTT Actions
| Action | Description |
|--------|-------------|
| Get MQTT Info | Retrieve MQTT broker info |
| Connect MQTT | Connect to MQTT broker |
| Disconnect MQTT | Disconnect from MQTT |

### Polling Actions
| Action | Description |
|--------|-------------|
| Start HTTP Polling | Start periodic status polling |
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
| 4 | Clip Recorded | Video clip saved |
| 5 | Stranger Detected | Unknown face detected |
| 6 | Camera Online | Camera came online |
| 7 | Camera Offline | Camera went offline |
| 8 | Camera Restarted | Camera rebooted |
| 9 | Line Crossing | Line crossing detection triggered |
| 10 | Region Intrusion | Region intrusion detection triggered |
| 11 | Intruder Detected | Security threat detected |
| 12 | Battery Low | Battery below 20% |

**Event Automation Examples:**
Use Control4 programming to:
- Turn on outdoor lights when motion detected
- Send push notification on human detection
- Start recording on intruder alert
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

### Example 3: Intruder Alert Integration

**Scenario:** Trigger security system on intruder

**Programming:**
```
When: Slomins K26-SL → Intruder Detected
Then:
  - Security System → Trigger Alarm
  - Send notification "INTRUDER ALERT"
  - Turn on: All House Lights
  - Unlock: Panic Room Door
  - Call: Emergency Contact
```

### Example 4: Battery Low Alert

**Scenario:** Notify when battery needs attention

**Programming:**
```
When: Slomins K26-SL → Battery Low
Then:
  - Send notification "K26 camera battery low - check solar panel"
  - Log: System event
```

### Example 5: Perimeter Monitoring

**Scenario:** Alert on line crossing (property boundary)

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

## Version History

**v1.1.0** (Current)
- CldBus API integration (api.arpha-tech.com)
- RTSP streaming support (streamtype=0/1 format)
- Battery management and monitoring
- Solar power support
- Wake-on-demand (7-second delay)
- MQTT event streaming over SSL (port 8884)
- Real-time detection (motion, human, face, stranger, intruder)
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
- **Intruder Detected** - Security threat
- **Battery Low** - Battery below 20%
- **Camera Offline** - Connectivity lost

### Battery Tips
- Ensure 4+ hours direct sunlight daily
- Keep solar panel clean
- Minimize streaming frequency
- Use sub stream to save battery
- Monitor battery level regularly

---

**End of Documentation**
