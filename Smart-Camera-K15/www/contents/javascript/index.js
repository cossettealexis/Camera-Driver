// K15 Settings UI - Firmware Info Only

let faces = [];
let facesDirty = false;


let faceListEl = null;
let saveFacesBtn = null;
let latestCameraSettings = {};
let isMicMuted = null;
let deviceNameEdited = false;
let storageFormatPending = false;
const pendingSettingSaves = new Map();
let settingSaveError = '';

function beginSettingSave(group) {
    if (pendingSettingSaves.size === 0) settingSaveError = '';
    pendingSettingSaves.set(group, (pendingSettingSaves.get(group) || 0) + 1);
    const modal = document.getElementById('settingSaveModal');
    if (modal) modal.classList.add('show');
    const message = document.getElementById('settingSaveMessage');
    if (message) message.innerText = 'Setting up...';
    const spinner = document.getElementById('settingSaveSpinner');
    if (spinner) spinner.hidden = false;
    const close = document.getElementById('settingSaveCloseBtn');
    if (close) close.hidden = true;
}

function finishSettingSave(group, success, error) {
    const pending = pendingSettingSaves.get(group);
    if (!pending) return;
    if (!success) settingSaveError = error || 'Setting could not be saved';
    if (pending === 1) pendingSettingSaves.delete(group);
    else pendingSettingSaves.set(group, pending - 1);
    if (pendingSettingSaves.size > 0) return;
    const message = document.getElementById('settingSaveMessage');
    if (message) message.innerText = settingSaveError || 'Setting saved';
    const spinner = document.getElementById('settingSaveSpinner');
    if (spinner) spinner.hidden = true;
    const close = document.getElementById('settingSaveCloseBtn');
    if (close) close.hidden = false;
}

function closeSettingSaveDialog() {
    if (pendingSettingSaves.size > 0) return;
    const modal = document.getElementById('settingSaveModal');
    if (modal) modal.classList.remove('show');
}


document.addEventListener('DOMContentLoaded', function () {
    initializeControl4();
    requestDeviceInfo();
     initDeviceInfo();
    initMicrophone();
    initCameraSettings();
    initReboot();
    initDeviceName();
    initSnapshot();
    loadFaces();
    initSaveFacesButton();
    requestCameraSettings();
});

function requestCameraSettings() {
    const mic = document.getElementById('mic');
    const micStatus = document.getElementById('micStatus');
    if (isMicMuted === null) {
        if (mic) mic.indeterminate = true;
        if (micStatus) micStatus.innerText = 'Refreshing...';
    }
    document.querySelectorAll('#mic, #motionDetection, #alarmToggle, #smartTrackingToggle, #recordingToggle, #nightVisionToggle, #antiFlicker, #flipImageToggle, #timeWatermarkToggle').forEach(function (control) {
        control.disabled = false;
    });
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (error) {
        console.error('Failed to request camera settings', error);
    }
}

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') requestCameraSettings();
});

window.addEventListener('pageshow', function (event) {
    requestCameraSettings();
});

window.addEventListener('focus', requestCameraSettings);

function updateMotionSettingsVisibility() {
    const motion = document.getElementById('motionDetection');
    const settings = document.getElementById('motionDependentSettings');
    if (motion && settings) settings.hidden = !motion.checked;
    const tracking = document.getElementById('smartTrackingToggle');
    const returnPosition = document.getElementById('returnPositionSettings');
    if (motion && tracking && returnPosition) returnPosition.hidden = !motion.checked || !tracking.checked;
}

function updateCameraSettingsUI(settings) {
    latestCameraSettings = { ...latestCameraSettings, ...settings };
    settings = latestCameraSettings;
    const toggles = {
        motionDetection: 'motion_switch',
        smartTrackingToggle: 'humanoid_track',
        flipImageToggle: 'flip_swt',
        timeWatermarkToggle: 'mark'
    };
    Object.entries(toggles).forEach(function ([id, key]) {
        const control = document.getElementById(id);
        const value = settings[key];
        if (!control || value === undefined || value === null) return;
        control.checked = value === true || Number(value) === 1;
        control.disabled = false;
    });
    updateMotionSettingsVisibility();
    const alarm = document.getElementById('alarmToggle');
    if (alarm && settings.siren_swt !== undefined && settings.light_swt !== undefined) {
        const audible = Number(settings.siren_swt) === 1;
        const visual = Number(settings.light_swt) === 1;
        alarm.checked = audible && visual;
        alarm.indeterminate = audible !== visual;
    }
    const selections = { detectionType: 'motion_type', detectionSensitivity: 'motion_sen', recordingToggle: 'record_mode' };
    Object.entries(selections).forEach(function ([id, key]) {
        const control = document.getElementById(id);
        if (control && settings[key] !== undefined && settings[key] !== null) control.value = String(settings[key]);
    });
    if (typeof settings.motion_x_y_w_h === 'string') {
        const coordinates = settings.motion_x_y_w_h.split(':');
        if (coordinates.length === 4 && coordinates.every(value => /^\d+$/.test(value))) {
            ['detectionZoneX', 'detectionZoneY', 'detectionZoneWidth', 'detectionZoneHeight'].forEach(function (id, index) {
                const control = document.getElementById(id);
                if (control) control.value = coordinates[index];
            });
        }
    }
    const nightVision = document.getElementById('nightVisionToggle');
    if (nightVision && settings.icut_mode !== undefined && settings.icut_mode !== null) {
        nightVision.value = String(settings.icut_mode);
        nightVision.disabled = false;
    }
    const recordingMode = document.getElementById('videoRecordingMode');
    if (recordingMode && settings.record_mode !== undefined && settings.record_mode !== null) {
        recordingMode.innerText = Number(settings.record_mode) === 0 ? 'Event Recording' :
            Number(settings.record_mode) === 1 ? 'Continuous Recording' : String(settings.record_mode);
    }
    const antiFlicker = document.getElementById('antiFlicker');
    if (antiFlicker && settings.anti_flicker !== undefined && settings.anti_flicker !== null) {
        antiFlicker.value = String(settings.anti_flicker);
        antiFlicker.disabled = false;
    }
    const storageStatus = document.getElementById('storageStatus');
    if (storageStatus && settings.stored_status !== undefined) {
        const statuses = { 0: 'Normal', 1: 'No SD card', 2: 'Filesystem not initialized' };
        storageStatus.innerText = statuses[settings.stored_status] || String(settings.stored_status);
    }
    const storageTotal = document.getElementById('storageTotal');
    const storageAvailable = document.getElementById('storageAvailable');
    const capacity = settings.stored_capacity;
    const usage = settings.stored_usage;
    if (storageTotal && capacity !== undefined && capacity !== null) {
        const total = Number(capacity);
        storageTotal.innerText = String(capacity).trim() !== '' && Number.isFinite(total) && total >= 0 && total <= 128
            ? total + ' GB' : '...';
    }
    if (storageAvailable && capacity !== undefined && capacity !== null && usage !== undefined && usage !== null) {
        const total = Number(capacity);
        const used = Number(usage);
        storageAvailable.innerText = String(capacity).trim() !== '' && String(usage).trim() !== '' &&
            Number.isFinite(total) && Number.isFinite(used) && total >= 0 && total <= 128 && used >= 0 && used <= 100
            ? Number((total * (1 - used / 100)).toFixed(2)) + ' GB' : '...';
    } else if (storageAvailable && capacity !== undefined) {
        storageAvailable.innerText = '...';
    }
    const recordingTimes = { recordMaxLength: 'motion_rec_time', recordTriggerInterval: 'motion_interval' };
    Object.entries(recordingTimes).forEach(function ([id, key]) {
        const control = document.getElementById(id);
        if (control && settings[key] !== undefined && settings[key] !== null) {
            control.value = String(settings[key]);
        }
    });
}

function initializeControl4() {
    try {
        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');
    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestDeviceInfo(resetDeviceName = false) {
    if (resetDeviceName) deviceNameEdited = false;
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}

function initDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
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

    input.addEventListener('input', function () {
        deviceNameEdited = true;
    });

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

        beginSettingSave('name');
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

            finishSettingSave('name', false, 'Failed to send command');
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
// MICROPHONE
// =====================================================

function initCameraSettings() {
    const motion = document.getElementById('motionDetection');
    const alarm = document.getElementById('alarmToggle');
    const tracking = document.getElementById('smartTrackingToggle');
    const recording = document.getElementById('recordingToggle');
    const nightVision = document.getElementById('nightVisionToggle');
    const antiFlicker = document.getElementById('antiFlicker');
    const formatBtn = document.getElementById('formatStorageBtn');
    const flipImage = document.getElementById('flipImageToggle');
    const timeWatermark = document.getElementById('timeWatermarkToggle');
    const storageStatus = document.getElementById('storageStatus');
    const recordMaxLength = document.getElementById('recordMaxLength');
    const recordTriggerInterval = document.getElementById('recordTriggerInterval');
    const saveEventTimeBtn = document.getElementById('saveEventTimeBtn');
    const eventTimeStatus = document.getElementById('eventTimeStatus');
    const detectionType = document.getElementById('detectionType');
    const detectionSensitivity = document.getElementById('detectionSensitivity');
    const zoneInputs = ['detectionZoneX', 'detectionZoneY', 'detectionZoneWidth', 'detectionZoneHeight'].map(id => document.getElementById(id));
    const saveZone = document.getElementById('saveDetectionZoneBtn');
    const fullZone = document.getElementById('fullDetectionZoneBtn');
    const zoneStatus = document.getElementById('detectionZoneStatus');

    if (!motion && !alarm && !tracking && !recording && !nightVision && !antiFlicker && !formatBtn && !saveEventTimeBtn && !flipImage && !timeWatermark) {
        return;
    }

    const sendSetting = function (key, value) {
        beginSettingSave('camera');
        try {
            const params = value !== null && typeof value === 'object' ? { key: key, ...value } : { key: key, value: value };
            C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify(params), false, true);
            return true;
        } catch (e) {
            console.error('Camera setting command failed:', key, e);
            finishSettingSave('camera', false, 'Failed to send setting');
            return false;
        }
    };

    if (detectionType) detectionType.addEventListener('change', function () { sendSetting('motion.type', Number(this.value)); });
    if (detectionSensitivity) detectionSensitivity.addEventListener('change', function () { sendSetting('motion.sen', Number(this.value)); });
    if (fullZone && zoneInputs.every(Boolean)) fullZone.addEventListener('click', function () {
        zoneInputs.forEach(input => { input.value = '0'; });
    });
    if (saveZone && zoneInputs.every(Boolean)) saveZone.addEventListener('click', function () {
        const coordinates = zoneInputs.map(input => Number(input.value));
        if (zoneInputs.some(input => !input.value) || coordinates.some(value => !Number.isSafeInteger(value) || value < 0)) {
            if (zoneStatus) zoneStatus.innerText = 'Enter nonnegative whole numbers for the detection zone.';
            return;
        }
        const sent = sendSetting('motion.x_y_w_h', coordinates.join(':'));
        if (zoneStatus) zoneStatus.innerText = sent ? 'Update requested.' : 'Failed to send update.';
    });

    if (saveEventTimeBtn && recordMaxLength && recordTriggerInterval) {
        saveEventTimeBtn.addEventListener('click', function () {
            const maxLength = Number(recordMaxLength.value);
            const interval = Number(recordTriggerInterval.value);
            if (!recordMaxLength.value || !recordTriggerInterval.value ||
                !Number.isInteger(maxLength) || maxLength < 0 || maxLength > 60 ||
                !Number.isInteger(interval) || interval < 0 || interval > 120) {
                if (eventTimeStatus) eventTimeStatus.innerText = 'Recording length must be 0-60 seconds; interval must be 0-120 seconds.';
                return;
            }
            const sent = sendSetting('motion', { rec_time: maxLength, interval: interval });
            if (eventTimeStatus) eventTimeStatus.innerText = sent ? 'Update requested.' : 'Failed to send update.';
        });
    }

    if (motion) {
        updateMotionSettingsVisibility();
        motion.addEventListener('change', function () {
            updateMotionSettingsVisibility();
            sendSetting('motion.switch', this.checked ? 1 : 0);
        });
    }

    if (alarm) {
        alarm.addEventListener('change', function () {
            sendSetting('siren_swt', this.checked ? 1 : 0);
            sendSetting('light_swt', this.checked ? 1 : 0);
        });
    }

    if (tracking) {
        tracking.addEventListener('change', function () {
            updateMotionSettingsVisibility();
            sendSetting('humanoid_track', this.checked ? 1 : 0);
        });
    }

    if (recording) {
        recording.addEventListener('change', function () {
            sendSetting('record_mode', Number(this.value));
        });
    }

    if (nightVision) {
        nightVision.addEventListener('change', function () {
            sendSetting('icut_mode', Number(this.value));
        });
    }

    if (flipImage) {
        flipImage.addEventListener('change', function () {
            sendSetting('flip_swt', this.checked ? 1 : 0);
        });
    }

    if (timeWatermark) {
        timeWatermark.addEventListener('change', function () {
            sendSetting('mark', this.checked ? 1 : 0);
        });
    }

    if (antiFlicker) {
        antiFlicker.addEventListener('change', function () {
            sendSetting('anti_flicker', Number(this.value));
        });
    }

    if (formatBtn) {
        const confirmation = document.getElementById('formatStorageConfirmModal');
        const confirmBtn = document.getElementById('confirmStorageFormatBtn');
        const cancelBtn = document.getElementById('cancelStorageFormatBtn');
        formatBtn.addEventListener('click', function () {
            if (!storageFormatPending && confirmation) confirmation.classList.add('show');
        });
        if (cancelBtn && confirmation) cancelBtn.addEventListener('click', function () {
            confirmation.classList.remove('show');
        });
        if (confirmBtn && confirmation) confirmBtn.addEventListener('click', function () {
            if (storageFormatPending || !confirmation.classList.contains('show')) return;
            confirmation.classList.remove('show');
            storageFormatPending = true;

            formatBtn.disabled = true;
            formatBtn.innerText = 'Formatting...';
            if (storageStatus) storageStatus.innerText = 'Formatting local storage...';

            beginSettingSave('storage');
            try {
                C4.sendCommand('FORMAT_STORAGE', JSON.stringify({ confirmed: true }), false, true);
            } catch (e) {
                console.error('Format storage command failed', e);
                storageFormatPending = false;
                formatBtn.disabled = false;
                formatBtn.innerText = 'Format Local Storage';
                if (storageStatus) storageStatus.innerText = 'Failed to send format command.';
                finishSettingSave('storage', false, 'Failed to format local storage.');
            }
        });
    }
}

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

    beginSettingSave('mic');
    try {

        C4.sendCommand(
            muted ? 'MUTE_MIC' : 'UNMUTE_MIC',
            '',
            false,
            true
        );

    } catch (e) {
        console.log('Mic command error', e);
        finishSettingSave('mic', false, 'Failed to send microphone command');
    }
}

function updateMicUI(muted) {

    isMicMuted = !!muted;

    const toggle = document.getElementById('mic');
    const status = document.getElementById('micStatus');

    if (toggle) {
        toggle.checked = !isMicMuted;
        toggle.indeterminate = false;
        toggle.disabled = false;

        if (toggle.checked !== !isMicMuted) {
            setTimeout(() => {
                toggle.checked = !isMicMuted;
            }, 50);
        }
    }

    if (status) {
        status.innerText = isMicMuted ? 'Call ended' : 'Call started';
    }
}


//Reboot
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

//snapshot
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

function renderFaces() {
    // Always re-query in case they were null
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

            beginSettingSave('face');
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
                finishSettingSave('face', false, 'Failed to update face name');
            }
        });

        facesDirty = false;
        btn.disabled = true;
    });
}

function onDataToUi(value) {
    try {
        const jsonObject = JSON.parse(value);

        // Handle icon_description wrapper
        let obj;
        if (jsonObject.hasOwnProperty('icon_description')) {
            obj = JSON.parse(jsonObject.icon_description);
        } else {
            obj = jsonObject;
        }

        if (obj.type === 'camera_settings') {
            if (obj.success) {
                updateCameraSettingsUI(obj.settings || {});
                if (obj.setting_saved) finishSettingSave('camera', true);
                if (obj.event_time_updated) {
                    const status = document.getElementById('eventTimeStatus');
                    if (status) status.innerText = 'Saved.';
                }
            } else {
                console.error('Camera settings API refresh failed');
            }
        }

        if (obj.mic_read_success === false || (obj.type === 'camera_settings' && !obj.success)) {
            const status = document.getElementById('micStatus');
            if (status && isMicMuted === null) status.innerText = '';
        }

        if (obj.type === 'storage_format') {
            storageFormatPending = false;
            const formatBtn = document.getElementById('formatStorageBtn');
            if (formatBtn) {
                formatBtn.disabled = false;
                formatBtn.innerText = 'Format Local Storage';
            }
            const status = document.getElementById('storageStatus');
            if (status) status.innerText = obj.success ? 'Local storage format requested.' : 'Local storage format failed.';
            finishSettingSave('storage', obj.success, obj.error || 'Local storage format failed.');
            if (obj.success) requestCameraSettings();
        }

        if (obj.type === 'camera_setting_result' && !obj.success) {
            finishSettingSave('camera', false, obj.error);
            requestCameraSettings();
        }

        if (obj.type === 'mic_setting_result') {
            finishSettingSave('mic', obj.success, obj.error);
        }

        if (obj.type === 'device_name_result' && !obj.success) {
            finishSettingSave('name', false, obj.error);
        }

        // Device Info
        if (obj.type === "device_info" && obj.success) {
            const devEl = document.getElementById('deviceVersion');
            const fwEl = document.getElementById('firmwareVersion');
            const relEl = document.getElementById('releaseDate');
            const nameInput = document.getElementById('deviceNameInput');

            if (nameInput && !deviceNameEdited && typeof obj.device_name === 'string') {
                nameInput.value = obj.device_name;
            }

            if (devEl) {
                devEl.innerText = "Device: " + (obj.device_name || "Unknown");
            }

            if (fwEl) {
                fwEl.innerText = "Firmware: " + (obj.version || "N/A");
            }

            if (relEl) {
                relEl.innerText = "Release: " + (obj.release_date || "N/A");
            }
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.mic_muted !== undefined && obj.mic_muted !== null) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1 || obj.mic_muted === '1' || obj.mic_muted === 'true';

            console.log("🎤 Mic UI UPDATE →", muted ? "MUTED" : "UNMUTED");

            updateMicUI(muted);
        }


        // Device Name Feedback
        if (obj.device_name_updated) {
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✓ Name updated successfully";
                statusEl.style.color = "#4ade80";
            }

            finishSettingSave('name', true);

            requestDeviceInfo(true);
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
            finishSettingSave('face', obj.success, obj.error);

            if (obj.success) {

                // Optional: refresh list
                // loadFaces();
            } else {
                facesDirty = true;
                const save = document.getElementById('saveFacesBtn');
                if (save) save.disabled = false;
            }
        }

    } catch (e) {
        console.error('onDataToUi ERROR:', e);
    }
}



// =====================================================
// ERROR HANDLERS
// =====================================================

function onVariable(v) {
    console.log('onVariable', v);
    requestCameraSettings();
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