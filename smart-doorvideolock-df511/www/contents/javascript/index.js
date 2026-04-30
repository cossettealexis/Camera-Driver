const smartLockBtn = document.querySelector('.smart_lock_btn');
const lockStatus = smartLockBtn.querySelector('.lock_status');
const cameraBtn = document.querySelector('.camera-panel');
let unlocking = false;
let timeoutId = 0;
var player = null;
var video_quality = 'SD';
let totalBytes = 0;
let lastReportTime = Date.now();
window._initialLockState="unknown";
// ======================
// Debug Panel
// ======================
function dbg(msg) {
    var panel = document.getElementById('debugPanel');
    if (!panel) return;
    var line = document.createElement('div');
    line.textContent = new Date().toLocaleTimeString() + ' → ' + msg;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
}

// lockstate.js already set window._initialLockState
(function() {
    if (window._initialLockState && window._initialLockState !== 'unknown') {
        // Can't use querySelector yet, so use a CSS class on body
        document.write('<style>' +
            (window._initialLockState === 'locked' 
                ? '.smart_lock_btn{background:radial-gradient(ellipse at center,#e4efe9 0%,#93a5cf 100%)!important;border-color:#00aaff!important}.unlock_icon{display:none!important}.lock_icon{display:block!important}'
                : '.lock_icon{display:none!important}.unlock_icon{display:block!important}') +
            '</style>');
    }
})();
// ======================
// Apply Lock State to UI
// ======================
function applyLockState(state) {
    dbg("applyLockState: " + state);
    if (state === "locked") {
        smartLockBtn.classList.add('lock');
        lockStatus.textContent = 'Hold to unlock';
    } else if (state === "unlocked") {
        smartLockBtn.classList.remove('lock');
        lockStatus.textContent = 'Hold to lock';
    }
}

// ======================
// Init
// ======================
// ✅ Add this - poll file for state changes while screen is open
var statePoller = null;

function startStatePolling() {
    if (statePoller) return; // already running
    dbg("polling started");
    statePoller = setInterval(function() {
        fetch('lockstate.json?t=' + Date.now())
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.state && data.state !== "unknown") {
                    if (window._lastKnownState !== data.state) {
                        dbg("✅ poll change: " + data.state);
                        window._lastKnownState = data.state;
                        applyLockState(data.state);
                    }
                }
            })
            .catch(function() {});
    }, 2000); // check every 2 seconds
}

function stopStatePolling() {
    if (statePoller) {
        clearInterval(statePoller);
        statePoller = null;
        dbg("polling stopped");
    }
}

document.addEventListener("DOMContentLoaded", function () {
    try {
        dbg("DOM ready");

        // ✅ Apply from JS variable INSTANTLY - no fetch needed
        if (window._initialLockState && window._initialLockState !== 'unknown') {
            dbg("✅ instant state: " + window._initialLockState);
            applyLockState(window._initialLockState);
            window._lastKnownState = window._initialLockState;
        }

        // Fetch file as backup and start polling
        fetch('lockstate.json?t=' + Date.now())
            .then(function(r) { return r.json(); })
            .then(function(data) {
                if (data.state && data.state !== 'unknown' && 
                    data.state !== window._lastKnownState) {
                    dbg("file update: " + data.state);
                    applyLockState(data.state);
                    window._lastKnownState = data.state;
                }
            })
            .catch(function(e) { dbg("no file: " + e.message); });

        startStatePolling();

        C4.subscribeToDataToUi(true);
        C4.subscribeToVariable("LAST_ROOM_SELECTED");
        C4.subscribeToVariable("LAST_MENU_SELECTED");
        C4.sendCommand("sendCameraPreviewCommand", "", false, false);

        setTimeout(function() {
            C4.sendCommand("REQUEST_SETTINGS", "", false, false);
        }, 300);

    } catch (error) {
        dbg("INIT ERROR: " + error.message);
    }
});

// ======================
// Receive live updates from Lua (C4:SendDataToUI)
// ======================
function onDataToUi(value) {
    // ✅ Always re-show UI and apply state immediately
    try {
        const obj = JSON.parse(value);

        // Skip C4 system messages
        if (!obj.icon && !obj.state && !obj.C4Message) {
            return;
        }

        // Handle camera stream
        if (obj.C4Message && obj.C4Message.Data) {
            try {
                const data = JSON.parse(obj.C4Message.Data);
                if (data.stream_url) {
                    if (data.video_quality) video_quality = data.video_quality;
                    startTuyaStream(data.stream_url);
                }
            } catch(e) {}
            return;
        }

        // ✅ Handle lock state update
        const state = obj.icon || obj.state;
        if (state && state !== "unknown") {
            dbg("✅ live: " + state);
            applyLockState(state);

            // ✅ Also update the lockstate.json cache in memory
            window._lastKnownState = state;
        }

    } catch (e) {
        dbg("ERR: " + e.message);
    }
}

// ======================
// Lock button hold events
// ======================
smartLockBtn.addEventListener('mousedown', beginUnlocking);
smartLockBtn.addEventListener('touchstart', beginUnlocking);
window.addEventListener('mouseup', resetUnlocking);
window.addEventListener('touchend', resetUnlocking);

function beginUnlocking() {
    const elements = $('.smart_lock_btn');
    unlocking = true;
    $('.circle-shade').show();

    if (elements.hasClass('lock')) {
        $('.circle-shade circle').addClass('unlock').removeClass('lock');
    } else {
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }

    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (!unlocking) return;

        if (!elements.hasClass('lock')) {
            smartLockBtn.classList.add('lock');
            lockStatus.textContent = 'Hold to unlock';
            sendLockCommand('lock');
        } else {
            smartLockBtn.classList.remove('lock');
            lockStatus.textContent = 'Hold to lock';
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
    dbg("sendLockCommand: " + action);
    try {
        C4.sendCommand("SetLockUnlock", JSON.stringify({ command: action }), false, true);
    } catch (e) {
        dbg("cmd error: " + e.message);
    }
}

// ======================
// C4 callbacks
// ======================
function onVariable(value) { console.log("onVariable:", value); }
function onSendCommandError(msg) { dbg("cmd error: " + msg); }
function onSubscribeToDataToUi(msg) { dbg("sub error: " + msg); }
function onSubscribeToVariableError(v, msg) { dbg("var error: " + v + " " + msg); }

// ======================
// Disable text selection
// ======================
$(document).ready(function () {
    $('body').disableSelection();
});
$.fn.extend({
    disableSelection: function () {
        this.each(function () {
            this.onselectstart = function () { return false; };
            this.unselectable = "on";
            $(this).css('-moz-user-select', 'none');
            $(this).css('-webkit-user-select', 'none');
        });
    }
});

// ======================
// Camera Preview
// ======================
cameraBtn.addEventListener('click', () => startCameraPreview());

function startCameraPreview() {
    try {
         stopStatePolling();
        const icon = cameraBtn.querySelector('.camera-icon');
        icon.style.color = '#01ff70';
        setTimeout(() => icon.style.color = '#01a6fe', 300);

        document.getElementById('videoContainer').style.display = 'block';
        document.getElementById('streamLoader').style.display = 'block';

        C4.sendCommand("CAMERA_LIVE_PREVIEW", JSON.stringify({}), false, true);
    } catch (e) {
        dbg("preview error: " + e.message);
    }
}

document.getElementById('btnCloseVideo').addEventListener('click', () => {
    document.getElementById('videoContainer').style.display = 'none';
    if (player) { player.destroy(); player = null; }
       startStatePolling();
});

function startVideoStream(url) {
    const canvas = document.getElementById('videoCanvas');
    canvas.style.display = 'block';
    if (window.player) { window.player.destroy(); }
    window.player = new JSMpeg.Player(url, {
        canvas: canvas, autoplay: true, audio: false, loop: true,
    });
    document.getElementById('streamLoader').style.display = 'none';
}

function startTuyaStream(rtspUrl) {
    const encodedUrl = btoa(rtspUrl);
    const wsUrl = 'wss://tuya.slomins.com/api/ffmpeg?url=' + encodedUrl + '&quality=' + video_quality.toLowerCase();
    dbg("stream: " + wsUrl.substring(0, 50));

    const canvas = document.getElementById('videoCanvas');
    document.getElementById('videoContainer').style.display = 'block';
    document.getElementById('streamLoader').style.display = 'block';
    canvas.style.display = 'none';

    if (player) { player.destroy(); player = null; }

    player = new JSMpeg.Player(wsUrl, {
        canvas: canvas, autoplay: true, audio: true, loop: false,
        onSourceEstablished: (source) => {
            source.socket.binaryType = 'arraybuffer';
            source.socket.addEventListener('message', e => { totalBytes += e.data.byteLength; });
        },
        onVideoDecode: () => {
            const now = Date.now();
            if (now - lastReportTime >= 1000) {
                totalBytes = 0; lastReportTime = now;
                document.getElementById('streamLoader').style.display = 'none';
                canvas.style.display = 'block';
            }
        }
    });
}