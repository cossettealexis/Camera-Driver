# My Camera Devices — Control4 Driver

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


✅ **MAC + Email Validation (Security Layer)**

Provides a security gate that validates the Control4 controller before allowing any API interaction.

####  Purpose

- Restricts access to authorized devices only
- Prevents unauthorized API usage
- Ensures email and controller MAC pairing is valid

---

###  Validation Flow

1. User enters **Composer Pro Email**
2. Driver retrieves controller MAC using `C4:GetUniqueMAC()`
3. MAC address is normalized into standard format (`XX:XX:XX:XX:XX:XX`)
4. Email and MAC are validated against a local whitelist
5. If validation succeeds:
   - Initialization and authentication proceed
6. If validation fails:
   - Execution is blocked immediately

---

# Enforcement Points

* Validation is enforced at critical stages of the driver lifecycle:
* On Composer Pro Email property change, acting as an early validation gate.
* Before executing device retrieval (GET_DEVICES), preventing unauthorized API access.
⚠️ If validation fails, execution is immediately stopped.


---

# Future Enhancement (API-Based Validation)

* The current local validation mechanism will eventually be replaced or supplemented with a remote API-based system.
* Planned improvements include:
* Dynamic management of users and devices without updating the driver.
* Centralized backend validation for enhanced security.
* Improved scalability for multiple controllers.

The existing validation flow remains unchanged; ValidateLocal will be extended to call the API.

--- 


# Notes

* MAC normalization ensures consistent comparisons across formats.
* Validation is currently local for speed and reliability.
* Acts as a security checkpoint before any API or cloud communication.
* Easily extendable for multiple users and devices.
* Future API integration will automate validation without manual driver updates.

---

# License

Copyright © 2025 Slomins. All Rights Reserved.