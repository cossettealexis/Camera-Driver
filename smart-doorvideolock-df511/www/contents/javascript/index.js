// =====================================================
// DF511 Smart Lock — index.js
// =====================================================
let smartLockBtn = null;
let lockStatus   = null;

document.addEventListener('DOMContentLoaded', function () {
    smartLockBtn = document.querySelector('.smart_lock_btn');
    lockStatus   = smartLockBtn ? smartLockBtn.querySelector('.lock_status') : null;
    if (smartLockBtn) {
        smartLockBtn.addEventListener('mousedown', beginUnlocking);
        smartLockBtn.addEventListener('touchstart', beginUnlocking, { passive: true });
    }
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

// ── Init ─────────────────────────────────────────────
// document.addEventListener('DOMContentLoaded', function () {
//     try {
//         // Load lock state from file
//         fetch('lockstate.json?t=' + Date.now())
//             .then(function (r) { return r.json(); })
//             .then(function (data) {
//                 if (data.state && data.state !== 'unknown') {
//                     applyLockState(data.state);
//                     window._lastKnownState = data.state;
//                 }
//             })
//             .catch(function () {});

//         startStatePolling();
//         startBatteryPolling();

//         // Subscribe to real-time pushes from Lua
//         C4.subscribeToDataToUi(true);
//         C4.subscribeToVariable('LAST_ROOM_SELECTED');
//         C4.subscribeToVariable('LAST_MENU_SELECTED');
//         C4.sendCommand('sendCameraPreviewCommand', '', false, false);

//         setTimeout(function () {
//             C4.sendCommand('REQUEST_SETTINGS', '', false, false);
//         }, 300);

//         // Staggered battery re-requests — catches cases where Lua pushes
//         // before the WebView subscription is ready
//         setTimeout(function () { C4.sendCommand('REQUEST_SETTINGS', '', false, false); }, 1000);
//         setTimeout(function () { C4.sendCommand('REQUEST_SETTINGS', '', false, false); }, 3000);

//     } catch (e) {
//         dbg('INIT ERR: ' + e.message);
//     }
// });

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

// // Show UI after 1 s regardless (safety net)
// document.addEventListener('DOMContentLoaded', function () {
//     setTimeout(showUI, 1000);
// });

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