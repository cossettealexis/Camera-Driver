# Smart-Camera-P160-SL — Control4 Driver

## Overview

Complete Control4 driver for Slomins P160-SL IP Camera with full API integration, authentication, streaming, and real-time MQTT event detection.

**Version:** 8  
**Package:** Slomins-indoor-P160.c4z  
**Minimum Control4 OS:** 3.3.2+

---

## Features

**Full API Integration**
- Initialize camera and retrieve public key
- User authentication with RSA-OAEP encryption
- Token management (temporary and exchange tokens)
- Device listing
- Device information retrieval

**Automatic Camera Discovery**
- Auto-populate IP Address, VID and MAC Address

**Streaming Support**
- RTSP main stream (high quality H264/H265)
- RTSP sub stream (low quality)
- MJPEG streaming support
- Dynamic URL generation

**Camera Functions**
- Snapshot capture and URL generation
- Customizable device naming
- Memory card detection and monitoring

**Two-Way Audio**
- Microphone mute/unmute control
- Speaker volume adjustment (1-10 levels)
- Audio output support during live streaming

**Security**
- RSA-OAEP + SHA256 encryption using C4:Crypto()
- HMAC-SHA256 signatures for API requests
- Secure token storage
- Anti-pry alarm state monitoring

**Real-Time Event Detection (MQTT)**
- Motion detection with snapshot attachment
- Human detection alerts
- Camera online/offline status monitoring
- Memory card status notifications

---

## Version History

### v9 (Current)

- Updated documentation to align with the device features.

### v8

- Fixed the issue where events (Camera Offline, Camera Online, Human Detected, Motion Detected, Memory Card Not Detected) not triggering.

### v6

- Auto-populate IP Address, VID and MAC Address
- Automatic camera discovery on network

---

## Support & Contact

- **Driver Version:** 9
- **Maintainer:** Slomins
- **Website:** [www.slomins.com](https://www.slomins.com)
- **Email:** [support@slomins.com](mailto:support@slomins.com)

---

## License

Copyright © 2025 Slomins. All Rights Reserved.
