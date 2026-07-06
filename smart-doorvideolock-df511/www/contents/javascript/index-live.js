// =====================================================
// DF511 VIDEO LOCK UI
// =====================================================

let slider = null;
let thumb = null;
let text = null;

let dragging = false;
let currentState = 'locked';

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {
    

    slider = document.getElementById('lockSlider');
    thumb = document.getElementById('sliderThumb');
    text = document.getElementById('sliderText');

    if (!slider || !thumb || !text) {
        console.log('Slider elements not found');
        return;
    }

    initializeControl4();

    thumb.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);

    applyLockState('locked');
    initScreenshot();
   
});

// =====================================================
// CONTROL4
// =====================================================

function initializeControl4() {

    try {

        C4.subscribeToDataToUi(true);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');

        C4.sendCommand(
            'sendCameraPreviewCommand',
            '',
            false,
            false
        );

        C4.sendCommand(
            'REQUEST_SETTINGS',
            '',
            false,
            false
        );

    } catch (e) {

        console.log('Control4 init error', e);
    }
}

// =====================================================
// SLIDER
// =====================================================

function maxPosition() {
    return slider.offsetWidth - thumb.offsetWidth - 8;
}

function onPointerDown(e) {

    dragging = true;

    if (thumb.setPointerCapture) {
        thumb.setPointerCapture(e.pointerId);
    }
}

function onPointerMove(e) {

    if (!dragging) return;

    const rect = slider.getBoundingClientRect();

    let x =
        e.clientX -
        rect.left -
        (thumb.offsetWidth / 2);

    x = Math.max(0, Math.min(x, maxPosition()));

    thumb.style.left = (x + 4) + 'px';
}

function onPointerUp() {

    if (!dragging) return;

    dragging = false;

    const current =
        parseFloat(thumb.style.left || '4') - 4;

    const unlockThreshold = maxPosition() * 0.50;
    const lockThreshold = maxPosition() * 0.50;

    // ---------------------------
    // LOCKED -> UNLOCK
    // ---------------------------

    if (currentState === 'locked') {

        if (current >= unlockThreshold) {

            sendLockCommand('unlock');

            // Immediate UI feedback
            applyLockState('unlocked');

        } else {

            thumb.style.left = '4px';
        }
    }

    // ---------------------------
    // UNLOCKED -> LOCK
    // ---------------------------

    else {

        if (current <= lockThreshold) {

            sendLockCommand('lock');

            // Immediate UI feedback
            applyLockState('locked');

        } else {

            thumb.style.left =
                (maxPosition() + 4) + 'px';
        }
    }
}

// =====================================================
// LOCK STATE
// =====================================================

function applyLockState(state) {

    currentState = state;

    if (state === 'locked') {

        slider.classList.remove('unlocked');

        text.textContent = 'Unlock';

        thumb.innerHTML = '🔒';

        thumb.style.left = '4px';

        console.log('STATE => LOCKED');
    }

    else if (state === 'unlocked') {

        slider.classList.add('unlocked');

        text.textContent = 'Lock';

        thumb.innerHTML = '🔓';

        thumb.style.left =
            (maxPosition() + 4) + 'px';

        console.log('STATE => UNLOCKED');
    }
}

// =====================================================
// SEND COMMAND
// =====================================================

function sendLockCommand(action) {

    try {

        console.log('SEND:', action);

        C4.sendCommand(
            'SetLockUnlock',
            JSON.stringify({
                command: action
            }),
            false,
            true
        );

    } catch (e) {

        console.log('sendLockCommand error', e);
    }
}



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
// SCREENSHOT FUNCTIONALITY
// =====================================================

let screenshotModal = null;
let screenshotImg = null;
let screenshotLoading = null;
let urlDisplay = null;

function initScreenshot() {
    screenshotModal = new bootstrap.Modal(document.getElementById('screenshotModal'));
    screenshotImg = document.getElementById('screenshotImage');
    screenshotLoading = document.getElementById('screenshotLoading');
    urlDisplay = document.getElementById('urlDisplay');

    const btn = document.getElementById('screenshotBtn');
    if (btn) btn.addEventListener('click', takeScreenshot);


    if (screenshotImg) {
        screenshotImg.addEventListener('load', function() {
            screenshotLoading.style.display = 'none';
            this.style.display = 'block';
        });
    }
}

function takeScreenshot() {
    if (!screenshotModal || !screenshotImg || !screenshotLoading) {
        console.error("Screenshot elements not found");
        return;
    }

    screenshotImg.style.display = 'none';
    screenshotLoading.style.display = 'block';
    if (urlDisplay) urlDisplay.textContent = "Capturing...";
    screenshotModal.show();

    try {
        C4.sendCommand('TAKE_SCREENSHOT', '', false, true);
        console.log('📸 TAKE_SCREENSHOT sent');
    } catch (e) {
        console.error('Send command failed', e);
    }
}

function updateUrlDisplay(url) {
    if (urlDisplay) {
        urlDisplay.textContent = url || "No URL received";
        console.log('📍 URL shown in modal:', url);
    }
}

function onDataToUi(value) {

    console.log('RAW LUA DATA:', value);
    
    // Show alert with raw data (for debugging)
    alert("Data received from Lua:\n\n" + value);

    try {

        const obj = JSON.parse(value);

        if (obj.state) {
            applyLockState(obj.state);
        }

        if (obj.icon) {
            applyLockState(obj.icon);
        }

        if (obj.battery !== undefined) {
            updateBatteryUI(obj.battery);
        }

        // ==================== SCREENSHOT RESPONSE ====================
        if (obj.type === "screenshot" && obj.url) {
           console.log('✅ Screenshot URL received:', obj.url);
            updateUrlDisplay(obj.url);                    // Show in modal

            if (screenshotImg && screenshotLoading) {
                screenshotLoading.style.display = 'none';
                screenshotImg.style.display = 'block';
                screenshotImg.src = obj.url;
            }
        }

        if (obj.type === "test_url" && obj.url) {
            console.log('✅ Test URL received:', obj.url);
            alert("✅ Test URL from Lua:\n\n" + obj.url);
            return;
        }

    } catch (e) {

        console.log('onDataToUi parse error', e);
        alert("Parse Error: " + e.message + "\n\nRaw data: " + value);
    }


}