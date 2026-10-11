// ==========================
// STATE (UI ONLY CACHE)
// ==========================

let isMicMuted = false;

// =====================================================
// INIT
// =====================================================

document.addEventListener('DOMContentLoaded', function () {


    initializeControl4();
    initMicrophone();
    requestInitialState();
    initDeviceName();
    initDeviceInfo();
    initReboot();
    initNotificationSettings();
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

    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestInitialState() {
    // Ask driver for current Anti-Pry and Mic state
    try {
        C4.sendCommand('REQUEST_INITIAL_STATE', '', false, true);
    } catch (e) {
        console.log('Request initial state failed', e);
    }
}



function initDeviceName() {

    const input = document.getElementById('deviceNameInput');
    const btn = document.getElementById('updateNameBtn');
    const statusEl = document.getElementById('deviceNameStatus');

    if (!btn || !input) {
        console.error("ERROR: Device name elements not found");
        return;
    }

    btn.addEventListener('click', function () {
      
        const newName = input.value.trim();

        if (!newName) {
            if (statusEl) {
                statusEl.innerText = "Please enter a device name";
                statusEl.style.color = "#ff6b6b";
                statusEl.hidden = false;
            }
            return;
        }

        if (statusEl) {
            statusEl.innerText = "Updating...";
            statusEl.style.color = "#ffffff";
            statusEl.hidden = false;
        }

        try {

            C4.sendCommand(
                "SET_DEVICE_NAME",
                JSON.stringify({ name: newName }),
                false,
                true
            );

            const display = document.getElementById('deviceNameDisplay');
            if (display) display.textContent = newName;
            if (typeof closeDeviceNameEditor === 'function') closeDeviceNameEditor();

            // Show Modal
            showModal("Device name updated successfully!", "Success");

        } catch (e) {

            console.error("Send error", e);

            if (statusEl) {
                statusEl.innerText = "Failed to send command";
                statusEl.style.color = "#ff6b6b";
                statusEl.hidden = false;
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



// =====================================================
// MICROPHONE
// =====================================================

function initMicrophone() {

    const toggle = document.getElementById('mic');
    if (!toggle) return;

    toggle.removeEventListener('change', handleMicToggle);
    toggle.addEventListener('change', handleMicToggle);
}

function initNotificationSettings() {
    document.querySelectorAll('[data-notification-setting]').forEach(toggle => {
        toggle.addEventListener('change', function () {
            try {
                C4.sendCommand('SET_NOTIFICATION_SETTING', JSON.stringify({
                    setting: this.dataset.notificationSetting,
                    enabled: this.checked
                }), false, true);
            } catch (error) {
                console.error('Failed to update notification setting', error);
            }
        });
    });
}

function handleMicToggle(e) {
                statusEl.hidden = false;

    const muted = !e.target.checked;

    sendMicCommand(muted);
}

function sendMicCommand(muted) {

    try {

                const display = document.getElementById('deviceNameDisplay');
                if (display) display.textContent = newName;
                if (typeof closeDeviceNameEditor === 'function') closeDeviceNameEditor();
        C4.sendCommand(
            muted ? 'MUTE_MIC' : 'UNMUTE_MIC',
            '',
            false,
            true
        );

    } catch (e) {
        console.log('Mic command error', e);
    }
                    statusEl.hidden = false;
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
    console.log('Reboot requested');

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

        console.log(" REBOOT_DEVICE command sent");

        // Show success modal immediately (optimistic – device will go offline)
        showModal(
            "Reboot command sent successfully.\nThe device will restart shortly.",
            "Reboot Initiated"
        );

        // Optional: re-enable the button after a few seconds
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

// =====================================================
// CONTROL4 DATA SYNC (SOURCE OF TRUTH)
// =====================================================

function updateCameraSettingsUI(settings) {
    const numeric = value => value === undefined || value === null || value === '' ? null : Number(value);
    const isEnabled = value => value === true || Number(value) === 1;
    const renderPicker = (key, value, labels) => {
        const number = numeric(value);
        if (number === null) return;
        const label = labels[number];
        if (label && typeof renderVideoSettingValue === 'function') renderVideoSettingValue(key, label);
    };

    renderPicker('recordingMode', settings.record_mode, { 0: 'Event Recording Mode', 1: '24hr Continuous Record' });
        renderPicker('nightVisionMode', settings.icut_mode, { 0: 'Automatic', 2: 'OFF', 3: 'ON' });
    renderPicker('antiFlicker', settings.anti_flicker, { 0: 'OFF', 1: '50Hz', 2: '60Hz' });
    renderPicker('detectionType', settings.motion_type, { 0: 'Motion Detection', 1: 'Person Detection' });
    renderPicker('detectionSensitivity', settings.motion_sen, { 0: 'Low', 1: 'Medium', 2: 'High' });

    const motionToggle = document.getElementById('motionDetectionToggle');
    if (motionToggle && settings.motion_switch !== undefined) {
        motionToggle.checked = isEnabled(settings.motion_switch);
        document.querySelectorAll('.motion-setting-row[data-setting]').forEach(row => {
            row.hidden = !motionToggle.checked;
        });
    }

    [['flipImageToggle', 'flip_swt'], ['timeWatermarkToggle', 'mark']].forEach(([id, key]) => {
        const toggle = document.getElementById(id);
        if (toggle && settings[key] !== undefined) toggle.checked = isEnabled(settings[key]);
    });

    [['eventRecordingLength', 'eventRecordingLengthValue', 'motion_rec_time'],
        ['eventTriggerInterval', 'eventTriggerIntervalValue', 'motion_interval']].forEach(([sliderId, outputId, key]) => {
        const slider = document.getElementById(sliderId);
        const value = numeric(settings[key]);
        if (!slider || value === null) return;
        slider.value = String(value);
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        const output = document.getElementById(outputId);
        if (output) output.textContent = String(value);
    });

    const speaker = document.getElementById('speakerVolume');
    const volume = numeric(settings.beep_vol);
    if (speaker && volume !== null) {
        speaker.value = String(volume);
        speaker.dispatchEvent(new Event('input', { bubbles: true }));
    }

    const storageStatus = document.getElementById('storageCardStatus');
    const storageStatusLabels = { 0: 'Normal', 1: 'No SD card', 2: 'Filesystem not initialized' };
    if (storageStatus && settings.stored_status !== undefined) {
        storageStatus.textContent = storageStatusLabels[settings.stored_status] || String(settings.stored_status);
    }

    const capacity = numeric(settings.stored_capacity);
    const usage = numeric(settings.stored_usage);
    const total = document.getElementById('storageTotal');
    const available = document.getElementById('storageAvailable');
    if (total && capacity !== null && capacity > 0) total.textContent = `${capacity} GB`;
    if (available && capacity !== null && capacity > 0 && usage !== null && usage >= 0 && usage <= 100) {
        available.textContent = `${Number((capacity * (1 - usage / 100)).toFixed(2))} GB`;
    }
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

        if (obj.type === 'camera_settings' && obj.success) {
            updateCameraSettingsUI(obj.settings || {});
            if (obj.event_time_updated) {
                const status = document.getElementById('eventTimeStatus');
                if (status) status.textContent = 'Saved.';
            }
        }

        if (obj.type === 'camera_setting_result' && !obj.success) {
            const status = document.getElementById('eventTimeStatus');
            if (status && !status.hidden) status.textContent = obj.error || 'Unable to save camera setting.';
            console.error('Camera setting update failed', obj.error);
            requestCameraSettings();
        }

        if (obj.type === 'storage_format') {
            const status = document.getElementById('storageActionStatus');
            if (status) {
                status.textContent = obj.success ? 'Local storage format requested.' : (obj.error || 'Local storage format failed.');
                status.hidden = false;
            }
            if (obj.success) requestCameraSettings();
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

            const deviceNameDisplay = document.getElementById('deviceNameDisplay');
            if (deviceNameDisplay && obj.device_name) {
                deviceNameDisplay.textContent = obj.device_name;
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

            let wifiSignal = obj.rssi;
            const signalValue = Number(obj.rssi);
            if (obj.rssi !== undefined && obj.rssi !== null && obj.rssi !== '' && Number.isFinite(signalValue)) {
                if (signalValue >= 0) {
                    wifiSignal = signalValue >= 75 ? 'Very strong' : signalValue >= 50 ? 'Strong' : signalValue >= 25 ? 'Fair' : 'Weak';
                } else {
                    wifiSignal = signalValue >= -50 ? 'Very strong' : signalValue >= -60 ? 'Strong' : signalValue >= -70 ? 'Fair' : 'Weak';
                }
            }

            const infoValues = {
                infoDeviceName: obj.device_name,
                infoVersion: obj.version,
                infoSerial: obj.serial,
                infoTimezone: obj.timezone,
                infoIp: obj.ip,
                infoMac: obj.mac,
                infoWifi: obj.wifi,
                infoWifiSignal: wifiSignal
            };
            Object.entries(infoValues).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element && value) element.textContent = value;
            });

            const identifier = document.getElementById('authUserIdentifier');
            if (identifier) identifier.textContent = obj.serial || obj.mac || 'Unavailable';
        }

        if (obj.type === 'notification_settings') {
            document.querySelectorAll('[data-notification-setting]').forEach(toggle => {
                const setting = toggle.dataset.notificationSetting;
                if (typeof obj[setting] === 'boolean') toggle.checked = obj[setting];
            });
        }

        if (obj.type === 'storage_status') {
            const status = document.getElementById('storageCardStatus');
            const labels = { 0: 'Card detected', 1: 'Not detected', 2: 'Filesystem not initialized' };
            if (status) status.textContent = labels[obj.status] || 'Unknown';
        }

        // =========================
        // MICROPHONE SYNC
        // =========================
        if (obj.type === "mic_update" || obj.mic_muted !== undefined) {

            const muted = obj.mic_muted === true || obj.mic_muted === 1;

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
        console.error('[DEBUG] onDataToUi ERROR:', e);
        console.error('[DEBUG] Raw value:', value);
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