![My Device Diagram](./contents/images/shield-logo.svg)
## My Devices Driver Documentation

### Overview
The **My Devices Driver** enables Control4 to integrate with multiple Tuya-based smart devices using secure AES-256-CBC encrypted TCP communication and cloud API interaction.  
It allows show all devices of user base on userid.

### Features
- Bi-directional communication with the Tuya Cloud API and local TCP server  
- AES-256-CBC encrypted communication for secure data exchange  
- Automatic TCP connection management with keep-alive support  
- Support for multiple Tuya devices through a single driver   

### Required Properties
- **MacAddress**: Control 4 Mac Address.
- **ClientId**: Tuya Cloud API client ID.
- **ClientSecret**: Tuya Cloud API client secret.
- **Contract**: Enables/disables driver cloud operations.
- **UserId**: Tuya user identifier.
- **1-20 DeviceIds**: The unique identifier of the Tuya switch devices.    
- **Device Response**: Mac Address Validation Message

### Network Binding
- **6001**: TCP connection to cloud relay server (Tuya MQTT-HTTP bridge).  
  - IP: `xx.xxx.xxx.xxx (slomins server ip)`  
  - Port: `8081`        
    
## Setup Instructions
1. Open Composer Pro and add the **My Devices Driver**.  
2. Navigate to **Properties** and enter your Tuya **UserId**.  
3. Ensure that the driver has access to the internet for cloud API communication.  
4. The driver will automatically connect to the secure TCP server and maintain synchronization.  
5. Test all user devices mapped in properties.  


### Change log

**Version 5**  
- TCI-829 - Drivers establish TCP connections using multiple ports with the TCP Port property.

**Version 4**  
- TCI-356 - Client ID and Secret Solution -  Solution by entering MAC Address in Property Section and validate MAC

**Version 3**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 2**  
- Updated driver documentation for clarity and completeness. 

**Version 1**  
- Encrypted driver code to enhance security.

