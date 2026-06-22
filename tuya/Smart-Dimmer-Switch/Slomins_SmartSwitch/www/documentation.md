![Smart Switch Diagram](./contents/images/shield-logo.svg)
## Smart Switch Driver Documentation

### Overview
This driver enables Control4 to integrate with a Tuya-based Smart Switch using secure AES-256-CBC encrypted TCP communication and cloud API interaction. It supports toggling the switch on/off and syncing device status to the UI.

### Features
- Bi-directional communication with the Tuya cloud and local TCP server  
- AES-256-CBC encrypted data reception over TCP  
- Full proxy support for `light_v2` and `uibutton` proxies  
- Dynamically updates icon and UI state  
- Supports Alexa light level emulation via `SetBrightnessTargetAlexa`  

### Required Properties
- **Tcp Port**:  TCP server port used by the driver to establish the network connection.
- **MacAddress**: Control 4 Mac Address.
- **ClientId**: Tuya Cloud API client ID.
- **ClientSecret**: Tuya Cloud API client secret.
- **Contract**: Enables/disables driver cloud operations.
- **UserId**: Tuya user identifier.
- **DeviceId**: The unique identifier of the Tuya switch device.  
- **State**: Reflects the current state of the switch ("on" or "off").  
- **Debug Mode**: Enables or disables debug logging.   
- **Device Response**: Mac Address Validation Message.

### Proxies
- **5001**: `light_v2` proxy handles ON/OFF commands and brightness transitions.  
- **5002**: `uibutton` proxy used for UI interaction and feedback.  

### Network Binding
- **6001**: TCP connection to cloud relay server (Tuya MQTT-HTTP bridge).  
  - IP: `xx.xxx.xxx.xxx (slomins server ip)`  
  - Port: `8081`   

### Driver Lifecycle
- `OnDriverInit`: Sets up TCP connection and initializes state  
- `OnDriverLateInit`: Refreshes icon and state UI via `HandleSelect`  
- `OnPropertyChanged`: Handles updates to `DeviceId` and `Debug Mode`  

### Key Functions
- **TcpConnection()**: Establishes persistent TCP link for real-time updates  
- **ReceivedFromNetwork()**: Decrypts and parses Tuya status data  
- **SendUpdate()**: Sends JSON data to UI and updates proxy icon/state  
- **UIRequest("SetSwitchOnOff")**: Sets switch state via Tuya OpenAPI  
- **SetSwitchOnOff()**: Sends command to cloud endpoint to turn switch ON/OFF  
- **GetApiDeviceStatus()**: Queries device status from Tuya cloud  
- **ExecuteCommand()**: Processes Composer actions (e.g., ON/OFF)  
- **RFP.SET_BRIGHTNESS_TARGET**: Used for Alexa emulation  

### Alexa Support (Light Proxy)
The driver emulates brightness control through `LIGHT_BRIGHTNESS_CHANGED` and `SET_BRIGHTNESS_TARGET` messages to support Alexa-style light control behavior.

### Icons
Dynamic icon states are provided for "on" and "off" via 70/90/300px sizes, integrated into navigator and UI.

### Debugging
Enabling `Debug Mode` will automatically turn off after 60 minutes to prevent log flooding. Logs are printed via `HandlerDebug()` and sent to Composer logs.
    
### Installation Steps

1. **Add the driver to your Control4 project:**
   - Open ComposerPro and drag the Smart Switch driver into the project tree.

2. **Set Driver Properties:**
   - Enter your Tuya `DeviceId`.
   - Enable `Debug Mode` if needed for troubleshooting. 

3. **Verify TCP Communication:**
   - Ensure the TCP link is established in the Lua tab logs (`TcpConnection()` and `ReceivedFromNetwork()`).

4. **Test ON/OFF Control:**
   - Trigger UI button or send `ON/OFF` from Composer and verify switch response.

5. **Check Logs & Sync:**
   - Use debug logs (`HandlerDebug()`) to verify status, property changes, or any communication errors.

6. **Finalize Configuration:**
   - Disable `Debug Mode` after verification.
   - Save the project and test from a touchscreen or mobile UI.


### Change log
**Version 96**  
- SDH-750 - Fixed the toggle issue.

**Version 95**  
- TCI-1194 - Apply To option is not showing other dimmers or switches on the list.

**Version 94**  
- TCI-853 - Advanced Lighting scenes for Smart Switch.
- SDH-1153 - Virtual Buttons under System Design when double click still is not showing.
- SDH-1154 - Fetch Client ID & Client Secret directly from REST API (remove Node.js dependency)

**Version 93**  
- TCI-829 - Drivers establish TCP connections using multiple ports with the TCP Port property.

**Version 92**  
- TCI-356 - Client ID and Secret Solution -  Solution by entering MAC Address in Property Section and validate MAC

**Version 91**  
- TCI-245 - Develop a way to show the list of devices for Agents as part of driver creating scenes 

**Version 90**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 89**  
- Updated driver documentation for clarity and completeness.

**Version 88**  
- Synced device status with UI when the device is turned on/off manually.

**Version 87**  
- Encrypted driver code to enhance security.


