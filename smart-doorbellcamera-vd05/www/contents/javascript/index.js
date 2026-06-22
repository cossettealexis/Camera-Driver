
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

    console.log('VD05 Settings UI Loaded');

    initializeControl4();

    initAntiPry();
    initMicrophone();
    initReboot();
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

    } catch (e) {
        console.log('Control4 init error', e);
    }
}

// =====================================================
// ANTI-PRY
// =====================================================

function initAntiPry() {

    const toggle = document.getElementById('antiPry');
    if (!toggle) return;

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

function updateAntiPryUI(state) {

    antiPryEnabled = state;

    const toggle = document.getElementById('antiPry');
    const status = document.getElementById('antiPryStatus');

    if (toggle) toggle.checked = state;
    if (status) status.innerText = state ? 'Enabled' : 'Disabled';
}

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

    console.log('📥 VD05 DATA:', value);

    try {

        const obj = JSON.parse(value);

        // =========================
        // ANTI-PRY SYNC
        // =========================
        if (obj.tamper_swt !== undefined) {

            const state = Number(obj.tamper_swt) === 1;

            console.log('🛡 Anti-Pry sync:', state);

            updateAntiPryUI(state);
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            console.log('🎤 Mic sync:', muted);

            updateMicUI(muted);
        }

    } catch (e) {
        console.log('onDataToUi parse error', e);
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