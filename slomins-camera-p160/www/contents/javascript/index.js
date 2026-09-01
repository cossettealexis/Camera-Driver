// ==========================
// DEBUG HELPER
// ==========================
function debugLog(msg, type = 'info') {
    const console = document.getElementById('debugConsole');
    if (console) {
        const div = document.createElement('div');
        div.className = type;
        div.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
        console.appendChild(div);
        console.scrollTop = console.scrollHeight;
    }
    
    // Also log to live view debug if it exists
    const logEntries = document.getElementById('logEntries');
    if (logEntries) {
        const div = document.createElement('div');
        div.style.color = type === 'error' ? '#f00' : '#00f';
        div.style.marginTop = '3px';
        div.textContent = new Date().toLocaleTimeString() + ' - ' + msg;
        logEntries.appendChild(div);
        
        const liveDebug = document.getElementById('liveDebugLog');
        if (liveDebug) liveDebug.scrollTop = liveDebug.scrollHeight;
    }
}

// ==========================
// STATE (UI ONLY CACHE)
// ==========================

let isMicMuted = false;
let liveStreamPlayer = null;
let streamMicMuted = false;
let streamVolume = 5;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {
    debugLog('DOMContentLoaded - Starting initialization');
    
    // Test if C4 object exists
    if (typeof C4 === 'undefined') {
        debugLog('ERROR: C4 object NOT FOUND! Running outside Control4!', 'error');
        alert('ERROR: C4 object not found! This UI must run inside Control4.');
        return;
    } else {
        debugLog('C4 object found - running in Control4 environment');
        // Force a test command immediately
        try {
            C4.sendCommand('GET_DEVICE_INFO', '', false, true);
            debugLog('Test command GET_DEVICE_INFO sent successfully');
        } catch (e) {
            debugLog('ERROR sending test command: ' + e.message, 'error');
        }
    }

    try {
        debugLog('Calling initializeControl4()');
        initializeControl4();
        
        debugLog('Calling initMicrophone()');
        initMicrophone();
        
        debugLog('Calling requestInitialState()');
        requestInitialState();
        
        debugLog('Calling initDeviceName()');
        initDeviceName();
        
        debugLog('Calling initDeviceInfo()');
        initDeviceInfo();
        
        debugLog('Calling initReboot()');
        initReboot();
        
        debugLog('Calling initLiveStream()');
        initLiveStream();
        
        debugLog('All initialization complete!', 'info');
    } catch (e) {
        debugLog('INIT ERROR: ' + e.message, 'error');
    }
});

// =====================================================
// CONTROL4 INIT
// =====================================================

function initializeControl4() {

    try {

        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');

        C4.sendCommand('REQUEST_SETTINGS', '', false, false);

    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestInitialState() {
    // Ask driver for current Anti-Pry and Mic state
    try {
        C4.sendCommand('REQUEST_INITIAL_STATE', '', false, true);
    } catch (e) {
        console.log('Request initial state failed', e);
    }
}



function initDeviceName() {

    const input = document.getElementById('deviceNameInput');
    const btn = document.getElementById('updateNameBtn');
    const statusEl = document.getElementById('deviceNameStatus');

    if (!btn || !input) {
        console.error("ERROR: Device name elements not found");
        return;
    }

    btn.addEventListener('click', function () {
      
        const newName = input.value.trim();

        if (!newName) {
            if (statusEl) {
                statusEl.innerText = "Please enter a device name";
                statusEl.style.color = "#ff6b6b";
            }
            return;
        }

        if (statusEl) {
            statusEl.innerText = "Updating...";
            statusEl.style.color = "#ffffff";
        }

        try {

            C4.sendCommand(
                "SET_DEVICE_NAME",
                JSON.stringify({ name: newName }),
                false,
                true
            );

            // Show Modal
            showModal("Device name updated successfully!", "Success");

        } catch (e) {

            console.error("Send error", e);

            if (statusEl) {
                statusEl.innerText = "Failed to send command";
                statusEl.style.color = "#ff6b6b";
            }

            // Or show an error modal instead
            showModal("Failed to send command", "Error");
        }
    });

    // Allow Enter key
    input.addEventListener('keypress', function (e) {
        if (e.key === 'Enter') {
            btn.click();
        }
    });
}

// =====================================================
// DEVICE INFO (Name + Firmware)
// =====================================================

function initDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}



// =====================================================
// MICROPHONE
// =====================================================

function initMicrophone() {

    const toggle = document.getElementById('mic');
    if (!toggle) return;

    toggle.removeEventListener('change', handleMicToggle);
    toggle.addEventListener('change', handleMicToggle);
}

function handleMicToggle(e) {

    const muted = !e.target.checked;

    sendMicCommand(muted);
}

function sendMicCommand(muted) {

    try {

        C4.sendCommand(
            muted ? 'MUTE_MIC' : 'UNMUTE_MIC',
            '',
            false,
            true
        );

    } catch (e) {
        console.log('Mic command error', e);
    }
}


function updateMicUI(muted) {

    isMicMuted = !!muted;

    const toggle = document.getElementById('mic');
    const status = document.getElementById('micStatus');

    if (toggle) {
        toggle.checked = !isMicMuted;

        if (toggle.checked !== !isMicMuted) {
            setTimeout(() => {
                toggle.checked = !isMicMuted;
            }, 50);
        }
    }

    if (status) {
        status.innerText = isMicMuted ? 'Muted' : 'Enabled';
    }
}

//Reboot
function initReboot() {
    const btn = document.getElementById('rebootBtn');
    if (!btn) {
        console.warn("rebootBtn not found");
        return;
    }

    btn.removeEventListener('click', handleReboot);
    btn.addEventListener('click', handleReboot);
}

function handleReboot() {
    console.log('Reboot requested');

    const btn = document.getElementById('rebootBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Rebooting...";
    }

    try {
        C4.sendCommand(
            'REBOOT_DEVICE',
            '',
            false,
            true
        );

        console.log(" REBOOT_DEVICE command sent");

        // Show success modal immediately (optimistic – device will go offline)
        showModal(
            "Reboot command sent successfully.\nThe device will restart shortly.",
            "Reboot Initiated"
        );

        // Optional: re-enable the button after a few seconds
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Reboot";
            }
        }, 4000);

    } catch (e) {
        console.error("Reboot command error", e);

        if (btn) {
            btn.disabled = false;
            btn.innerText = "Reboot";
        }

        showModal("Failed to send reboot command", "Error");
    }
}

// =====================================================
// CONTROL4 DATA SYNC (SOURCE OF TRUTH)
// =====================================================

function onDataToUi(value) {

    try {

        const jsonObject = JSON.parse(value);

        // Handle icon_description wrapper (NotificationHistory pattern)
        let obj;
        if (jsonObject.hasOwnProperty('icon_description')) {
            obj = JSON.parse(jsonObject.icon_description);
        } else {
            obj = jsonObject;
        }

       

        // =========================
        // DEVICE INFO (Name + Firmware)
        // =========================
        if (obj.type === "device_info" && obj.success) {

            // Store camera IP for streaming
            if (obj.ip) {
                window.deviceIP = obj.ip;
                debugLog('Camera IP stored: ' + obj.ip);
            }

            // Update current device name in input field
            const input = document.getElementById('deviceNameInput');
            if (input && obj.device_name) {
                input.value = obj.device_name;
            }

            // Update footer elements
            const devEl = document.getElementById('deviceVersion');
            const fwEl = document.getElementById('firmwareVersion');
            const relEl = document.getElementById('releaseDate');

            if (devEl) {
                devEl.innerText = "Device: " + (obj.device_name || "Unknown");
            }

            if (fwEl) {
                fwEl.innerText = "Firmware: " + (obj.version || obj.firmware || "Unknown");
            }

            if (relEl) {
                relEl.innerText = "Release: " + (obj.release_date || "N/A");
            }
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.type === "mic_update" || obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            updateMicUI(muted);
        }


        // Device Name Feedback
        if (obj.device_name_updated) {
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✓ Name updated successfully";
                statusEl.style.color = "#4ade80";
            }

            // Show Modal
            showModal("Device name updated successfully!", "Success");

            // Optional: clear input
            const input = document.getElementById('deviceNameInput');
            if (input) input.value = "";
        }

        // Error handling
        if (obj.error) {
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✗ Update failed";
                statusEl.style.color = "#ff6b6b";
            }
            showModal(obj.error || "Failed to update device name", "Error");
        }

       

    } catch (e) {
        console.error('[DEBUG] onDataToUi ERROR:', e);
        console.error('[DEBUG] Raw value:', value);
    }
}


// =====================================================
// ERROR HANDLERS
// =====================================================

function onVariable(v) {
    console.log('onVariable', v);
}

function onSendCommandError(msg) {
    console.log('Command Error', msg);
}

function onSubscribeToDataToUi(msg) {
    console.log('Subscribe Error', msg);
}

function onSubscribeToVariableError(v, msg) {
    console.log('Variable Error', v, msg);
}

// =====================================================
// LIVE STREAM
// =====================================================

function initLiveStream() {
    debugLog('initLiveStream() starting...');
    
    // Initialize stream microphone toggle
    const streamMicToggle = document.getElementById('streamMicToggle');
    debugLog('streamMicToggle element: ' + (streamMicToggle ? 'FOUND' : 'NOT FOUND'));
    
    if (streamMicToggle) {
        streamMicToggle.addEventListener('change', function(e) {
            streamMicMuted = !e.target.checked;
            debugLog('Mic toggled: ' + (streamMicMuted ? 'MUTED' : 'UNMUTED'));
            sendMicCommand(streamMicMuted);
            updateStreamMicIcon();
        });
        debugLog('Mic toggle listener added');
    }

    // Initialize speaker volume slider
    const volumeSlider = document.getElementById('streamVolumeSlider');
    debugLog('streamVolumeSlider element: ' + (volumeSlider ? 'FOUND' : 'NOT FOUND'));
    
    if (volumeSlider) {
        volumeSlider.addEventListener('input', function(e) {
            streamVolume = parseInt(e.target.value);
            debugLog('Volume changed to: ' + streamVolume);
            sendSpeakerVolumeCommand(streamVolume);
            updateStreamVolumeIcon();
        });
        debugLog('Volume slider listener added');
    }
    
    debugLog('initLiveStream() COMPLETE');
}

function startStream() {
    debugLog('startStream() called');
    console.log('Starting live stream...');
    
    const canvas = document.getElementById('videoCanvas');
    const statusEl = document.getElementById('streamStatus');
    
    debugLog('Canvas element: ' + (canvas ? 'FOUND' : 'NOT FOUND'));
    debugLog('Status element: ' + (statusEl ? 'FOUND' : 'NOT FOUND'));
    
    if (!canvas) {
        console.error('Video canvas not found');
        debugLog('ERROR: Video canvas not found!', 'error');
        return;
    }

    // Get camera IP from driver
    try {
        debugLog('Sending GET_DEVICE_INFO command...');
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
        
        const cameraIP = window.deviceIP || '192.168.1.6'; // Fallback IP
        debugLog('Camera IP: ' + cameraIP);
        
        // Choose streaming method based on availability
        const STREAMING_METHOD = 'HLS'; // Options: 'HLS', 'WEBSOCKET', or 'WEBRTC'
        
        if (statusEl) statusEl.innerText = 'Connecting to camera...';
        
        if (STREAMING_METHOD === 'HLS' && typeof Hls !== 'undefined') {
            // ====== METHOD 1: HLS STREAMING (Best compatibility) ======
            debugLog('Using HLS streaming method');
            
            // Replace canvas with video element
            const video = document.createElement('video');
            video.id = 'videoPlayer';
            video.controls = true;
            video.autoplay = true;
            video.muted = false;
            video.style.width = '100%';
            video.style.height = '100%';
            video.style.background = '#000';
            
            canvas.parentNode.replaceChild(video, canvas);
            
            const hlsUrl = `http://${cameraIP}:8889/p160/index.m3u8`;
            debugLog('HLS URL: ' + hlsUrl);
            
            if (Hls.isSupported()) {
                const hls = new Hls({
                    lowLatencyMode: true,
                    backBufferLength: 90,
                    maxBufferLength: 30,
                    maxMaxBufferLength: 600
                });
                
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                
                hls.on(Hls.Events.MANIFEST_PARSED, function() {
                    console.log('HLS stream ready');
                    debugLog('HLS stream ready, starting playback');
                    if (statusEl) statusEl.innerText = '● LIVE';
                    video.play();
                });
                
                hls.on(Hls.Events.ERROR, function(event, data) {
                    console.error('HLS Error:', data);
                    debugLog('HLS Error: ' + data.type + ' - ' + data.details, 'error');
                    if (statusEl) statusEl.innerText = 'Stream error: ' + data.details;
                });
                
                window.hlsPlayer = hls;
                
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                // iOS Safari native HLS support
                debugLog('Using native HLS support (iOS/Safari)');
                video.src = hlsUrl;
                video.addEventListener('loadedmetadata', function() {
                    if (statusEl) statusEl.innerText = '● LIVE';
                });
            }
            
        } else if (STREAMING_METHOD === 'WEBSOCKET' && typeof JSMpeg !== 'undefined') {
            // ====== METHOD 2: WEBSOCKET + JSMPEG ======
            debugLog('Using JSMpeg WebSocket streaming');
            
            const wsUrl = getWebSocketURL();
            debugLog('WebSocket URL: ' + wsUrl);
            
            liveStreamPlayer = new JSMpeg.Player(wsUrl, {
                canvas: canvas,
                autoplay: true,
                audio: false,
                videoBufferSize: 512 * 1024,
                onSourceEstablished: function() {
                    console.log('WebSocket stream established');
                    debugLog('WebSocket stream established!');
                    if (statusEl) statusEl.innerText = '● LIVE';
                },
                onSourceCompleted: function() {
                    console.log('WebSocket stream ended');
                    debugLog('WebSocket stream ended');
                    if (statusEl) statusEl.innerText = 'Stream ended';
                }
            });
            debugLog('JSMpeg player created');
            
        } else {
            // No streaming library available
            console.error('No streaming library available');
            debugLog('ERROR: No streaming library loaded!', 'error');
            if (statusEl) statusEl.innerText = 'Error: No streaming library available';
        }
        
    } catch (e) {
        console.error('Failed to start stream:', e);
        debugLog('ERROR starting stream: ' + e.message, 'error');
        if (statusEl) statusEl.innerText = 'Failed to start stream';
    }
}

function stopStream() {
    console.log('Stopping live stream...');
    
    if (liveStreamPlayer) {
        liveStreamPlayer.destroy();
        liveStreamPlayer = null;
    }
    
    const statusEl = document.getElementById('streamStatus');
    if (statusEl) statusEl.innerText = 'Disconnected';
}

function getWebSocketURL() {
    // Get camera IP from driver properties (stored in global var)
    const cameraIP = window.deviceIP || '192.168.1.6'; // Fallback IP
    
    // WebSocket endpoint for MPEG1 stream
    // Requires FFmpeg bridge server running on camera or proxy
    return `ws://${cameraIP}:8081/stream`;
    
    // Alternative: Use MediaMTX WebSocket endpoint
    // return `ws://${cameraIP}:8889/stream/p160/llhls.m3u8`;
}

function sendSpeakerVolumeCommand(volume) {
    console.log('Setting speaker volume to:', volume);
    
    try {
        // Send volume command to driver
        const params = JSON.stringify({ volume: volume });
        
        // Adjust based on your driver commands
        if (volume === 0) {
            C4.sendCommand('SPEAKER_MUTE', params, false, true);
        } else {
            // Send volume level
            for (let i = 0; i < Math.abs(volume - streamVolume); i++) {
                C4.sendCommand(
                    volume > streamVolume ? 'SPEAKER_VOLUME_UP' : 'SPEAKER_VOLUME_DOWN',
                    '',
                    false,
                    true
                );
            }
        }
    } catch (e) {
        console.error('Speaker volume command error', e);
    }
}

function updateStreamMicIcon() {
    const icon = document.getElementById('streamMicIcon');
    if (icon) {
        icon.setAttribute('data-lucide', streamMicMuted ? 'mic-off' : 'mic');
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}

function updateStreamVolumeIcon() {
    const icon = document.getElementById('streamVolumeIcon');
    if (icon) {
        if (streamVolume === 0) {
            icon.setAttribute('data-lucide', 'volume-x');
        } else if (streamVolume < 5) {
            icon.setAttribute('data-lucide', 'volume-1');
        } else {
            icon.setAttribute('data-lucide', 'volume-2');
        }
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
}