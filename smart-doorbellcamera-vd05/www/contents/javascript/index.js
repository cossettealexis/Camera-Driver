
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
    requestInitialState();
    initDeviceName();
    initDeviceInfo();
    initSnapshot();
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
        console.log('Control4 initialized');

    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestInitialState() {
    // Ask driver for current Anti-Pry and Mic state
    try {
        C4.sendCommand('REQUEST_INITIAL_STATE', '', false, true);
        console.log(' Requested initial Anti-Pry / Mic state');
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

        try {

            C4.sendCommand(
                "SET_DEVICE_NAME",
                JSON.stringify({ name: newName }),
                false,
                true
            );

            console.log("📤 SET_DEVICE_NAME sent:", newName);

            // Show Modal
            showModal("Device name updated successfully!", "Success");

        } catch (e) {

            console.error("Send error", e);

            if (statusEl) {
                statusEl.innerText = "Failed to send command";
                statusEl.style.color = "#ff6b6b";
            }

            // Or show an error modal instead
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

// =====================================================
// DEVICE INFO (Name + Firmware)
// =====================================================

function initDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
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

// =====================================================
// MICROPHONE
// =====================================================

function initMicrophone() {

    const toggle = document.getElementById('mic');
    if (!toggle) return;

    toggle.removeEventListener('change', handleMicToggle);
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

    isMicMuted = !!muted;

    const toggle = document.getElementById('mic');
    const status = document.getElementById('micStatus');

    if (toggle) {
        toggle.checked = !isMicMuted;

        if (toggle.checked !== !isMicMuted) {
            setTimeout(() => {
                toggle.checked = !isMicMuted;
            }, 50);
        }
    }

    if (status) {
        status.innerText = isMicMuted ? 'Muted' : 'Enabled';
    }
}

// =====================================================
// REBOOT
// =====================================================

// =====================================================
// REBOOT
// =====================================================

function initReboot() {
    const btn = document.getElementById('rebootBtn');
    if (!btn) {
        console.warn("⚠️ rebootBtn not found");
        return;
    }

    btn.removeEventListener('click', handleReboot);
    btn.addEventListener('click', handleReboot);
}

function handleReboot() {
    console.log('🔄 Reboot requested');

    const btn = document.getElementById('rebootBtn');
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Rebooting...";
    }

    try {
        C4.sendCommand(
            'REBOOT_DEVICE',
            '',
            false,
            true
        );

        console.log("📤 REBOOT_DEVICE command sent");

        // Show success modal immediately (optimistic – device will go offline)
        showModal(
            "Reboot command sent successfully.\nThe device will restart shortly.",
            "Reboot Initiated"
        );

        // Optional: re-enable the button after a few seconds
        // (in case the user stays on the page)
        setTimeout(() => {
            if (btn) {
                btn.disabled = false;
                btn.innerText = "Reboot";
            }
        }, 4000);

    } catch (e) {
        console.error("Reboot command error", e);

        if (btn) {
            btn.disabled = false;
            btn.innerText = "Reboot";
        }

        showModal("Failed to send reboot command", "Error");
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
        console.log("📤 TAKE_SNAPSHOT command sent");
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


// =====================================================
// CONTROL4 DATA SYNC (SOURCE OF TRUTH)
// =====================================================

function onDataToUi(value) {

    try {

        //const obj = JSON.parse(value);
        const jsonObject = JSON.parse(value);

        // Handle icon_description wrapper (NotificationHistory pattern)
        let obj;
        if (jsonObject.hasOwnProperty('icon_description')) {
            obj = JSON.parse(jsonObject.icon_description);
        } else {
            obj = jsonObject;
        }

      
        // =========================
        // DEVICE INFO (Name + Firmware)
        // =========================
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
        // =========================
        // ANTI-PRY SYNC
        // =========================
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

            console.log('Anti-Pry UI UPDATE →', state ? 'ENABLED' : 'DISABLED');
            updateAntiPryUI(state);
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.type === "mic_update" || obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            console.log("Mic UI UPDATE →", muted ? "MUTED" : "UNMUTED");

            updateMicUI(muted);
        }


        // Device Name Feedback
        if (obj.device_name_updated) {
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✓ Name updated successfully";
                statusEl.style.color = "#4ade80";
            }

            // Show Modal
            showModal("Device name updated successfully!", "Success");

            // Optional: clear input
            const input = document.getElementById('deviceNameInput');
            if (input) input.value = "";
        }

         if (obj.type === "snapshot_result") {
            console.log('[Snapshot] Received result:', obj);

            if (obj.success && obj.image_url) {
                openSnapshotModal(obj.image_url, "Snapshot captured");
            } else {
                openSnapshotModal(null, obj.error || "Failed to capture snapshot");
            }
        }

        // Error handling
        if (obj.error) {
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✗ Update failed";
                statusEl.style.color = "#ff6b6b";
            }
            showModal(obj.error || "Failed to update device name", "Error");
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