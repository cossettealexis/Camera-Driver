![slomins Logo](./contents/images/shield-logo.svg)
## Smart Dimmer Switch Driver Documentation

### Overview
This driver integrates a Tuya-based Smart Dimmer Switch with Control4, supporting secure cloud communication, local TCP encryption, and real-time dimming updates via proxy and UI.

### Features
- AES-256-CBC encrypted TCP communication for status updates
- Light level control via `light_v2` proxy and Alexa emulation
- Dynamic UI updates including icon state
- Full proxy and UI button support for user interaction
- Manual and cloud-based dimmer level syncing

### Required Properties
- **Tcp Port**:  TCP server port used by the driver to establish the network connection.
- **MacAddress**: Control 4 Mac Address.
- **ClientId**: Tuya Cloud API client ID.
- **ClientSecret**: Tuya Cloud API client secret.
- **Contract**: Enables/disables driver cloud operations.
- **UserId**: Tuya user identifier.
- **DeviceId**: The Tuya device ID of the dimmer switch
- **State**: Represents current ON/OFF status of the dimmer
- **Level**: Integer from 0–100 indicating brightness level
- **Debug Mode**: Enables verbose log output for diagnostics
- **Device Response**: Mac Address Validation Message

### Proxies
- **5001**: `light_v2` proxy for light level and ON/OFF state 
- **5002**: `uibutton` proxy for manual UI toggle

### Network Binding
- **6001**: TCP connection for real-time event relay
  - IP: `xx.xxx.xxx.xxx (Tuya bridge server)`  
  - Port: `8081`  

### Driver Lifecycle
- `OnDriverInit`: Setup and TCP initialization
- `OnDriverLateInit`: Sync UI state and fetch latest level
- `OnPropertyChanged`: React to `DeviceId`, `Debug Mode` or other changes

### Key Functions
- **TcpConnection()**: Handles encrypted TCP link to server
- **ReceivedFromNetwork()**: Parses Tuya messages and updates state/level
- **SendUpdate()**: Pushes brightness level and state to UI
- **SetSwitchLevel(level)**: Adjusts brightness via Tuya API
- **UIRequest("SetSwitchLevel")**: Triggered from proxy for brightness changes
- **UIRequest("SetSwitchOnOff")**: Sends ON/OFF to cloud API
- **ExecuteCommand()**: Composer actions ON/OFF/SetLevel
- **GetApiDeviceStatus()**: Tuya status query for sync

### Alexa Support (Light Proxy)
- Supports `LIGHT_BRIGHTNESS_CHANGED`, `SET_BRIGHTNESS_TARGET` to emulate Alexa dimming behavior

### Icons
Includes icon sets for ON/OFF states with brightness indication  
- Sizes: 70px, 90px, 300px (used in Navigator and touch UIs)

### Debugging
- `Debug Mode` logs encrypted/decrypted traffic and key driver actions.
- Auto-disabled after 60 minutes.

### Installation Steps

1. **Add the driver to Composer:**
   - Drag the Smart Dimmer Switch driver into your project.

2. **Configure Properties:**
   - Enter the `DeviceId`
   - Enable `Debug Mode` if needed

3. **Check TCP Log Output:**
   - Confirm `TcpConnection()` and `ReceivedFromNetwork()` are active

4. **Test Brightness Control:**
   - Use UI or Composer to change levels and verify updates

5. **Final Testing:**
   - Validate icon and state changes on touchscreen and app

6. **Save and Exit:**
   - Disable Debug Mode and finish setup

### Change Log
**Version 122**  
- SDH-1194 - Apply To option is not showing other dimmers or switches on the list

**Version 121**  
- SDH-1154 - Fetch Client ID & Client Secret directly from REST API (remove Node.js dependency)

**Version 120**  
- TCI-829 - Drivers establish TCP connections using multiple ports with the TCP Port property.

**Version 119**  
- TCI-356 - Client ID and Secret Solution -  Solution by entering MAC Address in Property Section and validate MAC

**Version 118**  
- TCI-245 - Develop a way to show the list of devices for Agents as part of driver creating scenes 

**Version 117**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 116**  
- Updated driver documentation for clarity and completeness.

**Version 115**  
-  toggle command add if handle from control4 programming menu

**Version 114**  
- Synced device status with UI when the device is turned on/off manually.

**Version 113**  
- Encrypted driver code to enhance security.

