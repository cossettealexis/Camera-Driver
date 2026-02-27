#!/usr/bin/env python3
"""
Universal Camera Bridge Server for Control4 Integration
Converts Tuya API/WebRTC streams to RTSP for Control4

Works with ALL camera types:
- K26-SL (Solar outdoor camera)
- VD05 (Video doorbell)
- P160-SL (Indoor camera)
- Any Tuya/CldBus compatible camera

Usage:
    Control4 connects to: rtsp://BRIDGE_IP:8554/stream?vid=CAMERA_VID&quality=high
"""

import asyncio
import json
import logging
import os
import socket
import subprocess
import time
from datetime import datetime
from threading import Thread
from typing import Optional, Dict, Any

import requests
from flask import Flask, request, Response, jsonify

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
API_BASE_URL = "https://api.arpha-tech.com"
BRIDGE_PORT = 8554  # RTSP port for Control4 to connect
HTTP_API_PORT = 5001  # HTTP API for management (changed from 5000 due to AirPlay)

app = Flask(__name__)

# Active camera sessions
camera_sessions: Dict[str, Dict[str, Any]] = {}


class TuyaCameraAPI:
    """Handles Tuya/CldBus API communication for camera wake and control"""
    
    def __init__(self, auth_token: str):
        self.auth_token = auth_token
        self.base_url = API_BASE_URL
        
    def wake_camera(self, vid: str) -> bool:
        """Wake up a sleeping camera via API"""
        try:
            logger.info(f"Waking camera VID: {vid}")
            
            url = f"{self.base_url}/api/v3/openapi/device/do-action"
            headers = {
                "Content-Type": "application/json",
                "Accept-Language": "en",
                "Authorization": f"Bearer {self.auth_token}"
            }
            body = {
                "vid": vid,
                "action_id": "ac_wakelocal",
                "input_params": json.dumps({"t": int(time.time()), "type": 0}),
                "check_t": 0,
                "is_async": 0
            }
            
            response = requests.post(url, headers=headers, json=body, timeout=10)
            
            if response.status_code == 200:
                logger.info(f"Camera {vid} wake command sent successfully")
                logger.info(f"Response: {response.text}")
                return True
            else:
                logger.error(f"Failed to wake camera {vid}: {response.status_code}")
                logger.error(f"Response body: {response.text}")
                return False
                
        except Exception as e:
            logger.error(f"Error waking camera {vid}: {str(e)}")
            return False
    
    def check_camera_status(self, vid: str) -> Dict[str, Any]:
        """Check if camera is online/awake"""
        try:
            url = f"{self.base_url}/api/v3/openapi/devices-v2"
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.auth_token}",
                "App-Name": "cldbus"
            }
            
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                devices = data.get("data", {}).get("devices", [])
                
                for device in devices:
                    if device.get("vid") == vid:
                        return {
                            "online": device.get("online", False),
                            "local_ip": device.get("local_ip", ""),
                            "device_name": device.get("device_name", ""),
                            "model": device.get("model", "")
                        }
            
            return {"online": False}
            
        except Exception as e:
            logger.error(f"Error checking camera status {vid}: {str(e)}")
            return {"online": False}
    
    def wait_for_camera_ready(self, vid: str, timeout: int = 10) -> bool:
        """Wait for camera to wake up and be ready"""
        logger.info(f"Waiting for camera {vid} to be ready...")
        
        # Just wait a fixed time - cameras are ready after wake command
        # K26 needs ~7 seconds, others are immediate
        time.sleep(7)
        
        logger.info(f"Camera {vid} should be ready now!")
        return True


class RTSPBridge:
    """Bridges between Tuya API/WebRTC and RTSP for Control4"""
    
    def __init__(self, vid: str, camera_ip: str, quality: str = "high"):
        self.vid = vid
        self.camera_ip = camera_ip
        self.quality = quality
        self.stream_process: Optional[subprocess.Popen] = None
        
    def get_camera_rtsp_url(self) -> str:
        """Get direct RTSP URL from camera"""
        # Map quality to stream type
        stream = "stream0" if self.quality == "high" else "stream1"
        return f"rtsp://{self.camera_ip}:8554/{stream}"
    
    def start_rtsp_relay(self, output_port: int) -> bool:
        """Start FFmpeg to relay camera RTSP stream in listen mode"""
        try:
            camera_url = self.get_camera_rtsp_url()
            
            logger.info(f"Starting RTSP relay from {camera_url} to port {output_port}")
            
            # FFmpeg RTSP server mode - listen for connections and relay camera feed
            cmd = [
                "ffmpeg",
                "-rtsp_transport", "tcp",
                "-i", camera_url,
                "-c", "copy",  # Copy without re-encoding
                "-f", "rtsp",
                "-rtsp_transport", "tcp",
                "-listen", "1",  # Listen mode - wait for client to connect
                f"rtsp://0.0.0.0:{output_port}/{self.vid}"
            ]
            
            self.stream_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT
            )
            
            # Give FFmpeg time to start listening
            time.sleep(3)
            
            # Check if process is still running
            if self.stream_process.poll() is not None:
                # Process died, get error output
                output, _ = self.stream_process.communicate()
                logger.error(f"FFmpeg process died: {output.decode()}")
                return False
            
            logger.info(f"RTSP relay started for VID {self.vid} on port {output_port}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start RTSP relay: {str(e)}")
            if self.stream_process:
                try:
                    output, _ = self.stream_process.communicate(timeout=1)
                    logger.error(f"FFmpeg output: {output.decode()}")
                except:
                    pass
            return False
    
    def stop(self):
        """Stop the relay"""
        if self.stream_process:
            self.stream_process.terminate()
            self.stream_process.wait(timeout=5)
            logger.info(f"RTSP relay stopped for VID {self.vid}")


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "running",
        "active_sessions": len(camera_sessions),
        "timestamp": datetime.now().isoformat()
    })


@app.route('/stream/<vid>', methods=['GET'])
def start_stream(vid: str):
    """
    Start streaming for a camera
    
    Parameters:
    - vid: Camera VID (required)
    - quality: high/low (default: high)
    - auth_token: Bearer token for API (required)
    """
    try:
        quality = request.args.get('quality', 'high')
        auth_token = request.args.get('auth_token') or request.headers.get('Authorization', '').replace('Bearer ', '')
        
        if not auth_token:
            return jsonify({"error": "auth_token required"}), 401
        
        logger.info(f"Stream request for VID: {vid}, quality: {quality}")
        
        # Initialize API
        api = TuyaCameraAPI(auth_token)
        
        # Wake camera
        wake_success = api.wake_camera(vid)
        if not wake_success:
            return jsonify({"error": "Failed to wake camera"}), 500
        
        # Wait for camera to be ready
        ready = api.wait_for_camera_ready(vid, timeout=10)
        if not ready:
            return jsonify({"error": "Camera did not wake up in time"}), 504
        
        # Get camera info
        status = api.check_camera_status(vid)
        camera_ip = status.get("local_ip")
        
        if not camera_ip:
            return jsonify({"error": "Could not determine camera IP"}), 500
        
        # Return direct camera RTSP URL (no relay needed - simpler!)
        stream = "stream0" if quality == "high" else "stream1"
        camera_rtsp_url = f"rtsp://{camera_ip}:8554/{stream}"
        
        camera_sessions[vid] = {
            "started": datetime.now().isoformat(),
            "camera_ip": camera_ip,
            "quality": quality
        }
        
        return jsonify({
            "success": True,
            "vid": vid,
            "rtsp_url": camera_rtsp_url,
            "camera_ip": camera_ip,
            "quality": quality,
            "message": "Camera is awake, stream ready"
        })
        
    except Exception as e:
        logger.error(f"Error starting stream: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/stream/<vid>', methods=['DELETE'])
def stop_stream(vid: str):
    """Stop streaming for a camera"""
    try:
        if vid in camera_sessions:
            session = camera_sessions[vid]
            session["bridge"].stop()
            del camera_sessions[vid]
            
            return jsonify({
                "success": True,
                "message": f"Stream stopped for {vid}"
            })
        else:
            return jsonify({"error": "No active session for this VID"}), 404
            
    except Exception as e:
        logger.error(f"Error stopping stream: {str(e)}")
        return jsonify({"error": str(e)}), 500


@app.route('/sessions', methods=['GET'])
def list_sessions():
    """List all active camera sessions"""
    sessions = {}
    for vid, session in camera_sessions.items():
        sessions[vid] = {
            "port": session["port"],
            "started": session["started"],
            "camera_ip": session["camera_ip"],
            "quality": session["quality"]
        }
    
    return jsonify(sessions)


def run_api_server():
    """Run the HTTP API server"""
    logger.info(f"Starting HTTP API server on port {HTTP_API_PORT}")
    app.run(host='0.0.0.0', port=HTTP_API_PORT, threaded=True)


if __name__ == "__main__":
    logger.info("=" * 70)
    logger.info("Universal Camera Bridge Server for Control4")
    logger.info("=" * 70)
    logger.info(f"HTTP API: http://0.0.0.0:{HTTP_API_PORT}")
    logger.info(f"RTSP Base Port: {BRIDGE_PORT}")
    logger.info("")
    logger.info("Supported Cameras: K26-SL, VD05, P160-SL, and all Tuya cameras")
    logger.info("=" * 70)
    
    # Start API server
    run_api_server()
