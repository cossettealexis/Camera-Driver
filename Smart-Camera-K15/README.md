# Slomins K15-SL PTZ Camera — Control4 Driver

## Overview

Complete Control4 driver for Slomins K15-SL PTZ IP Camera with full CldBus API integration, MQTT event streaming, RTSP video streaming, PTZ controls, and two-way audio support.

**Model:** K15-SL  
**Version:** 7  
**Minimum Control4 OS:** 3.3.2+  
**Device Type:** PTZ IP Camera  
**Last Updated:** August 18, 2026

---

## Features

**Automatic Camera Discovery**
- Auto-populate IP Address and VID

**Streaming Support**
- H.265 (HEVC)
- H.264 (AVC)
- MJPEG
- Snapshot

**PTZ Support**
- Pan (left/right) and Tilt (up/down) controls
- 8 preset positions
- Tracking mode
- No zoom capability

**Two-Way Audio**
- Microphone control (Mute/Unmute)
- Speaker volume control (1-10)

**Motion Detection**
- Motion event notifications
- Human detection

---

## Available Actions

- **Get Cloud Presets** — Fetch cloud preset spots from API
- **Go To Preset** — Move camera to a preset position
- **PTZ Up** — Move camera up
- **PTZ Down** — Move camera down
- **PTZ Left** — Move camera left
- **PTZ Right** — Move camera right
- **Take Snapshot** — Capture a still image from the camera
- **Initialize Camera** — Initialize camera connection and authentication
- **Mute Mic** — Mute the camera microphone
- **Unmute Mic** — Unmute the camera microphone
- **Turn up speaker volume** — Increase speaker volume by 1 level
- **Turn down speaker volume** — Decrease speaker volume by 1 level

---

## Control4 Programming Events and Conditionals

### Events

- **Motion Detected** — When camera detects motion
- **Human Detected** — When camera detects a person
- **Camera Online** — When camera comes online
- **Camera Offline** — When camera goes offline
- **Camera Restarted** — When camera reboots

### Conditionals

- **If sensing motion** — True/False
- **If not sensing motion** — True/False
- **If Mic is muted** — True/False
- **If Mic is unmuted** — True/False
- **If Speaker volume is 1-10** — 1 through 10
- **If tracking is on/off** — True/False

---

## Version History

### v7 (Current)

- Updated documentation to align with the device features.

### v6.0

- Added firmware info.

### v4.0

- Auto-populate IP Address, VID and MAC Address.

### v3.0

- Implemented functionality to store all incoming events in the database.

### v2.0

- Fixed version display showing 0 in Control4 Manage Drivers interface
- Fixed device specific conditionals labels not showing in Control4 Composer

### v1.0.2

- Removed hardcoded AppName

### v0.1.0

- Complete API integration
- RSA-OAEP encryption with C4:Crypto()
- User authentication
- Token management
- Device listing
- RTSP streaming URLs
- Snapshot support
- PTZ controls
- MQTT real-time event detection (SSL, port 8884)
- Push notification support with snapshot attachment

---

## Support & Contact

- **Driver Version:** 7
- **Maintainer:** Slomins
- **Website:** [www.slomins.com](https://www.slomins.com)
- **Email:** [support@slomins.com](mailto:support@slomins.com)

---

## License

Copyright © 2025 Slomins. All Rights Reserved.

This driver is proprietary software provided by Slomins for use with Slomins branded cameras and Control4 home automation systems. Unauthorized distribution, modification, or reverse engineering is prohibited.
