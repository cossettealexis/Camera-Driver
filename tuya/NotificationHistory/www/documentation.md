![slomins Logo](./contents/images/shield-logo.svg)

## Smart Lock Driver Documentation

### Overview
This driver enables Control4 to integrate with a Tuya-based Smart Lock using secure AES-256-CBC encrypted TCP communication and Tuya cloud API interaction. It allows remote locking/unlocking, real-time status updates, and integration with UI and automation events.

### Features
- Bi-directional communication with the Tuya cloud and local TCP server  
- AES-256-CBC encrypted data reception over TCP  
- Password-free locking/unlocking using Tuya's temp ticket API  
- Real-time status synchronization with Control4 UI  
- Event-based automation (Lock / Unlock triggers)  
- Full proxy support for `lock` and `uibutton` proxies  

### Required Properties
- **ClientId**: Tuya Cloud API client ID.
- **ClientSecret**: Tuya Cloud API client secret.
- **Contract**: Enables/disables driver cloud operations.
- **UserId**: Tuya user identifier.
- **DeviceId**: The unique Tuya ID for the smart lock device  
- **State**: Reflects the current lock status ("lock" or "unlock")  
- **Debug Mode**: Enables verbose logging and auto-disables after 10 mins  

### Proxies
- **5001**: `uibutton` proxy for UI-based lock/unlock control  
- **5002**: `lock` proxy for status sync and integration  

### Network Binding
- **6001**: TCP connection to cloud bridge server (encrypted)  
  - IP: `xx.xxx.xxx.xxx` (Slomins Server IP)  
  - Port: `8081`  

### Driver Lifecycle
- `OnDriverInit`: Initializes state, token generation, TCP connection  
- `OnDriverLateInit`: Reserved for future UI refresh routines  
- `OnPropertyChanged`: Reacts to changes in `DeviceId` and `State`  

### Key Functions
- **TcpConnection()**: Establishes and maintains encrypted TCP session  
- **ReceivedFromNetwork()**: Decrypts and parses TCP status from Tuya bridge  
- **SendUpdate()**: Pushes UI status and icon updates to Control4  
- **UIRequest("SetLockUnlock")**: Handles UI-initiated commands  
- **ExecuteCommandOnOff(command, deviceId)**: Executes cloud-based lock/unlock  
- **GenearteTempKey()**: Creates temporary ticket required for Tuya control  
- **SendCommand()**: Posts cloud command to Tuya with access token  
- **GetApiDeviceStatus()**: Polls cloud for current lock status  
- **ExecuteCommand()**: Handles Composer commands (`Lock`, `Unlock`)  

### Lock State Handling
When `lock_motor_state` is:
- `false` / `nil`: Status is `unlock`  
- `true`: Status is `lock`  

This is reflected in UI and Composer via `LOCK_STATUS_CHANGED` event.

### Events Fired
- `LOCK_STATUS_CHANGED` → `"locked"` or `"unlocked"`  
- `Lock` / `Unlock` → Composer events on successful action  

### Icons
Lock and unlock icons are dynamically displayed in UI  
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

4. **Test Lock/Unlock:**
   - Lock/unlock from Composer Actions or UI and observe result in Lua log and touchscreen.

5. **Composer Events:**
   - Attach programming logic to `Lock` and `Unlock` events in Composer.

6. **Verify & Finalize:**
   - Confirm state sync and disable `Debug Mode`.
   - Save project.

### Change log

**Version 74**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 73**  
- Updated driver documentation for clarity and completeness.

**Version 72**  
- Synced device status with UI when the device is turned on/off manually.

**Version 71**  
- Encrypted driver code to enhance security.

