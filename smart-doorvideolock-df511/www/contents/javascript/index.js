// =====================================================
// DF511 Smart Lock — index.js
// =====================================================
let smartLockBtn = null;
let lockStatus   = null;

// Device Name elements
let deviceNameInput = null;
let updateNameBtn = null;


// ---- Face Management ----

let faces = [];
let facesDirty = false;


let faceListEl = null;
let saveFacesBtn = null;

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
    requestDeviceInfo();
     loadFaces();
    initSaveFacesButton();

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

        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');

        C4.sendCommand('REQUEST_SETTINGS', '', false, false);

        console.log('Control4 initialized');

    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}




function renderFaces() {
    faceListEl = document.getElementById('faceList');
    saveFacesBtn = document.getElementById('saveFacesBtn');

    if (!faceListEl) {
        console.warn("faceList element not found");
        return;
    }

    faceListEl.innerHTML = '';

    if (faces.length === 0) {
        faceListEl.innerHTML = `<div class="empty-faces">No faces enrolled yet</div>`;
        if (saveFacesBtn) saveFacesBtn.disabled = true;
        return;
    }

    faces.forEach((face, index) => {
        const item = document.createElement('div');
        item.className = 'face-item';

        const imgSrc = face.imageUrl || '';
        alert(imgSrc);

        item.innerHTML = `
            <div class="face-avatar">
                ${imgSrc
                    ? `<img src="${imgSrc}" alt="${face.name || ''}" onerror="this.style.display='none'">`
                    : `<i data-lucide="user" style="width:22px;height:22px;color:var(--muted)"></i>`
                }
            </div>
            <div class="face-info">
                <input type="text" class="face-name-input" 
                       value="${face.name || ''}" 
                       data-index="${index}" 
                       maxlength="40" 
                       placeholder="Enter name">
                <div class="face-meta">ID: ${face.id || face.face_id || '-'}</div>
            </div>
        `;
        faceListEl.appendChild(item);
    });

    if (typeof lucide !== 'undefined') lucide.createIcons();

    faceListEl.querySelectorAll('.face-name-input').forEach(input => {
        input.addEventListener('input', function () {
            const idx = parseInt(this.dataset.index);
            faces[idx].name = this.value.trim();
            facesDirty = true;
            if (saveFacesBtn) saveFacesBtn.disabled = false;
        });
    });
}

function loadFaces() {
  

    faceListEl = document.getElementById('faceList');
    if (faceListEl) {
        faceListEl.innerHTML = `<div class="empty-faces">Loading faces...</div>`;
    }

    try {
        C4.sendCommand(
            'GET_STRANGER_FACES',
            JSON.stringify({ page: 1, page_size: 50 }),
            false,
            true
        );
    } catch (e) {
        console.error("Failed to request stranger faces", e);
        if (faceListEl) {
            faceListEl.innerHTML = `<div class="empty-faces">Failed to request faces</div>`;
        }
    }
}

function updateFacesFromDriver(notes) {
    console.log("updateFacesFromDriver received notes:", notes);

    faces = (notes || []).map(n => ({
        id: n.id || n.face_id,
        face_id: n.face_id,
        name: n.note || '',
        imageUrl: n.face_img_url || '',
        updated_at: n.updated_at
    }));

    facesDirty = false;
    saveFacesBtn = document.getElementById('saveFacesBtn');
    if (saveFacesBtn) saveFacesBtn.disabled = true;

    renderFaces();
}

function initSaveFacesButton() {
    const btn = document.getElementById('saveFacesBtn');
    if (!btn) return;

    btn.addEventListener('click', function () {
        if (!facesDirty) return;

        console.log("SAVE_FACES_TO_API", faces);

        // Send one update per changed face
        faces.forEach(face => {
            if (!face.face_id) return;

            try {
                C4.sendCommand(
                    'UPDATE_STRANGER_NOTE',
                    JSON.stringify({
                        face_id: face.face_id,
                        note: face.name || ''
                    }),
                    false,
                    true
                );
            } catch (e) {
                console.error("Failed to update note for", face.face_id, e);
            }
        });

        facesDirty = false;
        btn.disabled = true;
        showModal("Saving face names...", "Please wait");
    });
}



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

        // ========== BATTERY ==========
        if (obj.battery !== undefined) {
            updateBatteryUI(obj.battery);
            return;
        }

        // ========== LOCK STATE ==========
        var state = obj.icon || obj.state;
        if (state && state !== 'unknown') {
            applyLockState(state);
            window._lastKnownState = state;
        }

        // ========== DEVICE NAME UPDATED ==========
        if (obj.device_name_updated === true || obj.type === "device_name_updated") {
            showSuccessPopup("Device Name Updated Successfully!");
            if (deviceNameInput) deviceNameInput.value = "";
        }

        if (obj.error && String(obj.error).toLowerCase().includes("name")) {
            showSuccessPopup("Failed to update device name");
        }

        if (obj.type === "snapshot_result") {
            console.log('[Snapshot] Received result:', obj);

            if (obj.success && obj.image_url) {
                openSnapshotModal(obj.image_url, "Snapshot captured");
            } else {
                openSnapshotModal(null, obj.error || "Failed to capture snapshot");
            }
        }

        // =========================
        // STRANGER FACES LIST
        // =========================
        if (obj.type === "stranger_faces") {
            if (obj.success && obj.data && obj.data.notes) {
                updateFacesFromDriver(obj.data.notes);
            } else {
                showModal(obj.error || obj.message || "Failed to load faces", "Error");
                faces = [];
                renderFaces();
            }
        }

        // =========================
        // STRANGER NOTE UPDATED
        // =========================
        if (obj.type === "stranger_note_updated") {
            console.log("[UI] stranger_note_updated:", obj);

            if (obj.success) {
                showModal("Face name updated successfully!", "Success");

                // Optional: refresh list
                // loadFaces();
            } else {
                showModal(obj.error || "Failed to update face name", "Error");
            }
        }

    } catch (e) {
        alert("ERROR in onDataToUi: " + e.message);
        dbg('onDataToUi ERR: ' + e.message);
    }
}


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

    console.log("Device Name module initialized");

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



// ── C4 callbacks ─────────────────────────────────────
function onVariable(v)                        { console.log('onVariable:', v); }
function onSendCommandError(m)                { dbg('cmdErr: ' + m); }
function onSubscribeToDataToUi(m)             { dbg('subErr: ' + m); }
function onSubscribeToVariableError(v, m)     { dbg('varErr: ' + v + ' ' + m); }



