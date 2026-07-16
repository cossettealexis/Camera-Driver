
// =====================================================
// VD05 CAMERA SETTINGS UI (CONTROL4 - CLEAN VERSION)
// =====================================================

// ==========================
// DEBUG HELPER
// ==========================
function addDebugLog(message) {
    const debugPanel = document.getElementById('debugPanel');
    if (debugPanel) {
        const timestamp = new Date().toLocaleTimeString();
        const logDiv = document.createElement('div');
        logDiv.className = 'log';
        logDiv.innerHTML = `<span class="timestamp">[${timestamp}]</span> ${message}`;
        debugPanel.appendChild(logDiv);
        debugPanel.scrollTop = debugPanel.scrollHeight;
    }
}

// ==========================
// STATE (UI ONLY CACHE)
// ==========================
let antiPryEnabled = false;
let isMicMuted = false;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {

    console.log('VD05 Settings UI Loaded');
    addDebugLog('✅ JavaScript loaded - DOMContentLoaded fired');

    initializeControl4();

    initAntiPry();
    initMicrophone();
    initReboot();

    // Request initial state from driver
    requestInitialState();
    
    addDebugLog('✅ All UI components initialized');
});

// =====================================================
// CONTROL4 INIT
// =====================================================

function initializeControl4() {

    try {

        C4.subscribeToDataToUi(true);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');

        C4.sendCommand('REQUEST_SETTINGS', '', false, false);

        console.log('Control4 initialized');
        addDebugLog('✅ Control4 API initialized successfully');

    } catch (e) {
        console.log('Control4 init error', e);
        addDebugLog('❌ Control4 init ERROR: ' + e.message);
    }
}

function requestInitialState() {
    // Ask driver for current Anti-Pry and Mic state
    try {
        C4.sendCommand('REQUEST_INITIAL_STATE', '', false, true);
        console.log('📤 Requested initial Anti-Pry / Mic state');
    } catch (e) {
        console.log('Request initial state failed', e);
    }
}

// =====================================================
// ANTI-PRY
// =====================================================

function initAntiPry() {
    const toggle = document.getElementById('antiPry');
    if (!toggle) {
        console.error("❌ antiPry toggle not found in DOM!");
        return;
    }

    console.log("✅ antiPry toggle initialized");

    // Remove old listener if exists
    toggle.removeEventListener('change', handleAntiPryToggle);
    toggle.addEventListener('change', handleAntiPryToggle);
}

function handleAntiPryToggle(e) {

    const state = e.target.checked;

    console.log('🛡 Anti-Pry toggle clicked:', state);

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

    console.log('🎤 Mic toggle clicked:', muted ? 'MUTE' : 'UNMUTE');

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
// DEVICE INFO
// =====================================================

function updateDeviceInfo(version, releaseDate) {
    console.log('📋 Device Info:', version, releaseDate);
    addDebugLog('📝 Updating footer - FW: ' + version + ', Date: ' + releaseDate);

    const versionEl = document.getElementById('firmwareVersion');
    const dateEl = document.getElementById('releaseDate');

    if (versionEl) {
        versionEl.textContent = version || 'Unknown';
        addDebugLog('✅ Footer FW element updated');
    } else {
        addDebugLog('❌ Footer FW element NOT FOUND!');
    }
    
    if (dateEl) {
        dateEl.textContent = releaseDate || 'N/A';
        addDebugLog('✅ Footer Date element updated');
    } else {
        addDebugLog('❌ Footer Date element NOT FOUND!');
    }
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

    console.log('🔄 Reboot requested');

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
    addDebugLog('📥 DATA RECEIVED from driver!');
    try {
        const obj = JSON.parse(value);
        console.log('📥 onDataToUi received:', obj);
        addDebugLog('✅ JSON parsed successfully - type: ' + (obj.type || 'unknown'));

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

            console.log('🛡 Anti-Pry UI UPDATE →', state ? 'ENABLED' : 'DISABLED');
            addDebugLog('🛡 Anti-Pry update: ' + (state ? 'ENABLED' : 'DISABLED'));
            updateAntiPryUI(state);
        }

        // Mic handling
        if (obj.mic_muted !== undefined) {
            updateMicUI(!!obj.mic_muted);
        }

        // Device info handling
        if (obj.type === "device_info" && obj.firmware) {
            addDebugLog('📱 Device info received - FW: ' + obj.firmware.version);
            updateDeviceInfo(obj.firmware.version, obj.firmware.release_date);
        } else if (obj.type === "device_info") {
            addDebugLog('⚠️ Device info received but no firmware object!');
        }

    } catch (e) {
        console.error('❌ onDataToUi ERROR:', e, 'Raw value:', value);
        addDebugLog('❌ JSON PARSE ERROR: ' + e.message);
    }
}

function updateAntiPryUI(state) {
    antiPryEnabled = !!state;

    const toggle = document.getElementById('antiPry');
    const status = document.getElementById('antiPryStatus');

    if (toggle) {
        const wasChecked = toggle.checked;
        toggle.checked = antiPryEnabled;
        
        console.log(`[UI] Toggle updated: ${wasChecked} → ${toggle.checked} (desired: ${antiPryEnabled})`);
        
        // Extra force for stubborn Control4 WebView
        if (toggle.checked !== antiPryEnabled) {
            console.warn("[UI] Toggle didn't stick - forcing again");
            setTimeout(() => { toggle.checked = antiPryEnabled; }, 50);
        }
    }

    if (status) {
        status.innerText = antiPryEnabled ? 'Enabled' : 'Disabled';
    }
}
/*function onDataToUi(value) {

    console.log('📥 VD05 DATA:', value);

    try {

        const obj = JSON.parse(value);

        if (obj.tamper_swt !== undefined || obj.anti_pry_enabled !== undefined) {

            let state = false;

            if (obj.tamper_swt !== undefined) {
                state = Number(obj.tamper_swt) === 1;
            } else if (obj.anti_pry_enabled !== undefined) {
                state = !!obj.anti_pry_enabled;
            }

            console.log('Anti-Pry UI Update →', state ? 'ENABLED' : 'DISABLED');
            updateAntiPryUI(state);
        }

    
        if (obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            console.log('🎤 Mic sync:', muted);

            updateMicUI(muted);
        }

    } catch (e) {
        console.log('onDataToUi parse error', e);
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