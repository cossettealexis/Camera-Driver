// K26 UI
let isMicMuted = false;
let latestCameraSettings = {};
let hasConfirmedMicCall = false;
let speakerVolumeBeforeMute = 5;
let latestSnapshotUrl = '';
let k26LiveZoomIndex = 0;
const k26LiveZoomLevels = [1, 2, 3, 4, 5, 6];
let faces = [];
let faceEditMode = false;
let facePage = 1;
let requestedFacePage = 1;
let faceTotal = 0;
let namingFaceId = null;
let pendingFaceRename = null;
let pendingFaceDelete = null;
const selectedFaceIds = new Set();
let confirmedDeviceName = '';
let pendingDeviceName = '';
let deviceNameDraftDirty = false;
let deviceNameReturnFocus;
let settingsLoading = false;
let settingsLoadScope = 'motion';
let settingsRequestSequence = 0;
let activeSettingsRequest = 0;
let homeInfoReady = false;
let viewerSpeakerWritePending = false;
let viewerSpeakerLoadPending = false;
let viewerSpeakerLoadTimer;
let notificationHistoryPending = false;
let notificationHistoryPage = 1;
let notificationHistoryHasMore = false;
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
        values: [0, 1, 2], labels: ['Infrared mode', 'Unenabled', 'Color light mode'],
        descriptions: [
            'When an event is detected at night, the infrared light automatically turns on',
            'When the light in front of the camera is always brighter, use Enable to select this mode to always turn off the infrared light and white light',
            'When an event is detected at night, the white light will be automatically turned on to record color video, but it will accelerate battery consumption'
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
        (pendingSettingSaves.get('mic')?.label || pendingSettingSaves.get('speakerVolume')?.label || pendingSettingSaves.values().next().value?.label || 'Setting up...');
    const app = document.querySelector('.app');
    if (app) app.inert = pending || !document.getElementById('deviceNameSheet').hidden || !document.getElementById('storageFormatDialog').hidden ||
        !document.getElementById('restartConfirmationDialog').hidden || !document.getElementById('faceNamingSheet').hidden || !document.getElementById('faceDeleteConfirmation').hidden;
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
            if (kind === 'speakerVolume') {
                viewerSpeakerWritePending = false;
                updateViewerSpeaker(latestCameraSettings.beep_vol);
            }
            if (kind === 'name') updateDeviceNameConfirm();
            updateSettingSaveOverlay();
            showSettingToast(kind === 'restart' ? 'Restart request timed out' : 'Setting update timed out');
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
    else if (message && !settingsLoading && pendingSettingSaves.size === 0 && !settingSaveFailed) showSettingToast(message);
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
    const facial = document.getElementById('faceRecEnable');
    document.getElementById('facialRecognitionRow').style.borderBottom = facial.indeterminate || !facial.checked ? '0' : '';
    ['faceSimilarity', 'faceQuality'].forEach(id => {
        const row = document.getElementById(id);
        row.hidden = facial.indeterminate || !facial.checked || row.disabled;
    });
    document.getElementById('k26FaceManagement').hidden = !facial.indeterminate && !facial.checked;
}

function resetCameraSettings() {
    const indicator = latestCameraSettings.indicator_swt;
    latestCameraSettings = settingsLoadScope !== 'home' && indicator !== undefined ? { indicator_swt: indicator } : {};
    updateViewerSpeaker(latestCameraSettings.beep_vol);
    if (settingsLoadScope === 'home') {
        const statusLight = document.getElementById('statusLight');
        statusLight.disabled = true;
        statusLight.checked = false;
        statusLight.indeterminate = true;
        statusLight.setAttribute('aria-busy', 'true');
        const status = document.getElementById('statusLightValue');
        status.textContent = '...';
        status.hidden = false;
    }
    ['motionDetectionToggle', 'faceRecEnable', 'flipImageToggle', 'timeWatermarkToggle',
        'appAlertNotification', 'appMotionNotification', 'appOfflineNotification', 'appEventNotification'].forEach(id => {
        const control = document.getElementById(id);
        control.disabled = true;
        control.indeterminate = true;
        control.checked = false;
    });
    ['motionDetectionType', 'motionSensitivity', 'faceSimilarity', 'faceQuality', 'nightVisionMode', 'antiFlicker', 'speakerVolume', 'k26ZoneX', 'k26ZoneY', 'k26ZoneWidth', 'k26ZoneHeight'].forEach(id => {
        const control = document.getElementById(id);
        control.disabled = true;
        control.value = '';
    });
    document.getElementById('motionZoneOpen').disabled = true;
    document.getElementById('k26ZoneSave').disabled = true;
    document.getElementById('speakerVolumeValue').textContent = '...';
    ['storageTotal', 'storageAvailable', 'storageStatus'].forEach(id => { document.getElementById(id).textContent = '...'; });
    document.getElementById('formatStorageButton').disabled = true;
    updateMotionChoiceLabels();
    updateMotionVisibility();
}

function cameraSettingsReady() {
    if (settingsLoadScope === 'home') return homeInfoReady && !document.getElementById('statusLight').disabled;
    if (settingsLoadScope === 'notifications') return true;
    if (settingsLoadScope === 'audio') return !document.getElementById('speakerVolume').disabled;
    if (settingsLoadScope === 'storage') {
        const status = latestCameraSettings.stored_status;
        return status !== undefined && status !== null && status !== '' && [0, 1, 2].includes(Number(status)) &&
            (Number(status) !== 0 || !document.getElementById('formatStorageButton').disabled);
    }
    if (settingsLoadScope === 'video') {
        return ['nightVisionMode', 'antiFlicker', 'flipImageToggle', 'timeWatermarkToggle']
            .every(id => !document.getElementById(id).disabled);
    }
    const motion = document.getElementById('motionDetectionToggle');
    const facial = document.getElementById('faceRecEnable');
    if (motion.disabled || facial.disabled) return false;
    const motionReady = !motion.checked || ['motionDetectionType', 'motionSensitivity', 'k26ZoneSave']
        .every(id => !document.getElementById(id).disabled);
    const facialReady = !facial.checked || ['faceSimilarity', 'faceQuality']
        .every(id => !document.getElementById(id).disabled);
    return motionReady && facialReady;
}

function fitK26LivePreviewFrame() {
    const stage = document.getElementById('k26CameraStage');
    const frame = document.getElementById('k26CameraFrame');
    if (!stage || !frame) return;
    const width = Math.max(0, Math.min(stage.clientWidth, stage.clientHeight * 4 / 3));
    frame.style.width = `${width}px`;
    frame.style.height = `${width * 3 / 4}px`;
}

function cycleK26LiveZoom() {
    k26LiveZoomIndex = (k26LiveZoomIndex + 1) % k26LiveZoomLevels.length;
    const zoom = k26LiveZoomLevels[k26LiveZoomIndex];
    document.getElementById('k26CameraFrame').style.setProperty('--viewer-zoom', String(zoom));
    document.getElementById('k26ZoomChip').textContent = `${zoom.toFixed(1)}X`;
}

function updateViewerSpeaker(value) {
    const button = document.getElementById('k26ViewerSpeaker');
    if (!button) return;
    const volume = Number(value);
    if (!Number.isInteger(volume) || volume < 0 || volume > 10) {
        button.disabled = viewerSpeakerLoadPending || viewerSpeakerWritePending;
        button.setAttribute('aria-label', 'Load speaker volume');
        button.title = 'Load speaker volume';
        return;
    }
    if (volume > 0) speakerVolumeBeforeMute = volume;
    const muted = volume === 0;
    button.disabled = viewerSpeakerWritePending;
    button.classList.toggle('is-muted', muted);
    button.setAttribute('aria-pressed', String(muted));
    button.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on');
    button.title = muted ? 'Sound off' : 'Sound on';
    button.innerHTML = `<i data-lucide="${muted ? 'volume-x' : 'volume-2'}"></i>`;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleK26ViewerSpeaker() {
    if (viewerSpeakerWritePending || viewerSpeakerLoadPending) return;
    const current = Number(latestCameraSettings.beep_vol);
    if (!Number.isInteger(current) || current < 0 || current > 10) {
        viewerSpeakerLoadPending = true;
        updateViewerSpeaker(undefined);
        viewerSpeakerLoadTimer = setTimeout(() => {
            viewerSpeakerLoadPending = false;
            updateViewerSpeaker(latestCameraSettings.beep_vol);
            showSettingToast('Speaker volume request timed out');
        }, 10000);
        try {
            C4.sendCommand('GET_CAMERA_SETTINGS', JSON.stringify({ scope: 'audio' }), false, true);
        } catch (error) {
            clearTimeout(viewerSpeakerLoadTimer);
            viewerSpeakerLoadPending = false;
            updateViewerSpeaker(latestCameraSettings.beep_vol);
            showSettingToast('Unable to load speaker volume');
        }
        return;
    }
    const target = current === 0 ? speakerVolumeBeforeMute : 0;
    if (current > 0) speakerVolumeBeforeMute = current;
    viewerSpeakerWritePending = true;
    updateViewerSpeaker(current);
    beginSettingSave('speakerVolume', 'Updating speaker...');
    try {
        C4.sendCommand('SET_CAMERA_SETTING', JSON.stringify({ key: 'beep_vol', value: target }), false, true);
    } catch (error) {
        viewerSpeakerWritePending = false;
        updateViewerSpeaker(current);
        finishSettingSave('speakerVolume', false, 'Unable to update speaker');
    }
}

function toggleK26ViewerToolbar(showAlternate) {
    document.getElementById('k26ViewerToolbar').hidden = showAlternate;
    document.getElementById('k26ViewerAlternateToolbar').hidden = !showAlternate;
}

function openLatestK26Snapshot() {
    if (!latestSnapshotUrl) {
        showSettingToast('No captured snapshots available');
        return;
    }
    openSnapshotModal(latestSnapshotUrl, 'Latest captured snapshot');
}

function openK26ViewerNotifications() {
    notificationHistoryPending = false;
    notificationHistoryPage = 1;
    notificationHistoryHasMore = false;
    show('notificationHistoryPanel');
    requestK26Notifications(1);
}

function requestK26Notifications(page = 1, append = false) {
    if (notificationHistoryPending) return;
    notificationHistoryPending = true;
    const list = document.getElementById('notificationHistoryList');
    const loadMore = document.getElementById('notificationHistoryLoadMore');
    if (!append) {
        list.replaceChildren();
        const loading = document.createElement('div');
        loading.className = 'notification-history-empty';
        loading.textContent = 'Loading notifications...';
        list.appendChild(loading);
    } else loadMore.disabled = true;
    try {
        C4.sendCommand('GET_NOTIFICATION_HISTORY', JSON.stringify({ page }), false, true);
    } catch (error) {
        notificationHistoryPending = false;
        list.textContent = 'Unable to load notifications';
        loadMore.disabled = false;
    }
}

function loadMoreK26Notifications() {
    if (!notificationHistoryHasMore || notificationHistoryPending) return;
    requestK26Notifications(notificationHistoryPage + 1, true);
}

function describeK26Notification(item) {
    const rawType = String(item.message_type || 'Notification').trim();
    const normalized = rawType.toLowerCase().replace(/[\s-]+/g, '_');
    const device = item.device_name || 'Camera';
    if (normalized.includes('doorbell') || normalized.includes('door_bell')) {
        return { title: 'Doorbell Call Event', description: `${device} received a visitor click on the doorbell` };
    }
    if (normalized.includes('human')) {
        return { title: 'Human Detection Event', description: `${device} detected someone's presence` };
    }
    if (normalized.includes('stranger')) {
        return { title: 'Face Detection Event', detail: 'Stranger', description: `${device} detected someone appeared` };
    }
    if (normalized.includes('registered_user')) {
        return { title: 'Face Detection Event', detail: 'Registered User', description: `${device} detected someone appeared` };
    }
    if (normalized.includes('face')) {
        return { title: 'Face Detection Event', description: `${device} detected someone appeared` };
    }
    if (normalized.includes('motion') || normalized.includes('move_detect')) {
        return { title: 'Motion Detection Event', description: `${device} detected motion` };
    }
    const words = rawType.replace(/[_-]+/g, ' ').split(/\s+/).filter(Boolean);
    const titleText = words.map(word => word[0].toUpperCase() + word.slice(1).toLowerCase()).join(' ');
    const title = /\bevent$/i.test(titleText) ? titleText : `${titleText} Event`;
    return { title, description: device };
}

function renderK26Notifications(notifications, append = false) {
    const list = document.getElementById('notificationHistoryList');
    if (!append) list.replaceChildren();
    if (!notifications.length && !append) {
        const empty = document.createElement('div');
        empty.className = 'notification-history-empty';
        empty.textContent = 'No notifications';
        list.appendChild(empty);
    }
    notifications.forEach(item => {
        const card = document.createElement('article');
        card.className = 'notification-history-card';
        const media = document.createElement('div');
        media.className = 'notification-history-media';
        if (item.image_url) {
            const thumbnail = document.createElement('img');
            thumbnail.className = 'notification-history-thumb';
            thumbnail.alt = '';
            thumbnail.src = item.image_url;
            media.appendChild(thumbnail);
        } else {
            media.className = 'notification-history-placeholder';
            const icon = document.createElement('i');
            icon.setAttribute('data-lucide', 'bell-ring');
            media.appendChild(icon);
        }
        const copy = document.createElement('div');
        copy.className = 'notification-history-copy';
        const presentation = describeK26Notification(item);
        const title = document.createElement('div');
        title.className = 'notification-history-title';
        title.textContent = presentation.title;
        copy.appendChild(title);
        if (presentation.detail) {
            const detail = document.createElement('div');
            detail.className = 'notification-history-detail';
            detail.textContent = presentation.detail;
            copy.appendChild(detail);
        }
        const description = document.createElement('div');
        description.className = 'notification-history-description';
        description.textContent = presentation.description;
        copy.appendChild(description);
        const duration = Number(item.video_sec);
        if (duration > 0) {
            const badge = document.createElement('span');
            badge.className = 'notification-history-duration';
            badge.textContent = `00:${String(duration).padStart(2, '0')}`;
            media.appendChild(badge);
        }
        const time = document.createElement('time');
        time.className = 'notification-history-time';
        const timestamp = Number(item.time);
        if (Number.isFinite(timestamp) && timestamp > 0) {
            const date = new Date(timestamp > 1e12 ? timestamp : timestamp * 1000);
            time.textContent = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
        }
        card.appendChild(media);
        card.appendChild(copy);
        card.appendChild(time);
        if (item.image_url || item.video_url) {
            card.tabIndex = 0;
            card.setAttribute('role', 'button');
            card.addEventListener('click', () => {
                if (item.image_url) openSnapshotModal(item.image_url, item.message_type || 'Notification');
                else showSettingToast('Video preview is not available in this view');
            });
        }
        list.appendChild(card);
    });
    document.getElementById('notificationHistoryLoadMore').hidden = !notificationHistoryHasMore;
    document.getElementById('notificationHistoryLoadMore').disabled = false;
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function toggleK26ViewerFullscreen() {
    const player = document.getElementById('k26CameraView');
    const button = document.getElementById('k26ViewerFullscreen');
    if (!player || !button) return;
    if (document.fullscreenElement === player) {
        document.exitFullscreen();
        return;
    }
    const setFallback = fullscreen => {
        player.classList.toggle('is-fullscreen', fullscreen);
        button.setAttribute('aria-pressed', String(fullscreen));
        setTimeout(fitK26LivePreviewFrame, 0);
    };
    if (player.classList.contains('is-fullscreen')) {
        setFallback(false);
    } else if (typeof player.requestFullscreen === 'function') {
        player.requestFullscreen().catch(() => setFallback(true));
    } else setFallback(true);
}

function initK26ViewerControls() {
    fitK26LivePreviewFrame();
    window.addEventListener('resize', fitK26LivePreviewFrame);
    document.getElementById('k26ViewerMic').addEventListener('click', () => {
        sendMicCommand(hasConfirmedMicCall ? !isMicMuted : false);
    });
    document.getElementById('k26ViewerEndCall').addEventListener('click', () => {
        toggleK26ViewerToolbar(true);
    });
    document.getElementById('k26ViewerSpeaker').addEventListener('click', toggleK26ViewerSpeaker);
    document.getElementById('k26ViewerFullscreen').addEventListener('click', toggleK26ViewerFullscreen);
    document.getElementById('k26ZoomChip').addEventListener('click', cycleK26LiveZoom);
    document.getElementById('k26ViewerAlbum').addEventListener('click', openLatestK26Snapshot);
    document.getElementById('k26ViewerNotifications').addEventListener('click', openK26ViewerNotifications);
    document.getElementById('k26ViewerToolbarBack').addEventListener('click', () => toggleK26ViewerToolbar(false));
    document.addEventListener('fullscreenchange', () => {
        const player = document.getElementById('k26CameraView');
        const fullscreen = document.fullscreenElement === player;
        player.classList.toggle('is-fullscreen', fullscreen);
        document.getElementById('k26ViewerFullscreen').setAttribute('aria-pressed', String(fullscreen));
        fitK26LivePreviewFrame();
    });
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && document.getElementById('k26CameraView').classList.contains('is-fullscreen')) {
            toggleK26ViewerFullscreen();
        }
    });
}

document.addEventListener('DOMContentLoaded', function () {
    initializeControl4();
    initK26ViewerControls();
    initMicrophone();
    initDeviceName();
    initSnapshot();
    initCameraSettings();
    requestCameraSettings('home');
});

function requestCameraSettings(scope = 'motion') {
    clearTimeout(settingsLoadTimer);
    settingsLoadScope = scope;
    if (scope === 'home') homeInfoReady = false;
    activeSettingsRequest = ++settingsRequestSequence;
    settingsLoading = true;
    resetCameraSettings();
    document.getElementById('settingSaveToast').hidden = true;
    updateSettingSaveOverlay();
    settingsLoadTimer = setTimeout(() => finishCameraSettingsLoad(false, 'Settings request timed out'), 20000);
    try {
        const command = scope === 'home' || scope === 'information' ? 'GET_DEVICE_INFO' : 'GET_CAMERA_SETTINGS';
        C4.sendCommand(command, JSON.stringify({ scope, request_id: activeSettingsRequest }), false, true);
        if (scope === 'home') {
            C4.sendCommand('GET_CAMERA_SETTINGS', JSON.stringify({ scope, request_id: activeSettingsRequest }), false, true);
        }
    } catch (e) {
        console.error('Failed to request camera settings', e);
        finishCameraSettingsLoad(false, 'Unable to request camera settings');
    }
}

function updateSpeakerVolumePreview() {
    const slider = document.getElementById('speakerVolume');
    const value = Number(slider.value);
    slider.style.setProperty('--speaker-fill', `${value * 10}%`);
    const output = document.getElementById('speakerVolumeValue');
    output.textContent = String(value);
    output.style.left = `calc(8px + ${value * 10}% - ${value * 1.6}px)`;
}

function openStorageFormat() {
    if (document.getElementById('formatStorageButton').disabled || pendingSettingSaves.size > 0) return;
    document.getElementById('cancelStorageFormat').disabled = false;
    document.getElementById('confirmStorageFormat').disabled = false;
    document.getElementById('storageFormatTitle').textContent = 'Format Local Storage';
    document.getElementById('confirmStorageFormat').textContent = 'Next';
    document.getElementById('storageFormatDialog').hidden = false;
    updateSettingSaveOverlay();
    document.getElementById('cancelStorageFormat').focus();
}

function closeStorageFormat() {
    if (pendingSettingSaves.has('format')) return;
    document.getElementById('storageFormatDialog').hidden = true;
    updateSettingSaveOverlay();
}

function confirmStorageFormat() {
    if (document.getElementById('storageFormatDialog').hidden || pendingSettingSaves.has('format')) return;
    document.getElementById('storageFormatDialog').hidden = true;
    beginSettingSave('format', 'Formatting...');
    document.getElementById('cancelStorageFormat').disabled = true;
    document.getElementById('confirmStorageFormat').disabled = true;
    try {
        C4.sendCommand('FORMAT_STORAGE', JSON.stringify({ confirmed: true }), false, true);
    } catch (error) {
        document.getElementById('cancelStorageFormat').disabled = false;
        document.getElementById('confirmStorageFormat').disabled = false;
        finishSettingSave('format', false, 'Unable to send format command');
    }
}

async function copyDeviceSerial() {
    const value = document.getElementById('deviceSerial').textContent;
    if (!value || value === '...') return;
    try {
        await navigator.clipboard.writeText(value);
        showSettingToast('SN copied');
    } catch (error) {
        showSettingToast('Clipboard unavailable');
    }
}

function openC4AuthenticationService() {
    show('c4AuthenticationPanel');
    requestCameraSettings('information');
}

async function copyUserIdentifier() {
    const identifier = document.getElementById('c4UserIdentifier').textContent;
    if (!identifier || identifier === '...') return;
    try {
        await navigator.clipboard.writeText(identifier);
        showSettingToast('User identifier copied');
    } catch (error) {
        showSettingToast('Clipboard unavailable');
    }
}

function openPairingModeConfirmation() {
    document.getElementById('devicePairingDialog').hidden = false;
}

function closePairingModeConfirmation() {
    document.getElementById('devicePairingDialog').hidden = true;
}

function confirmPairingMode() {
    closePairingModeConfirmation();
    showSettingToast('Device pairing mode is not available from the K26 driver');
}

function currentSettingsResponse(obj) {
    return (!obj.scope || obj.scope === settingsLoadScope) &&
        (obj.request_id === undefined || Number(obj.request_id) === activeSettingsRequest);
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
    if (integerInRange(latestCameraSettings.indicator_swt, 1)) {
        const statusLight = document.getElementById('statusLight');
        statusLight.checked = Number(latestCameraSettings.indicator_swt) === 1;
        statusLight.indeterminate = false;
        statusLight.disabled = false;
        statusLight.setAttribute('aria-busy', 'false');
        const status = document.getElementById('statusLightValue');
        status.textContent = statusLight.checked ? 'On' : 'Off';
        status.hidden = true;
    }
    const motionEnabled = Number(latestCameraSettings.motion_switch) === 1;
    const motionToggle = document.getElementById('motionDetectionToggle');
    if (motionToggle && integerInRange(latestCameraSettings.motion_switch, 1)) {
        motionToggle.checked = motionEnabled;
        motionToggle.indeterminate = false;
        motionToggle.disabled = false;
    }
    const motionGroup = document.getElementById('motionSettingsGroup');
    if (motionGroup) motionGroup.hidden = !motionEnabled;

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
            [0, 1, 2].includes(Number(value)) : integerInRange(value, 2);
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
    if (integerInRange(latestCameraSettings.beep_vol, 10)) {
        const volume = document.getElementById('speakerVolume');
        volume.value = String(latestCameraSettings.beep_vol);
        volume.disabled = false;
        updateSpeakerVolumePreview();
        updateViewerSpeaker(latestCameraSettings.beep_vol);
    }
    const storageState = latestCameraSettings.stored_status;
    const capacity = latestCameraSettings.stored_capacity;
    const usage = latestCameraSettings.stored_usage;
    if (integerInRange(storageState, 2)) {
        document.getElementById('storageStatus').textContent = ['Normal', 'No SD card', 'Filesystem not initialized'][Number(storageState)];
    }
    if (integerInRange(capacity, 128) && integerInRange(usage, 100) && Number(storageState) === 0) {
        document.getElementById('storageTotal').textContent = `${Number(capacity)} GB`;
        document.getElementById('storageAvailable').textContent = `${Number((Number(capacity) * (1 - Number(usage) / 100)).toFixed(2))} GB`;
        document.getElementById('formatStorageButton').disabled = false;
    } else document.getElementById('formatStorageButton').disabled = Number(storageState) !== 2;
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
    const statusLight = document.getElementById('statusLight');
    statusLight.addEventListener('change', () => sendCameraSetting('indicator_swt', statusLight.checked ? 1 : 0));
    const motionToggle = document.getElementById('motionDetectionToggle');
    const detectionType = document.getElementById('motionDetectionType');
    const sensitivity = document.getElementById('motionSensitivity');
    const zoneOpen = document.getElementById('motionZoneOpen');
    const zoneSave = document.getElementById('k26ZoneSave');

    if (motionToggle) motionToggle.addEventListener('change', () => {
        updateMotionVisibility();
        sendCameraSetting('motion.switch', motionToggle.checked ? 1 : 0);
    });
    if (detectionType) detectionType.addEventListener('change', () => sendCameraSetting('motion.type', detectionType.value));
    if (sensitivity) sensitivity.addEventListener('change', () => sendCameraSetting('motion.sen', sensitivity.value));
    const facial = document.getElementById('faceRecEnable');
    facial.addEventListener('change', () => {
        updateMotionVisibility();
        sendCameraSetting('unknow_snapswt', facial.checked ? 1 : 0);
    });
    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        const control = document.getElementById(id);
        control.addEventListener('change', () => sendCameraSetting(key, control.checked ? 1 : 0));
    });
    const volume = document.getElementById('speakerVolume');
    volume.addEventListener('input', updateSpeakerVolumePreview);
    volume.addEventListener('change', () => sendCameraSetting('beep_vol', Number(volume.value)));
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
    const viewerMic = document.getElementById('k26ViewerMic');
    if (viewerMic) {
        const inCall = hasConfirmedMicCall && !isMicMuted;
        viewerMic.classList.toggle('is-active', inCall);
        viewerMic.classList.toggle('is-muted', !inCall);
        viewerMic.setAttribute('aria-pressed', String(inCall));
        viewerMic.setAttribute('aria-label', inCall ? 'Mute microphone' : 'Start camera call');
        viewerMic.title = inCall ? 'Mute microphone' : 'Start camera call';
    }
}


function handleReboot() {
    if (pendingSettingSaves.has('restart')) return;
    document.getElementById('restartConfirmationDialog').hidden = false;
    updateSettingSaveOverlay();
}

function closeRestartConfirmation() {
    document.getElementById('restartConfirmationDialog').hidden = true;
    updateSettingSaveOverlay();
}

function confirmRestart() {
    const dialog = document.getElementById('restartConfirmationDialog');
    if (!dialog || dialog.hidden || pendingSettingSaves.has('restart')) return;
    closeRestartConfirmation();
    beginSettingSave('restart', 'Restarting device.\nPlease wait...');
    try {
        C4.sendCommand('REBOOT_DEVICE', '', false, true);
    } catch (error) {
        finishSettingSave('restart', false, 'Unable to send restart request');
    }
}

//snapshot
function initSnapshot() {
    const btn = document.getElementById('snapshotHomeBtn');
    if (btn) {
        btn.removeEventListener('click', handleTakeSnapshot);
        btn.addEventListener('click', handleTakeSnapshot);
    }
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

function formatFaceTimestamp(value) {
    if (value === undefined || value === null || value === '') return '';
    const text = String(value).trim();
    let date;
    if (/^\d+(?:\.\d+)?$/.test(text)) {
        const timestamp = Number(text);
        if (!Number.isFinite(timestamp) || timestamp <= 0) return '';
        date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp);
    } else date = new Date(text.replace(' ', 'T'));
    if (!Number.isFinite(date.getTime())) return '';
    const pad = component => String(component).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
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
    requestedFacePage = page;
    document.getElementById('faceLoadMore').disabled = true;
    if (page === 1 && faces.length === 0) document.getElementById('faceList').textContent = 'Loading faces...';
    try {
        C4.sendCommand('GET_STRANGER_FACES', JSON.stringify({ page, page_size: 50 }), false, true);
    } catch (error) {
        document.getElementById('faceList').textContent = 'Unable to load faces';
        document.getElementById('faceLoadMore').disabled = false;
    }
}

function updateFacesFromDriver(notes, page = 1, total = notes.length) {
    const received = notes.map(note => ({
        id: note.id !== undefined && note.id !== null && note.id !== '' && Number.isSafeInteger(Number(note.id)) && Number(note.id) > 0 ? Number(note.id) : null,
        face_id: note.face_id, name: note.note || '', imageUrl: note.face_img_url || '', updated_at: note.updated_at
    }));
    if (page === 1) faces = received;
    else received.forEach(face => {
        const index = faces.findIndex(current => current.face_id === face.face_id);
        if (index < 0) faces.push(face); else faces[index] = face;
    });
    facePage = page;
    faceTotal = Number(total) || faces.length;
    [...selectedFaceIds].forEach(id => { if (!faces.some(face => face.id === id)) selectedFaceIds.delete(id); });
    document.getElementById('faceLoadMore').disabled = false;
    renderFaces();
}

function toggleFaceEditMode() {
    if (pendingSettingSaves.size > 0) return;
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
    updateSettingSaveOverlay();
    document.getElementById('faceNamingInput').focus();
}

function closeFaceNaming() {
    if (pendingSettingSaves.has('faces')) return;
    document.getElementById('faceNamingSheet').hidden = true;
    namingFaceId = null;
    updateSettingSaveOverlay();
}

function confirmFaceNaming() {
    if (!namingFaceId || pendingSettingSaves.has('faces')) return;
    pendingFaceRename = { face_id: namingFaceId, note: document.getElementById('faceNamingInput').value.trim() };
    beginSettingSave('faces');
    try { C4.sendCommand('UPDATE_STRANGER_NOTE', JSON.stringify(pendingFaceRename), false, true); }
    catch (error) { finishSettingSave('faces', false, 'Unable to save face name'); pendingFaceRename = null; }
}

function openFaceDeleteConfirmation() {
    if (!selectedFaceIds.size || pendingSettingSaves.size > 0) return;
    document.getElementById('faceDeleteConfirmation').hidden = false;
    updateSettingSaveOverlay();
}

function closeFaceDeleteConfirmation() {
    document.getElementById('faceDeleteConfirmation').hidden = true;
    updateSettingSaveOverlay();
}

function confirmFaceDeletion() {
    if (document.getElementById('faceDeleteConfirmation').hidden || !selectedFaceIds.size || pendingSettingSaves.has('faceDelete')) return;
    pendingFaceDelete = [...selectedFaceIds];
    beginSettingSave('faceDelete');
    try {
        C4.sendCommand('DELETE_STRANGER_FACES', JSON.stringify({ ids_json: JSON.stringify(pendingFaceDelete) }), false, true);
        closeFaceDeleteConfirmation();
    } catch (error) { finishSettingSave('faceDelete', false, 'Unable to delete faces'); pendingFaceDelete = null; }
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

        if (obj.type === 'notification_history') {
            notificationHistoryPending = false;
            const loadMore = document.getElementById('notificationHistoryLoadMore');
            if (!obj.success) {
                document.getElementById('notificationHistoryList').textContent = obj.error || 'Unable to load notifications';
                loadMore.hidden = true;
                loadMore.disabled = false;
                return;
            }
            notificationHistoryPage = Number(obj.page) || 1;
            notificationHistoryHasMore = obj.has_more === true;
            renderK26Notifications(obj.notifications || [], notificationHistoryPage > 1);
            return;
        }

        if (obj.type === 'restart_result') {
            finishSettingSave('restart', obj.success === true, obj.error || 'Restart request failed', '');
            return;
        }

        if (obj.type === 'camera_settings' && viewerSpeakerLoadPending && obj.scope === 'audio') {
            clearTimeout(viewerSpeakerLoadTimer);
            viewerSpeakerLoadPending = false;
            if (obj.success && obj.settings && obj.settings.beep_vol !== undefined) {
                updateCameraSettingsUI(obj.settings);
                toggleK26ViewerSpeaker();
            } else {
                updateViewerSpeaker(latestCameraSettings.beep_vol);
                showSettingToast('Unable to load speaker volume');
            }
            return;
        }

        if (obj.type === 'device_info' && !obj.success) {
            if (currentSettingsResponse(obj) && ['home', 'information'].includes(settingsLoadScope)) {
                finishCameraSettingsLoad(false, obj.error || 'Unable to load device information');
            }
            return;
        }

        // Device Info
        if (obj.type === "device_info" && obj.success) {
            if (!currentSettingsResponse(obj)) return;
            const devEl = document.getElementById('deviceVersion');
            const fwEl = document.getElementById('firmwareVersion');
            const homeName = document.getElementById('homeDeviceName');
            const viewerName = document.getElementById('viewerDeviceName');

            if (devEl) {
                devEl.innerText = obj.device_name || '...';
            }
            if (homeName) homeName.innerText = obj.device_name || '...';
            if (viewerName) viewerName.innerText = obj.device_name || '...';

            if (fwEl) {
                fwEl.innerText = obj.version || '...';
            }

            document.getElementById('footerDeviceVersion').textContent = `Device: ${obj.device_name || '...'}`;
            document.getElementById('footerFirmwareVersion').textContent = `Firmware: ${obj.version || '...'}`;
            document.getElementById('footerReleaseDate').textContent = `Release: ${obj.release_date || '...'}`;

            const firmwareAvailability = document.getElementById('firmwareAvailability');
            if (firmwareAvailability) firmwareAvailability.textContent = obj.can_update === true ? 'Update available' :
                obj.can_update === false ? 'The current version is the latest.' : '...';
            const userIdentifier = obj.user_identifier;
            document.getElementById('c4UserIdentifier').textContent = userIdentifier || '...';
            document.getElementById('copyUserIdentifier').disabled = !userIdentifier;
            const batteryLevel = document.getElementById('powerBatteryLevel');
            if (batteryLevel) {
                batteryLevel.textContent = obj.battery !== undefined && obj.battery !== null && Number.isFinite(Number(obj.battery))
                    ? `${Number(obj.battery)}%` : '...';
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

        if (obj.type === 'device_info' && obj.success && ['home', 'information'].includes(settingsLoadScope)) {
            const fields = { deviceSerial: obj.serial, deviceTimezone: obj.timezone, deviceIp: obj.ip,
                deviceMac: obj.mac, deviceWifi: obj.wifi, deviceSignal: obj.rssi };
            Object.entries(fields).forEach(([id, value]) => {
                document.getElementById(id).textContent = value !== undefined && value !== null && value !== '' &&
                    (typeof value === 'string' || typeof value === 'number') ? String(value) : '...';
            });
            document.getElementById('copyDeviceSerial').disabled = !obj.serial;
            if (settingsLoadScope === 'home') {
                homeInfoReady = !!obj.device_name;
                if (!homeInfoReady) finishCameraSettingsLoad(false, 'Device name unavailable');
                else if (cameraSettingsReady()) finishCameraSettingsLoad(true);
            } else finishCameraSettingsLoad(!!obj.device_name, 'Device name unavailable');
        }

        if (obj.type === 'camera_settings') {
            if (!obj.setting_saved && !currentSettingsResponse(obj)) return;
            if (obj.success && obj.settings) {
                updateCameraSettingsUI(obj.settings);
                if (obj.setting_saved && viewerSpeakerWritePending) {
                    viewerSpeakerWritePending = false;
                    updateViewerSpeaker(latestCameraSettings.beep_vol);
                    finishSettingSave('speakerVolume', true, undefined,
                        Number(latestCameraSettings.beep_vol) === 0 ? 'Sound off' : 'Sound on');
                } else if (obj.setting_saved) finishSettingSave('camera', true);
                else if (cameraSettingsReady()) finishCameraSettingsLoad(true);
                else if (obj.complete && (settingsLoadScope !== 'home' || document.getElementById('statusLight').disabled)) {
                    finishCameraSettingsLoad(false, 'Required settings were not returned by the camera');
                }
            } else if (!obj.success) {
                finishCameraSettingsLoad(false, 'Unable to load camera settings');
            }
            return;
        }

        if (obj.type === 'camera_setting_result' && !obj.success) {
            updateCameraSettingsUI({});
            if (viewerSpeakerWritePending) {
                viewerSpeakerWritePending = false;
                updateViewerSpeaker(latestCameraSettings.beep_vol);
                finishSettingSave('speakerVolume', false, obj.error || 'Speaker update failed');
            } else finishSettingSave('camera', false, obj.error || 'Camera setting update failed');
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
                const viewerName = document.getElementById('viewerDeviceName');
                if (viewerName) viewerName.innerText = updatedName;
                document.getElementById('deviceVersion').innerText = updatedName;
                document.getElementById('footerDeviceVersion').textContent = `Device: ${updatedName}`;
            }
            pendingDeviceName = '';
            closeDeviceNameSheet();
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
                updateFacesFromDriver(obj.data.notes, Number(obj.data.page) || requestedFacePage, obj.data.total);
            } else {
                document.getElementById('faceList').textContent = obj.error || 'Unable to load faces';
                document.getElementById('faceLoadMore').disabled = false;
            }
            return;
        }

        // =========================
        // STRANGER NOTE UPDATED
        // =========================
        if (obj.type === "stranger_note_updated") {
            if (!pendingFaceRename) return;
            finishSettingSave('faces', obj.success, obj.error || 'Failed to update face name');
            if (obj.success) {
                const face = faces.find(item => item.face_id === pendingFaceRename.face_id);
                if (face) face.name = typeof obj.note === 'string' ? obj.note : pendingFaceRename.note;
                closeFaceNaming();
                renderFaces();
                loadFaces();
            } else {
                document.getElementById('faceNamingError').textContent = obj.error || 'Failed to update face name';
            }
            pendingFaceRename = null;
            return;
        }

        if (obj.type === 'stranger_faces_deleted') {
            if (!pendingFaceDelete) return;
            finishSettingSave('faceDelete', obj.success, obj.error || 'Unable to delete faces');
            if (obj.success) {
                faces = faces.filter(face => !pendingFaceDelete.includes(face.id));
                faceTotal = Math.max(faces.length, faceTotal - pendingFaceDelete.length);
                selectedFaceIds.clear();
                faceEditMode = false;
                renderFaces();
                loadFaces();
            }
            pendingFaceDelete = null;
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