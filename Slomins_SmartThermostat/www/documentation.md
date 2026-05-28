![slomins Logo](./contents/images/shield-logo.svg)

## Smart Thermostat Driver Documentation

### Overview 
This driver enables Control4 to integrate with a Tuya-based Smart Thermostat using secure AES-256-CBC encrypted TCP communication and Tuya cloud API interaction. It provides control of HVAC mode, setpoints, real-time status updates, and integration with UI and automation events.

  
### Contents of a Control4 Driver Template

This section provides a definition of the files that are delivered within a Control4 Driver Template that require modification by the driver developer.

- **`actions.lua`** – This .lua file contains all of the functions needed to handle the Actions that are defined in the driver.
- **`connections.lua`** – This .lua file contains the functions which manage the status of the drivers’ connection bindings and connection state. These include: OnSerialConnectionChanged, OnIRConnectionChanged, OnNetworkConnectionChanged, OnNetworkStatusChanged, OnURLConnectionChanged.
- **`device_messages.lua`** – This .lua file contains the Get, Handle and Dispatch message functions. These functions are used to receive data from the communication buffer (Get), Parse the data appropriately (Handle) and send the parsed data (Dispatch). Refer to the Thermostat_proxy_class.lua file in this template as a reference of the device functions that are in the proxy. All device functions begin with “dev_”.
- **`device_specific_commands.lua`** – This .lua file contains all of the driver’s ExecuteCommand Code. Functions for device specific commands should be implemented in this file. These are functions that use: EX_CMD.<command>. These functions are received using ExecuteCommand and represent functions that the device provides but are not supported through the defined Control4 Proxy. 
- **`driver.lua`** – This .lua file is the main .lua file for the device driver. This is the .lua file defined in the driver XML. It is the first .lua file that gets executed when the driver is loaded.
- **`driver.xml`** – This .XML file contains all of the driver’s XML code. 
- **`properties.lua`** – This .lua file contains the implementation for any Properties found in the driver.
- **`proxy_commands.lua`** – This .lua file contains all of the driver’s commands that are sent from the Thermostat Proxy. These commands are received using the ReceivedFromProxy API. Implement any commands needed by your driver in this file. Note the use of “TODO” in the file documentation that indicates exactly where the driver developer needs to write code.
- **`proxy_init.lua`** – This .lua file contains all of the driver’s initialization functions. These include: ON_DRIVER_EARLY_INIT & ON_DRIVER_LATEINIT. 
 
This section provides a definition for the directories and files that are delivered within a Control4 Driver Template which require no modification at all by the driver developer. The folders which contain these files are designated in this document with a note of “Requires No Modification”.

#### `common/` (No Modification Required)
The content of this folder requires no modification by the driver developer. This folder contains numerous .lua files which are required by most Control4 drivers:
- **`c4_command.lua`** – This .lua file contains the API functions required to handle commands the driver receives through ExecuteCommand & ReceivedFromProxy.
- **`c4_common.lua`** – This .lua file contains common helper functions used by Control4 drivers.
- **`c4_device_connection_base.lua`** – The Device Connection Base Class.lua file. This is the base class which makes up the class structure used for communication with devices. The other files in this class: c4_ir_connection.lua, c4_network_connection.lua, c4_serial_connection.lua, c4_url_ connection.lua
- **`c4_driver_declarations.lua`** – This .lua file contains Common Driver Declarations.
- **`c4_init.lua`** – This .lua file contains the API functions required to handle calls the driver receives during its initialization. This includes OnDriverInit, OnDriverLateInit & OnDrivetrDestroyed
- **`c4_ir_connection.lua`** – This .lua file is required for drivers using IR control.
- **`c4_network_connection.lua`** – This .lua file is required for drivers using Network control.
- **`c4_notify.lua`** – This .lua file contains helper functions for sending Notifications.
- **`c4_property.lua`** – This .lua file contains the API function that is called when a property changes.
- **`c4_serial_connection.lua`** – This .lua file is required for drivers using Serial control.
- **`c4_url_connection.lua`** – This .lua file is required for cloud-based drivers.

#### `lib/` (No Modification Required)
The content of this folder requires no modification by the driver developer. This folder contains several libraries provided by Control4 that a driver may or may not use.:
- **`c4_log.lua`** – Control4 driver templates use this library for logging. It includes code to support items such as log naming conventions, logging levels & enabling/disabling logging.
- **`c4_object.lua`** – This .lua file is a base class file that defies the class/object structure. It contains the InheritFrom function used by any class defined in the driver.
- **`c4_queue.lua`** – This .lua file is a base class file that defies the class/object structure. It contains the InheritFrom function used by any class defined in the driver.
- **`c4_timer.lua`** – This .lua file is a class used to manage timers.
- **`c4_xml.lua`** – This .lua file contains helper functions associated with parsing and managing the driver’s XML.

#### `thermostat/` (No Modification Required)
The content of this folder requires no modification by the driver developer. The thermostat folder contains classes that define the Thermostat proxy itself.
- **`thermostat_proxy_class.lua`** – Implementation of the Thermostat Proxy Class.
- **`thermostat_proxy_commands.lua`** – This .lua file contains all of the commands using the ReceivedfromProxy API. The proxy command implementation is done in the proxy_commands.lua file.
- **`thermostat_proxy_notifies.lua`** – This .lua file contains all of the Thermostat Proxy API Commands required to send notifications to Control4. These API Commands are called in the device_specific_commands.lua file. 

### Features
- Bi-directional communication with the Tuya cloud and local TCP server  
- AES-256-CBC encrypted data reception over TCP  
- Temperature setpoint and mode control  
- Real-time sync of temperature and HVAC status  
- Full proxy support for `thermostat` proxy  
- Composer events for temperature/mode changes  

### Device Properties
| Property Name     | Type           | Description                                 |
|-------------------|----------------|---------------------------------------------|
| `Tcp Port`        | String         | TCP server port used by the driver to establish the network connection. |
| `MacAddress`      | String         | Control 4 Mac Address.                      |
| `ClientId`        | String         | Tuya Cloud API client ID.                   |
| `ClientSecret`    | String         | Tuya Cloud API client secret.               |
| `Contract`        | String         | Enables/disables driver cloud operations.   |    
| `UserId`          | String         | Tuya user identifier.                       |
| `DeviceId`        | String         | Tuya device ID for cloud operations         |
| `Mode`            | List           | Current mode: `off`, `heat`, `cool`, `auto` |
| `CoolTemp`        | Ranged Float   | Target cooling temperature (0-33 °C)        |
| `HeatTemp`        | Ranged Float   | Target heating temperature (0-33 °C)        |
| `CurrentTemp`     | Ranged Float   | Current indoor temperature (0-33 °C)        |
| `Log Level`       | List           | Logging detail level                        |
| `Log Mode`        | List           | Log output: off, print, log, or both        |
| `Device Response` | String         | Mac Address Validation Message.             |


### Proxies
- **5001**: `uibutton` Used for icon/UI state display with visual feedback
- **5002**: `thermostat` Main thermostat proxy (`thermostatV2`)

### Network Binding
- **6001**: TCP connection to cloud bridge server (encrypted)  
  - IP: `xx.xxx.xxx.xxx` (Slomins Server IP)  
  - Port: `8081`  

### Driver Lifecycle
- `OnDriverInit`: Initializes state, starts TCP connection, cloud token fetch  
- `OnDriverLateInit`: Reserved for future enhancements  
- `OnPropertyChanged`: Reacts to `DeviceId`, `TemperatureUnit` changes  

### Key Functions
- **TcpConnection()**: Initializes secure TCP connection  
- **ReceivedFromNetwork()**: Decrypts and handles TCP thermostat updates  
- **SendUpdate()**: Updates UI setpoint, mode, and current temp  
- **UIRequest("SetSetpoint"/"SetMode"/"SetFanMode")**: Handles UI requests  
- **ExecuteCommand()**: Composer commands (Set Heat/Cool/Auto, Fan On/Auto)  
- **SendCommand()**: Sends control command to Tuya via cloud  
- **GetApiDeviceStatus()**: Retrieves latest state from Tuya cloud  
- **SetSetpoint(temp)**: Sets desired temperature  
- **SetMode(mode)**: Sets HVAC mode (`heat`, `cool`, `auto`)  
- **SetFanMode(mode)**: Sets fan mode (`on`, `auto`)  

#### Setpoint Ranges

- **Heating:** 4–31°C (38–89°F)
- **Cooling:** 6–32°C (42–90°F)
- **Humidity Setpoint (for dehumidify):** 0–100%

### Thermostat State Mapping
- **Current Temp**: `temp_current`  
- **Target Temp**: `temp_set`  
- **Mode**: `mode` (heat, cool, auto, off)  
- **Fan Mode**: `fan_mode` (auto, on)  
- **HVAC State**: UI shows `Heating`, `Cooling`, or `Idle`  

### Events Fired
- `THERMOSTAT_TEMPERATURE_CHANGED`  
- `THERMOSTAT_MODE_CHANGED`  
- `THERMOSTAT_FAN_MODE_CHANGED`  

### Icons
Thermostat state icons (heat, cool, auto, off) can be displayed dynamically in UI  
(Recommended: SVG or PNG at 90px or 300px)

### Debugging
Enable `Debug Mode` via Properties to log API and TCP events.  
Logs auto-disable in 10 minutes using `gDebugTimer`.
 

### Installation Steps

1. **Import the driver into Control4:**
   - Add the Thermostat driver via ComposerPro.

2. **Set Required Properties:**
   - Enter Tuya `DeviceId`.
   - Select `TemperatureUnit` (°C or °F).

3. **TCP & Cloud Sync:**
   - Ensure `TcpConnection()` succeeds and thermostat status updates in Lua logs.
   - Verify real-time temperature sync and mode control.

4. **Test UI/Composer Control:**
   - Use UI or Composer to set temperature/mode and observe log/response.

5. **Programming Events:**
   - Attach logic to `THERMOSTAT_*` events in Composer for automation.

6. **Verify Final Setup:**
   - Check all readings and control actions are correctly mapped.
   - Disable Debug Mode before final deployment.


### Change log
**Version 69**  
- SDH-1196 - Enable Temperature Correction Feature for Tuya Thermostat in Control4 Driver
- SDH-1195 - Color change for Cooling (blue) and Heating (red)

**Version 68**  
- SDH-1156 - Thermostat - Ability to schedule temp changes

**Version 67**  
- SDH-1156 - Thermostat V66 Issue -Adjusting the heating temperature on the app also affects the cooling temperature, and vice versa

**Version 66**  
- SDH-1154 - Fetch Client ID & Client Secret directly from REST API (remove Node.js dependency)

**Version 65**  
- TCI-829 - Drivers establish TCP connections using multiple ports with the TCP Port property.

**Version 64**  
- TCI-356 - Client ID and Secret Solution -  Solution by entering MAC Address in Property Section and validate MAC

**Version 63**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption
- TCI-307 - scenes issue fixes

**Version 62**  
- Updated driver documentation for clarity and completeness.

**Version 61**  
- Synced device status with UI when the device is operate manually.

**Version 60**  
- Encrypted driver code to enhance security.