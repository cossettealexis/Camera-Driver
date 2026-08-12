
// =====================================================
// VD05 CAMERA SETTINGS UI (CONTROL4 - CLEAN VERSION)
// =====================================================

// ==========================
// STATE (UI ONLY CACHE)
// ==========================
let antiPryEnabled = false;
let isMicMuted = false;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {

    initializeControl4();

    initAntiPry();
    initMicrophone();
    initReboot();
    initDeviceInfo();

    // Request initial state from driver
    requestInitialState();
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

function initDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}

// =====================================================
// ANTI-PRY
// =====================================================

function initAntiPry() {
    const toggle = document.getElementById('antiPry');
    if (!toggle) {
        console.error("ERROR: antiPry toggle not found in DOM!");
        return;
    }

    // Remove old listener if exists
    toggle.removeEventListener('change', handleAntiPryToggle);
    toggle.addEventListener('change', handleAntiPryToggle);
}

function handleAntiPryToggle(e) {

    const state = e.target.checked;

    // DO NOT assume success — Lua will confirm
    sendAntiPryCommand(state);
}

function sendAntiPryCommand(state) {

    try {

        C4.sendCommand(
            'SET_ANTI_PRY',
            JSON.stringify({
                state: state ? 1 : 0   // 🔥 force 0/1
            }),
            false,
            true
        );

    } catch (e) {
        console.log('Anti-Pry command error', e);
    }
}

/*function updateAntiPryUI(state) {

    antiPryEnabled = !!state;

    const toggle = document.getElementById('antiPry');
    const status = document.getElementById('antiPryStatus');

    if (toggle) toggle.checked = antiPryEnabled;
    if (status) status.innerText = antiPryEnabled ? 'Enabled' : 'Disabled';
} */


// =====================================================
// MICROPHONE
// =====================================================

function initMicrophone() {

    const toggle = document.getElementById('mic');
    if (!toggle) return;

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

    isMicMuted = muted;

    const toggle = document.getElementById('mic');
    const status = document.getElementById('micStatus');

    if (toggle) toggle.checked = !muted;
    if (status) status.innerText = muted ? 'Muted' : 'Enabled';
}

// =====================================================
// REBOOT
// =====================================================

function initReboot() {

    const btn = document.getElementById('rebootBtn');
    if (!btn) return;

    btn.addEventListener('click', handleReboot);
}

function handleReboot() {

    try {

        C4.sendCommand(
            'REBOOT_DEVICE',
            '',
            false,
            true
        );

    } catch (e) {
        console.log('Reboot error', e);
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

        // Device Info (Name + Firmware)
        if (obj.type === "device_info" && obj.success) {
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

        if (obj.type === "anti_pry_update" || 
            obj.tamper_swt !== undefined || 
            obj.anti_pry_enabled !== undefined) {
            
            let state = false;
            
            // Prefer tamper_swt (most reliable)
            if (obj.tamper_swt !== undefined) {
                state = Number(obj.tamper_swt) === 1;
            } else if (obj.anti_pry_enabled !== undefined) {
                state = !!obj.anti_pry_enabled;
            }

            updateAntiPryUI(state);
        }

        // Mic handling
        if (obj.mic_muted !== undefined) {
            updateMicUI(!!obj.mic_muted);
        }

    } catch (e) {
        console.error('ERROR: onDataToUi ERROR:', e, 'Raw value:', value);
    }
}

function updateAntiPryUI(state) {
    antiPryEnabled = !!state;

    const toggle = document.getElementById('antiPry');
    const status = document.getElementById('antiPryStatus');

    if (toggle) {
        const wasChecked = toggle.checked;
        toggle.checked = antiPryEnabled;
        
        // Extra force for stubborn Control4 WebView
        if (toggle.checked !== antiPryEnabled) {
            setTimeout(() => { toggle.checked = antiPryEnabled; }, 50);
        }
    }

    if (status) {
        status.innerText = antiPryEnabled ? 'Enabled' : 'Disabled';
    }
}
/*function onDataToUi(value) {

    console.log('VD05 DATA:', value);

    try {

        const obj = JSON.parse(value);

        if (obj.tamper_swt !== undefined || obj.anti_pry_enabled !== undefined) {

            let state = false;

            if (obj.tamper_swt !== undefined) {
                state = Number(obj.tamper_swt) === 1;
            } else if (obj.anti_pry_enabled !== undefined) {
                state = !!obj.anti_pry_enabled;
            }

            updateAntiPryUI(state);
        }

    
        if (obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            updateMicUI(muted);
        }

    } catch (e) {
        // Parse error - silently ignore
    }
} */

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