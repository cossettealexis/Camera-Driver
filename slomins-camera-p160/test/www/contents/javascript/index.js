
// =====================================================
// VD05 CAMERA SETTINGS UI (CONTROL4 - CLEAN VERSION)
// =====================================================

// ==========================
// STATE (UI ONLY CACHE)
// ==========================

let isMicMuted = false;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {


    initializeControl4();
    initMicrophone();
    requestInitialState();
    initDeviceName();
    initDeviceInfo();
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