![slomins Logo](./contents/images/shield-logo.svg)

## Smart Camera Driver Documentation

### Overview
This driver enables integration of a Tuya-based Smart Camera into the Control4 ecosystem. It supports live video streaming, one-way audio control, PTZ (Pan-Tilt-Zoom) functionality(only if device support), floodlight and siren toggling, and video quality management, using encrypted TCP communication and JavaScript UI integration.

### Features
- Live video stream playback via WebSocket-FFmpeg bridge.
- Real-time UI feedback for stream quality, mute, siren, light, and PTZ control.
- PTZ (Pan/Tilt/Zoom) support using button gestures only if device support this feature.
- Control floodlight and siren switches remotely.
- Toggle between SD and HD video quality.
- Dynamic bandwidth usage indicator.
- TCP-based encrypted communication with Tuya bridge.

---

### Required Properties

| Property Name | Type   | Description |
|---------------|--------|-------------|
| `ClientId`     | STRING  | Tuya Cloud API client ID.                   |
| `ClientSecret` | STRING  | Tuya Cloud API client secret.               |
| `Contract`     | STRING  | Enables/disables driver cloud operations.   |    
| `UserId`       | STRING  | Tuya user identifier.                       |
| `DeviceId`    | STRING | Unique Tuya camera device ID. |
| `VideoQuality`| STRING | (Read-only) Video resolution level. Default: `SD`. |
| `Mute`        | LIST   | (Read-only) Mute state of camera audio. Options: `On`, `Off`. |

---

### Proxies

- **5001**: `uibutton` — Proxy for video UI interaction (mute, light, siren, PTZ, etc.)

---

### Network Binding

| ID     | Type | Description |
|--------|------|-------------|
| 6001   | TCP  | Encrypted communication with Tuya bridge server |
| Port   | 8081 | Persistent TCP session with `keep_alive`, `monitor_connection`, etc. enabled. |

---

### Driver Lifecycle Functions (`driver.lua`)

- **OnDriverInit**: Initializes system, loads saved state, sets up TCP.
- **OnDriverLateInit**: Handles delayed property sync (if needed).
- **OnPropertyChanged**: Reacts to `DeviceId` and updates stream state accordingly.
- **ReceivedFromNetwork()**: Decrypts TCP messages and updates UI via `SendToProxy`.
- **SendToCameraUI(data)**: Sends JSON state to HTML5 interface.
- **HandleControlCommand()**: Handles mute, light, siren, quality, PTZ commands.
- **PlayLiveStream()**: Triggers stream URL delivery and begins playback in JS UI.

---

### JavaScript UI Integration (`index.js`)

The HTML5 Control4 interface (`index.js`) supports:

#### Live Stream
- Connects to WebSocket server:  
  `wss://{Streaming Server IP}}/api/ffmpeg?url=<base64url>&quality=<sd|hd>`
![normal_img](./contents/images/streaming_server_diagram.png)

#### Real-Time Updates
- Uses `onDataToUi()` to:
  - Set video quality (`SD`, `HD`)
  - Toggle audio mute (`On`, `Off`)
  - Toggle floodlight and siren
  - Show/hide PTZ buttons based on capabilities

#### PTZ Controls
- PTZ movement via:
  - `sendTuyaCommand('ptz_control', directionCode)`
  - `ptz_stop` called on release
- Direction codes:
  - `0` = Up
  - `4` = Down
  - `6` = Left
  - `2` = Right

#### Commands Handled
| Command           | Function                       |
|------------------|--------------------------------|
| `SetVideoMute`    | Toggles audio stream volume    |
| `SetVideoLight`   | Turns on/off floodlight        |
| `SetVideoSiren`   | Turns on/off siren             |
| `SetVideoQuality` | Switches between SD and HD     |
| `SetControlPtz`   | Starts PTZ movement            |
| `ptz_stop`        | Stops PTZ movement             |

---

### Events & Communication Flow

1. TCP receives JSON from Tuya Bridge
2. `driver.lua` parses and forwards to UI via `SendToProxy`
3. UI (`index.js`) parses message in `onDataToUi()`
4. User interacts with controls
5. `C4.sendCommand()` triggers Lua-side command handling
6. Command is sent via TCP back to Tuya cloud

--- 

### Debugging & Testing

- Use `Lua debug log` to verify:
  - TCP connection status
  - Received stream URLs
  - Command routing via `ReceivedFromProxy()`
- Use browser console to validate:
  - JS event handling (`onDataToUi`, `playLiveStream`)
  - WebSocket URL generation
- Video stream issues?
  - Verify base64 RTSP URL
  - Ensure WebSocket bridge is active at `/api/ffmpeg`

---

### Installation Steps

1. **Import Driver in Composer Pro**
   - Load `.c4z` with the included `driver.lua`, `driver.xml`, and UI files.

2. **Set `DeviceId`**
   - Enter your Tuya camera's device ID.

3. **Verify TCP Connection**
   - Ensure port `8081` is reachable by the camera bridge.

4. **Test Live Stream**
   - Confirm camera loads on Control4 touchscreens or T3/T4 interface.

5. **Check Controls**
   - Toggle mute, floodlight, siren, and PTZ to verify communication.

---

### Change Log

**Version 5**  
- TCI-303 - Add correct dates for Driver and Add proper naming convention for Drivers
- TCI-254 - Client id and Client secret dynamic update with Encryption

**Version 4**  
- Updated driver documentation for clarity and completeness.

**Version 3**  
- Added PTZ (Pan-Tilt-Zoom) control support for compatible camera devices.

**Version 2**  
- Initial release with TCP and Tuya cloud support   
- Real-time cloud status updates

---

