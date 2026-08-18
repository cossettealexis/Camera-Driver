# Slomins K26-SL Solar Outdoor Camera — Control4 Driver

## Overview

Complete Control4 driver for Slomins K26-SL Solar-Powered Outdoor Camera with CldBus API integration, MQTT event streaming, RTSP video streaming, battery management, and wake-on-demand support.

**Version:** 9  
**Package:** Slomins-outdoor-K26.c4z  
**Minimum Control4 OS:** 3.3.2+  
**Last Updated:** August 18, 2026

---

## Features

**Automatic Camera Discovery**
- Auto-populate IP Address, VID and MAC Address

**Streaming Support**
- H.265 (HEVC)
- H.264 (AVC)
- MJPEG
- Snapshot

**PTZ Support**
- No PTZ capabilities (fixed camera)

**Battery Management**
- Battery level monitoring (0-100%)
- Low battery alerts

**Two-Way Audio**
- Microphone control (Mute/Unmute)
- Speaker volume control (1-10)

**Motion Detection**
- Adjustable sensitivity (1-10)
- Motion event notifications
- Human detection
- Face detection (registered users and strangers)

---

## Available Actions

- **Take Snapshot** — Capture a still image from the camera
- **Initialize Camera** — Initialize camera connection and authentication
- **Mute Mic** — Mute the camera microphone
- **Unmute Mic** — Unmute the camera microphone
- **Turn up speaker volume** — Increase speaker volume by 1 level
- **Turn down speaker volume** — Decrease speaker volume by 1 level
- **Sensitivity =** — Set motion detection sensitivity (1-10)
- **Awake Camera** — Wake the camera from sleep mode

---

## Control4 Programming Events and Conditionals

### Events

- **Motion Detected** — When camera detects motion
- **Human Detected** — When camera detects a person
- **Face Detected** — When camera detects a face
- **Stranger Detected** — When camera detects an unknown face
- **Low Battery** — When battery level is low
- **Camera Online** — When camera comes online
- **Camera Offline** — When camera goes offline
- **Camera Restarted** — When camera reboots
- **Registered User Detected** — When camera detects a known registered user

### Conditionals

- **If sensing motion is** — True/False
- **If not sensing motion is** — True/False
- **If Mic is muted** — True/False
- **If Mic is unmuted** — True/False
- **If Speaker volume is** — 1 through 10
- **If battery level is** — 0 through 100
- **If Sensitivity is** — 1 through 10

---

## Version History

### v9 (Current)

- Updated documentation to align with the device features.

### v8

- Added restart option.

### v7

- Added firmware info.

### v6

- Auto-populate IP Address, VID and MAC Address.

### v4.0

- Removed PTZ capabilities

### v3.0

- Added Face Detection: Distinguish between registered users and strangers
- Added "Registered User Detected" event (fires when a named face is detected)
- Fixed version display showing 0 in Control4 Manage Drivers interface

---

## Support & Contact

- **Driver Version:** 9
- **Maintainer:** Slomins
- **Website:** [www.slomins.com](https://www.slomins.com)
- **Email:** [support@slomins.com](mailto:support@slomins.com)

---

## License

Copyright © 2025-2026 Slomins. All Rights Reserved.

This driver is proprietary software provided by Slomins for use with Slomins branded solar cameras and Control4 home automation systems. Unauthorized distribution, modification, or reverse engineering is prohibited.
