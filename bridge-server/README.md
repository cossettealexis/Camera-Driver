# Universal Camera Bridge Server for Control4

This bridge server converts Tuya API/WebRTC streams to RTSP streams that Control4 can consume.

## 🎯 Purpose

Solves the problem where Control4 cannot directly connect to battery-powered cameras (like K26-SL) that sleep to conserve power. The bridge:

1. Accepts Control4 RTSP connection requests
2. Wakes up the camera via Tuya API
3. Waits for camera to be ready (up to 10 seconds)
4. Relays the camera's RTSP stream to Control4
5. Works with **ALL** Slomins camera types (K26, VD05, P160, etc.)

## 🎥 Supported Cameras

- **K26-SL**: Solar outdoor camera (battery-powered, sleeps)
- **VD05**: Video doorbell (always-powered)
- **P160-SL**: Indoor camera (always-powered)
- Any Tuya/CldBus compatible camera

## 📋 Requirements

- Python 3.8+
- FFmpeg (for RTSP relay)
- Network access to cameras and Tuya API

## 🚀 Installation

### 1. Install Python Dependencies

```bash
cd bridge-server
pip install -r requirements.txt
```

### 2. Install FFmpeg

**macOS:**
```bash
brew install ffmpeg
```

**Linux:**
```bash
sudo apt-get install ffmpeg
```

**Windows:**
Download from https://ffmpeg.org/download.html

### 3. Configure

Copy the example config:
```bash
cp config.example.json config.json
```

Edit `config.json` with your settings:
- Set `auth_token` to your Tuya API bearer token
- Add your camera VIDs

## 🏃 Running the Server

```bash
python camera_bridge.py
```

The server will start:
- **HTTP API**: `http://localhost:5000`
- **RTSP Base Port**: `8554`

## 📡 API Usage

### Start a Stream

**HTTP Request:**
```bash
GET /stream/{VID}?quality=high&auth_token=YOUR_TOKEN
```

**Example (K26 Camera):**
```bash
curl "http://localhost:5000/stream/d50gu5mbtn8c73cnacvg?quality=high&auth_token=YOUR_TOKEN"
```

**Response:**
```json
{
  "success": true,
  "vid": "d50gu5mbtn8c73cnacvg",
  "rtsp_url": "rtsp://localhost:8554/d50gu5mbtn8c73cnacvg",
  "camera_ip": "192.168.60.71",
  "quality": "high",
  "message": "Stream ready"
}
```

### Stop a Stream

```bash
DELETE /stream/{VID}
```

### List Active Sessions

```bash
GET /sessions
```

### Health Check

```bash
GET /health
```

## 🔧 Control4 Integration

### Option 1: Update Driver to Use Bridge

Modify your camera driver's `GET_RTSP_H264_QUERY_STRING` function:

```lua
function GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
    local vid = Properties["VID"]
    local token = Properties["Auth Token"]
    local bridge_ip = "192.168.1.100"  -- Your bridge server IP
    local quality = "high"  -- or "low"
    
    -- First, trigger the stream start via HTTP
    local url = string.format(
        "http://%s:5000/stream/%s?quality=%s&auth_token=%s",
        bridge_ip, vid, quality, token
    )
    
    -- Call the API (you may need to add HTTP client code)
    C4:url():get(url)
    
    -- Wait a moment for bridge to set up
    C4:Sleep(2000)
    
    -- Return bridge RTSP URL
    return string.format("rtsp://%s:8554/%s", bridge_ip, vid)
end
```

### Option 2: Pre-Start Streams

Manually start streams before using in Control4:

```bash
# Start K26 stream
curl "http://BRIDGE_IP:5000/stream/d50gu5mbtn8c73cnacvg?quality=high&auth_token=YOUR_TOKEN"

# Now Control4 can connect to:
# rtsp://BRIDGE_IP:8554/d50gu5mbtn8c73cnacvg
```

## 📊 Parameters

| Parameter | Required | Description | Example |
|-----------|----------|-------------|---------|
| `vid` | Yes | Camera VID | `d50gu5mbtn8c73cnacvg` |
| `quality` | No | Stream quality: `high`/`low` | `high` |
| `auth_token` | Yes | Tuya API bearer token | `Bearer abc123...` |

**Quality Mapping:**
- `high` → `/stream0` (main stream, higher resolution)
- `low` → `/stream1` (sub stream, lower resolution)

## 🏗️ Architecture

```
Control4 Camera Proxy
        ↓
    RTSP Request (rtsp://BRIDGE:8554/VID)
        ↓
Bridge Server (camera_bridge.py)
        ↓
    1. Receive request with VID
    2. Call Tuya API to wake camera
    3. Wait for camera ready (up to 10s)
    4. Get camera local IP
    5. Connect to camera's RTSP (port 8554)
    6. Relay stream via FFmpeg
        ↓
Camera (K26/VD05/P160)
```

## 🐛 Troubleshooting

### Camera doesn't wake up

- Check auth token is valid
- Verify camera VID is correct
- Ensure camera has power (K26: check solar charge)

### RTSP stream fails

- Verify FFmpeg is installed: `ffmpeg -version`
- Check camera is on same network
- Ensure port 8554 is not blocked

### Control4 shows no video

- Check bridge server logs
- Verify Control4 can reach bridge IP
- Try VLC first: `vlc rtsp://BRIDGE_IP:8554/VID`

## 📝 Logs

Logs show:
- Camera wake requests
- API responses
- RTSP relay status
- Connection errors

Example:
```
2025-02-20 10:30:15 - INFO - Stream request for VID: d50gu5mbtn8c73cnacvg, quality: high
2025-02-20 10:30:15 - INFO - Waking camera VID: d50gu5mbtn8c73cnacvg
2025-02-20 10:30:16 - INFO - Camera d50gu5mbtn8c73cnacvg wake command sent successfully
2025-02-20 10:30:16 - INFO - Waiting for camera d50gu5mbtn8c73cnacvg to be ready...
2025-02-20 10:30:23 - INFO - Camera d50gu5mbtn8c73cnacvg is ready!
2025-02-20 10:30:23 - INFO - Starting RTSP relay from rtsp://192.168.60.71:8554/stream0 to port 8554
2025-02-20 10:30:23 - INFO - RTSP relay started for VID d50gu5mbtn8c73cnacvg
```

## 🔐 Security Notes

- Keep `auth_token` secure
- Consider using HTTPS for API endpoints in production
- Restrict bridge server access to local network
- Use firewall rules to limit access

## 🚀 Production Deployment

For production use:

1. **Run as systemd service** (Linux)
2. **Use supervisor** (cross-platform)
3. **Add authentication** to HTTP API
4. **Use HTTPS** with reverse proxy (nginx)
5. **Monitor** with health check endpoint
6. **Log rotation** for production logs

## 📄 License

Internal use for Slomins camera integration.
