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
    initSnapshot();
   
});

// =====================================================
// CONTROL4
// =====================================================

function initializeControl4() {

    try {

        C4.subscribeToDataToUi(false);
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





function updateUrlDisplay(url) {
    if (urlDisplay) {
        urlDisplay.textContent = url || "No URL received";
        console.log('📍 URL shown in modal:', url);
    }
}

function initSnapshot() {
    const btn = document.getElementById('snapshotHomeBtn');
    if (!btn) {
        console.warn("snapshotHomeBtn not found");
        return;
    }

    btn.removeEventListener('click', handleTakeSnapshot);
    btn.addEventListener('click', handleTakeSnapshot);
}

function handleTakeSnapshot() {
    console.log('📸 Take Snapshot requested');

    // Open snapshot modal in loading state
    openSnapshotModal(null, "Capturing snapshot...");

    try {
        C4.sendCommand(
            'TAKE_SNAPSHOT',
            JSON.stringify({}),
            false,
            true
        );
        console.log("TAKE_SNAPSHOT command sent");
    } catch (e) {
        console.error("Snapshot command error", e);
        openSnapshotModal(null, "Failed to send snapshot command");
    }
}

function openSnapshotModal(imageUrl, message) {
    const modal   = document.getElementById('snapshotModal');
    const img     = document.getElementById('snapshotModalImage');
    const msgEl   = document.getElementById('snapshotModalMessage');
    const titleEl = document.getElementById('snapshotModalTitle');

    console.log('[Snapshot] openSnapshotModal called');
    console.log('[Snapshot] imageUrl =', imageUrl);
    console.log('[Snapshot] img element found?', !!img);

    if (titleEl) titleEl.innerText = "Snapshot";
    if (msgEl)   msgEl.innerText = message || "";

    if (img) {
        if (imageUrl) {
            // Clear first, then set (helps some webviews)
            img.removeAttribute('src');
            img.src = imageUrl + (imageUrl.indexOf('?') > -1 ? '&' : '?') + 't=' + Date.now();
            img.style.display = 'block';
            console.log('[Snapshot] src set to:', img.src);
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
        }
    } else {
        console.error('[Snapshot] ERROR: #snapshotModalImage not found in DOM!');
    }

    if (modal) {
        modal.classList.add('show');
    } else {
        console.error('[Snapshot] ERROR: #snapshotModal not found in DOM!');
    }
}

function closeSnapshotModal() {
    const modal = document.getElementById('snapshotModal');
    const img   = document.getElementById('snapshotModalImage');

    if (modal) modal.classList.remove('show');
    if (img) {
        img.src = '';
        img.style.display = 'none';
    }
}

/**
 * Converts a .cgi (or any image URL) into a displayable JPEG data/object URL
 */
async function convertCgiToJpegUrl(cgiUrl) {
    try {
        const response = await fetch(cgiUrl, {
            method: 'GET',
            cache: 'no-store',          // important – always get fresh image
            mode: 'cors'                // may need to be 'no-cors' in some environments
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const blob = await response.blob();

       
        const jpegBlob = new Blob([blob], { type: 'image/jpeg' });

        
        return URL.createObjectURL(jpegBlob);

    
    } catch (err) {
        console.error('Failed to convert CGI to JPEG:', err);
        return null;
    }
}

// Helper if you prefer base64
function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function onDataToUi(value) {

    console.log('RAW LUA DATA:', value);

    try {

        const jsonObject = JSON.parse(value);
    
        // Handle icon_description wrapper (NotificationHistory pattern)
        let obj;
        if (jsonObject.hasOwnProperty('icon_description')) {
            obj = JSON.parse(jsonObject.icon_description);
        } else {
            obj = jsonObject;
        }
       

        if (obj.state) {
            applyLockState(obj.state);
        }

        if (obj.icon) {
            applyLockState(obj.icon);
        }

        if (obj.battery !== undefined) {
            updateBatteryUI(obj.battery);
        }

        if (obj.type === "snapshot_result") {
            alert('[Snapshot] Received result:', obj.image_url);

            if (obj.success && obj.image_url) {
                openSnapshotModal(obj.image_url, "Loading snapshot...");
            } else {
                openSnapshotModal(null, obj.error || "Failed to capture snapshot");
            }
        }


        if (obj.type === "test_url" && obj.url) {
            console.log(' Test URL received:', obj.url);
            return;
        }

    } catch (e) {

        console.log('onDataToUi parse error', e);

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
