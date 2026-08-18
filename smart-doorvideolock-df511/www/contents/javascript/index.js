// =====================================================
// DF511 Smart Lock — index.js
// =====================================================
let smartLockBtn = null;
let lockStatus   = null;

// Device Name elements
let deviceNameInput = null;
let updateNameBtn = null;

document.addEventListener('DOMContentLoaded', function () {
    smartLockBtn = document.querySelector('.smart_lock_btn');
    lockStatus   = smartLockBtn ? smartLockBtn.querySelector('.lock_status') : null;
    if (smartLockBtn) {
        smartLockBtn.addEventListener('mousedown', beginUnlocking);
        smartLockBtn.addEventListener('touchstart', beginUnlocking, { passive: true });
    }
     // Control4 Setup
    initializeControl4();

    // Device Name
    initDeviceName();

});



let unlocking  = false;
let timeoutId  = 0;
var video_quality = 'SD';

function dbg(msg) {
    var panel = document.getElementById('debugPanel');
    if (!panel) return;
    var line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + ' → ' + msg;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
}

// ── Show UI helper ──────────────────────────────────
function showUI() {
    var el = document.querySelector('.smartlockui');
    if (el && el.style.display === 'none') {
        el.style.display = 'block';
    }
}

// ── Lock state ──────────────────────────────────────
function applyLockState(state) {
    if (!smartLockBtn || !lockStatus) return;
    if (state === 'locked') {
        smartLockBtn.classList.add('lock');
        lockStatus.textContent = 'Hold to unlock';
    } else if (state === 'unlocked') {
        smartLockBtn.classList.remove('lock');
        lockStatus.textContent = 'Hold to lock';
    }
}

var statePoller = null;
function startStatePolling() {
    if (statePoller) return;
    statePoller = setInterval(function () {
        fetch('lockstate.json?t=' + Date.now())
            .then(function (r) { return r.json(); })
            .then(function (data) {
                if (data.state && data.state !== 'unknown' &&
                    data.state !== window._lastKnownState) {
                    window._lastKnownState = data.state;
                    applyLockState(data.state);
                }
            })
            .catch(function () {});
    }, 2000);
}

// ── Battery ─────────────────────────────────────────
var batteryPoller    = null;
var _lastBatteryPct  = null;   // track last value to avoid redundant DOM writes

function startBatteryPolling() {
    if (batteryPoller) return;
    pollBatteryFile();                               // immediate first poll
    batteryPoller = setInterval(pollBatteryFile, 10000); // every 10 s as fallback
}

function pollBatteryFile() {
    fetch('battery.json?t=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (data) {
            if (data.battery !== undefined) {
                updateBatteryUI(data.battery);
            }
        })
        .catch(function () {});
}


document.addEventListener('DOMContentLoaded', function () {
    try {
        // Fire all requests in parallel immediately
        Promise.all([
            fetch('lockstate.json?t=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    if (data.state && data.state !== 'unknown') {
                        applyLockState(data.state);
                        window._lastKnownState = data.state;
                    }
                }).catch(() => {}),

            fetch('battery.json?t=' + Date.now())
                .then(r => r.json())
                .then(data => {
                    if (data.battery !== undefined) updateBatteryUI(data.battery);
                }).catch(() => {})
        ]);

        startStatePolling();
        startBatteryPolling();

        C4.subscribeToDataToUi(true);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');
        C4.sendCommand('sendCameraPreviewCommand', '', false, false);
        C4.sendCommand('REQUEST_SETTINGS', '', false, false);

        // Staggered fallback requests
        setTimeout(() => C4.sendCommand('REQUEST_SETTINGS', '', false, false), 800);
        setTimeout(() => C4.sendCommand('REQUEST_SETTINGS', '', false, false), 2500);

    } catch (e) {
        dbg('INIT ERR: ' + e.message);
    }
});

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

// ── Main data receiver ───────────────────────────────
function onDataToUi(value) {
    try {
        // Always try to show UI when data arrives
        // showUI();

        var obj = JSON.parse(value);

        // ── Battery update (real-time from Lua C4:SendDataToUI) ──
        if (obj.battery !== undefined) {
            updateBatteryUI(obj.battery);
            return;
        }

        // ── NEW: Timestamp Support ──
        if (obj.time || obj.event) {
            updateLastEventTime(obj);
        }

        // ── Stream info ──
        if (obj.C4Message && obj.C4Message.Data) {
            try {
                var d = JSON.parse(obj.C4Message.Data);
                if (d.stream_url && d.video_quality) video_quality = d.video_quality;
            } catch (e) {}
            return;
        }

        // ── Lock state ──
        var state = obj.icon || obj.state;
        if (state && state !== 'unknown') {
            applyLockState(state);
            window._lastKnownState = state;
        }

        // =============================================
        // DEVICE NAME SUPPORT (NEW)
        // =============================================

        // ==================== DEVICE NAME ====================
        // ==================== DEVICE NAME ====================
        if (obj.type === "device_info" && obj.device_name) {
            if (deviceNameInput) {
                deviceNameInput.value = obj.device_name;
                console.log("✅ Device name loaded:", obj.device_name);
            }
        }

        if (obj.device_name_updated === true || obj.device_name_updated === "success") {
            console.log("✅ Device name updated");
            showSuccessPopup("Device Name Updated Successfully!");
            if (deviceNameInput) deviceNameInput.value = "";
        }

        if (obj.error && obj.error.toLowerCase().includes("name")) {
            showSuccessPopup("Failed to update device name");
        }

    } catch (e) {
        dbg('onDataToUi ERR: ' + e.message);
    }
}

// ── Touch / mouse handlers ───────────────────────────
window.addEventListener('mouseup', resetUnlocking);
window.addEventListener('touchend', resetUnlocking);

function beginUnlocking() {
    var btn = $('.smart_lock_btn');
    unlocking = true;
    $('.circle-shade').show();
    if (btn.hasClass('lock')) {
        $('.circle-shade circle').addClass('unlock').removeClass('lock');
    } else {
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }

    clearTimeout(timeoutId);
    timeoutId = setTimeout(function () {
        if (!unlocking) return;

        if (!btn.hasClass('lock')) {
            smartLockBtn.classList.add('lock');
            if (lockStatus) lockStatus.textContent = 'Hold to unlock';
            sendLockCommand('lock');
        } else {
            smartLockBtn.classList.remove('lock');
            if (lockStatus) lockStatus.textContent = 'Hold to lock';
            sendLockCommand('unlock');
        }

        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
        unlocking = false;
    }, 2000);
}

function resetUnlocking() {
    if (unlocking) {
        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }
    unlocking = false;
}

function sendLockCommand(action) {
    try {
        C4.sendCommand('SetLockUnlock', JSON.stringify({ command: action }), false, true);
    } catch (e) {
        dbg('cmd err: ' + e.message);
    }
}

// ── C4 callbacks ─────────────────────────────────────
function onVariable(v)                        { console.log('onVariable:', v); }
function onSendCommandError(m)                { dbg('cmdErr: ' + m); }
function onSubscribeToDataToUi(m)             { dbg('subErr: ' + m); }
function onSubscribeToVariableError(v, m)     { dbg('varErr: ' + v + ' ' + m); }

// ── jQuery helpers ───────────────────────────────────
$(document).ready(function () {
    $('body').disableSelection();
});

$.fn.extend({
    disableSelection: function () {
        this.each(function () {
            this.onselectstart = function () { return false; };
            this.unselectable  = 'on';
            $(this).css({ '-moz-user-select': 'none', '-webkit-user-select': 'none' });
        });
        return this;
    }
});



// ── Battery UI renderer ──────────────────────────────
function updateBatteryUI(power) {
    var icon = document.getElementById('batteryIcon');
    var text = document.getElementById('batteryText');
    if (!icon) return;

    var pwr = parseInt(power, 10);
    if (isNaN(pwr)) return;

    // Skip redundant DOM updates
    if (pwr === _lastBatteryPct) return;
    _lastBatteryPct = pwr;

    var css;
    if      (pwr >= 75) css = 100;
    else if (pwr >= 50) css = 75;
    else if (pwr >= 25) css = 50;
    else if (pwr > 15)  css = 25;
    else                css = 10;

    icon.setAttribute('data-percent', css);

    if (text) {
        text.textContent = pwr + '%';
        if (pwr <= 15) {
            text.style.color      = '#ff0000';
            text.style.fontWeight = '600';
        } else if (pwr <= 25) {
            text.style.color      = '#e67e22';
            text.style.fontWeight = '600';
        } else {
            text.style.color      = '#444';
            text.style.fontWeight = '400';
        }
    }
}


// =====================================================
// DEVICE NAME
// =====================================================

function initDeviceName() {

    const input = document.getElementById('deviceNameInput');
    const btn = document.getElementById('updateNameBtn');
    const statusEl = document.getElementById('deviceNameStatus');

    if (!btn || !input) {
        console.error("❌ Device name elements not found");
        return;
    }

    console.log("✅ Device Name module initialized");

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

        // === SHOW MODAL IMMEDIATELY WHEN BUTTON IS CLICKED ===
       setTimeout(() => {
            showModal("Device name updated successfully!", "Success");
        }, 5000);

        try {
            C4.sendCommand(
                "SET_DEVICE_NAME",
                JSON.stringify({ name: newName }),
                false,
                true
            );

            console.log("📤 SET_DEVICE_NAME sent:", newName);

        } catch (e) {
            console.error("Send error", e);
            if (statusEl) {
                statusEl.innerText = "Failed to send command";
                statusEl.style.color = "#ff6b6b";
            }
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

function handleDeviceNameUpdate() {
    const newName = deviceNameInput.value.trim();
    if (!newName) {
        alert("Please enter a device name");
        return;
    }

    try {
        C4.sendCommand(
            "SET_DEVICE_NAME",
            JSON.stringify({ name: newName }),
            false,
            true
        );

        console.log("📤 SET_DEVICE_NAME sent:", newName);
        showSuccessPopup("Updating device name...");

    } catch (e) {
        console.error("Failed to send SET_DEVICE_NAME", e);
        alert("Failed to send command");
    }
}

 
// ====================== SUCCESS POPUP ======================

function showSuccessPopup(message = "Success") {
    const popup = document.getElementById('successPopup') || document.querySelector('.sucess_popup');
    if (popup) {
        popup.textContent = message;
        popup.style.display = 'block';
        setTimeout(() => { popup.style.display = 'none'; }, 2500);
    }
}


