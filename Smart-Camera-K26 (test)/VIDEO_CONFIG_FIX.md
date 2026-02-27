# K26 Camera - Control4 Video Compatibility Fix

## Problem Summary

The K26 camera was experiencing two types of RTSP streaming failures in Control4:

### Case 1: `streamFailedToInitiate(with: -1)`
- **Cause**: Wrong stream path (was using `stream1` instead of `stream0`)
- **Fix**: Changed default Stream Path from `stream1` → `stream0` in driver.xml

### Case 2: `streamInitiated, fps: 0, bitrate: 0`
- **Cause**: Video encoder settings incompatible with Control4's Surge media engine
- **Symptoms**: RTSP connection succeeds but video frames cannot be decoded
- **Fix**: Added automatic video configuration with Control4-compatible H264 settings

## Root Cause Analysis

Control4's video decoder has **strict compatibility requirements**:

### ❌ What Doesn't Work:
- **H264 High Profile** (too complex)
- **B-frames enabled** (bidirectional prediction frames)
- **Missing SPS/PPS headers** (critical for decoder initialization)
- **H265 codec** (HEVC not supported)
- **Very high resolutions** (>1080p may struggle)

### ✅ What Control4 Needs:
- **H264 Baseline or Main profile**
- **No B-frames** (I-frames and P-frames only)
- **SPS/PPS repeated** in stream
- **720p resolution** (1280x720 recommended)
- **GOP = 2×FPS** (e.g., GOP 30 for 15 fps)
- **Moderate bitrate** (1-2 Mbps)

## Changes Made

### 1. Fixed Stream Path Default (driver.xml)
```xml
<!-- BEFORE -->
<default>stream1</default>  <!-- Sub stream (low quality) -->

<!-- AFTER -->
<default>stream0</default>  <!-- Main stream (high quality) -->
```

### 2. Added Video Configuration Function (driver.lua)
New function: `CONFIGURE_VIDEO_SETTINGS()`

**Control4-Compatible Settings:**
```lua
{
    codec = "H264",          -- H264 only (not H265)
    profile = "baseline",    -- Baseline profile (most compatible)
    resolution = "1280x720", -- 720p recommended
    fps = 15,                -- 15 fps (good balance)
    gop = 30,                -- GOP = 2×FPS
    bitrate = 1024,          -- 1 Mbps
    b_frames = 0             -- No B-frames (critical!)
}
```

**API Call:**
- Action ID: `ac_video_cfg`
- Endpoint: `/api/v3/openapi/device/do-action`
- Applied via Arpha Tech cloud API

### 3. Automatic Configuration on Stream Start
Modified `GET_RTSP_H264_QUERY_STRING()` to:
1. **Configure video settings first** (Control4-compatible encoder)
2. **Then wake camera** for streaming
3. **Return correct stream path** (stream0 or stream1)

### 4. Manual Configuration Button (driver.xml)
Added action in Composer:
```xml
<action>
    <name>Configure Video Settings (Control4)</name>
    <command>CONFIGURE_VIDEO_SETTINGS</command>
</action>
```

## Testing Instructions

### 1. Reload Driver
1. Open Control4 Composer
2. Find K26 camera driver
3. Right-click → "Refresh Navigator"
4. Verify "Configure Video Settings (Control4)" button appears

### 2. Test Automatic Configuration
1. Open Control4 app
2. Navigate to camera
3. Tap to view live stream
4. **Expected Results:**
   - Driver logs show: "[VIDEO] Configuring Control4-compatible encoder settings..."
   - Driver logs show: "[RTSP] Waking camera for streaming session..."
   - RTSP connection initiates successfully
   - Video displays with FPS > 0

### 3. Test Manual Configuration
1. In Composer, go to camera properties
2. Click "Configure Video Settings (Control4)"
3. Check Status property: Should show "Video encoder configured"
4. Check driver logs: Should show video config success

### 4. Verify Stream Path Logic
**High Resolution Test (≥720p):**
- Request 1280x720 or higher
- Should use `stream0` (main stream)

**Low Resolution Test (<720p):**
- Request 640x480 or lower
- Should use `stream1` (sub stream)

## Expected Outcomes

### ✅ Case 1 Fixed (RTSP Handshake)
- RTSP connection establishes successfully
- No more `streamFailedToInitiate(with: -1)` errors
- Correct stream path (stream0) used by default

### ✅ Case 2 Fixed (Video Decoding)
- Video frames decode successfully
- FPS > 0 (typically 15 fps)
- Bitrate > 0 (typically ~1000 kbps)
- Video displays in Control4 app

## Troubleshooting

### If Still No Video After Fix:

#### 1. Check Camera Is Awake
```
Battery cameras sleep to save power
Wait 5-10 seconds after wake command
```

#### 2. Verify Video Config Applied
```
Check driver logs for "Video encoder configured"
Manually trigger "Configure Video Settings (Control4)" button
Wait 30 seconds, then try streaming again
```

#### 3. Test RTSP Manually
```bash
# Install ffmpeg/ffplay
brew install ffmpeg

# Test RTSP stream directly
ffplay rtsp://192.168.60.18:8554/stream0
```

#### 4. Check API Response
Driver logs should show:
```
[DEBUG] Video Config URL: https://api.arpha-tech.com/api/v3/openapi/device/do-action
[DEBUG] Video Config Body: {"vid":"...","action_id":"ac_video_cfg",...}
Video config response code: 200
✅ Video settings configured for Control4 compatibility
```

### If Video Config Fails:

#### Possible Causes:
1. **Camera doesn't support `ac_video_cfg` action**
   - Check API documentation for K26-SL model
   - May need different action ID

2. **Authentication failed**
   - Verify Auth Token is valid
   - Check VID is correct

3. **Network timeout**
   - Camera may be offline
   - Cloud API may be unavailable

#### Alternative Approach:
If API doesn't support video config:
1. Access camera web interface directly (http://192.168.60.18:8080)
2. Manually configure video settings:
   - Codec: H264
   - Profile: Baseline
   - Resolution: 1280x720
   - FPS: 15
   - GOP: 30
   - B-frames: Disabled
3. Save settings and test streaming again

## Technical Details

### Control4 Surge Media Engine
- Proprietary decoder optimized for low latency
- Supports **H264 Baseline and Main profiles only**
- Cannot decode **H264 High Profile** or **H265**
- Requires **SPS/PPS in-band** (in stream, not out-of-band)

### K26-SL Camera Encoder
- Default: H264 High Profile (incompatible!)
- Default: B-frames enabled (incompatible!)
- Need to force: Baseline profile, no B-frames

### Why B-Frames Cause FPS=0:
- B-frames require both **past and future** reference frames
- Increases decode complexity significantly
- Control4 Surge engine **cannot handle B-frames**
- Result: Packets arrive but decoder fails → FPS stays 0

## Files Modified

1. **driver.xml**
   - Line 148: Changed `<default>stream1</default>` → `<default>stream0</default>`
   - Added action button for manual video configuration

2. **driver.lua**
   - Added `CONFIGURE_VIDEO_SETTINGS()` function (after line 1307)
   - Modified `GET_RTSP_H264_QUERY_STRING()` to call video config automatically
   - Added command handler in `ExecuteCommand()`

## Version History

- **v1.0** - Initial K26 driver with stream1 default
- **v1.1** - Fixed stream path to stream0
- **v1.2** - Added automatic Control4-compatible video configuration

## References

- Control4 Surge Media Engine documentation
- H264 Profile specifications (Baseline, Main, High)
- K26-SL camera API documentation
- Arpha Tech cloud API reference

---

**Created:** January 2026  
**Author:** Driver Development Team  
**Camera Model:** K26-SL (Tuya Battery Camera)  
**Control4 Integration:** Camera Proxy v5001
