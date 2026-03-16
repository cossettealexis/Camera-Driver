const smartLockBtn = document.querySelector('.smart_lock_btn');
const lockStatus = smartLockBtn.querySelector('.lock_status');
const cameraBtn = document.querySelector('.camera-panel');
let unlocking = false;
let timeoutId = 0;
let snapshotTimer = null;
var player = null;
var video_quality = 'SD';
let totalBytes = 0;
let lastReportTime = Date.now();



document.addEventListener("DOMContentLoaded", function () {
    try {
        // Initial request to Control4
        C4.sendCommand("sendCameraPreviewCommand", "", false, false);
        C4.subscribeToDataToUi(true);
        C4.subscribeToVariable("LAST_ROOM_SELECTED");
        C4.subscribeToVariable("LAST_MENU_SELECTED");
    } catch (error) {
        console.error("Error initializing Control4:", error);
    }
});

// ======================
// Handle updates from Control4
// ======================
function onDataToUi(value) {
    try {
        console.log('onDataToUi', value);

        const root = JSON.parse(value);

        // ---------- CAMERA STREAM ----------
        if (root.C4Message && root.C4Message.Data) {
            const data = JSON.parse(root.C4Message.Data);

            if (data.stream_url) {
                console.log("Camera stream received:", data.stream_url);

                if (data.video_quality) {
                    video_quality = data.video_quality;
                }

                startTuyaStream(data.stream_url);
            }
        }

        var elements = document.getElementsByClassName('smartlockui');
        if (elements.length > 0 && elements[0].style.display === 'none') {
            elements[0].style.display = 'block';
        }

        let jsonObject = JSON.parse(value);

        // Prefer icon field from Lua
        if (jsonObject.hasOwnProperty("icon")) {
            if (jsonObject.icon === "locked") {
                smartLockBtn.classList.add('lock');
                lockStatus.textContent = 'Hold to unlock';
            } else if (jsonObject.icon === "unlocked") {
                smartLockBtn.classList.remove('lock');
                lockStatus.textContent = 'Hold to lock';
            }
        }

        // Optional: show message from API
        if (jsonObject.hasOwnProperty("icon_description")) {
            let iconDataObject = JSON.parse(jsonObject.icon_description);
            if (iconDataObject.apiresponse) {
                $(".sucess_popup").text(iconDataObject.apiresponse)
                setTimeout(function () {
                    $(".sucess_popup").fadeIn(500).delay(500).fadeOut(2000);
                }, 500);
            }
        }

       

    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


// ======================
// Lock button events
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
            sendHandleSelect('lock'); // Control4 UI
            onLockUnlockSelected('lock'); // Composer Pro
        } else {
            smartLockBtn.classList.remove('lock');
            lockStatus.textContent = 'Hold to lock';
            sendHandleSelect('unlock'); // Control4 UI
            onLockUnlockSelected('unlock'); // Composer Pro
        }

        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
        unlocking = false;
    }, 2000); // hold duration
}

function resetUnlocking() {
    if (unlocking) {
        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }
    unlocking = false;
}

// ======================
// Send command to Control4 HandleSelect
// ======================
function sendHandleSelect(action) {
    console.log('sendHandleSelect:', action);

    // Only use SetLockUnlock — do NOT send Menu
    try {
        const params = JSON.stringify({ command: action }); // "lock" or "unlock"
        C4.sendCommand("SetLockUnlock", params, false, true);
    } catch (error) {
        console.error("Error sending SetLockUnlock:", error);
    }
}


// ======================
// Send command to Composer Pro SetLockUnlock
// ======================
function onLockUnlockSelected(command) {
    console.log('onLockUnlockSelected:', command);

    const params = JSON.stringify({ command: command });

    try {
        C4.sendCommand("SetLockUnlock", params, false, true);
    } catch (error) {
        console.error("Error sending SetLockUnlock:", error);
    }
}

// ======================
// Errors & Variables
// ======================
function onVariable(value) {
    console.log("Received variable:", value);
}

function onSendCommandError(message) {
    console.log("Error sending command:", message);
}

function onSubscribeToDataToUi(message) {
    console.log("Error subscribing to data to UI:", message);
}

function onSubscribeToVariableError(variable, message) {
    console.log("Error subscribing to variable:", variable, message);
}

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
// Live Preview Button
// ======================
cameraBtn.addEventListener('click', () => {
    startCameraPreview();
});

function startCameraPreview() {
    try {
        flashCameraIcon();

        const videoContainer = document.getElementById('videoContainer');
        const loader = document.getElementById('streamLoader');
      //  const img = document.getElementById('mjpegStream');

        videoContainer.style.display = 'block';
        loader.style.display = 'block';
      //  img.style.display = 'none';

        C4.sendCommand(
            "CAMERA_LIVE_PREVIEW",
            JSON.stringify({}),
            false,
            true
        );
    } catch (e) {
        console.error("Camera preview error:", e);
    }
}


function flashCameraIcon() {
    const icon = cameraBtn.querySelector('.camera-icon');
    icon.style.color = '#01ff70';
    setTimeout(() => icon.style.color = '#01a6fe', 300);
}

// ======================
// Snapshot Streaming (Control4-Safe)
// ======================
function startSnapshot(url) {
   
   // const img = document.getElementById('mjpegStream');
    const loader = document.getElementById('streamLoader');

    loader.style.display = 'none';
    img.style.display = 'block';

    clearInterval(snapshotTimer);
  //  snapshotTimer = setInterval(() => {
  //      img.src = url + '?t=' + Date.now();
  //  }, 500);
}

function startVideoStream(url) {
    const canvas = document.getElementById('videoCanvas');
    canvas.style.display = 'block'; // show canvas

    // Destroy previous player if exists
    if (window.player) {
        window.player.destroy();
    }

    // Initialize JSMpeg player
    window.player = new JSMpeg.Player(url, {
        canvas: canvas,
        autoplay: true,
        audio: false,
        loop: true,
    });

    // Hide loader once started
    document.getElementById('streamLoader').style.display = 'none';
}



// ======================
// Receive WebView Messages from Lua
// ======================

function onMessage(message) {
    console.log("Raw Message from Lua:", message);

    try {
        const data = (typeof message === 'string')
            ? JSON.parse(message)
            : message;

        // Use stream_url from Lua
        const rtspUrl = data.stream_url || data.url; 
        if (rtspUrl && rtspUrl.startsWith("rtsp://")) {
            console.log("Starting Tuya RTSP stream:", rtspUrl);
            startTuyaStream(rtspUrl); // <-- route through Tuya WS
        } else if (rtspUrl) {
            // Fallback for already converted WebSocket URL
            startVideoStream(rtspUrl);
        }
    } catch (e) {
        console.error("onMessage error:", e);
    }
}




document.getElementById('btnCloseVideo').addEventListener('click', () => {
    const vc = document.getElementById('videoContainer');
  //  const img = document.getElementById('mjpegStream');

    vc.style.display = 'none';
  //  img.src = ''; // stop stream
});

function startTuyaStream(rtspUrl) {

    const encodedUrl = btoa(rtspUrl);
    const wsUrl =
        'wss://tuya.slomins.com/api/ffmpeg'
        + '?url=' + encodedUrl
        + '&quality=' + video_quality.toLowerCase();

    console.log("WS STREAM:", wsUrl);

    const videoContainer = document.getElementById('videoContainer');
    const loader = document.getElementById('streamLoader');
    const canvas = document.getElementById('videoCanvas');

    videoContainer.style.display = 'block';
    loader.style.display = 'block';
    canvas.style.display = 'none';

    if (player) {
        player.destroy();
        player = null;
    }

    player = new JSMpeg.Player(wsUrl, {
        canvas: canvas,
        autoplay: true,
        audio: true,
        loop: false,

        onSourceEstablished: (source) => {
            source.socket.binaryType = 'arraybuffer';
            source.socket.addEventListener('message', e => {
                totalBytes += e.data.byteLength;
            });
        },

        onVideoDecode: () => {
            const now = Date.now();
            if (now - lastReportTime >= 1000) {
                totalBytes = 0;
                lastReportTime = now;
                loader.style.display = 'none';
                canvas.style.display = 'block';
            }
        }
    });
}
