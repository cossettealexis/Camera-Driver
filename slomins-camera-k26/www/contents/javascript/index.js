// K26 Settings UI
let isMicMuted = false;
let latestCameraSettings = {};
let hasConfirmedMicCall = false;
let confirmedDeviceName = '';
let pendingDeviceName = '';
let deviceNameDraftDirty = false;
let deviceNameReturnFocus;
let settingsLoading = false;
let settingsLoadScope = 'motion';
let settingsLoadTimer;
let settingToastTimer;
let settingSaveFailed = false;
let motionOptionDraft = null;
const pendingSettingSaves = new Map();
const motionOptionSpecs = {
    motionDetectionType: {
        key: 'motion.type', title: 'Detection Type', labels: ['Motion Detection', 'Person Detection'],
        descriptions: ['All detected movements trigger events', 'Only people can trigger the detector']
    },
    motionSensitivity: {
        key: 'motion.sen', title: 'Detection Sensitivity', min: 0, max: 2, slider: true,
        labels: ['Low', 'Medium', 'High'], immediate: true,
        description: 'Motion detected in zone. Starting recording.'
    },
    faceSimilarity: {
        key: 'unknow_thld', title: 'Face Similarity Threshold', min: 1, max: 99, slider: true,
        description: 'The higher the threshold, the fewer misjudgments in facial recognition, but the probability of missed judgments may increase'
    },
    faceQuality: {
        key: 'unknow_faceq', title: 'Face Image Quality Threshold', immediate: true,
        labels: ['Low', 'Medium', 'High'], description: 'Filter low-quality facial images according to the set threshold'
    },
    nightVisionMode: {
        key: 'icut_mode', title: 'Night Vision Mode', immediate: true,
        values: [0, 2, 3], labels: ['Infrared night vision', 'Color night vision', 'Smart night vision'],
        descriptions: [
            'When an event is detected at night, the infrared light automatically turns on',
            'When an event is detected at night, the white light will be automatically turned on to record color video, but it will accelerate battery consumption',
            ''
        ]
    },
    antiFlicker: {
        key: 'anti_flicker', title: 'Anti-Flicker', immediate: true, labels: ['OFF', '50Hz', '60Hz']
    }
};

function showSettingToast(message) {
    const toast = document.getElementById('settingSaveToast');
    clearTimeout(settingToastTimer);
    toast.textContent = message;
    toast.hidden = false;
    settingToastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

function updateSettingSaveOverlay() {
    const pending = settingsLoading || pendingSettingSaves.size > 0;
    const overlay = document.getElementById('settingSaveOverlay');
    overlay.setAttribute('data-loading', String(settingsLoading));
    overlay.hidden = !pending;
    document.getElementById('settingSaveLabel').textContent = settingsLoading ? 'Loading...' :
        (pendingSettingSaves.get('mic')?.label || 'Setting up...');
    const app = document.querySelector('.app');
    if (app) app.inert = pending || !document.getElementById('deviceNameSheet').hidden;
    if (pending) overlay.focus();
}

function finishCameraSettingsLoad(success, error) {
    if (!settingsLoading) return;
    clearTimeout(settingsLoadTimer);
    settingsLoading = false;
    updateSettingSaveOverlay();
    if (!success) {
        show('homePanel');
        showSettingToast(error || 'Unable to load settings');
    }
}

function beginSettingSave(kind, label = 'Setting up...') {
    if (pendingSettingSaves.size === 0) settingSaveFailed = false;
    const previous = pendingSettingSaves.get(kind);
    if (previous) clearTimeout(previous.timer);
    pendingSettingSaves.set(kind, {
        label,
        count: (previous?.count || 0) + 1,
        timer: setTimeout(() => {
            pendingSettingSaves.delete(kind);
            settingSaveFailed = true;
            if (kind === 'camera') updateCameraSettingsUI({});
            if (kind === 'mic') updateMicUI(isMicMuted);
            if (kind === 'name') updateDeviceNameConfirm();
            updateSettingSaveOverlay();
            showSettingToast('Setting update timed out');
        }, 20000)
    });
    document.getElementById('settingSaveToast').hidden = true;
    updateSettingSaveOverlay();
}

function finishSettingSave(kind, success, error, message = 'Settings saved') {
    const pending = pendingSettingSaves.get(kind);
    if (!pending) return;
    if (!success) settingSaveFailed = true;
    pending.count -= 1;
    if (pending.count === 0 || !success) {
        clearTimeout(pending.timer);
        pendingSettingSaves.delete(kind);
    }
    if (kind === 'name') updateDeviceNameConfirm();
    updateSettingSaveOverlay();
    if (!success) showSettingToast(error || 'Unable to save settings');
    else if (!settingsLoading && pendingSettingSaves.size === 0 && !settingSaveFailed) showSettingToast(message);
}

function closeMotionOption() {
    document.getElementById('motionOptionSheet').hidden = true;
    motionOptionDraft = null;
}

function confirmMotionOption() {
    if (!motionOptionDraft) return;
    const { id, value } = motionOptionDraft;
    closeMotionOption();
    sendCameraSetting(motionOptionSpecs[id].key, id === 'faceSimilarity' ? value / 100 : value);
}

function openMotionOption(id) {
    const spec = motionOptionSpecs[id];
    const control = document.getElementById(id);
    if (!spec || control.disabled || control.value === '') return;
    const value = id === 'faceSimilarity' ? Math.round(Number(control.value) * 100) : Number(control.value);
    motionOptionDraft = { id, value };
    document.getElementById('motionOptionTitle').textContent = spec.title;
    const description = document.getElementById('motionOptionDescription');
    description.textContent = spec.description || '';
    description.hidden = !spec.description;
    document.getElementById('motionOptionConfirm').hidden = !!spec.immediate;
    const body = document.getElementById('motionOptionBody');
    body.replaceChildren();
    if (spec.slider) {
        const wrapper = document.createElement('div');
        wrapper.className = 'motion-option-range';
        const output = document.createElement('output');
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(spec.min);
        slider.max = String(spec.max);
        slider.step = '1';
        slider.value = String(value);
        slider.setAttribute('aria-label', spec.title);
        const update = () => {
            if (!motionOptionDraft) return;
            motionOptionDraft.value = Number(slider.value);
            const progress = (Number(slider.value) - spec.min) / (spec.max - spec.min);
            slider.style.setProperty('--range-fill', `${progress * 100}%`);
            output.style.left = `calc(12px + ${progress * 100}% - ${progress * 24}px)`;
            output.textContent = id === 'faceSimilarity' ? `${slider.value}%` : spec.labels[Number(slider.value)];
        };
        slider.addEventListener('input', update);
        if (spec.immediate) slider.addEventListener('change', confirmMotionOption);
        const bounds = document.createElement('div');
        bounds.className = 'motion-option-bounds';
        (id === 'faceSimilarity' ? ['1%', '99%'] : spec.labels).forEach(text => {
            const label = document.createElement('span');
            label.textContent = text;
            bounds.appendChild(label);
        });
        wrapper.appendChild(output);
        wrapper.appendChild(slider);
        wrapper.appendChild(bounds);
        body.appendChild(wrapper);
        update();
    } else {
        spec.labels.forEach((label, index) => {
            const optionValue = spec.values ? spec.values[index] : index;
            const row = document.createElement('label');
            row.className = `motion-option-item${spec.descriptions ? ' motion-option-type' : ''}`;
            const copy = document.createElement('span');
            copy.textContent = label;
            if (spec.descriptions && spec.descriptions[index]) {
                const detail = document.createElement('span');
                detail.className = 'motion-option-subtitle';
                detail.textContent = spec.descriptions[index];
                copy.appendChild(detail);
            }
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'motion-option';
            radio.value = String(optionValue);
            radio.disabled = false;
            radio.checked = optionValue === value;
            radio.addEventListener('change', () => {
                if (!motionOptionDraft) return;
                motionOptionDraft.value = optionValue;
                if (spec.immediate) confirmMotionOption();
            });
            row.appendChild(copy);
            row.appendChild(radio);
            body.appendChild(row);
        });
    }
    document.getElementById('motionOptionSheet').hidden = false;
}

function updateMotionChoiceLabels() {
    Object.entries(motionOptionSpecs).forEach(([id, spec]) => {
        const control = document.getElementById(id);
        const value = Number(control.value);
        const labelIndex = spec.values ? spec.values.indexOf(value) : value;
        const label = control.disabled || control.value === '' ? '...' :
            id === 'faceSimilarity' ? `${Math.round(value * 100)}%` : spec.labels[labelIndex];
        document.getElementById(`${id}Value`).textContent = label || '...';
    });
}

function updateMotionVisibility() {
    const motion = document.getElementById('motionDetectionToggle');
    document.getElementById('motionSettingsGroup').hidden = motion.indeterminate || !motion.checked;
    document.getElementById('motionAlarmGroup').hidden = motion.indeterminate || !motion.checked;
    const facial = document.getElementById('faceRecEnable');
    ['faceSimilarity', 'faceQuality'].forEach(id => {
        const row = document.getElementById(id);
        row.hidden = facial.indeterminate || !facial.checked || row.disabled;
    });
    document.getElementById('k26FaceManagement').hidden = !facial.indeterminate && !facial.checked;
}

function resetCameraSettings() {
    latestCameraSettings = {};
    ['motionDetectionToggle', 'motionAlarmToggle', 'faceRecEnable', 'flipImageToggle', 'timeWatermarkToggle'].forEach(id => {
        const control = document.getElementById(id);
        control.disabled = true;
        control.indeterminate = true;
        control.checked = false;
    });
    ['motionDetectionType', 'motionSensitivity', 'faceSimilarity', 'faceQuality', 'nightVisionMode', 'antiFlicker', 'k26ZoneX', 'k26ZoneY', 'k26ZoneWidth', 'k26ZoneHeight'].forEach(id => {
        const control = document.getElementById(id);
        control.disabled = true;
        control.value = '';
    });
    document.getElementById('motionZoneOpen').disabled = true;
    document.getElementById('k26ZoneSave').disabled = true;
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

function cameraSettingsReady() {
    if (settingsLoadScope === 'video') {
        return ['nightVisionMode', 'antiFlicker', 'flipImageToggle', 'timeWatermarkToggle']
            .every(id => !document.getElementById(id).disabled);
    }
    const motion = document.getElementById('motionDetectionToggle');
    const facial = document.getElementById('faceRecEnable');
    if (motion.disabled || facial.disabled) return false;
    const motionReady = !motion.checked || ['motionDetectionType', 'motionSensitivity', 'motionAlarmToggle', 'k26ZoneSave']
        .every(id => !document.getElementById(id).disabled);
    const facialReady = !facial.checked || ['faceSimilarity', 'faceQuality']
        .every(id => !document.getElementById(id).disabled);
    return motionReady && facialReady;
}

document.addEventListener('DOMContentLoaded', function () {
    initializeControl4();
    requestDeviceInfo();
    initMicrophone();
    initReboot();
    initDeviceName();
    initSnapshot();
    initSaveFacesButton();
    initCameraSettings();
    requestCameraSettings();
});

function requestCameraSettings(scope = 'motion') {
    clearTimeout(settingsLoadTimer);
    settingsLoadScope = scope;
    settingsLoading = true;
    resetCameraSettings();
    document.getElementById('settingSaveToast').hidden = true;
    updateSettingSaveOverlay();
    settingsLoadTimer = setTimeout(() => finishCameraSettingsLoad(false, 'Settings request timed out'), 20000);
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (e) {
        console.error('Failed to request camera settings', e);
        finishCameraSettingsLoad(false, 'Unable to request camera settings');
    }
}

function sendCameraSetting(key, value) {
    beginSettingSave('camera');
    try {
        C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify({ key, value }), false, true);
    } catch (e) {
        console.error('Failed to update camera setting', e);
        updateCameraSettingsUI({});
        finishSettingSave('camera', false, 'Unable to send setting');
    }
}

function setCameraSettingsStatus(message) {
    const status = document.getElementById('k26MotionStatus');
    if (status) status.innerText = message || '';
}

function updateCameraSettingsUI(settings) {
    latestCameraSettings = { ...latestCameraSettings, ...settings };
    const integerInRange = (value, limit) => value !== undefined && value !== null && value !== '' &&
        Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= limit;
    const motionEnabled = Number(latestCameraSettings.motion_switch) === 1;
    const motionToggle = document.getElementById('motionDetectionToggle');
    if (motionToggle && integerInRange(latestCameraSettings.motion_switch, 1)) {
        motionToggle.checked = motionEnabled;
        motionToggle.indeterminate = false;
        motionToggle.disabled = false;
    }
    const motionGroup = document.getElementById('motionSettingsGroup');
    const alarmGroup = document.getElementById('motionAlarmGroup');
    if (motionGroup) motionGroup.hidden = !motionEnabled;
    if (alarmGroup) alarmGroup.hidden = !motionEnabled;

    [
        ['motionDetectionType', 'motion_type'],
        ['motionSensitivity', 'motion_sen']
    ].forEach(([id, key]) => {
        const control = document.getElementById(id);
        if (control && integerInRange(latestCameraSettings[key], key === 'motion_type' ? 1 : 2)) {
            control.value = String(latestCameraSettings[key]);
            control.disabled = false;
        }
    });
    const alarm = document.getElementById('motionAlarmToggle');
    if (alarm && integerInRange(latestCameraSettings.siren_swt, 1) && integerInRange(latestCameraSettings.light_swt, 1)) {
        alarm.checked = Number(latestCameraSettings.siren_swt) === 1 && Number(latestCameraSettings.light_swt) === 1;
        alarm.indeterminate = Number(latestCameraSettings.siren_swt) !== Number(latestCameraSettings.light_swt);
        alarm.disabled = false;
    }
    const facial = document.getElementById('faceRecEnable');
    if (integerInRange(latestCameraSettings.unknow_snapswt, 1)) {
        facial.checked = Number(latestCameraSettings.unknow_snapswt) === 1;
        facial.indeterminate = false;
        facial.disabled = false;
    }
    const similarity = latestCameraSettings.unknow_thld;
    if (similarity !== undefined && similarity !== null && similarity !== '' &&
        Number.isFinite(Number(similarity)) && Number(similarity) >= .01 && Number(similarity) <= .99) {
        const control = document.getElementById('faceSimilarity');
        control.value = String(Number(similarity));
        control.disabled = false;
    }
    if (integerInRange(latestCameraSettings.unknow_faceq, 2)) {
        const control = document.getElementById('faceQuality');
        control.value = String(latestCameraSettings.unknow_faceq);
        control.disabled = false;
    }
    [['nightVisionMode', 'icut_mode'], ['antiFlicker', 'anti_flicker']].forEach(([id, key]) => {
        const value = latestCameraSettings[key];
        const valid = key === 'icut_mode' ? value !== undefined && value !== null && value !== '' &&
            [0, 2, 3].includes(Number(value)) : integerInRange(value, 2);
        if (valid) {
            const control = document.getElementById(id);
            control.value = String(value);
            control.disabled = false;
        }
    });
    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        if (integerInRange(latestCameraSettings[key], 1)) {
            const control = document.getElementById(id);
            control.checked = Number(latestCameraSettings[key]) === 1;
            control.indeterminate = false;
            control.disabled = false;
        }
    });
    const zone = document.getElementById('motionZoneOpen');
    if (zone && typeof latestCameraSettings.motion_x_y_w_h === 'string') {
        const coordinates = latestCameraSettings.motion_x_y_w_h.split(':');
        if (coordinates.length === 4 && coordinates.every(value => /^\d+$/.test(value))) {
            ['k26ZoneX', 'k26ZoneY', 'k26ZoneWidth', 'k26ZoneHeight'].forEach((id, index) => {
                const input = document.getElementById(id);
                if (input) {
                    input.value = coordinates[index];
                    input.disabled = false;
                }
            });
            zone.disabled = false;
            const save = document.getElementById('k26ZoneSave');
            if (save) save.disabled = false;
        }
    }
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

function initCameraSettings() {
    resetCameraSettings();
    const motionToggle = document.getElementById('motionDetectionToggle');
    const detectionType = document.getElementById('motionDetectionType');
    const sensitivity = document.getElementById('motionSensitivity');
    const alarm = document.getElementById('motionAlarmToggle');
    const zoneOpen = document.getElementById('motionZoneOpen');
    const zoneSave = document.getElementById('k26ZoneSave');

    if (motionToggle) motionToggle.addEventListener('change', () => {
        updateMotionVisibility();
        sendCameraSetting('motion.switch', motionToggle.checked ? 1 : 0);
    });
    if (detectionType) detectionType.addEventListener('change', () => sendCameraSetting('motion.type', detectionType.value));
    if (sensitivity) sensitivity.addEventListener('change', () => sendCameraSetting('motion.sen', sensitivity.value));
    if (alarm) alarm.addEventListener('change', () => sendCameraSetting('alarm', alarm.checked ? 1 : 0));
    const facial = document.getElementById('faceRecEnable');
    facial.addEventListener('change', () => {
        updateMotionVisibility();
        sendCameraSetting('unknow_snapswt', facial.checked ? 1 : 0);
    });
    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        const control = document.getElementById(id);
        control.addEventListener('change', () => sendCameraSetting(key, control.checked ? 1 : 0));
    });
    if (zoneOpen) zoneOpen.addEventListener('click', () => show('detectionZonePanel'));
    if (zoneSave) zoneSave.addEventListener('click', () => {
        const coordinates = ['k26ZoneX', 'k26ZoneY', 'k26ZoneWidth', 'k26ZoneHeight']
            .map(id => document.getElementById(id)?.value);
        if (coordinates.some(value => !/^\d+$/.test(value || ''))) {
            const status = document.getElementById('k26ZoneStatus');
            if (status) status.innerText = 'Enter four whole-number coordinates';
            return;
        }
        sendCameraSetting('motion.x_y_w_h', coordinates.join(':'));
        const status = document.getElementById('k26ZoneStatus');
        if (status) status.innerText = '';
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

function requestDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}

function updateDeviceNameConfirm() {
    const input = document.getElementById('deviceNameInput');
    document.getElementById('updateNameBtn').disabled = pendingSettingSaves.has('name') || !input.value.trim();
}

function openDeviceNameSheet() {
    if (settingsLoading || pendingSettingSaves.size > 0) return;
    deviceNameReturnFocus = document.activeElement;
    deviceNameDraftDirty = false;
    const input = document.getElementById('deviceNameInput');
    input.value = confirmedDeviceName;
    document.getElementById('deviceNameStatus').innerText = '';
    document.getElementById('deviceNameSheet').hidden = false;
    updateDeviceNameConfirm();
    updateSettingSaveOverlay();
    input.focus();
    input.select();
    requestDeviceInfo();
}

function closeDeviceNameSheet() {
    if (pendingSettingSaves.has('name')) return;
    document.getElementById('deviceNameSheet').hidden = true;
    deviceNameDraftDirty = false;
    document.getElementById('deviceNameInput').value = confirmedDeviceName;
    document.getElementById('deviceNameStatus').innerText = '';
    updateDeviceNameConfirm();
    updateSettingSaveOverlay();
    deviceNameReturnFocus?.focus();
}

function clearDeviceName() {
    if (pendingSettingSaves.has('name')) return;
    const input = document.getElementById('deviceNameInput');
    input.value = '';
    deviceNameDraftDirty = true;
    document.getElementById('deviceNameStatus').innerText = '';
    updateDeviceNameConfirm();
    input.focus();
}

function initDeviceName() {

    const input = document.getElementById('deviceNameInput');
    const btn = document.getElementById('updateNameBtn');
    const statusEl = document.getElementById('deviceNameStatus');

    if (!btn || !input) {
        console.error(" Device name elements not found");
        return;
    }

    console.log("✅ Device Name module initialized");

    input.addEventListener('input', () => {
        deviceNameDraftDirty = true;
        if (statusEl) statusEl.innerText = '';
        updateDeviceNameConfirm();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && !document.getElementById('deviceNameSheet').hidden) closeDeviceNameSheet();
    });

    btn.addEventListener('click', function () {
        if (pendingSettingSaves.has('name')) return;
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

        pendingDeviceName = newName;
        beginSettingSave('name');
        updateDeviceNameConfirm();
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

function initMicrophone() {

    const toggle = document.getElementById('mic');
    if (!toggle) return;

    toggle.removeEventListener('change', handleMicToggle);
    toggle.addEventListener('change', handleMicToggle);
    const status = document.getElementById('micStatus');
    if (status && !hasConfirmedMicCall) status.innerText = 'Switch on to start a call.';
}

function handleMicToggle(e) {

    const muted = !e.target.checked;

    console.log('🎤 Mic toggle clicked:', muted ? 'MUTE' : 'UNMUTE');

    sendMicCommand(muted);
}

function sendMicCommand(muted) {
    beginSettingSave('mic', muted ? 'Ending call...' : 'Starting call...');
    try {

        C4.sendCommand(
            muted ? 'MUTE_MIC' : 'UNMUTE_MIC',
            '',
            false,
            true
        );

    } catch (e) {
        console.log('Mic command error', e);
        updateMicUI(isMicMuted);
        finishSettingSave('mic', false, 'Unable to send call command');
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
        status.innerText = hasConfirmedMicCall ? (isMicMuted ? 'Call Ended' : 'Call Started') : 'Switch on to start a call.';
    }
}


//Reboot
function initReboot() {
    const btn = document.getElementById('rebootBtn');
    if (!btn) {
        console.warn("rebootBtn not found");
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

        const updates = faces.filter(face => face.face_id);
        if (updates.length === 0) return;
        btn.disabled = true;
        updates.forEach(() => beginSettingSave('faces'));
        updates.forEach(face => {

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
                finishSettingSave('faces', false, 'Unable to send face name');
                btn.disabled = false;
            }
        });
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

        // Device Info
        if (obj.type === "device_info" && obj.success) {
            const devEl = document.getElementById('deviceVersion');
            const fwEl = document.getElementById('firmwareVersion');
            const relEl = document.getElementById('releaseDate');
            const homeName = document.getElementById('homeDeviceName');

            if (devEl) {
                devEl.innerText = obj.device_name || '...';
            }
            if (homeName) homeName.innerText = obj.device_name || '...';

            if (fwEl) {
                fwEl.innerText = obj.version || '...';
            }

            if (relEl) {
                relEl.innerText = obj.release_date || '...';
            }
            const nameInput = document.getElementById('deviceNameInput');
            if (obj.device_name) {
                confirmedDeviceName = obj.device_name;
                if (nameInput && !deviceNameDraftDirty && !pendingSettingSaves.has('name')) {
                    nameInput.value = confirmedDeviceName;
                    updateDeviceNameConfirm();
                    if (!document.getElementById('deviceNameSheet').hidden) nameInput.select();
                }
            }
        }

        if (obj.type === 'camera_settings') {
            if (obj.success && obj.settings) {
                updateCameraSettingsUI(obj.settings);
                if (obj.setting_saved) finishSettingSave('camera', true);
                else if (cameraSettingsReady()) finishCameraSettingsLoad(true);
            } else if (!obj.success) {
                finishCameraSettingsLoad(false, 'Unable to load camera settings');
            }
            return;
        }

        if (obj.type === 'camera_setting_result' && !obj.success) {
            updateCameraSettingsUI({});
            finishSettingSave('camera', false, obj.error || 'Camera setting update failed');
            return;
        }

        if (obj.type === 'mic_result') {
            if (obj.success) {
                hasConfirmedMicCall = true;
                updateMicUI(obj.mic_muted === true || obj.mic_muted === 1);
            } else updateMicUI(isMicMuted);
            finishSettingSave('mic', obj.success, obj.error || 'Unable to update call',
                isMicMuted ? 'Call Ended' : 'Call Started');
            return;
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if ((obj.type === "mic_update" || obj.mic_muted !== undefined) && !pendingSettingSaves.has('mic')) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

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
            const updatedName = obj.device_name || pendingDeviceName;
            if (updatedName) {
                confirmedDeviceName = updatedName;
                document.getElementById('homeDeviceName').innerText = updatedName;
                document.getElementById('deviceVersion').innerText = updatedName;
            }
            pendingDeviceName = '';
            closeDeviceNameSheet();
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
            finishSettingSave('faces', obj.success, obj.error || 'Failed to update face name');
            if (!obj.success) {
                facesDirty = true;
                document.getElementById('saveFacesBtn').disabled = false;
            } else if (!pendingSettingSaves.has('faces') && !settingSaveFailed) {
                facesDirty = false;
            }
            return;
        }

        // Error handling
        if (obj.error && obj.type !== 'camera_setting_result') {
            if (pendingSettingSaves.has('name')) {
                finishSettingSave('name', false, obj.error);
                document.getElementById('deviceNameStatus').innerText = obj.error;
                return;
            }
            const statusEl = document.getElementById('deviceNameStatus');
            if (statusEl) {
                statusEl.innerText = "✗ Update failed";
                statusEl.style.color = "#ff6b6b";
            }
            showModal(obj.error || "Failed to update device name", "Error");
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