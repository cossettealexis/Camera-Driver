// K15 Settings UI - Firmware Info Only

let faces = [];
let facesDirty = false;


let faceListEl = null;
let saveFacesBtn = null;
let latestCameraSettings = {};
let latestSnapshotUrl = '';
let k15PresetLoadTimer = null;
let k15PresetLoadPending = false;
let k15ZoomIndex = 0;
const k15ZoomLevels = [1, 2, 3, 4, 5, 6];
let k15SpeakerVolumeBeforeMute = null;
let k15SpeakerLoadPending = false;
let k15SpeakerWritePending = false;
let k15SpeakerTogglePending = false;
let k15SpeakerLoadTimer = null;
let isMicMuted = null;
let deviceNameEdited = false;
let storageFormatPending = false;
let settingsLoadTimer = null;
let settingsLoadPending = false;
let k15DetectionTypeDraft = null;
const k15VideoOptionSpecs = {
    recordingMode: {
        key: 'record_mode', title: 'Recording Mode', values: [0, 1],
        labels: ['Event Recording Mode', '24hr Continuous Record'],
        descriptions: ['In Event Recording Mode, the device is woken up by events to record, which provides longer battery life.', '24-Hour Uninterrupted Recording']
    },
    nightVision: {
        key: 'icut_mode', title: 'Night Vision Mode', values: [0, 2, 3],
        labels: ['Infrared Night Vision', 'Color Night Vision', 'Smart Night Vision'],
        descriptions: [
            'At night, the device always uses infrared light for imaging and does not turn on the white light.',
            'At night, the device always uses white light for imaging to capture continuous color footage.',
            'At night, the device defaults to infrared night vision and automatically switches to color night vision when a valid event is detected to capture more detailed video footage.'
        ]
    },
    antiFlicker: { key: 'anti_flicker', title: 'Anti-Flicker', values: [0, 1, 2], labels: ['OFF', '50Hz', '60Hz'] }
};
const pendingSettingSaves = new Map();
let settingSaveError = '';

function finishSettingsLoad() {
    if (!settingsLoadPending) return;
    settingsLoadPending = false;
    clearTimeout(settingsLoadTimer);
    const overlay = document.getElementById('settingsLoadingOverlay');
    if (overlay) overlay.hidden = true;
}

let k15ToastTimer = null;

function showK15Toast(message) {
    const toast = document.getElementById('k15StatusToast');
    if (!toast) return;
    clearTimeout(k15ToastTimer);
    toast.textContent = message;
    toast.hidden = false;
    k15ToastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

function beginSettingsLoad() {
    settingsLoadPending = true;
    const overlay = document.getElementById('settingsLoadingOverlay');
    if (overlay) overlay.hidden = false;
    clearTimeout(settingsLoadTimer);
    settingsLoadTimer = setTimeout(finishSettingsLoad, 15000);
}

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

function finishSettingSave(group, success, error, successMessage = 'Setting saved') {
    const pending = pendingSettingSaves.get(group);
    if (!pending) return;
    if (!success) settingSaveError = error || 'Setting could not be saved';
    if (pending === 1) pendingSettingSaves.delete(group);
    else pendingSettingSaves.set(group, pending - 1);
    if (group === 'name') updateK15DeviceNameConfirm();
    if (pendingSettingSaves.size > 0) return;
    const message = document.getElementById('settingSaveMessage');
    if (message) message.innerText = settingSaveError || successMessage;
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
    initMicrophone();
    initCameraSettings();
    initReboot();
    initDeviceName();
    initSnapshot();
    loadFaces();
    initSaveFacesButton();
    requestCameraSettings(true);
});

function requestCameraSettings(showLoading = false) {
    if (showLoading) beginSettingsLoad();
    const mic = document.getElementById('mic');
    const micStatus = document.getElementById('micStatus');
    if (isMicMuted === null) {
        if (mic) mic.indeterminate = true;
        if (micStatus) micStatus.innerText = 'Refreshing...';
    }
        document.querySelectorAll('#mic, #speakerVolume, #motionDetection, #detectionType, #detectionSensitivity, #k15SensitivitySlider, #alarmToggle, #recordingToggle, #nightVisionToggle, #antiFlicker, #flipImageToggle, #timeWatermarkToggle').forEach(function (control) {
            control.disabled = true;
    });
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (error) {
        console.error('Failed to request camera settings', error);
        if (showLoading) finishSettingsLoad();
    }
}

function sendK15Ptz(direction) {
    try {
        if (direction === 'stop') C4.sendCommand('PTZ_STOP', '', false, true);
        else C4.sendCommand('PTZ_MOVE', JSON.stringify({ direction }), false, true);
    } catch (error) {
        console.error('Failed to send camera movement command', error);
    }
}

function toggleK15Fullscreen() {
    const view = document.getElementById('k15CameraView');
    const button = document.getElementById('k15ViewerFullscreen');
    if (!view || !button) return;
    if (document.fullscreenElement === view) {
        document.exitFullscreen?.();
        return;
    }
    const setFallback = fullscreen => {
        view.classList.toggle('is-fullscreen', fullscreen);
        button.setAttribute('aria-pressed', String(fullscreen));
    };
    if (view.classList.contains('is-fullscreen')) {
        setFallback(false);
    } else if (typeof view.requestFullscreen === 'function') {
        view.requestFullscreen().catch(() => setFallback(true));
    } else {
        setFallback(true);
    }
}

document.addEventListener('fullscreenchange', () => {
    const view = document.getElementById('k15CameraView');
    const button = document.getElementById('k15ViewerFullscreen');
    if (!view || !button) return;
    const fullscreen = document.fullscreenElement === view;
    view.classList.toggle('is-fullscreen', fullscreen);
    button.setAttribute('aria-pressed', String(fullscreen));
});

document.addEventListener('keydown', event => {
    const view = document.getElementById('k15CameraView');
    if (event.key === 'Escape' && view?.classList.contains('is-fullscreen')) toggleK15Fullscreen();
});

function cycleK15Zoom() {
    k15ZoomIndex = (k15ZoomIndex + 1) % k15ZoomLevels.length;
    const zoom = k15ZoomLevels[k15ZoomIndex];
    const frame = document.querySelector('#k15CameraView .camera-frame');
    const chip = document.getElementById('k15ZoomChip');
    if (frame) frame.style.setProperty('--viewer-zoom', String(zoom));
    if (chip) {
        chip.textContent = `${zoom.toFixed(1)}X`;
        chip.setAttribute('aria-label', `Change zoom, currently ${zoom.toFixed(1)}X`);
        chip.title = `Change zoom, currently ${zoom.toFixed(1)}X`;
    }
}

function toggleK15ViewerToolbar(showAlternate) {
    const primary = document.getElementById('k15ViewerToolbar');
    const alternate = document.getElementById('k15ViewerAlternateToolbar');
    if (!primary || !alternate) return;
    primary.hidden = showAlternate;
    alternate.hidden = !showAlternate;
}

function toggleK15DetectionZone() {
    const editor = document.getElementById('detectionZoneEditor');
    if (!editor) return;
    editor.hidden = !editor.hidden;
    if (!editor.hidden) document.getElementById('detectionZoneX')?.focus();
}

function toggleK15ViewerMic() {
    sendMicCommand(isMicMuted === false);
}

function openK15PtzControls() {
    const overlay = document.getElementById('k15PtzOverlay');
    if (!overlay) return;
    overlay.hidden = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeK15PtzControls() {
    const overlay = document.getElementById('k15PtzOverlay');
    if (overlay) overlay.hidden = true;
}

function openK15PresetSheet() {
    const sheet = document.getElementById('k15PresetSheet');
    const list = document.getElementById('k15PresetList');
    if (!sheet || !list || k15PresetLoadPending) return;
    sheet.hidden = false;
    list.replaceChildren();
    const loading = document.createElement('div');
    loading.className = 'k15-preset-status';
    loading.textContent = 'Loading presets...';
    list.appendChild(loading);
    k15PresetLoadPending = true;
    k15PresetLoadTimer = setTimeout(() => {
        k15PresetLoadPending = false;
        renderK15Presets([], 'Unable to load presets');
    }, 15000);
    try {
        C4.sendCommand('GET_PRESETS_API', '', false, true);
    } catch (error) {
        clearTimeout(k15PresetLoadTimer);
        k15PresetLoadPending = false;
        renderK15Presets([], 'Unable to load presets');
    }
}

function closeK15PresetSheet() {
    const sheet = document.getElementById('k15PresetSheet');
    if (sheet) sheet.hidden = true;
    if (k15PresetLoadPending) {
        clearTimeout(k15PresetLoadTimer);
        k15PresetLoadPending = false;
    }
}

function renderK15Presets(presets, error) {
    const list = document.getElementById('k15PresetList');
    if (!list) return;
    list.replaceChildren();
    if (error || !presets.length) {
        const status = document.createElement('div');
        status.className = 'k15-preset-status';
        status.textContent = error || 'No presets available';
        list.appendChild(status);
        return;
    }
    presets.forEach((preset, index) => {
        const button = document.createElement('button');
        button.className = 'k15-preset-item';
        button.type = 'button';
        const name = document.createElement('span');
        name.textContent = preset.name || `Preset ${index + 1}`;
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'chevron-right');
        button.append(name, icon);
        button.addEventListener('click', () => selectK15Preset(index + 1));
        list.appendChild(button);
    });
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function selectK15Preset(index) {
    closeK15PresetSheet();
    try {
        C4.sendCommand('PTZ_GOTO_PRESET', JSON.stringify({ INDEX: index }), false, true);
    } catch (error) {
        console.error('Unable to send preset command', error);
    }
}

function sendK15ViewerSetting(key, value) {
    beginSettingSave('camera');
    try {
        C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify({ key, value }), false, true);
    } catch (error) {
        console.error('Viewer setting command failed:', key, error);
        finishSettingSave('camera', false, 'Failed to send setting');
    }
}

function toggleK15ViewerAlarm() {
    const siren = Number(latestCameraSettings.siren_swt);
    const light = Number(latestCameraSettings.light_swt);
    if (![0, 1].includes(siren) || ![0, 1].includes(light)) return;
    const enabled = siren !== 1 || light !== 1;
    sendK15ViewerSetting('siren_swt', enabled ? 1 : 0);
    sendK15ViewerSetting('light_swt', enabled ? 1 : 0);
}

function cycleK15NightVision() {
    const current = Number(latestCameraSettings.icut_mode);
    const modes = [0, 2, 3];
    const index = modes.indexOf(current);
    if (index < 0) return;
    sendK15ViewerSetting('icut_mode', modes[(index + 1) % modes.length]);
}

function openLatestK15Snapshot() {
    if (!latestSnapshotUrl) {
        showModal('Take a snapshot first', 'Snapshot');
        return;
    }
    openSnapshotModal(latestSnapshotUrl, 'Snapshot captured');
}

function openK15DetectionTypeSheet() {
    const current = Number(latestCameraSettings.motion_type);
    if (![0, 1].includes(current)) return;
    k15DetectionTypeDraft = current;
    document.querySelectorAll('input[name="k15DetectionTypeChoice"]').forEach(option => {
        option.checked = Number(option.value) === current;
    });
    document.getElementById('k15DetectionTypeSheet').hidden = false;
}

function closeK15DetectionTypeSheet() {
    const sheet = document.getElementById('k15DetectionTypeSheet');
    if (sheet) sheet.hidden = true;
    k15DetectionTypeDraft = null;
}

function confirmK15DetectionType() {
    const selected = document.querySelector('input[name="k15DetectionTypeChoice"]:checked');
    if (!selected) return;
    const value = Number(selected.value);
    closeK15DetectionTypeSheet();
    sendK15ViewerSetting('motion.type', value);
}

function openK15VideoOption(id) {
    const spec = k15VideoOptionSpecs[id];
    const current = Number(latestCameraSettings[spec?.key]);
    if (!spec || !spec.values.includes(current)) return;
    document.getElementById('k15VideoOptionTitle').textContent = spec.title;
    const list = document.getElementById('k15VideoOptionList');
    list.replaceChildren();
    spec.values.forEach((value, index) => {
        const label = document.createElement('label');
        label.className = `k15-video-option-item${spec.descriptions ? ' k15-video-option-described' : ''}`;
        const copy = document.createElement('span');
        copy.className = 'k15-video-option-copy';
        const text = document.createElement('span');
        text.textContent = spec.labels[index];
        copy.appendChild(text);
        if (spec.descriptions?.[index]) {
            const description = document.createElement('span');
            description.className = 'k15-video-option-description';
            description.textContent = spec.descriptions[index];
            copy.appendChild(description);
        }
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'k15VideoOptionChoice';
        radio.value = String(value);
        radio.checked = value === current;
        radio.addEventListener('change', () => {
            if (!radio.checked) return;
            const key = k15VideoOptionSpecs[id].key;
            closeK15VideoOption();
            sendK15ViewerSetting(key, value);
        });
        label.addEventListener('click', () => {
            if (value === current) closeK15VideoOption();
        });
        label.append(copy, radio);
        list.appendChild(label);
    });
    document.getElementById('k15VideoOptionSheet').hidden = false;
}

function closeK15VideoOption() {
    const sheet = document.getElementById('k15VideoOptionSheet');
    if (sheet) sheet.hidden = true;
}

function updateK15SensitivityPreview(value) {
    const slider = document.getElementById('k15SensitivitySlider');
    const label = document.getElementById('k15SensitivityCurrent');
    const labels = ['Low', 'Medium', 'High'];
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 2) return;
    if (slider) {
        slider.hidden = false;
        slider.value = String(index);
        slider.style.setProperty('--sensitivity-progress', `${index * 50}%`);
    }
    if (label) label.textContent = labels[index];
}

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') requestCameraSettings();
});

window.addEventListener('pageshow', function (event) {
    requestCameraSettings();
});

window.addEventListener('focus', () => requestCameraSettings());

function updateMotionSettingsVisibility() {
    const motion = document.getElementById('motionDetection');
    const settings = document.getElementById('motionDependentSettings');
    if (motion && settings) settings.hidden = !motion.checked;
}

function updateK15ViewerSpeaker(value = latestCameraSettings.beep_vol) {
    const button = document.getElementById('k15ViewerSpeaker');
    if (!button) return;
    const volume = Number(value);
    if (!Number.isInteger(volume) || volume < 0 || volume > 10) {
        button.disabled = k15SpeakerLoadPending || k15SpeakerWritePending;
        button.setAttribute('aria-label', 'Load speaker volume');
        button.title = 'Load speaker volume';
        return;
    }
    if (volume > 0) k15SpeakerVolumeBeforeMute = volume;
    const muted = volume === 0;
    button.disabled = k15SpeakerLoadPending || k15SpeakerWritePending;
    button.classList.toggle('is-muted', muted);
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    button.title = muted ? 'Sound off' : 'Sound on';
    button.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateK15SpeakerVolumePreview(value = latestCameraSettings.beep_vol) {
    const slider = document.getElementById('speakerVolume');
    const output = document.getElementById('speakerVolumeValue');
    if (!slider || !output) return;
    const volume = Number(value);
    if (!Number.isInteger(volume) || volume < 0 || volume > 10) {
        slider.disabled = true;
        slider.hidden = true;
        output.textContent = '...';
        return;
    }
    slider.hidden = false;
    slider.value = String(volume);
    slider.disabled = k15SpeakerWritePending;
    slider.style.setProperty('--speaker-fill', `${volume * 10}%`);
    output.textContent = String(volume);
    output.style.left = `calc(8px + ${volume * 10}% - ${volume * 1.6}px)`;
}

function toggleK15ViewerSpeaker() {
    if (k15SpeakerLoadPending || k15SpeakerWritePending) return;
    const current = Number(latestCameraSettings.beep_vol);
    if (!Number.isInteger(current) || current < 0 || current > 10) {
        k15SpeakerLoadPending = true;
        updateK15ViewerSpeaker(undefined);
        k15SpeakerLoadTimer = setTimeout(() => {
            k15SpeakerLoadPending = false;
            updateK15ViewerSpeaker();
        }, 10000);
        try {
            C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
        } catch (error) {
            clearTimeout(k15SpeakerLoadTimer);
            k15SpeakerLoadPending = false;
            updateK15ViewerSpeaker();
        }
        return;
    }
    if (current === 0 && k15SpeakerVolumeBeforeMute === null) {
        show('audioSettingsPanel');
        return;
    }
    const target = current === 0 ? k15SpeakerVolumeBeforeMute : 0;
    if (current > 0) k15SpeakerVolumeBeforeMute = current;
    k15SpeakerWritePending = true;
    k15SpeakerTogglePending = true;
    updateK15ViewerSpeaker(current);
    beginSettingSave('camera');
    try {
        C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify({ key: 'beep_vol', value: target }), false, true);
    } catch (error) {
        k15SpeakerWritePending = false;
        k15SpeakerTogglePending = false;
        updateK15ViewerSpeaker(current);
        finishSettingSave('camera', false, 'Unable to update speaker');
    }
}

function updateCameraSettingsUI(settings) {
    latestCameraSettings = { ...latestCameraSettings, ...settings };
    settings = latestCameraSettings;
    updateK15ViewerSpeaker(settings.beep_vol);
    updateK15SpeakerVolumePreview(settings.beep_vol);
    const toggles = {
        motionDetection: 'motion_switch',
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
    if (alarm) {
        const hasAlarmState = settings.siren_swt !== undefined && settings.siren_swt !== null &&
            settings.light_swt !== undefined && settings.light_swt !== null;
        alarm.disabled = !hasAlarmState;
        if (hasAlarmState) {
            const audible = Number(settings.siren_swt) === 1;
            const visual = Number(settings.light_swt) === 1;
            alarm.checked = audible && visual;
            alarm.indeterminate = audible !== visual;
        }
    }
    const viewerAlarm = document.getElementById('k15ViewerAlarm');
    if (viewerAlarm) viewerAlarm.disabled = !(
        settings.siren_swt !== undefined && settings.siren_swt !== null &&
        settings.light_swt !== undefined && settings.light_swt !== null
    );
    const viewerNightVision = document.getElementById('k15ViewerNightVision');
    if (viewerNightVision) viewerNightVision.disabled = settings.icut_mode === undefined || settings.icut_mode === null;
    const motionTypeValue = document.getElementById('detectionTypeValue');
    const motionType = Number(settings.motion_type);
    if (motionTypeValue && [0, 1].includes(motionType)) {
        motionTypeValue.textContent = ['Motion Detection', 'Person Detection'][motionType];
        const control = document.getElementById('detectionType');
        if (control) control.disabled = false;
    }
    const sensitivity = Number(settings.motion_sen);
    if (Number.isInteger(sensitivity) && sensitivity >= 0 && sensitivity <= 2) {
        updateK15SensitivityPreview(sensitivity);
        const control = document.getElementById('detectionSensitivity');
        const slider = document.getElementById('k15SensitivitySlider');
        if (control) control.disabled = false;
        if (slider) slider.disabled = false;
    }
    const selections = { recordingToggle: 'record_mode' };
    Object.entries(selections).forEach(function ([id, key]) {
        const control = document.getElementById(id);
        if (control && settings[key] !== undefined && settings[key] !== null) {
            control.value = String(settings[key]);
            control.disabled = false;
        }
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
    const nightVisionValue = document.getElementById('nightVisionValue');
    const nightVisionIndex = k15VideoOptionSpecs.nightVision.values.indexOf(Number(settings.icut_mode));
    if (nightVision && nightVisionValue && nightVisionIndex >= 0) {
        nightVisionValue.textContent = k15VideoOptionSpecs.nightVision.labels[nightVisionIndex];
        nightVision.disabled = false;
    }
    const recordingMode = document.getElementById('videoRecordingMode');
    if (recordingMode && settings.record_mode !== undefined && settings.record_mode !== null) {
        const modeIndex = k15VideoOptionSpecs.recordingMode.values.indexOf(Number(settings.record_mode));
        const modeButton = document.getElementById('videoRecordingBtn');
        if (modeIndex >= 0) {
            recordingMode.textContent = k15VideoOptionSpecs.recordingMode.labels[modeIndex];
            if (modeButton) modeButton.disabled = false;
        }
    }
    const antiFlicker = document.getElementById('antiFlicker');
    const antiFlickerValue = document.getElementById('antiFlickerValue');
    const antiFlickerIndex = k15VideoOptionSpecs.antiFlicker.values.indexOf(Number(settings.anti_flicker));
    if (antiFlicker && antiFlickerValue && antiFlickerIndex >= 0) {
        antiFlickerValue.textContent = k15VideoOptionSpecs.antiFlicker.labels[antiFlickerIndex];
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

function updateK15DeviceNameConfirm() {
    const input = document.getElementById('deviceNameInput');
    const button = document.getElementById('updateNameBtn');
    if (!input || !button) return;
    button.disabled = pendingSettingSaves.has('name') || !input.value.trim();
}

function openK15DeviceNameSheet() {
    const sheet = document.getElementById('deviceNameSheet');
    const input = document.getElementById('deviceNameInput');
    const status = document.getElementById('deviceNameStatus');
    if (!sheet || !input || pendingSettingSaves.size > 0) return;
    deviceNameEdited = false;
    const name = document.getElementById('settingsDeviceName')?.textContent || '';
    input.value = name === '...' ? '' : name;
    if (status) status.textContent = '';
    sheet.hidden = false;
    updateK15DeviceNameConfirm();
    if (typeof lucide !== 'undefined') lucide.createIcons();
    input.focus();
    input.select();
    requestDeviceInfo(true);
}

function closeK15DeviceNameSheet() {
    if (pendingSettingSaves.has('name')) return;
    const sheet = document.getElementById('deviceNameSheet');
    const input = document.getElementById('deviceNameInput');
    const status = document.getElementById('deviceNameStatus');
    if (sheet) sheet.hidden = true;
    deviceNameEdited = false;
    if (input) {
        const name = document.getElementById('settingsDeviceName')?.textContent || '';
        input.value = name === '...' ? '' : name;
    }
    if (status) status.textContent = '';
    updateK15DeviceNameConfirm();
}

function clearK15DeviceName() {
    if (pendingSettingSaves.has('name')) return;
    const input = document.getElementById('deviceNameInput');
    if (!input) return;
    input.value = '';
    deviceNameEdited = true;
    updateK15DeviceNameConfirm();
    input.focus();
}

function initDeviceName() {
    const input = document.getElementById('deviceNameInput');
    const button = document.getElementById('updateNameBtn');
    const status = document.getElementById('deviceNameStatus');
    if (!button || !input) return;

    input.addEventListener('input', function () {
        deviceNameEdited = true;
        if (status) status.textContent = '';
        updateK15DeviceNameConfirm();
    });

    button.addEventListener('click', function () {
        if (pendingSettingSaves.has('name')) return;
        const newName = input.value.trim();
        if (!newName) {
            if (status) status.textContent = 'Please enter a device name';
            updateK15DeviceNameConfirm();
            return;
        }
        if (status) status.textContent = '';
        beginSettingSave('name');
        updateK15DeviceNameConfirm();
        try {
            C4.sendCommand('SET_DEVICE_NAME', JSON.stringify({ name: newName }), false, true);
        } catch (error) {
            if (status) status.textContent = 'Unable to change device name';
            finishSettingSave('name', false, 'Unable to change device name');
        }
    });

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') button.click();
        if (event.key === 'Escape') closeK15DeviceNameSheet();
    });
    updateK15DeviceNameConfirm();
}

// =====================================================
// MICROPHONE
// =====================================================

function initCameraSettings() {
    const motion = document.getElementById('motionDetection');
    const alarm = document.getElementById('alarmToggle');
    const recording = document.getElementById('recordingToggle');
    const nightVision = document.getElementById('nightVisionToggle');
    const antiFlicker = document.getElementById('antiFlicker');
    const speakerVolume = document.getElementById('speakerVolume');
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
    const sensitivitySlider = document.getElementById('k15SensitivitySlider');
    const zoneInputs = ['detectionZoneX', 'detectionZoneY', 'detectionZoneWidth', 'detectionZoneHeight'].map(id => document.getElementById(id));
    const saveZone = document.getElementById('saveDetectionZoneBtn');
    const fullZone = document.getElementById('fullDetectionZoneBtn');
    const zoneStatus = document.getElementById('detectionZoneStatus');

    if (!motion && !alarm && !recording && !nightVision && !antiFlicker && !speakerVolume && !formatBtn && !saveEventTimeBtn && !flipImage && !timeWatermark) {
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
            return false;
        }
    };

    if (sensitivitySlider) {
        sensitivitySlider.addEventListener('input', function () { updateK15SensitivityPreview(Number(this.value)); });
        sensitivitySlider.addEventListener('change', function () { sendSetting('motion.sen', Number(this.value)); });
    }
    if (speakerVolume) {
        speakerVolume.addEventListener('input', function () { updateK15SpeakerVolumePreview(Number(this.value)); });
        speakerVolume.addEventListener('change', function () {
            const value = Number(this.value);
            if (value === Number(latestCameraSettings.beep_vol)) return;
            k15SpeakerWritePending = true;
            k15SpeakerTogglePending = false;
            updateK15ViewerSpeaker(value);
            updateK15SpeakerVolumePreview(value);
            if (!sendSetting('beep_vol', value)) {
                k15SpeakerWritePending = false;
                updateK15ViewerSpeaker();
                updateK15SpeakerVolumePreview();
            }
        });
    }
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

    if (recording) {
        recording.addEventListener('change', function () {
            sendSetting('record_mode', Number(this.value));
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

        if (obj.type === 'camera_presets') {
            clearTimeout(k15PresetLoadTimer);
            k15PresetLoadPending = false;
            renderK15Presets(obj.success ? (obj.presets || []) : [], obj.success ? null : (obj.error || 'Unable to load presets'));
        }

        if (obj.type === 'camera_settings') {
            finishSettingsLoad();
            if (k15SpeakerLoadPending) {
                clearTimeout(k15SpeakerLoadTimer);
                k15SpeakerLoadPending = false;
            }
            if (obj.success) {
                updateCameraSettingsUI(obj.settings || {});
                if (obj.setting_saved) {
                    const speakerWrite = k15SpeakerWritePending && obj.settings?.beep_vol !== undefined;
                    const speakerToggle = speakerWrite && k15SpeakerTogglePending;
                    if (speakerWrite) {
                        k15SpeakerWritePending = false;
                        k15SpeakerTogglePending = false;
                        updateK15ViewerSpeaker();
                    }
                    const successMessage = speakerToggle
                        ? (Number(obj.settings.beep_vol) === 0 ? 'Sound off' : 'Sound on')
                        : 'Setting saved';
                    finishSettingSave('camera', true, undefined, successMessage);
                    if (speakerToggle) {
                        closeSettingSaveDialog();
                        showK15Toast(successMessage);
                    }
                }
                if (obj.event_time_updated) {
                    const status = document.getElementById('eventTimeStatus');
                    if (status) status.innerText = 'Saved.';
                }
            } else {
                updateK15ViewerSpeaker();
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
            if (k15SpeakerWritePending) k15SpeakerWritePending = false;
            k15SpeakerTogglePending = false;
            if (k15SpeakerLoadPending) {
                clearTimeout(k15SpeakerLoadTimer);
                k15SpeakerLoadPending = false;
            }
            updateK15ViewerSpeaker();
            updateK15SpeakerVolumePreview();
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
            const deviceName = typeof obj.device_name === 'string' && obj.device_name ? obj.device_name : '...';
            const viewerName = document.getElementById('viewerDeviceName');
            const settingsName = document.getElementById('settingsDeviceName');
            if (viewerName) viewerName.textContent = deviceName;
            if (settingsName) settingsName.textContent = deviceName;

            if (nameInput && !deviceNameEdited && typeof obj.device_name === 'string') {
                nameInput.value = obj.device_name;
                updateK15DeviceNameConfirm();
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
            const infoValues = {
                infoDeviceName: deviceName,
                infoFirmwareVersion: obj.version || 'N/A',
                infoReleaseDate: obj.release_date || 'N/A',
                infoSerialNumber: obj.serial || 'N/A',
                infoIpAddress: obj.ip || 'N/A',
                infoMacAddress: obj.mac || 'N/A',
                infoWifi: obj.wifi || 'N/A',
                infoBattery: obj.battery !== undefined && obj.battery !== null && Number.isFinite(Number(obj.battery)) ? `${obj.battery}%` : 'N/A',
                infoOnline: obj.online === true ? 'Online' : obj.online === false ? 'Offline' : 'N/A'
            };
            Object.entries(infoValues).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
            const firmwareStatus = document.getElementById('firmwareUpdateStatus');
            if (firmwareStatus && typeof obj.can_update === 'boolean') {
                firmwareStatus.textContent = obj.can_update ? 'Update available' : 'The current version is the latest.';
            }
        }

        if (obj.type === 'device_info' && !obj.success) {
            ['infoDeviceName', 'infoFirmwareVersion', 'infoReleaseDate', 'infoSerialNumber', 'infoIpAddress', 'infoMacAddress', 'infoWifi', 'infoBattery', 'infoOnline'].forEach(id => {
                const element = document.getElementById(id);
                if (element) element.textContent = 'N/A';
            });
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
                statusEl.innerText = '';
            }

            finishSettingSave('name', true);
            closeK15DeviceNameSheet();

            requestDeviceInfo(true);
        }

        if (obj.type === "snapshot_result") {
            console.log('[Snapshot] Received result:', obj);

            if (obj.success && obj.image_url) {
                latestSnapshotUrl = obj.image_url;
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