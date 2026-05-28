![slomins Logo](./contents/images/shield-logo.svg)

## Smart Outdoor Switch Driver Documentation

### Overview
This driver enables Control4 to integrate with a Tuya-based Smart Outdoor Switch (dual switch) using AES-256-CBC encrypted TCP communication and token-authenticated Tuya cloud API. It supports real-time control, status sync, and touchscreen UI integration.


### Features
- Control and monitor two switches (`switch_1`, `switch_2`)
- AES-256-CBC encrypted communication with local bridge
- Tuya OpenAPI token authentication for cloud commands
- Real-time feedback and UI icon updates
- Composer and UI support for toggle/status
- Dual proxy support: `uibutton` and `light_v2`

### Required Properties
| Property Name   | Type      | Description |
|----------------|-----------|-------------|
| `ClientId`     | `string`  | Tuya Cloud API client ID.                   |
| `ClientSecret` | `string`  | Tuya Cloud API client secret.               |
| `Contract`     | `string`  | Enables/disables driver cloud operations.   |    
| `UserId`       | `string`  | Tuya user identifier.                       |
| `DeviceId`     | `string`  | Unique Tuya device ID used for cloud and local control |
| `State_1`      | `boolean` | Reflects ON/OFF state of switch 1 |
| `State_2`      | `boolean` | Reflects ON/OFF state of switch 2 |
| `Debug Mode`   | `boolean` | Enables verbose logging for troubleshooting (auto-disables after 10 minutes) |

### Proxies
- **5001**: `uibutton` proxy for manual toggle of switch 1 & 2
- **5002**: `light_v2` proxy for syncing light state with Composer

### Network Binding
- **6001**: TCP connection for receiving state updates from local bridge
  - IP: `xx.xxx.xxx.xxx (Tuya bridge server)`
  - Port: `8081`
  - Data is sent in encrypted JSON format with deviceId and command type

### Driver Lifecycle
- `OnDriverInit`: Sets up initial state, generates API token, and opens TCP connection
- `OnDriverLateInit`: Used for UI refresh or delayed state sync
- `OnPropertyChanged`: Reconnects and refreshes state when `DeviceId` is updated

### Key Functions
- `TcpConnection()`: Opens and maintains secure TCP session with bridge
- `ReceivedFromNetwork()`: Decrypts and processes TCP commands (`switch_1`, `switch_2`)
- `SendUpdate()`: Updates Control4 UI and Composer icons based on state
- `UIRequest("TOGGLE")`: Handles UI toggle for each switch
- `SendCommandTuya()`: Sends switch ON/OFF command to Tuya OpenAPI
- `GetApiDeviceStatus()`: Polls cloud for real-time device status
- `ExecuteCommand()`: Called from Composer Actions (Turn On/Off Switch 1/2)

### Icons
Custom icons are used to reflect ON/OFF states visually  
- Supports: 70px, 90px, 300px assets

### Debugging
- `Debug Mode` logs decrypted TCP traffic and system actions
- Automatically disabled after 60 minutes to reduce log spam

### Installation Steps

1. **Add the driver in Composer:**
   - Drop the Smart Outdoor Switch driver into your project

2. **Configure Properties:**
   - Input the correct `DeviceId`
   - Enable `Debug Mode` temporarily if needed

3. **Initialize TCP:**
   - Ensure the bridge IP/port is reachable and logs show connection success

4. **Test Functionality:**
   - Toggle Outdoor Switch from UI and Composer
   - Confirm correct status is reflected on Control4 touchscreen

5. **Finalize Setup:**
   - Validate all connections
   - Turn off Debug Mode

### Change Log

**Version 3**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 2**  
- Updated driver documentation for clarity and completeness.

**Version 1**  
- Initial release with TCP and Tuya cloud support  
- Proxy-based UI ON/OFF toggle added  
- Real-time cloud status updates