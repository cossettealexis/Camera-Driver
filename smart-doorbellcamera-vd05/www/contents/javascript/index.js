
let antiPryEnabled = false;
let isMicMuted = false;
let confirmedDeviceName = '';
let pendingDeviceName = '';
let deviceNameDraftDirty = false;
let deviceNameReturnFocus = null;
let liveSnapshotTimer = null;
let liveSnapshotTimeout = null;
let liveSnapshotPending = false;
let snapshotModalPending = false;
let liveZoomIndex = 0;
const liveZoomLevels = [1, 1.5, 2];

// ---- Face Management ----

let faces = [];
let latestDeviceSettings = {};
let confirmedFaceSwitch;
let faceUpdatePending = false;
let faceUpdateAttempt = 0;
let faceEditMode = false;
let facePage = 1;
let faceTotal = 0;
const selectedFaceIds = new Set();
let namingFaceId = null;
let pendingFaceRename = null;

const pendingSettingSaves = new Map();
let settingToastTimer;
let settingSaveFailed = false;
const pendingSettingsLoads = new Set();
let settingsLoadTimer;

function finishSettingsLoad(kind, success, error) {
    if (!pendingSettingsLoads.has(kind)) return;
    if (!success) {
        pendingSettingsLoads.clear();
        clearTimeout(settingsLoadTimer);
        updateSettingSaveOverlay();
        show('homePanel');
        showSettingToast(error || 'Unable to load settings');
        return;
    }
    pendingSettingsLoads.delete(kind);
    if (pendingSettingsLoads.size === 0) clearTimeout(settingsLoadTimer);
    updateSettingSaveOverlay();
}

let lastFaceRequest = 0;
const FACE_REFRESH_GAP_MS = 1500;
let motionOptionDraft = null;
let storageFormatStep = 0;
let installationStep = 1;
const motionOptionSpecs = {
    nightVisionMode: {
        key: 'icut_mode', title: 'Night Vision Mode', immediate: true, values: [0, 2, 3],
        labels: ['Automatic', 'OFF', 'ON'],
        descriptions: [
            'When the light is dark, it will automatically switch to infrared night vision mode',
            'When the light in front of the camera is consistently bright, using this mode will always turn off the infrared fill light during recording.',
            'When the light in front of the camera is consistently dim, using this mode will always turn on the infrared fill light during recording.'
        ]
    },
    antiFlicker: {
        key: 'anti_flicker', title: 'Anti-Flicker', immediate: true,
        labels: ['OFF', '50Hz', '60Hz']
    },
    faceSimilarity: {
        key: 'unknow_thld', title: 'Face Similarity Threshold', min: 1, max: 99, slider: true,
        description: 'The higher the threshold, the fewer misjudgments in facial recognition, but the probability of missed judgments may increase'
    },
    faceQuality: {
        key: 'unknow_faceq', title: 'Face Image Quality Threshold', immediate: true,
        description: 'Filter low-quality facial images according to the set threshold',
        labels: ['Low', 'Medium', 'High']
    },
    detectionType: {
        key: 'motion.type', title: 'Detection Type', labels: ['Motion Detection', 'Person Detection'],
        descriptions: ['All detected movements trigger events', 'Only people can trigger the detector']
    },
    detectionSensitivity: {
        key: 'motion.sen', title: 'Detection Sensitivity', min: 0, max: 2, slider: true,
        description: 'Motion detected in zone. Starting recording.', labels: ['Low', 'Medium', 'High'], immediate: true
    }
};

function updateMotionChoiceLabels() {
    Object.entries(motionOptionSpecs).forEach(([id, spec]) => {
        const control = document.getElementById(id);
        const value = Number(control.value);
        const label = control.disabled || control.value === '' ? '...' :
            id === 'faceSimilarity' ? `${Math.round(value * 100)}%` : spec.labels[value];
        document.getElementById(`${id}Value`).textContent = label || '...';
    });
}

function hydrateFacialThresholds(settings) {
    const similarity = settings.unknow_thld;
    if (similarity !== undefined && similarity !== null && similarity !== '' &&
        Number.isFinite(Number(similarity)) && Number(similarity) >= 0.01 && Number(similarity) <= 0.99) {
        const control = document.getElementById('faceSimilarity');
        control.value = String(Number(similarity));
        control.disabled = false;
    }
    const quality = settings.unknow_faceq;
    if (quality !== undefined && quality !== null && quality !== '' &&
        Number.isInteger(Number(quality)) && Number(quality) >= 0 && Number(quality) <= 2) {
        const control = document.getElementById('faceQuality');
        control.value = String(Number(quality));
        control.disabled = false;
    }
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

function closeMotionOption() {
    document.getElementById('motionOptionSheet').hidden = true;
    motionOptionDraft = null;
}

function confirmMotionOption() {
    if (!motionOptionDraft) return;
    const { id, value } = motionOptionDraft;
    const spec = motionOptionSpecs[id];
    const apiValue = spec.values ? spec.values[value] : id === 'faceSimilarity' ? value / 100 : value;
    closeMotionOption();
    sendMotionSetting(spec.key, apiValue);
}

function openMotionOption(id) {
    const spec = motionOptionSpecs[id];
    const control = document.getElementById(id);
    if (!spec || control.disabled || control.value === '') return;
    const rawValue = id === 'faceSimilarity' ? Math.round(Number(control.value) * 100) : Number(control.value);
    const value = spec.values ? spec.values.indexOf(rawValue) : rawValue;
    if (value < 0) return;
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
        const labels = id === 'faceSimilarity' ? ['1%', '99%'] : spec.labels;
        labels.forEach(text => {
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
            const row = document.createElement('label');
            row.className = `motion-option-item${spec.descriptions ? ' motion-option-type' : ''}`;
            const copy = document.createElement('span');
            copy.textContent = label;
            if (spec.descriptions) {
                const detail = document.createElement('span');
                detail.className = 'motion-option-subtitle';
                detail.textContent = spec.descriptions[index];
                copy.appendChild(detail);
            }
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = 'motion-option';
            radio.value = String(index);
            radio.checked = index === value;
            radio.addEventListener('change', () => {
                if (!motionOptionDraft) return;
                motionOptionDraft.value = index;
                if (spec.immediate) confirmMotionOption();
            });
            row.appendChild(copy);
            row.appendChild(radio);
            body.appendChild(row);
        });
    }
    document.getElementById('motionOptionSheet').hidden = false;
}

function showSettingToast(message) {
    const toast = document.getElementById('settingSaveToast');
    clearTimeout(settingToastTimer);
    toast.textContent = message;
    toast.hidden = false;
    settingToastTimer = setTimeout(() => { toast.hidden = true; }, 2500);
}

function beginSettingSave(kind, label = 'Setting up...') {
    if (pendingSettingSaves.size === 0) settingSaveFailed = false;
    const pending = pendingSettingSaves.get(kind);
    if (pending) clearTimeout(pending.timer);
    pendingSettingSaves.set(kind, {
        label,
        count: (pending?.count || 0) + 1,
        timer: setTimeout(() => {
            pendingSettingSaves.delete(kind);
            settingSaveFailed = true;
            if (kind === 'name') updateDeviceNameConfirm();
            updateSettingSaveOverlay();
            showSettingToast('Setting update timed out');
        }, 20000)
    });
    document.getElementById('settingSaveToast').hidden = true;
    updateSettingSaveOverlay();
}

function updateSettingSaveOverlay() {
    const loading = pendingSettingsLoads.size > 0;
    const pending = pendingSettingSaves.size > 0 || loading;
    const overlay = document.getElementById('settingSaveOverlay');
    overlay.setAttribute('data-loading', String(loading));
    document.getElementById('settingSaveLabel').textContent = loading ? 'Loading...' :
        (pendingSettingSaves.get('mic')?.label || 'Setting up...');
    overlay.hidden = !pending;
    const app = document.querySelector('.app');
    if (app) app.inert = pending;
    if (pending) overlay.focus();
}

function finishSettingSave(kind, success, error, successMessage = 'Settings saved') {
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
    else if (pendingSettingSaves.size === 0 && pendingSettingsLoads.size === 0 && !settingSaveFailed) showSettingToast(successMessage);
}

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {

    console.log('VD05 Settings UI Loaded');

    initializeControl4();

    initAntiPry();
    initMicrophone();
    initFacialRecognition();
    initReboot();
    initDeviceName();
    initSnapshot();
    initMotionSettings();
    initVideoSettings();
    initAudioSettings();
    initLiveView();
    initDeviceInfo();
    requestInitialState();
    startLiveSnapshotPolling();
    initStatusLight();
});

function isLiveViewerActive() {
    const panel = document.getElementById('viewerPanel');
    return !!panel && panel.classList.contains('active');
}

function stopLiveSnapshotPolling() {
    clearTimeout(liveSnapshotTimer);
    clearTimeout(liveSnapshotTimeout);
    liveSnapshotTimer = null;
    liveSnapshotTimeout = null;
    liveSnapshotPending = false;
}

function requestLiveSnapshot() {
    if (!isLiveViewerActive()) return;
    if (liveSnapshotPending) return;
    liveSnapshotPending = true;
    try {
        C4.sendCommand('GET_CAMERA_SNAPSHOT', JSON.stringify({}), false, true);
    } catch (error) {
        liveSnapshotPending = false;
        document.getElementById('livePreviewStatus').textContent = 'Camera preview unavailable';
        scheduleLiveSnapshot(3000);
        return;
    }
    clearTimeout(liveSnapshotTimeout);
    liveSnapshotTimeout = setTimeout(() => {
        if (!liveSnapshotPending) return;
        liveSnapshotPending = false;
        document.getElementById('livePreviewStatus').textContent = 'Camera preview unavailable';
        scheduleLiveSnapshot(2500);
    }, 7000);
}

function scheduleLiveSnapshot(delay = 1000) {
    if (!isLiveViewerActive()) return;
    clearTimeout(liveSnapshotTimer);
    liveSnapshotTimer = setTimeout(() => {
        liveSnapshotPending = false;
        requestLiveSnapshot();
    }, delay);
}

function startLiveSnapshotPolling() {
    stopLiveSnapshotPolling();
    fitLivePreviewFrame();
    requestLiveSnapshot();
}

function displayLiveSnapshot(url) {
    const preview = document.getElementById('livePreview');
    const status = document.getElementById('livePreviewStatus');
    preview.onload = () => {
        status.hidden = true;
        const now = new Date();
        document.getElementById('liveTimestamp').textContent =
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
        document.getElementById('liveTimestamp').hidden = false;
    };
    preview.onerror = () => {
        status.textContent = 'Camera preview unavailable';
        status.hidden = false;
        scheduleLiveSnapshot(2500);
    };
    preview.style.display = 'block';
    preview.src = url + (url.includes('?') ? '&' : '?') + 't=' + Date.now();
}

function fitLivePreviewFrame() {
    const stage = document.getElementById('cameraStage');
    const frame = document.getElementById('cameraFrame');
    if (!stage || !frame) return;
    const width = Math.max(0, Math.min(stage.clientWidth, stage.clientHeight * 4 / 3));
    frame.style.width = `${width}px`;
    frame.style.height = `${width * 3 / 4}px`;
}

function initLiveView() {
    fitLivePreviewFrame();
    window.addEventListener('resize', fitLivePreviewFrame);
    document.getElementById('viewerZoom').addEventListener('click', () => {
        liveZoomIndex = (liveZoomIndex + 1) % liveZoomLevels.length;
        document.getElementById('livePreview').style.setProperty('--viewer-zoom', liveZoomLevels[liveZoomIndex]);
        document.getElementById('zoomChip').textContent = `${liveZoomLevels[liveZoomIndex].toFixed(1)}X`;
    });
    document.getElementById('zoomChip').addEventListener('click', () => document.getElementById('viewerZoom').click());
    document.getElementById('viewerSnapshot').addEventListener('click', () => {
        const preview = document.getElementById('livePreview');
        if (preview.src) openSnapshotModal(preview.src, 'Snapshot captured');
        else requestLiveSnapshot();
    });
    document.getElementById('viewerMic').addEventListener('click', () => {
        sendMicCommand(hasConfirmedMicCall ? !isMicMuted : false);
    });
    document.getElementById('viewerEndCall').addEventListener('click', () => sendMicCommand(true));
    document.getElementById('viewerFullscreen').addEventListener('click', () => {
        const stage = document.getElementById('cameraStage');
        if (document.fullscreenElement) document.exitFullscreen?.();
        else stage.requestFullscreen?.();
    });
}

function updateMotionVisibility() {
    const motion = document.getElementById('motionDetection');
    document.getElementById('motionOptions').hidden = motion.indeterminate || !motion.checked;
    document.getElementById('motionAlarmGroup').hidden = motion.indeterminate || !motion.checked;
    const facial = document.getElementById('faceRecEnable');
    document.querySelectorAll('[data-face-option]').forEach(row => {
        row.hidden = facial.indeterminate || !facial.checked || !!row.disabled;
    });
    document.getElementById('faceManagementLink').hidden = !facial.indeterminate && !facial.checked;
}

function resetMotionSettings() {
    ['motionDetection', 'motionAlarm', 'faceRecEnable'].forEach(id => {
        const control = document.getElementById(id);
        control.checked = false;
        control.indeterminate = true;
        control.disabled = true;
    });
    ['detectionType', 'detectionSensitivity', 'faceSimilarity', 'faceQuality', 'zoneX', 'zoneY', 'zoneWidth', 'zoneHeight'].forEach(id => {
        const control = document.getElementById(id);
        control.value = '';
        control.disabled = true;
    });
    document.getElementById('saveMotionZone').disabled = true;
    if (!faceUpdatePending) updateFaceRecognitionState(latestDeviceSettings.unknow_snapswt);
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

function requestMotionSettings() {
    clearTimeout(settingsLoadTimer);
    pendingSettingsLoads.clear();
    pendingSettingsLoads.add('camera');
    pendingSettingsLoads.add('device');
    document.getElementById('settingSaveToast').hidden = true;
    updateSettingSaveOverlay();
    resetMotionSettings();
    document.getElementById('motionSettingsStatus').textContent = '';
    settingsLoadTimer = setTimeout(() => {
        finishSettingsLoad('camera', false, 'Settings request timed out');
        finishSettingsLoad('device', false, 'Settings request timed out');
    }, 20000);
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
        C4.sendCommand('REQUEST_SETTINGS', '', false, false);
    } catch (error) {
        finishSettingsLoad('camera', false, 'Camera connection unavailable');
        finishSettingsLoad('device', false, 'Camera connection unavailable');
    }
}

function sendMotionSetting(key, value) {
    const status = document.getElementById('motionSettingsStatus');
    status.textContent = '';
    beginSettingSave('camera');
    try {
        C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify({ key, value }), false, true);
    } catch (error) {
        finishSettingSave('camera', false, 'Unable to send setting');
    }
}

function openVideoSettings() {
    show('videoSettingsPanel');
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (error) {
        showSettingToast('Unable to load video settings');
    }
}

function openAudioSettings() {
    show('audioSettingsPanel');
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (error) {
        showSettingToast('Unable to load audio settings');
    }
}

function openNotificationSettings() {
    show('notificationSettingsPanel');
}

function openStorageSettings() {
    show('storagePanel');
    document.getElementById('storageTotal').textContent = '...';
    document.getElementById('storageAvailable').textContent = '...';
    document.getElementById('storageStatus').textContent = '...';
    document.getElementById('formatStorageButton').disabled = true;
    try {
        C4.sendCommand('GET_CAMERA_SETTINGS', '', false, true);
    } catch (error) {
        showSettingToast('Unable to load storage settings');
    }
}

function openInstallationGuide() {
    installationStep = 1;
    const livePreview = document.getElementById('livePreview');
    const installationPreview = document.getElementById('installationLivePreview');
    if (livePreview && livePreview.getAttribute('src')) installationPreview.src = livePreview.currentSrc || livePreview.src;
    renderInstallationStep();
    show('installationPanel');
}

function renderInstallationStep() {
    document.querySelectorAll('.installation-step').forEach((step, index) => {
        step.hidden = index + 1 !== installationStep;
    });
    document.getElementById('installationTitle').textContent = `Installation Tutorial (${installationStep}/3)`;
    document.getElementById('installationNext').textContent = installationStep === 3 ? 'Finish' : 'Next Step';
}

function previousInstallationStep() {
    if (installationStep === 1) {
        show('homePanel');
        return;
    }
    installationStep -= 1;
    renderInstallationStep();
}

function nextInstallationStep() {
    if (installationStep === 3) {
        show('homePanel');
        return;
    }
    installationStep += 1;
    renderInstallationStep();
}

function openInstallationSkip() {
    document.getElementById('installationSkipDialog').hidden = false;
}

function closeInstallationSkip() {
    document.getElementById('installationSkipDialog').hidden = true;
}

function confirmInstallationSkip() {
    closeInstallationSkip();
    show('homePanel');
}

function openStorageFormat() {
    if (document.getElementById('formatStorageButton').disabled || pendingSettingSaves.size > 0) return;
    storageFormatStep = 0;
    document.getElementById('storageFormatTitle').textContent = 'Format Local Storage';
    document.getElementById('confirmStorageFormat').textContent = 'Next';
    document.getElementById('storageFormatDialog').hidden = false;
}

function closeStorageFormat() {
    if (pendingSettingSaves.has('format')) return;
    document.getElementById('storageFormatDialog').hidden = true;
    storageFormatStep = 0;
}

function confirmStorageFormat() {
    if (document.getElementById('storageFormatDialog').hidden || pendingSettingSaves.has('format')) return;
    if (storageFormatStep === 0) {
        storageFormatStep = 1;
        document.getElementById('storageFormatTitle').textContent = 'Confirm Format Local Storage';
        document.getElementById('confirmStorageFormat').textContent = 'Format';
        return;
    }
    beginSettingSave('format', 'Formatting...');
    try {
        C4.sendCommand('FORMAT_STORAGE', JSON.stringify({ confirmed: true }), false, true);
    } catch (error) {
        finishSettingSave('format', false, 'Unable to send format command');
    }
}

function initMotionSettings() {
    resetMotionSettings();
    const motion = document.getElementById('motionDetection');
    motion.addEventListener('change', () => {
        updateMotionVisibility();
        sendMotionSetting('motion.switch', motion.checked ? 1 : 0);
    });
    [['detectionType', 'motion.type'], ['detectionSensitivity', 'motion.sen']].forEach(([id, key]) => {
        document.getElementById(id).addEventListener('change', event => sendMotionSetting(key, Number(event.target.value)));
    });
    document.getElementById('motionAlarm').addEventListener('change', event => {
        sendMotionSetting('alarm', event.target.checked ? 1 : 0);
    });
    document.getElementById('faceRecEnable').addEventListener('change', updateMotionVisibility);
    document.getElementById('saveMotionZone').addEventListener('click', () => {
        const inputs = ['zoneX', 'zoneY', 'zoneWidth', 'zoneHeight'].map(id => document.getElementById(id));
        const values = inputs.map(input => Number(input.value));
        const status = document.getElementById('motionZoneStatus');
        if (inputs.some(input => input.value === '') || values.some(value => !Number.isSafeInteger(value) || value < 0)) {
            status.textContent = 'Enter nonnegative whole numbers.';
            return;
        }
        sendMotionSetting('motion.x_y_w_h', values.join(':'));
        status.textContent = '';
    });
    updateMotionVisibility();
}

function initVideoSettings() {
    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        document.getElementById(id).addEventListener('change', event => sendMotionSetting(key, event.target.checked ? 1 : 0));
    });
}

function hydrateVideoSettings(settings) {
    const nightVision = document.getElementById('nightVisionMode');
    const nightValue = Number(settings.icut_mode);
    if (settings.icut_mode !== undefined && settings.icut_mode !== null && [0, 2, 3].includes(nightValue)) {
        nightVision.value = String(nightValue);
        nightVision.disabled = false;
        document.getElementById('nightVisionModeValue').textContent = motionOptionSpecs.nightVisionMode.labels[
            motionOptionSpecs.nightVisionMode.values.indexOf(nightValue)
        ];
    }
    const antiFlicker = document.getElementById('antiFlicker');
    const flickerValue = Number(settings.anti_flicker);
    if (settings.anti_flicker !== undefined && settings.anti_flicker !== null && Number.isInteger(flickerValue) && flickerValue >= 0 && flickerValue <= 2) {
        antiFlicker.value = String(flickerValue);
        antiFlicker.disabled = false;
        document.getElementById('antiFlickerValue').textContent = motionOptionSpecs.antiFlicker.labels[flickerValue];
    }
    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        const toggle = document.getElementById(id);
        const value = settings[key];
        if (value === undefined || value === null || ![0, 1].includes(Number(value))) return;
        toggle.checked = Number(value) === 1;
        toggle.disabled = false;
    });
}

function initAudioSettings() {
    const slider = document.getElementById('speakerVolume');
    slider.addEventListener('input', updateSpeakerVolumePreview);
    slider.addEventListener('change', () => sendMotionSetting('beep_vol', Number(slider.value)));
}

function updateSpeakerVolumePreview() {
    const slider = document.getElementById('speakerVolume');
    const value = Number(slider.value);
    slider.style.setProperty('--speaker-fill', `${value * 10}%`);
    const output = document.getElementById('speakerVolumeValue');
    output.textContent = String(value);
    output.style.left = `calc(8px + ${value * 10}% - ${value * 1.6}px)`;
}

function hydrateAudioSettings(settings) {
    const slider = document.getElementById('speakerVolume');
    const value = Number(settings.beep_vol);
    if (settings.beep_vol === undefined || settings.beep_vol === null || !Number.isInteger(value) || value < 0 || value > 10) return;
    slider.value = String(value);
    slider.disabled = false;
    updateSpeakerVolumePreview();
}

function hydrateStorageSettings(settings) {
    const status = Number(settings.stored_status);
    const statusLabels = ['Normal', 'No SD card', 'Filesystem not initialized'];
    const availableStatus = settings.stored_status !== undefined && settings.stored_status !== null &&
        Number.isInteger(status) && status >= 0 && status <= 2;
    if (availableStatus) document.getElementById('storageStatus').textContent = statusLabels[status];
    const capacity = Number(settings.stored_capacity);
    const usage = Number(settings.stored_usage);
    const validMetrics = settings.stored_capacity !== undefined && settings.stored_capacity !== null &&
        settings.stored_usage !== undefined && settings.stored_usage !== null &&
        Number.isInteger(capacity) && capacity >= 0 && capacity <= 128 &&
        Number.isInteger(usage) && usage >= 0 && usage <= 100;
    if (availableStatus && status === 0 && validMetrics) {
        document.getElementById('storageTotal').textContent = `${capacity} GB`;
        document.getElementById('storageAvailable').textContent = `${Number((capacity * (1 - usage / 100)).toFixed(2))} GB`;
        document.getElementById('formatStorageButton').disabled = false;
    } else {
        document.getElementById('formatStorageButton').disabled = !availableStatus || status !== 2;
    }
}

function hydrateMotionSettings(settings) {
    const integerInRange = (value, max) => value !== undefined && value !== null && value !== '' &&
        Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= max;
    const motion = document.getElementById('motionDetection');
    if (integerInRange(settings.motion_switch, 1)) {
        motion.checked = Number(settings.motion_switch) === 1;
        motion.indeterminate = false;
        motion.disabled = false;
    }
    [['detectionType', 'motion_type'], ['detectionSensitivity', 'motion_sen']].forEach(([id, key]) => {
        if (integerInRange(settings[key], key === 'motion_type' ? 1 : 2)) {
            document.getElementById(id).value = String(settings[key]);
            document.getElementById(id).disabled = false;
        }
    });
    if (integerInRange(settings.siren_swt, 1)) {
        const alarm = document.getElementById('motionAlarm');
        alarm.checked = Number(settings.siren_swt) === 1;
        alarm.indeterminate = false;
        alarm.disabled = false;
    }
    if (typeof settings.motion_x_y_w_h === 'string' && /^\d+:\d+:\d+:\d+$/.test(settings.motion_x_y_w_h)) {
        settings.motion_x_y_w_h.split(':').forEach((value, index) => {
            document.getElementById(['zoneX', 'zoneY', 'zoneWidth', 'zoneHeight'][index]).value = value;
            document.getElementById(['zoneX', 'zoneY', 'zoneWidth', 'zoneHeight'][index]).disabled = false;
        });
        document.getElementById('saveMotionZone').disabled = false;
    }
    hydrateFacialThresholds(settings);
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

// =====================================================
// CONTROL4 INIT
// =====================================================

function initializeControl4() {

    try {

        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');
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

    input.addEventListener('input', function () {
        deviceNameDraftDirty = true;
        if (statusEl) statusEl.innerText = '';
        updateDeviceNameConfirm();
    });
    document.addEventListener('keydown', function (event) {
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
            statusEl.innerText = '';
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

    beginSettingSave('antiPry');
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
        finishSettingSave('antiPry', false, 'Unable to send setting');
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

let hasConfirmedMicCall = false;

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

    const viewerMic = document.getElementById('viewerMic');
    if (viewerMic) {
        if (viewerMic.classList && typeof viewerMic.classList.toggle === 'function') {
            viewerMic.classList.toggle('is-active', hasConfirmedMicCall && !isMicMuted);
            viewerMic.classList.toggle('is-muted', hasConfirmedMicCall && isMicMuted);
        }
        viewerMic.setAttribute('aria-pressed', String(hasConfirmedMicCall && !isMicMuted));
    }

    if (status) {
        status.innerText = hasConfirmedMicCall ? (isMicMuted ? 'Call Ended' : 'Call Started') : 'Switch on to start a call.';
    }
}



// =====================================================
// REBOOT
// =====================================================

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
    snapshotModalPending = true;

    try {
        C4.sendCommand(
            'TAKE_SNAPSHOT',
            JSON.stringify({}),
            false,
            true
        );
        console.log("📤 TAKE_SNAPSHOT command sent");
    } catch (e) {
        snapshotModalPending = false;
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




function formatFaceTimestamp(value) {
    if (value === undefined || value === null || value === '') return '';
    const text = String(value).trim();
    let date;
    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const timestamp = Number(text);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
        date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    } else {
        date = new Date(text.replace(' ', 'T'));
    }
    if (!Number.isFinite(date.getTime())) return '';
    const pad = component => String(component).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function renderFaces() {
    const list = document.getElementById('faceList');
    list.replaceChildren();
    if (faces.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'face-empty';
        const art = document.createElement('div');
        art.className = 'face-empty-art';
        art.setAttribute('aria-hidden', 'true');
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'scan');
        art.appendChild(icon);
        const person = document.createElement('i');
        person.className = 'face-empty-person';
        person.setAttribute('data-lucide', 'user-round');
        art.appendChild(person);
        const label = document.createElement('div');
        label.className = 'face-empty-label';
        label.textContent = 'No face detected yet';
        empty.appendChild(art);
        empty.appendChild(label);
        list.appendChild(empty);
    }
    faces.forEach(face => {
        const row = document.createElement('div');
        row.className = 'face-entry';
        row.tabIndex = 0;
        row.setAttribute('role', 'button');
        row.setAttribute('aria-label', face.name || 'Stranger');
        if (faceEditMode) {
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'face-selection';
            check.checked = selectedFaceIds.has(face.id);
            check.disabled = face.id === null;
            check.setAttribute('aria-label', `Select ${face.name || 'Stranger'}`);
            check.addEventListener('click', event => event.stopPropagation());
            check.addEventListener('change', () => {
                if (check.checked) selectedFaceIds.add(face.id); else selectedFaceIds.delete(face.id);
                updateFaceSelection();
            });
            row.appendChild(check);
        }
        const hasImage = /^https?:\/\//i.test(face.imageUrl);
        const image = document.createElement(hasImage ? 'img' : 'span');
        image.className = 'face-entry-image';
        const placeholder = () => {
            const fallback = document.createElement('span');
            fallback.className = 'face-entry-image face-image-placeholder';
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'user');
            icon.setAttribute('aria-hidden', 'true');
            fallback.appendChild(icon);
            return fallback;
        };
        if (hasImage) {
            image.src = face.imageUrl;
            image.alt = face.name || 'Stranger';
            image.addEventListener('error', () => {
                image.replaceWith(placeholder());
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }, { once: true });
        } else {
            image.className += ' face-image-placeholder';
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'user');
            icon.setAttribute('aria-hidden', 'true');
            image.appendChild(icon);
        }
        row.appendChild(image);
        const details = document.createElement('span');
        details.className = 'face-entry-details';
        const name = document.createElement('span');
        name.className = 'face-entry-name';
        name.textContent = face.name || 'Stranger';
        const time = document.createElement('span');
        time.className = 'face-entry-time';
        const updatedAt = formatFaceTimestamp(face.updated_at);
        time.textContent = updatedAt ? `Last Updated Time:${updatedAt}` : '';
        details.appendChild(name);
        details.appendChild(time);
        row.appendChild(details);
        const activate = () => {
            if (faceEditMode) {
                if (face.id === null) return;
                if (selectedFaceIds.has(face.id)) selectedFaceIds.delete(face.id); else selectedFaceIds.add(face.id);
                renderFaces();
            } else openFaceNaming(face.face_id);
        };
        row.addEventListener('click', activate);
        row.addEventListener('keydown', event => {
            if (event.target !== row) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activate(); }
        });
        list.appendChild(row);
    });
    document.getElementById('faceLoadMore').hidden = faces.length >= faceTotal;
    document.getElementById('faceEditButton').textContent = faceEditMode ? 'Cancel' : 'Edit';
    document.getElementById('faceEditToolbar').hidden = !faceEditMode;
    updateFaceSelection();
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function loadFaces(page = 1) {
    if (!document.getElementById('faceList')) return;
    lastFaceRequest = Date.now();
    document.getElementById('faceLoadMore').disabled = true;
    if (page === 1 && faces.length === 0) document.getElementById('faceList').textContent = 'Loading faces...';
    try {
        C4.sendCommand(
            'GET_STRANGER_FACES',
            JSON.stringify({ page, page_size: 50 }),
            false,
            true
        );
    } catch (e) {
        console.error("Failed to request stranger faces", e);
        document.getElementById('faceList').textContent = 'Unable to load faces';
        document.getElementById('faceLoadMore').disabled = false;
    }
}

function refreshFaces() {
    const panel = document.getElementById('facialRecPanel');
    if (!panel || !panel.classList.contains('active')) return;
    if (faceEditMode || namingFaceId !== null) return;
    if (Date.now() - lastFaceRequest < FACE_REFRESH_GAP_MS) return;
    loadFaces();
}

document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') refreshFaces();
});

if (typeof window !== 'undefined') {
    window.addEventListener('pageshow', refreshFaces);
    window.addEventListener('focus', refreshFaces);
}

function updateFacesFromDriver(notes, page = 1, total = notes.length) {
    const received = notes.map(n => ({
        id: n.id !== undefined && n.id !== null && n.id !== '' && Number.isSafeInteger(Number(n.id)) && Number(n.id) > 0 ? Number(n.id) : null,
        face_id: n.face_id,
        name: n.note || '',
        imageUrl: n.face_img_url || '',
        updated_at: n.updated_at
    }));
    if (page === 1) faces = received;
    else {
        received.forEach(face => {
            const index = faces.findIndex(current => current.face_id === face.face_id);
            if (index < 0) faces.push(face); else faces[index] = face;
        });
    }
    facePage = page;
    faceTotal = Number(total) || faces.length;
    [...selectedFaceIds].forEach(id => { if (!faces.some(face => face.id === id)) selectedFaceIds.delete(id); });
    document.getElementById('faceLoadMore').disabled = false;
    renderFaces();
}

function updateFaceRecognitionState(value, errorMessage) {
    const toggle = document.getElementById('faceRecEnable');
    const toggleStatus = document.getElementById('faceRecStatus');
    const faceSwitch = value === 0 || value === 1 || value === '0' || value === '1' ? Number(value) : undefined;
    if (toggle) {
        const available = faceSwitch === 0 || faceSwitch === 1;
        confirmedFaceSwitch = faceSwitch;
        toggle.checked = available && faceSwitch === 1;
        toggle.indeterminate = !available;
        toggle.disabled = !available;
        if (toggleStatus) toggleStatus.innerText = errorMessage || (available ? (toggle.checked ? 'Enabled' : 'Disabled') : 'Unavailable');
        updateMotionVisibility();
    }
}

function initFacialRecognition() {
    const toggle = document.getElementById('faceRecEnable');
    if (!toggle) return;
    toggle.addEventListener('change', function () {
        if (faceUpdatePending || confirmedFaceSwitch === undefined) return;
        const attempt = ++faceUpdateAttempt;
        faceUpdatePending = true;
        toggle.disabled = true;
        beginSettingSave('faceRecognition');
        try {
            C4.sendCommand('SET_FACE_RECOGNITION', JSON.stringify({ unknow_snapswt: toggle.checked ? 1 : 0 }), false, true);
        } catch (error) {
            faceUpdatePending = false;
            updateFaceRecognitionState(confirmedFaceSwitch, 'Failed to update facial recognition');
            finishSettingSave('faceRecognition', false, 'Failed to update facial recognition');
        }
        setTimeout(function () {
            if (!faceUpdatePending || attempt !== faceUpdateAttempt) return;
            faceUpdatePending = false;
            updateFaceRecognitionState(confirmedFaceSwitch, 'Update timed out');
            finishSettingSave('faceRecognition', false, 'Update timed out');
            C4.sendCommand('REQUEST_SETTINGS', '', false, false);
        }, 15000);
    });
}

function updateDeviceSettingsFromDriver(settings) {
    latestDeviceSettings = { ...latestDeviceSettings, ...(settings || {}) };
    updateStatusLight(latestDeviceSettings.indicator_swt);
    if (!faceUpdatePending) updateFaceRecognitionState(latestDeviceSettings.unknow_snapswt);
    hydrateFacialThresholds(latestDeviceSettings);
}

function updateStatusLight(value) {
    const toggle = document.getElementById('statusLight');
    if (!toggle) return;
    const state = Number(value);
    const available = value !== undefined && value !== null && value !== '' && (state === 0 || state === 1);
    toggle.disabled = !available;
    toggle.indeterminate = !available;
    if (available) toggle.checked = state === 1;
}

function initStatusLight() {
    const toggle = document.getElementById('statusLight');
    if (!toggle) return;
    toggle.addEventListener('change', () => sendMotionSetting('indicator_swt', toggle.checked ? 1 : 0));
}

function updateFaceSelection() {
    const selectable = faces.filter(face => face.id !== null);
    const selectAll = document.getElementById('faceSelectAll');
    selectAll.checked = selectable.length > 0 && selectable.every(face => selectedFaceIds.has(face.id));
    selectAll.indeterminate = selectedFaceIds.size > 0 && !selectAll.checked;
    selectAll.disabled = selectable.length === 0;
    document.getElementById('faceSelectedCount').textContent = String(selectedFaceIds.size);
    document.getElementById('faceDeleteButton').disabled = selectedFaceIds.size === 0;
}

function toggleFaceEditMode() {
    faceEditMode = !faceEditMode;
    selectedFaceIds.clear();
    renderFaces();
}

function selectAllFaces(selected) {
    selectedFaceIds.clear();
    if (selected) faces.forEach(face => { if (face.id !== null) selectedFaceIds.add(face.id); });
    renderFaces();
}

function leaveFaceManagement() {
    faceEditMode = false;
    selectedFaceIds.clear();
    show('motionDetectionPanel');
}

function openFaceNaming(faceId) {
    const face = faces.find(item => item.face_id === faceId);
    if (!face || !faceId) return;
    namingFaceId = faceId;
    document.getElementById('faceNamingInput').value = face.name;
    document.getElementById('faceNamingInput').placeholder = 'Stranger';
    document.getElementById('faceNamingError').textContent = '';
    document.getElementById('faceNamingSheet').hidden = false;
    document.getElementById('faceNamingInput').focus();
}

function closeFaceNaming() {
    document.getElementById('faceNamingSheet').hidden = true;
    namingFaceId = null;
}

function confirmFaceNaming() {
    if (!namingFaceId) return;
    const note = document.getElementById('faceNamingInput').value.trim();
    pendingFaceRename = { face_id: namingFaceId, note };
    beginSettingSave('faces');
    try {
        C4.sendCommand('UPDATE_STRANGER_NOTE', JSON.stringify(pendingFaceRename), false, true);
    } catch (error) {
        finishSettingSave('faces', false, 'Unable to save face name');
    }
}

function openFaceDeleteConfirmation() {
    if (selectedFaceIds.size) document.getElementById('faceDeleteConfirmation').hidden = false;
}

function closeFaceDeleteConfirmation() {
    document.getElementById('faceDeleteConfirmation').hidden = true;
}

function confirmFaceDeletion() {
    const ids = [...selectedFaceIds];
    if (!ids.length) return;
    beginSettingSave('faceDelete');
    try {
        C4.sendCommand('DELETE_STRANGER_FACES', JSON.stringify({ ids_json: JSON.stringify(ids) }), false, true);
        closeFaceDeleteConfirmation();
    } catch (error) {
        finishSettingSave('faceDelete', false, 'Unable to delete faces');
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

        if (obj.type === 'camera_settings') {
            if (obj.success) {
                Object.assign(latestDeviceSettings, obj.settings || {});
                hydrateMotionSettings(obj.settings || {});
                hydrateVideoSettings(obj.settings || {});
                hydrateAudioSettings(obj.settings || {});
                hydrateStorageSettings(obj.settings || {});
                if (obj.settings && obj.settings.indicator_swt !== undefined) {
                    latestDeviceSettings.indicator_swt = obj.settings.indicator_swt;
                    updateStatusLight(obj.settings.indicator_swt);
                }
            }
            document.getElementById('motionSettingsStatus').textContent = '';
            document.getElementById('motionZoneStatus').textContent = '';
            if (!obj.setting_saved) {
                const motion = document.getElementById('motionDetection');
                const complete = !motion.checked || ['detectionType', 'detectionSensitivity', 'saveMotionZone', 'motionAlarm']
                    .every(id => !document.getElementById(id).disabled);
                const ready = obj.success && !motion.disabled && complete;
                finishSettingsLoad('camera', ready, 'Unable to load camera settings');
            }
            if (obj.success && obj.setting_saved) finishSettingSave('camera', true);
        }
        if (obj.type === 'camera_setting_result' && !obj.success) {
            document.getElementById('motionSettingsStatus').textContent = '';
            document.getElementById('motionZoneStatus').textContent = '';
            updateStatusLight(latestDeviceSettings.indicator_swt);
            hydrateVideoSettings(latestDeviceSettings);
            hydrateAudioSettings(latestDeviceSettings);
            finishSettingSave('camera', false, obj.error);
            return;
        }

        if (obj.type === 'storage_format') {
            finishSettingSave('format', obj.success, obj.error || 'Format request failed', 'Format command accepted');
            if (obj.success) {
                closeStorageFormat();
                document.getElementById('formatStorageButton').disabled = true;
            }
            return;
        }

      
        // =========================
        // DEVICE INFO (Name + Firmware)
        // =========================
        if (obj.type === "device_info" && obj.success) {

            const input = document.getElementById('deviceNameInput');
            if (obj.device_name) {
                confirmedDeviceName = obj.device_name;
                document.getElementById('settingsDeviceName').textContent = obj.device_name;
                if (input && !deviceNameDraftDirty && !pendingSettingSaves.has('name')) {
                    input.value = confirmedDeviceName;
                    updateDeviceNameConfirm();
                    if (!document.getElementById('deviceNameSheet').hidden) input.select();
                }
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
            const viewerName = document.getElementById('viewerDeviceName');
            if (viewerName) viewerName.innerText = obj.device_name || 'VD05 Camera';
            if (obj.device_name) {
                document.getElementById('settingsDeviceName').textContent = obj.device_name;
                document.getElementById('informationDeviceName').textContent = obj.device_name;
            }
            document.getElementById('informationFirmware').textContent = obj.version || obj.firmware || '...';
            document.getElementById('informationRelease').textContent = obj.release_date || '...';
            document.getElementById('informationIp').textContent = obj.ip || '...';
            document.getElementById('informationMac').textContent = obj.mac || '...';
            document.getElementById('informationBattery').textContent = Number.isFinite(Number(obj.battery)) && obj.battery !== null ? `${obj.battery}%` : '...';
            document.getElementById('powerBatteryLevel').textContent = Number.isFinite(Number(obj.battery)) && obj.battery !== null ? `${obj.battery}%` : '...';
            document.getElementById('firmwareAvailability').textContent = obj.can_update === true ? 'Update available' :
                obj.can_update === false ? 'The current version is the latest.' : '...';
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
            finishSettingSave('antiPry', true);
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.type === 'mic_result') {
            if (obj.success) {
                hasConfirmedMicCall = true;
                updateMicUI(obj.mic_muted === true || obj.mic_muted === 1);
            }
            else updateMicUI(isMicMuted);
            finishSettingSave('mic', obj.success, obj.error || 'Unable to update call',
                isMicMuted ? 'Call Ended' : 'Call Started');
            return;
        }

        if ((obj.type === "mic_update" || obj.mic_muted !== undefined) && !pendingSettingSaves.has('mic')) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

            console.log("Mic UI UPDATE →", muted ? "MUTED" : "UNMUTED");

            updateMicUI(muted);
            hasConfirmedMicCall = true;
        }


        if (obj.type === 'device_name_result') {
            if (obj.success) {
                const updatedName = obj.device_name || pendingDeviceName;
                if (updatedName) {
                    confirmedDeviceName = updatedName;
                    document.getElementById('settingsDeviceName').textContent = updatedName;
                }
                pendingDeviceName = '';
                deviceNameDraftDirty = false;
                finishSettingSave('name', true);
                closeDeviceNameSheet();
            } else {
                finishSettingSave('name', false, obj.error || 'Failed to update name');
                document.getElementById('deviceNameStatus').textContent = obj.error || 'Failed to update name';
                updateDeviceNameConfirm();
            }
            return;
        }

        // Compatibility with driver versions that send only device_name_updated.
        if (obj.device_name_updated) {
            const updatedName = obj.device_name || pendingDeviceName;
            if (updatedName) {
                confirmedDeviceName = updatedName;
                document.getElementById('settingsDeviceName').textContent = updatedName;
            }
            pendingDeviceName = '';
            deviceNameDraftDirty = false;
            finishSettingSave('name', true);
            closeDeviceNameSheet();
            return;
        }

         if (obj.type === "snapshot_result") {
            if (liveSnapshotPending) {
                liveSnapshotPending = false;
                clearTimeout(liveSnapshotTimeout);
                if (isLiveViewerActive()) {
                    if (obj.success && obj.image_url) displayLiveSnapshot(obj.image_url);
                    else {
                        document.getElementById('livePreviewStatus').textContent = obj.error || 'Camera preview unavailable';
                        scheduleLiveSnapshot(2500);
                    }
                    if (obj.success && obj.image_url) scheduleLiveSnapshot(1200);
                }
                return;
            }
            if (snapshotModalPending) {
                snapshotModalPending = false;
                if (obj.success && obj.image_url) openSnapshotModal(obj.image_url, "Snapshot captured");
                else openSnapshotModal(null, obj.error || "Failed to capture snapshot");
                return;
            }
            if (isLiveViewerActive()) {
                if (obj.success && obj.image_url) displayLiveSnapshot(obj.image_url);
                else document.getElementById('livePreviewStatus').textContent = obj.error || 'Camera preview unavailable';
            }
        }

        // =========================
        // STRANGER FACES LIST
        // =========================
        if (obj.type === "stranger_faces") {
            if (!document.getElementById('faceList')) return;
            if (obj.success && obj.data && obj.data.notes) {
                updateFacesFromDriver(obj.data.notes, Number(obj.data.page) || 1, obj.data.total);
            } else {
                document.getElementById('faceList').textContent = obj.error || 'Unable to load faces';
                document.getElementById('faceLoadMore').disabled = false;
            }
            return;
        }

        if (obj.type === 'device_settings') {
            updateDeviceSettingsFromDriver(obj.settings);
            finishSettingsLoad('device', confirmedFaceSwitch !== undefined, 'Unable to load facial recognition settings');
            return;
        }

        if (obj.type === 'face_recognition_updated') {
            faceUpdatePending = false;
            if (obj.success) {
                latestDeviceSettings.unknow_snapswt = obj.unknow_snapswt;
                updateFaceRecognitionState(obj.unknow_snapswt);
                finishSettingSave('faceRecognition', true);
                C4.sendCommand('REQUEST_SETTINGS', '', false, false);
            } else {
                updateFaceRecognitionState(confirmedFaceSwitch, obj.error || 'Failed to update facial recognition');
                finishSettingSave('faceRecognition', false, obj.error || 'Failed to update facial recognition');
            }
            return;
        }

        // =========================
        // STRANGER NOTE UPDATED
        // =========================
        if (obj.type === "stranger_note_updated") {
            console.log("[UI] stranger_note_updated:", obj);

            if (obj.success) {
                if (pendingFaceRename) {
                    const face = faces.find(item => item.face_id === (obj.face_id || pendingFaceRename.face_id));
                    if (face) face.name = typeof obj.note === 'string' ? obj.note : pendingFaceRename.note;
                    pendingFaceRename = null;
                    closeFaceNaming();
                    renderFaces();
                }
                finishSettingSave('faces', true);
                loadFaces();
            } else {
                finishSettingSave('faces', false, obj.error || 'Failed to update face name');
            }
            return;
        }

        if (obj.type === 'stranger_faces_deleted') {
            finishSettingSave('faceDelete', obj.success, obj.error);
            if (obj.success) {
                selectedFaceIds.clear();
                faceEditMode = false;
                loadFaces();
            }
            return;
        }

        // Error handling
        if (obj.error) {
            if (pendingSettingSaves.size > 0) {
                [...pendingSettingSaves.keys()].forEach(kind => finishSettingSave(kind, false, obj.error));
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
        console.log('onDataToUi parse error', e);
    }
}


// =====================================================
// ERROR HANDLERS
// =====================================================

function onVariable(v) {
    console.log('onVariable', v);
    refreshFaces();
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

function updateDeviceNameConfirm() {
    const input = document.getElementById('deviceNameInput');
    const button = document.getElementById('updateNameBtn');
    if (input && button) button.disabled = pendingSettingSaves.has('name') || !input.value.trim();
}

function openDeviceNameSheet() {
    if (pendingSettingSaves.size > 0) return;
    deviceNameReturnFocus = document.activeElement;
    deviceNameDraftDirty = false;
    const input = document.getElementById('deviceNameInput');
    input.value = confirmedDeviceName || document.getElementById('settingsDeviceName').textContent.trim();
    document.getElementById('deviceNameStatus').textContent = '';
    document.getElementById('deviceNameSheet').hidden = false;
    updateDeviceNameConfirm();
    input.focus();
    input.select();
    initDeviceInfo();
}

function closeDeviceNameSheet() {
    if (pendingSettingSaves.has('name')) return;
    document.getElementById('deviceNameSheet').hidden = true;
    document.getElementById('deviceNameStatus').textContent = '';
    document.getElementById('deviceNameInput').value = confirmedDeviceName;
    deviceNameDraftDirty = false;
    updateDeviceNameConfirm();
    if (deviceNameReturnFocus && deviceNameReturnFocus.focus) deviceNameReturnFocus.focus();
}

function clearDeviceName() {
    if (pendingSettingSaves.has('name')) return;
    const input = document.getElementById('deviceNameInput');
    input.value = '';
    deviceNameDraftDirty = true;
    document.getElementById('deviceNameStatus').textContent = '';
    updateDeviceNameConfirm();
    input.focus();
}