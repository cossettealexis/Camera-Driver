# Slomins VD05 Video Doorbell — Control4 Driver

## Overview

Complete Control4 driver for Slomins VD05 Video Doorbell Camera with full CldBus API integration, MQTT event streaming, RTSP video streaming, doorbell functionality, and two-way audio support.

**Model:** VD05  
**Version:** 1.0.0  
**Minimum Control4 OS:** 3.3.2+  
**Device Type:** Video Doorbell with Camera

---

## Features

### 🔔 **Doorbell Functionality**
- Doorbell ring detection and notifications
- Two-way audio communication (intercom)
- Visitor notification with snapshot attachment
- Integration with Control4 doorbell events
- Chime trigger support

### 🎥 **Video Streaming**
- RTSP streaming support (H.264/H.265)
- Main stream (high quality) and sub stream (low quality)
- Dynamic RTSP URL generation with token authentication
- Format: `rtsp://IP:8554/streamtype=0` (sub) / `streamtype=1` (main)
- Snapshot capture via HTTP API

### 🔔 **Real-Time Event Detection**
- MQTT-based real-time event streaming over SSL (port 8884)
- Doorbell ring notifications with snapshot
- Motion detection with notification attachments
- Human detection
- Face detection
- Stranger detection
- Line crossing detection
- Region intrusion detection
- Camera online/offline status monitoring

### 🔐 **Security & Authentication**
- CldBus API integration with RSA-OAEP + SHA256 encryption
- HMAC-SHA256 signatures for API requests
- Secure token management (temp token, exchange token, auth token)
- MQTT over SSL/TLS (port 8884)
- OAuth-style authentication flow
- Pre-encrypted post data support for API calls

### 🌐 **Network Discovery**
- HTTP scan-based camera discovery (IP range scanning)
- SDDP (Simple Device Discovery Protocol) multicast discovery
- Automatic device binding to CldBus API
- Multi-device support via VID (Virtual ID)

### 📊 **Advanced Features**
- Multiple connection types (Camera, Network/MQTT, Keep-alive TCP)
- Configurable event intervals (default: 5 seconds)
- Alert and info notifications (enable/disable)
- MQTT auto-connect and reconnection
- HTTP polling mode (alternative to MQTT)
- PTZ support (Pan/Tilt/Zoom) - Note: VD05 has limited PTZ
- Preset management (8 presets)
- Custom authentication types: BASIC, DIGEST, NONE

---

## Requirements

- **Control4 Composer Pro** (version compatible with OS 3.3.2+)
- **Control4 OS** 3.3.2 or newer (required for C4:Crypto() RSA encryption)
- **Network Access** to:
  - Doorbell on local LAN:
    - HTTP: 8080 (API, snapshots)
    - RTSP: 8554 (video streaming)
    - TCP: 3333 (device communication)
    - TCP: 8081 (keep-alive connection)
  - CldBus API: `https://api.arpha-tech.com`
  - MQTT Broker: Port 8884 (SSL/TLS)
- **Slomins VD05 Video Doorbell** with firmware supporting CldBus protocol
- **Account credentials** for CldBus API (default: pyabu@slomins.com)
- **Power:** Wired (doorbell transformer or AC adapter)

---

## Device Specifications

**VD05 Video Doorbell**
- **Type:** Wired video doorbell camera
- **Power:** 16-24V AC (doorbell transformer) or POE
- **Resolution:** 1920x1080 (1080p), 1280x720 (720p), 640x480 (VGA)
- **Video Codec:** H.264, H.265
- **Field of View:** 180° wide angle
- **Night Vision:** IR LEDs
- **Audio:** Two-way audio (speaker + microphone)
- **Button:** Mechanical doorbell button with LED ring
- **Network:** Wi-Fi primary, Ethernet optional
- **Default IP:** DHCP assigned by router
- **VID:** Unique per device (obtained from CldBus API)
- **Ports:**
  - HTTP: 8080 (API, snapshots)
  - RTSP: 8554 (video streaming)
  - TCP: 3333 (device communication)
  - TCP: 8081 (keep-alive connection with auto-reconnect)
  - MQTT: 8884 (SSL/TLS events)

---

## Installation

### 1. Install Driver Package

1. Download `Slomins-doorbell-VD05.c4z`
2. Open **Control4 Composer Pro**
3. Navigate to **System Design** > **Agents & Drivers**
4. Click **Add Driver** > **Browse** and select the `.c4z` file
5. Driver will appear as "Slomins VD05 Video Doorbell"

### 2. Add Doorbell to Project

1. In Composer Pro, drag "Slomins VD05 Video Doorbell" to your room (typically Porch/Entry)
2. The driver will auto-initialize and attempt connection
3. Check the driver properties for configuration

### 3. Configure Doorbell Settings

Navigate to driver **Properties** tab:

#### **Required Settings:**
- **IP Address:** Doorbell's local IP (e.g., assigned by your router via DHCP)
- **VID:** Doorbell's Virtual ID from CldBus API (unique per device)
- **Account:** CldBus account email (default: pyabu@slomins.com)

#### **Optional Settings:**
- **HTTP Port:** Default 8080
- **RTSP Port:** Default 8554
- **Authentication Type:** BASIC (default), DIGEST, or NONE
- **Username/Password:** If authentication required (default: SystemConnect/123456)
- **PTZ Enabled:** Yes/No (default: Yes, limited on VD05)
- **Enable MQTT:** True/False (default: False, enable for real-time doorbell events)
- **Enable Alert Notifications:** True/False (default: True)
- **Enable Info Notifications:** True/False (default: True)
- **Event Interval:** 5000ms (default, 0-30000ms range)

#### **Advanced Settings:**
- **Base API URL:** https://api.arpha-tech.com (default)
- **ClientID:** OAuth client ID
- **Public Key:** RSA public key (auto-populated)

### 4. Initialize Doorbell

Use the **Actions** tab to initialize:

1. **Login/Register:** Authenticate with CldBus API
2. **Get Temp Token:** Retrieve temporary token
3. **Get Exchange Token:** Exchange for persistent token
4. **Get Devices:** List all devices on account
5. **Bind Device:** Bind doorbell to Control4 driver
6. **Initialize:** Complete initialization sequence

Or use the single action:
- **Initialize:** Runs full initialization sequence automatically

### 5. Test Streaming

Use **Actions** tab to test:

1. **Test Snapshot:** Verify snapshot URL generation
2. **Test Main Stream:** Test high-quality RTSP stream
3. **Test Sub Stream:** Test low-quality RTSP stream

Check the driver logs for RTSP URLs generated:
- Main: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=1`
- Sub: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=0`

### 6. Enable MQTT Events (Recommended for Doorbell)

For real-time doorbell ring notifications:

1. Set **Enable MQTT** property to **True**
2. Run action: **Get MQTT Info**
3. Run action: **Connect MQTT**
4. Verify connection in logs

Alternative: Use **HTTP Polling** for periodic status updates
- Action: **Start HTTP Polling**

### 7. Configure Control4 Doorbell Integration

1. In Composer Pro, go to **Programming**
2. Create doorbell automation:
   - **When:** "Doorbell Ring" event
   - **Then:** Trigger chime, lights, notifications, etc.
3. Use **Doorbell Ring** event for Control4 announcements
4. Optionally forward video to TVs or mobile app

---

## Usage

### Doorbell Ring Event

When someone presses the doorbell:
1. VD05 detects button press
2. MQTT event sent to driver
3. Driver triggers Control4 **"Doorbell Ring"** event
4. Snapshot captured automatically
5. Notification sent with visitor snapshot
6. Control4 automation triggered (chime, lights, etc.)

**Configure Doorbell Automation:**
- Go to **Programming** > **When** > Select doorbell > **Doorbell Ring**
- Add actions: Announce, send notification, turn on lights, etc.

### Live Video Streaming

1. In Control4 app, navigate to doorbell camera
2. Tap camera to view live stream
3. Driver automatically generates RTSP URL with authentication token
4. View visitor at door in real-time

**Manual RTSP Access:**
- Main Stream: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=1`
- Sub Stream: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=0`

### Two-Way Audio (Intercom)

**Via Control4 App:**
1. Open doorbell camera view
2. Tap microphone/speaker icon
3. Speak to visitor through doorbell speaker
4. Hear visitor through doorbell microphone

**Note:** Two-way audio requires Control4 app version that supports intercom on camera devices.

### Event Notifications

When MQTT is enabled, driver receives real-time events:
- **Doorbell Ring** → Notification with snapshot attachment
- Motion detected → Alert
- Human/Face/Stranger detected → Alerts
- Line crossing → Intrusion alert
- Camera online/offline → Status updates

**Configure in Properties:**
- **Enable Alert Notifications:** Doorbell ring, motion, intruder alerts
- **Enable Info Notifications:** Online/offline, restart events

### Camera Discovery

**HTTP Scan Discovery:**
1. Action: **Discover Cameras (HTTP Scan)**
2. Scans IP range (e.g., 192.168.1.1 to 192.168.1.50)
3. Set **IP Scan Range End** property (default: 50)
4. Finds doorbells on local network

**SDDP Discovery:**
1. Action: **Discover Cameras (SDDP)**
2. Sends multicast discovery packets
3. Doorbells respond with device info
4. Faster than HTTP scan

### Snapshot Capture

**Snapshot URL format:**
```
http://[YOUR_DOORBELL_IP]:8080/tmp/snap.jpeg
```

Or use dynamic snapshot action:
- Action: **Test Snapshot**
- Checks **Last Snapshot URL** property for result

### PTZ Control (Limited)

VD05 has limited PTZ functionality:
- Digital zoom only (no mechanical pan/tilt)
- Preset positions not available on doorbell
- Use PTZ actions for zoom control only

---

## Properties Reference

### Network Settings
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| IP Address | STRING | (DHCP assigned) | Doorbell's local IP address |
| HTTP Port | INTEGER | 8080 | Port for API and snapshots |
| RTSP Port | INTEGER | 8554 | Port for RTSP streaming |
| Authentication Type | LIST | BASIC | BASIC, DIGEST, or NONE |
| Username | STRING | SystemConnect | HTTP authentication username |
| Password | PASSWORD | 123456 | HTTP authentication password |

### Device Identification
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| VID | STRING | (unique per device) | Virtual device ID from CldBus |
| Product ID | STRING | VD05 | Doorbell model identifier |
| Device Name | STRING | VD05 | Friendly device name |
| Account | STRING | pyabu@slomins.com | CldBus account email |

### Streaming Settings
| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Stream Path | STRING | stream1 | Legacy RTSP stream path |
| Snapshot URL Path | STRING | /GetSnapshot | Legacy snapshot path |
| Default Resolution | LIST | 1280x720 | 640x480, 1280x720, 1920x1080 |
| PTZ Enabled | LIST | Yes | Enable PTZ controls (limited on VD05) |

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
| Enable Alert Notifications | LIST | True | Doorbell ring, motion, intruder alerts |
| Enable Info Notifications | LIST | True | Online/offline, restart events |

### Status Properties (Read-Only)
| Property | Type | Description |
|----------|------|-------------|
| Status | STRING | Driver initialization status |
| Online | STRING | Doorbell online status (true/false) |
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
| Bind Device | Bind doorbell to driver |

### Streaming Actions
| Action | Description |
|--------|-------------|
| Test Snapshot | Test snapshot URL generation |
| Test Main Stream | Test high-quality RTSP stream |
| Test Sub Stream | Test low-quality RTSP stream |

### Discovery Actions
| Action | Description |
|--------|-------------|
| Discover Cameras (HTTP Scan) | Scan IP range for doorbells |
| Discover Cameras (SDDP) | Multicast SDDP discovery |

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
| Get Camera Properties | Retrieve doorbell properties |
| Update UI Properties | Update Control4 UI |

---

## Events

The driver triggers Control4 events for automation:

| Event ID | Event Name | Description |
|----------|------------|-------------|
| 1 | Motion Detected | Doorbell detected motion (alert, with snapshot) |
| 2 | Doorbell Ring | Button pressed - primary doorbell event |
| 3 | Face Detected | Face detected at door |
| 4 | Clip Recorded | Video clip saved |
| 6 | Camera Online | Doorbell came online |
| 7 | Camera Offline | Doorbell went offline |
| 8 | Camera Restarted | Doorbell rebooted |
| 9 | Line Crossing | Line crossing detection |
| 10 | Region Intrusion | Region intrusion detection |

**Event Automation Examples:**
Use Control4 programming to:
- Ring physical chime when doorbell pressed
- Announce "Someone is at the front door"
- Send push notification to mobile devices
- Turn on porch lights when doorbell rings
- Display video on TVs when motion detected
- Record video clip on doorbell ring

---

## Troubleshooting

### Doorbell Not Ringing in Control4

**Check:**
1. MQTT is enabled and connected
2. **Enable Alert Notifications** is set to **True**
3. Doorbell button is functioning (test locally)
4. Event automation is configured in Control4 Programming

**Action:**
1. Run **Connect MQTT** to establish connection
2. Verify MQTT connection in logs
3. Press doorbell button and check driver logs for "Doorbell Ring" event
4. Configure Control4 automation for doorbell ring event

### Doorbell Not Initializing

**Check:**
1. IP address is correct and doorbell is reachable
2. Account credentials are valid
3. VID matches the actual device
4. Doorbell is powered on and connected to network
5. Power supply is adequate (16-24V AC)

**Action:** Run **Initialize** action and check logs

### No Video Stream

**Check:**
1. RTSP port 8554 is open and accessible
2. Main/Sub Stream URL properties are populated
3. Network bandwidth is sufficient for streaming

**Action:**
1. Run **Test Main Stream** or **Test Sub Stream**
2. Check generated RTSP URL in logs
3. Verify network connectivity to doorbell

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

### Two-Way Audio Not Working

**Check:**
1. Control4 app version supports intercom on cameras
2. Audio permissions enabled on mobile device
3. Network has sufficient bandwidth for audio streaming
4. Doorbell microphone and speaker are functional

**Action:**
1. Test audio locally with Slomins app
2. Verify RTSP stream includes audio track
3. Check Control4 app settings for audio support

### Snapshot Not Capturing

**Check:**
1. HTTP Port 8080 is accessible
2. Authentication credentials are correct
3. Snapshot path is valid

**Action:**
1. Run **Test Snapshot** action
2. Check **Last Snapshot URL** property
3. Test URL in browser: `http://[YOUR_DOORBELL_IP]:8080/tmp/snap.jpeg`

### Discovery Not Finding Doorbell

**HTTP Scan:**
- Ensure doorbell IP is within scan range
- Adjust **IP Scan Range End** property
- Doorbell must respond to HTTP on port 8080

**SDDP:**
- Doorbell must support SDDP protocol
- Multicast must be enabled on network
- Check firewall allows multicast traffic

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

### Doorbell Shows Offline

**Check:**
1. Power supply is connected and adequate (16-24V AC minimum)
2. Wi-Fi signal strength is sufficient
3. Network has not changed (SSID/password)
4. Doorbell hasn't been reset

**Solution:**
1. Check physical power connection
2. Verify Wi-Fi connection on doorbell
3. Run **Get Camera Properties** action
4. Check **Online** property in driver

### Video Quality Issues

**Check:**
1. Network bandwidth is sufficient
2. Using appropriate stream (main vs sub)
3. Wi-Fi signal strength is good
4. Multiple devices not streaming simultaneously

**Solution:**
1. Use sub stream for lower bandwidth
2. Check network speed to doorbell
3. Move Wi-Fi access point closer if needed
4. Enable QoS for video traffic on router

---

## Technical Notes

### RTSP URL Format

The driver generates RTSP URLs in the format:
```
rtsp://[IP]:[PORT]/streamtype=[TYPE]
```

- **IP:** Doorbell IP address
- **PORT:** RTSP port (default 8554)
- **TYPE:**
  - `0` = Sub stream (low quality, low bandwidth)
  - `1` = Main stream (high quality, higher bandwidth)

**Example URLs:**
- Main: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=1`
- Sub: `rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=0`

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

### MQTT Event Format for Doorbell

Events received on MQTT topic: `{VID}/events`

**Doorbell Ring Example:**
```json
{
  "event": "doorbell_ring",
  "timestamp": 1708300000,
  "snapshot_url": "http://[DOORBELL_IP]:8080/snapshot/12345.jpg",
  "device_id": "[YOUR_DEVICE_VID]",
  "button": "pressed"
}
```

**Motion Detection Example:**
```json
{
  "event": "motion",
  "timestamp": 1708300000,
  "snapshot_url": "http://[DOORBELL_IP]:8080/snapshot/12346.jpg",
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
   - Hidden: True (doorbell button is primary interface)

2. **Network/MQTT Connection (6001):**
   - Type: TCP
   - Ports: 3333 (API), 554 (RTSP), 8884 (MQTT SSL)
   - Purpose: Network communication

3. **Keep-Alive Connection (7001):**
   - Type: TCP
   - Port: 8081
   - Features: Auto-connect, keep-alive, connection monitoring
   - Purpose: Persistent connection to doorbell

### Doorbell Button LED

VD05 has LED ring around button:
- **Solid White:** Normal operation, online
- **Pulsing White:** Processing (button pressed)
- **Red:** Offline or error
- **Blue:** Pairing/setup mode

### Power Requirements

- **Voltage:** 16-24V AC
- **Current:** Minimum 1A recommended
- **Source:** Doorbell transformer or dedicated AC adapter
- **Note:** Insufficient power may cause random disconnections

### Video Codec Support

- **H.264 (Recommended):** Widely compatible, lower bandwidth
- **H.265 (HEVC):** Better compression, higher quality, requires more CPU
- Control4 prefers H.264 for maximum compatibility

---

## Integration Examples

### Example 1: Doorbell Chime Automation

**Scenario:** Ring physical chime when doorbell pressed

**Programming:**
```
When: Slomins VD05 → Doorbell Ring
Then: 
  - Doorbell Chime → Activate
  - Wait 5 seconds
  - Doorbell Chime → Deactivate
```

### Example 2: Video Display on TV

**Scenario:** Show doorbell video on living room TV when pressed

**Programming:**
```
When: Slomins VD05 → Doorbell Ring
Then:
  - Living Room TV → Power On
  - Living Room TV → Select HDMI 1 (Control4 Matrix)
  - Control4 Matrix → Route Slomins VD05 to Living Room TV
  - Wait 30 seconds
  - Living Room TV → Return to Previous Input
```

### Example 3: Security Mode Integration

**Scenario:** Enhanced alerts when away

**Programming:**
```
When: Slomins VD05 → Motion Detected
If: Security System → State is "Away"
Then:
  - Send notification "Motion at front door while away"
  - Turn on: Porch Lights, Driveway Lights
  - Start recording: NVR Camera Group
  - Send snapshot to mobile app
```

### Example 4: Package Delivery Detection

**Scenario:** Alert on human detection during day

**Programming:**
```
When: Slomins VD05 → Human Detected
If: Time is between 9:00 AM and 6:00 PM
Then:
  - Announce "Delivery detected at front door"
  - Send notification with snapshot
  - Start recording for 2 minutes
```

---

## Support

For driver support, doorbell issues, or feature requests:

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
- Doorbell automation programming available

---

## Version History

**v1.0.0** (Current)
- Initial release
- CldBus API integration
- RTSP streaming support
- Doorbell ring detection
- Two-way audio support
- Motion and human detection
- MQTT event streaming
- HTTP polling mode
- Snapshot capture
- PTZ controls (digital zoom)
- Control4 event integration

---

## License

Copyright © 2025 Slomins. All Rights Reserved.

This driver is proprietary software provided by Slomins for use with Slomins branded video doorbells and Control4 home automation systems. Unauthorized distribution, modification, or reverse engineering is prohibited.

---

## Appendix: Quick Reference

### Default Ports
- **HTTP:** 8080
- **RTSP:** 8554
- **TCP:** 3333, 8081
- **MQTT:** 8884 (SSL)

### Example Device
- **Model:** VD05
- **IP:** Assigned by your router (DHCP)
- **VID:** Unique per device

### RTSP URLs
- **Main:** rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=1
- **Sub:** rtsp://[YOUR_DOORBELL_IP]:8554/streamtype=0

### Snapshot URL
- http://[YOUR_DOORBELL_IP]:8080/tmp/snap.jpeg

### Primary Events
- **Doorbell Ring** - Button pressed
- **Motion Detected** - Movement at door
- **Human Detected** - Person identified
- **Face Detected** - Face recognition
- **Camera Offline** - Connectivity lost

---

**End of Documentation**
