# Deploy Bridge Server to Control4 VM

## Prerequisites

Your Control4 Composer Pro VM needs:
- Python 3.8 or higher
- FFmpeg
- Network access to cameras and Control4 controller

## Installation Steps

### 1. Copy Files to VM

Copy these files to your VM:
```
bridge-server/
├── camera_bridge.py
├── requirements.txt
├── config.example.json
└── README.md
```

**Using SCP (from your Mac):**
```bash
# Replace VM_IP with your VM's IP address
scp -r bridge-server/ user@VM_IP:/home/user/
```

### 2. Install Dependencies on VM

SSH into your VM:
```bash
ssh user@VM_IP
```

Install Python and FFmpeg:
```bash
# For Ubuntu/Debian VM
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv ffmpeg

# For Windows VM (use Chocolatey)
# choco install python ffmpeg
```

### 3. Set Up Python Environment

```bash
cd /home/user/bridge-server

# Create virtual environment
python3 -m venv venv

# Activate it
source venv/bin/activate  # Linux/Mac
# OR
venv\Scripts\activate     # Windows

# Install packages
pip install -r requirements.txt
```

### 4. Get VM's IP Address

Find the VM's IP address:
```bash
# Linux/Mac
ifconfig | grep "inet "

# Windows
ipconfig
```

Example output: `192.168.60.100`

### 5. Update K26 Driver Configuration

In Control4 Composer:
1. Open K26 camera driver properties
2. Set `Use Bridge Server` = `True`
3. Set `Bridge Server IP` = `192.168.60.100` (your VM's IP)
4. Set `Bridge Server Port` = `5001`

### 6. Run Bridge Server

On the VM:
```bash
cd /home/user/bridge-server
source venv/bin/activate
python camera_bridge.py
```

You should see:
```
======================================================================
Universal Camera Bridge Server for Control4
======================================================================
HTTP API: http://0.0.0.0:5001
RTSP Base Port: 8554

Supported Cameras: K26-SL, VD05, P160-SL, and all Tuya cameras
======================================================================
Starting HTTP API server on port 5001
 * Running on http://127.0.0.1:5001
 * Running on http://192.168.60.100:5001
```

### 7. Test the Bridge

From your Mac or VM, test the health endpoint:
```bash
curl http://192.168.60.100:5001/health
```

Should return:
```json
{
  "status": "running",
  "active_sessions": 0,
  "timestamp": "2026-02-20T00:40:29.743000"
}
```

### 8. Test Camera Wake (Optional)

Get your auth token from Control4 driver properties, then:
```bash
curl "http://192.168.60.100:5001/stream/d50gu5mbtn8c73cnacvg?quality=high&auth_token=YOUR_TOKEN"
```

Should return:
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

## Run Bridge as a Service (Linux VM)

To keep bridge running automatically:

### Create systemd service file:

```bash
sudo nano /etc/systemd/system/camera-bridge.service
```

Paste this:
```ini
[Unit]
Description=Camera Bridge Server for Control4
After=network.target

[Service]
Type=simple
User=youruser
WorkingDirectory=/home/youruser/bridge-server
Environment="PATH=/home/youruser/bridge-server/venv/bin"
ExecStart=/home/youruser/bridge-server/venv/bin/python camera_bridge.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
sudo systemctl daemon-reload
sudo systemctl enable camera-bridge
sudo systemctl start camera-bridge
sudo systemctl status camera-bridge
```

Check logs:
```bash
sudo journalctl -u camera-bridge -f
```

## Run Bridge as a Service (Windows VM)

Use NSSM (Non-Sucking Service Manager):

1. Download NSSM: https://nssm.cc/download
2. Extract and open command prompt as Administrator
3. Run:
```cmd
nssm install CameraBridge "C:\bridge-server\venv\Scripts\python.exe" "C:\bridge-server\camera_bridge.py"
nssm set CameraBridge AppDirectory "C:\bridge-server"
nssm start CameraBridge
```

Check status:
```cmd
nssm status CameraBridge
```

## Troubleshooting

### Bridge won't start
- Check Python version: `python3 --version` (need 3.8+)
- Check FFmpeg: `ffmpeg -version`
- Check port 5001 is free: `netstat -tulpn | grep 5001`

### Can't connect to bridge from Control4
- Check VM firewall allows port 5001
- Verify VM IP address hasn't changed
- Test from Control4 controller: `curl http://VM_IP:5001/health`

### Camera doesn't wake
- Verify auth token is valid in Control4 driver
- Check camera VID is correct
- Check VM can reach api.arpha-tech.com
- Check VM can reach camera IP (192.168.60.71)

### No video in Control4
- Check bridge logs for errors
- Verify FFmpeg is installed
- Test camera RTSP directly: `vlc rtsp://192.168.60.71:8554/stream0`
- Check port 8554 is open on VM

## Network Requirements

VM must be able to reach:
- **Tuya API**: `api.arpha-tech.com` (HTTPS/443) - for wake commands
- **K26 Camera**: `192.168.60.71:8554` (RTSP) - for video stream
- **Control4**: Allow Control4 to reach VM on port 5001 (HTTP) and 8554 (RTSP)

## Security Notes

- Bridge runs on HTTP (not HTTPS) - only use on trusted internal network
- Auth tokens are passed in URL (visible in logs) - consider adding basic auth later
- Port 5001 should not be exposed to internet
- Consider using firewall rules to restrict access to Control4 IPs only
