# Slomins VD05 Video Doorbell — Control4 Driver

## Overview

Complete Control4 driver for Slomins VD05 Video Doorbell Camera with full CldBus API integration, MQTT event streaming, RTSP video streaming, doorbell functionality, and two-way audio support.

**Model:** VD05  
**Version:** 12 
**Minimum Control4 OS:** 3.3.2+  
**Device Type:** Video Doorbell with Camera  
**Last Updated:** August 19, 2026

---

## Features

**Automatic Camera Discovery**
- Auto-populate IP Address and VID

**Streaming Support**
- H.264 (AVC)
- H.265 (HEVC)

**PTZ Support**
- No PTZ capabilities (fixed camera)

**Doorbell Functionality**
- Doorbell ring detection and notifications
- Anti-pry alarm detection
- Visitor notification with snapshot attachment

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
- Stranger detection
- Registered user detection

---

## Available Actions

- **Take Snapshot** — Capture a still image from the camera
- **Initialize Camera** — Initialize camera connection and authentication
- **Wake Camera** — Wake the camera from sleep mode
- **Mute Mic** — Mute the camera microphone
- **Unmute Mic** — Unmute the camera microphone
- **Turn up speaker volume** — Increase speaker volume by 1 level
- **Turn down speaker volume** — Decrease speaker volume by 1 level
- **Sensitivity =** — Set motion detection sensitivity (1-10)
- **Show device information** — Display device information
- **Test Doorbell Event** — Test doorbell event trigger

---

## Control4 Programming Events and Conditionals

### Events

- **Motion Detected** — When camera detects motion
- **Human Detected** — When camera detects a person
- **Stranger Detected** — When camera detects an unknown person
- **Doorbell Ring** — When doorbell button is pressed
- **Low Battery** — When battery level is low
- **Camera Online** — When camera comes online
- **Camera Offline** — When camera goes offline
- **Camera Restarted** — When camera reboots
- **Anti Pry alarm is triggered** — When anti-pry alarm is triggered
- **Registered User Detected** — When camera detects a known registered user

### Conditionals

- **If sensing motion** — True/False
- **If not sensing motion** — True/False
- **If Mic is muted** — True/False
- **If Mic is unmuted** — True/False
- **If Speaker volume is** — 1 through 10
- **If battery level is** — 0 through 100
- **If Sensitivity is** — 1 through 10

---

## Version History

### v11 (Current)

- Updated documentation to align with the device features.

### v10.0

- Bug fixes - Online and Offline push notifications
- Custom Ui for Facial Recognition Configuration
- Added Restart feature

### v9.0

- Added firmware info.

### v8.0

- Fixed Timeline display issue - events now appear in both Timeline and Event History
- Added CAMERA_EVENT notifications to Camera Proxy for Timeline integration

### v7.0

- Auto-populate IP Address, VID and MAC Address

### v6.0

- Fixed doorbell button response delay for programmed Control4 actions

---

## Support & Contact

- **Driver Version:** 11
- **Maintainer:** Slomins
- **Website:** [www.slomins.com](https://www.slomins.com)
- **Email:** [support@slomins.com](mailto:support@slomins.com)

---

## License

Copyright © 2025 Slomins. All Rights Reserved.

This driver is proprietary software provided by Slomins for use with Slomins branded video doorbells and Control4 home automation systems. Unauthorized distribution, modification, or reverse engineering is prohibited.
