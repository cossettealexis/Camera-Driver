# Smart-Camera-P160-SL — Control4 Driver

## Overview

Control4 driver responsible for API initialization, authentication, token generation, and secure token forwarding to a Node.js backend service.
This driver acts as an authentication bridge between Control4 and an external cloud platform.

**Version:** 0.1.0
**Package:** MyCameraDevice.c4z
**Minimum Control4 OS:** 3.3.2+

## Features

✅ **API Initialization**

- Initialize OpenAPI session
- Retrieve and store RSA public key
- Generate and persist Client ID

✅ **Authentication**

- Login or register user account
- RSA-OAEP encryption (via external service)
- HMAC-SHA256 request signing
- Auth token retrieval and storage

✅ **Token Relay**

- Forward auth token to Node.js backend
- Automatic retry logic
- Includes AppId, AppSecret and Auth Token

✅ **Status & Visibility**

- Driver status reporting
- Read-only token and connection indicators