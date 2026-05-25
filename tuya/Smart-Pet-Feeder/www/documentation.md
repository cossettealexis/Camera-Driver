![Slmoins logo](./contents/images/shield-logo.svg)

## Smart Pet Feeder Documentation

### Overview
This driver integrates Control4 with a Tuya-based Smart Pet Feeder using both secure AES-256-CBC encrypted TCP communication and Tuya cloud API interaction. It supports real-time feeding control, switch toggling, status updates, and dynamic UI feedback.

### Features
- Cloud + TCP-based bi-directional communication  
- AES-256-CBC decryption for secure TCP messages  
- Real-time feeding and switch control from UI  
- Status synchronization with Control4 properties and UI  
- Access token management for Tuya OpenAPI  
- Manual feed control via Composer and UI  
- Dynamic icon update on UI using `uibutton` proxy  

### Required Properties
- **DeviceId**: Tuya device identifier for the pet feeder  
- **ManualFeed**: Reflects the last manual feed value (optional)  
- **Debug Mode**: Enables console logs and auto-disables after 10 mins  

### Proxies
- **5001**: `uibutton` proxy for triggering feeding or switch control  

### Network Binding
- **6001**: TCP connection to cloud bridge server (encrypted)  
  - IP: `tuya.slomins.com`  
  - Port: `8081`  

### Driver Lifecycle
- `OnDriverInit`: Initializes TCP connection and sets device state  
- `OnDriverLateInit`: Sends current icon state to UI  
- `OnPropertyChanged`: Reacts to `DeviceId` or `ManualFeed` property updates  

### Key Functions

- **TcpConnection()**  
  Establishes encrypted TCP session with Tuya relay server.

- **ReceivedFromNetwork()**  
  Decrypts base64-encoded AES-256-CBC TCP messages and extracts `switch` status.

- **SendUpdate()**  
  Sends extracted data to UI and triggers `ICON_CHANGED` and `UPDATE_UI`.

- **UIRequest("SetManualFeed" / "SetSwitch")**  
  Sends cloud command to Tuya for feeding or toggling switch.

- **HandleSelect()**  
  Triggers UI update with the last manual feed status.

- **setDeviceCommand()**  
  Posts `manual_feed` or `switch` command to Tuya OpenAPI using access token.

- **GetApiDeviceStatus()**  
  Fetches latest feeder status (`manual_feed`, `switch`, `battery_percentage`) from cloud.

- **GenerateToken()**  
  Authenticates with Tuya cloud and retrieves access token.

- **CalculateSignature / WithAccessToken()**  
  HMAC-SHA256 signing required for Tuya API requests.

- **StringToSign()**  
  Generates signature base string for Tuya OpenAPI.

### Device Status Handling

Extracted Tuya `code` values and mapped behavior:

| Code                 | Type           | Description                               |
|----------------------|----------------|-------------------------------------------|
| `ClientId`           | String         | Tuya Cloud API client ID.                 |
| `ClientSecret`       | String         | Tuya Cloud API client secret.             |
| `Contract`           | String         | Enables/disables driver cloud operations. |    
| `UserId`             | String         | Tuya user identifier.                     |
| `manual_feed`        | Integer        | Feed count or trigger flag                |
| `switch`             | Boolean        | Power or activity status                  |
| `battery_percentage` | Integer        | Battery level (if supported)              |

All values are sent to the UI as JSON via `SendUpdate()`.

### Events Fired

- `ICON_CHANGED` → When `manual_feed` or `switch` value changes  
- `UPDATE_UI` → Triggered after a UI or cloud update  
- Manual property update (e.g., `ManualFeed`) upon successful cloud command 

### Icons
icons are dynamically displayed in UI  
(Recommended: 70px / 90px / 300px SVG or PNG files)

### Debugging
Set `Debug Mode` to `On` in Composer to enable logs.  
Debug mode auto-disables after 10 minutes using `gDebugTimer`.

### Installation Steps

1. **Import the driver into your Control4 project:**
   - Open ComposerPro and add the Smart Lock driver.

2. **Set Required Properties:**
   - Enter Tuya `DeviceId` under Properties.
   - Optionally enable `Debug Mode` for testing.

3. **TCP & Cloud Sync:**
   - Verify `TcpConnection()` logs and `ReceivedFromNetwork()` triggers status sync.
   - Confirm API-based status sync and ticket generation via Lua logs.

4. **Cloud Integration:**
   - Trigger SetManualFeed or SetSwitch from UI or Composer.
   - Validate GenerateToken() and command status logs.

5. **UI Test:**
   - Tap UI button and ensure icon updates and values are reflected.
   - Confirm ICON_CHANGED and UPDATE_UI are sent to proxy.

6. **Verify & Finalize:**
   - Ensure values sync correctly and disable Debug Mode for production.
   - Save and back up your Composer project.

### Change log

**Version 12**
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 11**  
- Updated driver documentation for clarity and completeness.

**Version 10**  
- Synced device status with UI when the device is turned on/off manually.

**Version 9**  
- Encrypted driver code to enhance security.

