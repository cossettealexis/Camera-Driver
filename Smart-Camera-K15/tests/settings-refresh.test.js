const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
const javascript = fs.readFileSync(path.join(root, 'www/contents/javascript/index.js'), 'utf8');

function eventTarget() {
    const listeners = {};
    return {
        addEventListener(name, callback) {
            (listeners[name] ||= new Set()).add(callback);
        },
        removeEventListener(name, callback) {
            listeners[name]?.delete(callback);
        },
        dispatch(name, event = {}) {
            if (name === 'change' && this.disabled) return;
            for (const callback of listeners[name] || []) callback.call(this, { target: this, ...event });
        }
    };
}

function openSettings() {
    const elements = {};
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const classes = new Set((match[0].match(/class="([^"]+)"/)?.[1] || '').split(' '));
        elements[match[1]] = {
            ...eventTarget(),
            checked: /\bchecked\b/.test(match[0]),
            disabled: /\bdisabled\b/.test(match[0]),
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) }
        };
    }
    const document = {
        ...eventTarget(),
        visibilityState: 'visible',
        getElementById: id => elements[id] || null,
        querySelectorAll: selector => selector === '.panel'
            ? Object.values(elements).filter(element => element.classList.contains('panel'))
            : selector.split(',').map(id => elements[id.trim().slice(1)]).filter(Boolean)
    };
    const commands = [];
    const timers = [];
    const context = vm.createContext({
        document, window: { ...eventTarget(), confirm: () => true }, console,
        C4: { sendCommand: (...args) => commands.push(args), subscribeToDataToUi() {}, subscribeToVariable() {} },
        lucide: { createIcons() {} }, setTimeout(callback) { timers.push(callback); }
    });
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
    vm.runInContext(javascript, context);
    for (const name of ['initDeviceInfo', 'initReboot', 'initSnapshot', 'loadFaces']) {
        context[name] = () => {};
    }
    document.dispatch('DOMContentLoaded');
    commands.splice(0, commands.length, ...commands.filter(command => command[0] !== 'GET_DEVICE_INFO'));
    return { context, document, elements, commands, timers };
}

test('layout reserves footer space and allows long settings panels to scroll', () => {
    const styles = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    const rule = selector => [...styles.matchAll(new RegExp(selector + '\\s*\\{([^}]+)\\}', 'g'))].at(-1)[1];
    assert.match(rule('body'), /display:\s*flex/);
    assert.match(rule('\\.app'), /min-height:\s*0/);
    assert.match(rule('\\.content'), /min-height:\s*0/);
    assert.match(rule('\\.content'), /overflow-y:\s*auto/);
    assert.match(rule('\\.list'), /overflow-y:\s*auto/);
    assert.match(rule('\\.footer'), /flex-shrink:\s*0/);
    assert.match(rule('\\.footer'), /padding-bottom:\s*calc\(12px \+ max\(64px, env\(safe-area-inset-bottom, 0px\)\)\)/);
    assert.doesNotMatch(rule('\\.footer'), /margin-top:\s*-/);
    assert.doesNotMatch(html.match(/<footer[\s\S]*?<\/footer>/)[0], /<br\s*\/?\s*>/);
});

test('opening and reopening settings fetches API values and restores toggles without writes', () => {
    const { context, document, elements, commands } = openSettings();
    assert.equal(commands[0][0], 'GET_CAMERA_SETTINGS');
    assert.equal(elements.smartTrackingToggle.disabled, false);
    context.onDataToUi(JSON.stringify({
        type: 'camera_settings', success: true, mic_muted: false,
        settings: { motion_switch: '1', siren_swt: '0', light_swt: '0', humanoid_track: '1', record_mode: '0', icut_mode: '0', anti_flicker: 2, stored_status: 0 }
    }));
    assert.equal(elements.smartTrackingToggle.checked, true);
    assert.equal(elements.alarmToggle.checked, false);
    assert.equal(elements.mic.checked, true);
    assert.equal(elements.mic.disabled, false);
    assert.equal(elements.antiFlicker.value, '2');
    assert.equal(commands.length, 1);
    context.show('homePanel');
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SETTINGS');
    assert.equal(elements.smartTrackingToggle.disabled, false);
    document.dispatch('visibilitychange');
    context.window.dispatch('pageshow', { persisted: true });
    assert.equal(commands.length, 4);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { humanoid_track: 1 } }));
    assert.equal(elements.smartTrackingToggle.checked, true);
    assert.equal(elements.smartTrackingToggle.disabled, false);
});

test('a fresh settings screen restores enabled Alarm from the proxy response wrapper', () => {
    const first = openSettings();
    first.elements.alarmToggle.checked = true;
    first.elements.alarmToggle.dispatch('change');
    assert.deepEqual(first.commands.slice(-2).map(command => JSON.parse(command[1])), [{ key: 'siren_swt', value: 1 }, { key: 'light_swt', value: 1 }]);
    const reopened = openSettings();
    assert.equal(reopened.elements.alarmToggle.checked, false);
    reopened.context.onDataToUi(JSON.stringify({
        icon_description: JSON.stringify({ type: 'camera_settings', success: true, settings: { siren_swt: '1', light_swt: '1' } })
    }));
    assert.equal(reopened.elements.alarmToggle.checked, true);
    assert.equal(reopened.commands.length, 1);
    reopened.context.onDataToUi(JSON.stringify({
        icon_description: JSON.stringify({ type: 'camera_settings', success: true, settings: { siren_swt: '0' } })
    }));
    assert.equal(reopened.elements.alarmToggle.checked, false);
});

test('alarm sends both switches while each other change sends one command', () => {
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, mic_muted: false, settings: { siren_swt: 1, icut_mode: 2 } }));
    commands.length = 0;
    elements.alarmToggle.checked = false;
    elements.alarmToggle.dispatch('change');
    assert.equal(commands.length, 2);
    assert.deepEqual(JSON.parse(commands[0][1]), { key: 'siren_swt', value: 0 });
    assert.deepEqual(JSON.parse(commands[1][1]), { key: 'light_swt', value: 0 });
    elements.nightVisionToggle.value = '2';
    elements.nightVisionToggle.dispatch('change');
    assert.deepEqual(JSON.parse(commands[2][1]), { key: 'icut_mode', value: 2 });
    elements.mic.checked = false;
    elements.mic.dispatch('change');
    assert.equal(commands.length, 4);
    assert.equal(commands[3][0], 'MUTE_MIC');
});

test('failed or incomplete API responses leave toggles usable and preserve valid values', () => {
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { humanoid_track: 1 } }));
    context.requestCameraSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: false }));
    assert.equal(elements.smartTrackingToggle.checked, true);
    for (const id of ['mic', 'motionDetection', 'alarmToggle', 'smartTrackingToggle', 'recordingToggle', 'nightVisionToggle', 'antiFlicker']) {
        assert.equal(elements[id].disabled, false, id);
    }
    commands.length = 0;
    elements.smartTrackingToggle.checked = false;
    elements.smartTrackingToggle.dispatch('change');
    assert.equal(commands.length, 1);
    assert.deepEqual(JSON.parse(commands[0][1]), { key: 'humanoid_track', value: 0 });
});

test('toggles remain usable when the refresh never replies or the command throws', () => {
    const { context, elements, commands } = openSettings();
    elements.mic.checked = true;
    elements.mic.dispatch('change');
    assert.equal(commands.at(-1)[0], 'UNMUTE_MIC');
    context.C4.sendCommand = () => { throw new Error('transport unavailable'); };
    context.requestCameraSettings();
    assert.equal(elements.mic.disabled, false);
    assert.equal(elements.smartTrackingToggle.disabled, false);
});

test('video settings use screenshot wording and restore modes, flip and watermark from API values', () => {
    const video = html.match(/<section id="videoSettingsPanel"[\s\S]*?<\/section>/)[0];
    for (const label of ['Recording', 'Night Vision Mode', 'Infrared Night Vision', 'Anti-Flicker', 'OFF', 'Flip Image', 'Time Watermark']) {
        assert.ok(video.includes(label), label);
    }
    assert.ok(video.includes("show('recordingPanel')"));
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true,
        settings: { record_mode: '0', icut_mode: '0', anti_flicker: '0', flip_swt: '0', mark: '1' } }));
    assert.equal(elements.videoRecordingMode.innerText, 'Event Recording');
    assert.equal(elements.nightVisionToggle.value, '0');
    assert.equal(elements.antiFlicker.value, '0');
    assert.equal(elements.flipImageToggle.checked, false);
    assert.equal(elements.timeWatermarkToggle.checked, true);
    assert.equal(commands.length, 1);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { flip_swt: 1, mark: 0 } }));
    assert.equal(elements.flipImageToggle.checked, true);
    assert.equal(elements.timeWatermarkToggle.checked, false);
});

test('video controls send one update each using existing device keys', () => {
    const { elements, commands } = openSettings();
    commands.length = 0;
    elements.flipImageToggle.checked = true;
    elements.flipImageToggle.dispatch('change');
    elements.timeWatermarkToggle.checked = false;
    elements.timeWatermarkToggle.dispatch('change');
    elements.nightVisionToggle.value = '0';
    elements.nightVisionToggle.dispatch('change');
    elements.antiFlicker.value = '0';
    elements.antiFlicker.dispatch('change');
    assert.deepEqual(commands.map(command => JSON.parse(command[1])), [
        { key: 'flip_swt', value: 1 }, { key: 'mark', value: 0 },
        { key: 'icut_mode', value: 0 }, { key: 'anti_flicker', value: 0 }
    ]);
});

test('Recording is accessible only inside Video Settings and returns there', () => {
    const home = html.match(/<section id="homePanel"[\s\S]*?<\/section>/)[0];
    const video = html.match(/<section id="videoSettingsPanel"[\s\S]*?<\/section>/)[0];
    const recording = html.match(/<section id="recordingPanel"[\s\S]*?<\/section>/)[0];
    assert.ok(!home.includes("show('recordingPanel')"));
    assert.ok(home.includes("show('videoSettingsPanel')"));
    assert.ok(video.includes("show('recordingPanel')"));
    assert.ok(recording.includes("show('videoSettingsPanel')"));
    assert.ok(!recording.includes("show('homePanel')"));
});

test('event time values load from the API and Confirm sends numeric recording settings', () => {
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_rec_time: '15', motion_interval: '0' } }));
    assert.equal(elements.recordMaxLength.value, '15');
    assert.equal(elements.recordTriggerInterval.value, '0');
    commands.length = 0;
    elements.saveEventTimeBtn.dispatch('click');
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], 'SET_CAMERA_SETTING');
    assert.deepEqual(JSON.parse(commands[0][1]), { key: 'motion', rec_time: 15, interval: 0 });
    assert.equal(elements.eventTimeStatus.innerText, 'Update requested.');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, event_time_updated: true, settings: { motion_rec_time: 15, motion_interval: 0 } }));
    assert.equal(elements.eventTimeStatus.innerText, 'Saved.');
    context.show('recordingPanel');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_rec_time: 0, motion_interval: 120 } }));
    assert.equal(elements.recordMaxLength.value, '0');
    assert.equal(elements.recordTriggerInterval.value, '120');
});

test('event time rejects missing, out-of-range, and fractional values without writes', () => {
    const { elements, commands } = openSettings();
    commands.length = 0;
    for (const [length, interval] of [['', '0'], ['15', ''], ['-1', '0'], ['61', '0'], ['15', '-1'], ['15', '121'], ['10.5', '0'], ['15', '0.5']]) {
        elements.recordMaxLength.value = length;
        elements.recordTriggerInterval.value = interval;
        elements.saveEventTimeBtn.dispatch('click');
        assert.equal(commands.length, 0);
    }
});

test('Local Storage matches labels and displays API capacity and remaining space', () => {
    const storage = html.match(/<section id="storagePanel"[\s\S]*?<\/section>/)[0];
    for (const label of ['Local Storage', 'Total:', 'Available:', 'Format Local Storage']) {
        assert.ok(storage.includes(label), label);
    }
    assert.ok(!storage.includes('3 Days'));
    const { context, elements } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true,
        settings: { stored_capacity: '29', stored_usage: '20', stored_status: 0 } }));
    assert.equal(elements.storageTotal.innerText, '29 GB');
    assert.equal(elements.storageAvailable.innerText, '23.2 GB');
    assert.equal(elements.storageStatus.innerText, 'Normal');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true,
        settings: { stored_capacity: 29, stored_usage: 0 } }));
    assert.equal(elements.storageAvailable.innerText, '29 GB');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true,
        settings: { stored_capacity: 29, stored_usage: 101 } }));
    assert.equal(elements.storageAvailable.innerText, '...');
});

test('format requires in-page confirmation and waits for the driver result', () => {
    const { context, elements, commands } = openSettings();
    commands.length = 0;
    context.window.confirm = () => { throw new Error('Native dialogs are unavailable in Control4'); };
    elements.formatStorageBtn.dispatch('click');
    assert.equal(elements.formatStorageConfirmModal.classList.contains('show'), true);
    assert.equal(commands.length, 0);
    elements.cancelStorageFormatBtn.dispatch('click');
    assert.equal(elements.formatStorageConfirmModal.classList.contains('show'), false);
    elements.confirmStorageFormatBtn.dispatch('click');
    assert.equal(commands.length, 0);
    elements.formatStorageBtn.dispatch('click');
    elements.confirmStorageFormatBtn.dispatch('click');
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], 'FORMAT_STORAGE');
    assert.deepEqual(JSON.parse(commands[0][1]), { confirmed: true });
    assert.equal(elements.formatStorageBtn.disabled, true);
    elements.confirmStorageFormatBtn.dispatch('click');
    assert.equal(commands.length, 1);
    context.onDataToUi(JSON.stringify({ type: 'storage_format', success: true }));
    assert.equal(elements.formatStorageBtn.disabled, false);
    assert.equal(elements.formatStorageBtn.innerText, 'Format Local Storage');
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SETTINGS');
    assert.notEqual(elements.storageStatus.innerText, 'Ready');
});

test('failed format restores the button and shows the error without issuing another request', () => {
    const { context, elements, commands } = openSettings();
    commands.length = 0;
    elements.formatStorageBtn.dispatch('click');
    elements.confirmStorageFormatBtn.dispatch('click');
    context.onDataToUi(JSON.stringify({ type: 'storage_format', success: false, error: 'Device offline' }));
    assert.equal(elements.formatStorageBtn.disabled, false);
    assert.equal(elements.settingSaveMessage.innerText, 'Device offline');
    assert.equal(commands.length, 1);
});

test('motion-dependent settings follow the main toggle and API state without changing saved options', () => {
    const { context, elements, commands } = openSettings();
    assert.equal(elements.motionDependentSettings.hidden, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true,
        settings: { motion_switch: 1, motion_sen: 2, humanoid_track: 1 } }));
    assert.equal(elements.motionDependentSettings.hidden, false);
    assert.equal(elements.detectionSensitivity.value, '2');
    commands.length = 0;
    elements.motionDetection.checked = false;
    elements.motionDetection.dispatch('change');
    assert.equal(elements.motionDependentSettings.hidden, true);
    assert.deepEqual(commands.map(command => JSON.parse(command[1])), [{ key: 'motion.switch', value: 0 }]);
    assert.equal(elements.smartTrackingToggle.checked, true);
    elements.motionDetection.checked = true;
    elements.motionDetection.dispatch('change');
    assert.equal(elements.motionDependentSettings.hidden, false);
    assert.equal(elements.detectionSensitivity.value, '2');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 0 } }));
    assert.equal(elements.motionDependentSettings.hidden, true);
    assert.equal(commands.length, 2);
});

test('Return Position shows only when Motion Detection and Smart Tracking are enabled', () => {
    const { context, elements, commands } = openSettings();
    assert.equal(elements.returnPositionSettings.hidden, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 1, humanoid_track: 0 } }));
    assert.equal(elements.returnPositionSettings.hidden, true);
    commands.length = 0;
    elements.smartTrackingToggle.checked = true;
    elements.smartTrackingToggle.dispatch('change');
    assert.equal(elements.returnPositionSettings.hidden, false);
    assert.deepEqual(JSON.parse(commands[0][1]), { key: 'humanoid_track', value: 1 });
    elements.smartTrackingToggle.checked = false;
    elements.smartTrackingToggle.dispatch('change');
    assert.equal(elements.returnPositionSettings.hidden, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { humanoid_track: 1 } }));
    assert.equal(elements.returnPositionSettings.hidden, false);
    assert.equal(elements.returnPosition.disabled, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 0 } }));
    assert.equal(elements.returnPositionSettings.hidden, true);
    assert.equal(commands.length, 2);
});

test('Motion Detection uses confirmed selectors, colon-separated zone and unavailable Return Position', () => {
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: {
        motion_switch: 1, motion_type: 1, motion_sen: 0, motion_x_y_w_h: '10:20:300:200',
        siren_swt: 1, light_swt: 0, humanoid_track: 1
    } }));
    assert.equal(elements.motionDetection.checked, true);
    assert.equal(elements.detectionType.value, '1');
    assert.equal(elements.detectionSensitivity.value, '0');
    assert.equal(elements.detectionZoneX.value, '10');
    assert.equal(elements.detectionZoneHeight.value, '200');
    assert.equal(elements.alarmToggle.checked, false);
    assert.equal(elements.alarmToggle.indeterminate, true);
    assert.equal(elements.returnPosition.disabled, true);
    commands.length = 0;
    elements.motionDetection.checked = false;
    elements.motionDetection.dispatch('change');
    elements.detectionType.value = '0';
    elements.detectionType.dispatch('change');
    elements.detectionSensitivity.value = '2';
    elements.detectionSensitivity.dispatch('change');
    elements.smartTrackingToggle.checked = true;
    elements.smartTrackingToggle.dispatch('change');
    elements.saveDetectionZoneBtn.dispatch('click');
    assert.deepEqual(commands.map(command => JSON.parse(command[1])), [
        { key: 'motion.switch', value: 0 }, { key: 'motion.type', value: 0 },
        { key: 'motion.sen', value: 2 }, { key: 'humanoid_track', value: 1 },
        { key: 'motion.x_y_w_h', value: '10:20:300:200' }
    ]);
    elements.fullDetectionZoneBtn.dispatch('click');
    elements.saveDetectionZoneBtn.dispatch('click');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.x_y_w_h', value: '0:0:0:0' });
    const count = commands.length;
    elements.detectionZoneX.value = '-1';
    elements.saveDetectionZoneBtn.dispatch('click');
    assert.equal(commands.length, count);
});

test('recording and night modes use Aiden enums and event length accepts 0 and 60', () => {
    const { context, elements, commands } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { record_mode: 1, icut_mode: 3 } }));
    assert.equal(elements.recordingToggle.value, '1');
    assert.equal(elements.videoRecordingMode.innerText, 'Continuous Recording');
    assert.equal(elements.nightVisionToggle.value, '3');
    commands.length = 0;
    elements.recordingToggle.value = '0';
    elements.recordingToggle.dispatch('change');
    elements.nightVisionToggle.value = '3';
    elements.nightVisionToggle.dispatch('change');
    assert.deepEqual(commands.map(command => JSON.parse(command[1])), [{ key: 'record_mode', value: 0 }, { key: 'icut_mode', value: 3 }]);
    for (const length of ['0', '60']) {
        elements.recordMaxLength.value = length;
        elements.recordTriggerInterval.value = '120';
        elements.saveEventTimeBtn.dispatch('click');
        assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion', rec_time: Number(length), interval: 120 });
    }
    const nightOptions = html.match(/<select id="nightVisionToggle"[\s\S]*?<\/select>/)[0];
    for (const [value, label] of [['0', 'Infrared Night Vision'], ['2', 'Color Night Vision'], ['3', 'Smart Night Vision']]) {
        assert.ok(nightOptions.includes(`<option value="${value}">${label}</option>`));
    }
});

test('native webview lifecycle requests live values and missing mic state is not shown as disabled', () => {
    const { context, elements, commands } = openSettings();
    assert.equal(elements.mic.indeterminate, true);
    assert.equal(elements.micStatus.innerText, 'Refreshing...');
    commands.length = 0;
    context.window.dispatch('pageshow', { persisted: false });
    context.window.dispatch('focus');
    context.onVariable({ name: 'LAST_MENU_SELECTED', value: 'security' });
    assert.equal(commands.length, 3);
    assert.ok(commands.every(command => command[0] === 'GET_CAMERA_SETTINGS'));
    context.onDataToUi(JSON.stringify({ icon_description: JSON.stringify({ type: 'camera_settings', success: true, mic_read_success: true, mic_muted: false, settings: {} }) }));
    assert.equal(elements.mic.checked, true);
    assert.equal(elements.mic.indeterminate, false);
    assert.equal(elements.micStatus.innerText, 'Call started');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, mic_read_success: false, settings: {} }));
    assert.equal(elements.mic.checked, true);
    assert.equal(elements.micStatus.innerText, 'Call started');
    const reopened = openSettings();
    reopened.context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, mic_read_success: true, mic_muted: false, settings: {} }));
    assert.equal(reopened.elements.mic.checked, true);
});

test('microphone displays call started and call ended on driver-confirmed updates', () => {
    const { context, elements } = openSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, mic_read_success: false, settings: {} }));
    assert.equal(elements.micStatus.innerText, '');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: false }));
    assert.equal(elements.mic.checked, true);
    assert.equal(elements.micStatus.innerText, 'Call started');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: true }));
    assert.equal(elements.mic.checked, false);
    assert.equal(elements.micStatus.innerText, 'Call ended');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, mic_read_success: false, settings: {} }));
    assert.equal(elements.micStatus.innerText, 'Call ended');
});

test('opening Device Name requests existing info and populates without overwriting edits', () => {
    const { context, elements, commands } = openSettings();
    context.show('deviceNamePanel');
    assert.equal(commands.at(-1)[0], 'GET_DEVICE_INFO');
    context.onDataToUi(JSON.stringify({ icon_description: JSON.stringify({ type: 'device_info', success: true, device_name: 'driveway pt poe' }) }));
    assert.equal(elements.deviceNameInput.value, 'driveway pt poe');
    elements.deviceNameInput.value = 'New camera name';
    elements.deviceNameInput.dispatch('input');
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'driveway pt poe' }));
    assert.equal(elements.deviceNameInput.value, 'New camera name');
    context.show('homePanel');
    context.show('deviceNamePanel');
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'Updated in app' }));
    assert.equal(elements.deviceNameInput.value, 'Updated in app');
    context.onDataToUi(JSON.stringify({ device_name_updated: true }));
    assert.equal(commands.at(-1)[0], 'GET_DEVICE_INFO');
    assert.equal(elements.deviceNameInput.value, 'Updated in app');
});

test('save dialog waits for write acknowledgement, ignores reads, and waits for both alarm switches', () => {
    const { context, elements } = openSettings();
    elements.alarmToggle.checked = true;
    elements.alarmToggle.dispatch('change');
    assert.equal(elements.settingSaveModal.classList.contains('show'), true);
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    assert.equal(elements.settingSaveCloseBtn.hidden, true);
    context.closeSettingSaveDialog();
    assert.equal(elements.settingSaveModal.classList.contains('show'), true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { siren_swt: 1, light_swt: 1 } }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { siren_swt: 1 } }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { light_swt: 1 } }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting saved');
    assert.equal(elements.settingSaveSpinner.hidden, true);
    assert.equal(elements.settingSaveCloseBtn.hidden, false);
    context.closeSettingSaveDialog();
    assert.equal(elements.settingSaveModal.classList.contains('show'), false);
});

test('a failed save cannot become Setting saved when the other alarm request completes', () => {
    const { context, elements } = openSettings();
    elements.alarmToggle.checked = true;
    elements.alarmToggle.dispatch('change');
    context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Device rejected alarm' }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { light_swt: 1 } }));
    assert.equal(elements.settingSaveMessage.innerText, 'Device rejected alarm');
    assert.equal(elements.settingSaveCloseBtn.hidden, false);
});

test('name, microphone, storage, and face changes all show acknowledgement-based save feedback', () => {
    const { context, elements } = openSettings();
    elements.deviceNameInput.value = 'Renamed camera';
    elements.updateNameBtn.dispatch('click');
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ device_name_updated: true }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting saved');
    elements.mic.checked = true;
    elements.mic.dispatch('change');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: false }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'mic_setting_result', success: true }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting saved');
    elements.formatStorageBtn.dispatch('click');
    elements.confirmStorageFormatBtn.dispatch('click');
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'storage_format', success: true }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting saved');
    vm.runInContext("faces = [{face_id:'one',name:'One'},{face_id:'two',name:'Two'}]; facesDirty = true;", context);
    elements.saveFacesBtn.disabled = false;
    elements.saveFacesBtn.dispatch('click');
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting up...');
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true }));
    assert.equal(elements.settingSaveMessage.innerText, 'Setting saved');
});

test('Lua settings use production schema, confirmed nested payloads and storage action', () => {
    const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');
    const getterStart = driver.lastIndexOf('function GET_DEVICE_PROPERTY(');
    const getter = driver.slice(getterStart, driver.indexOf('function UPDATE_DEVICE_PROPERTY(', getterStart));
    const settingsStart = driver.indexOf('function GET_CAMERA_SETTINGS()');
    const settings = driver.slice(settingsStart, driver.indexOf('function InitializeCamera()', settingsStart));
    const stateStart = driver.indexOf('local camera_settings = {');
    const state = driver.slice(stateStart, driver.indexOf('\n}', stateStart) + 2);
    const writerStart = driver.indexOf('function UPDATE_DEVICE_PROPERTY(');
    const writer = driver.slice(writerStart, driver.indexOf('\nend', writerStart) + 4);
    const senderStart = driver.indexOf('function SendDeviceInfoToUI(data)');
    const sender = driver.slice(senderStart, driver.indexOf('\nend', senderStart) + 4);
    const normalizeStart = driver.indexOf('local function normalize_bool(');
    const normalize = driver.slice(normalizeStart, driver.indexOf('\nend', normalizeStart) + 4);
    const muteStart = driver.indexOf('    if strCommand == "MUTE_MIC" then');
    const micCommands = driver.slice(muteStart, driver.indexOf('    if strCommand == "SPEAKER_VOLUME_UP" then', muteStart));
    const proxyStart = driver.indexOf('function ReceivedFromProxy(');
    const proxy = driver.slice(proxyStart, driver.indexOf('\nend', proxyStart) + 4);
    const micStart = driver.indexOf('function SET_MIC_STATE(');
    const micFunctions = driver.slice(micStart, driver.indexOf('function GET_DEVICE_STATUS()', micStart));
    const nameStart = driver.indexOf('function SET_DEVICE_NAME(');
    const nameFunction = driver.slice(nameStart, driver.indexOf('\nend', nameStart) + 4);
    const source = `
        ${state}
        local conditional_state = {}
        local response, status_code, pushed, requested
        local proxy_updates = 0
        local actual_json = require("CldBusApi.dkjson")
        local json = { encode = actual_json.encode, decode = function(value)
            if value == "response" then return response end
            if value == "encoded-status" then return {{status_key="humanoid_track",status_val="1"}} end
            if value == "encoded-motion" then return {switch=1,type=0,sen=2,x_y_w_h="0:0:0:0",rec_time=15,interval=60} end
            return actual_json.decode(value)
        end }
        local _props = { ["Auth Token"] = "token", VID = "target" }
        local Properties = {}
        local GlobalObject = { LnduBaseAppId = "app", CldBusAppId = "app", LnduBaseUrl = "https://example.invalid" }
        local function GetCldBusCredentials() return "app", "secret" end
        ${normalize}
        local C4 = {
            UpdateProperty = function() end,
            SetTimer = function() end,
            SendDataToUI = function(self, payload) pushed = json.decode(payload) end,
            SendToProxy = function(self, binding, command, params)
                assert(binding == 5005)
                if command == "ICON_CHANGED" then pushed = json.decode(params.icon_description) end
                if command == "UPDATE_UI" then proxy_updates = proxy_updates + 1 end
            end
        }
        local transport = { execute = function(request, callback)
            requested = { url=request.url, method=request.method, body=request.body and json.decode(request.body) }
            if requested.body and requested.body.data then
                assert(type(requested.body.data) == "string")
                requested.data = json.decode(requested.body.data)
            end
            if requested.body and requested.body.input_params then
                assert(type(requested.body.input_params) == "string")
                requested.input_params = json.decode(requested.body.input_params)
            end
            callback(status_code or 200, "response")
        end }
        ${getter}
        ${writer}
        ${sender}
        ${settings}
        ${proxy}
        assert(normalize_bool(1, false) == true and normalize_bool(0, true) == false)
        local muted
        local function SET_MIC_STATE(value) muted = value end
        local function micCommand(strCommand)
            ${micCommands}
        end
        micCommand("MUTE_MIC")
        assert(muted == true)
        micCommand("UNMUTE_MIC")
        assert(muted == false)
        response = { code = 20000, data = {{data_id="siren_swt",value="1"},{data_id="humanoid_track",value="1"},{data_id="mic_on",value="1"},{data_id="record_mode",value="0"},{data_id="motion",value="encoded-motion"},{data_id="stored",value={status=0,capacity=29,usage=20}}} }
        GET_CAMERA_SETTINGS()
        assert(proxy_updates == 1, "Settings snapshot did not reach UI proxy 5005")
        assert(requested.url == "https://example.invalid/api/v3/openapi/device/property-latest")
        assert(requested.method == "POST" and requested.body.vid == "target" and requested.body.data_source == 0)
        local alarm_requested = false
        for _, key in ipairs(requested.body.data_ids) do
            if key == "siren_swt" then alarm_requested = true end
        end
        assert(alarm_requested and pushed.settings.siren_swt == "1")
        assert(pushed.success and pushed.settings.humanoid_track == "1" and pushed.settings.record_mode == "0")
        assert(pushed.settings.motion_switch == 1 and pushed.settings.motion_rec_time == 15 and pushed.settings.motion_interval == 60)
        assert(pushed.settings.stored_capacity == 29 and pushed.settings.stored_usage == 20)
        local ids = {}
        for _, key in ipairs(requested.body.data_ids) do ids[key] = true end
        assert(ids.motion and ids.stored and ids.humanoid_track and ids.record_mode and ids.mark)
        assert(not ids.return_position and not ids.smart_track and not ids.logo_mark)
        assert(pushed.mic_muted == false)
        local opened_requests = proxy_updates
        ReceivedFromProxy(5005, "SELECT", {Menu="security"})
        assert(proxy_updates == opened_requests + 1 and pushed.mic_muted == false)
        response = { code=20000, data={{data_id="ac_talk",value={on_off=1}}} }
        ReceivedFromProxy(5005, "SELECT", {})
        assert(pushed.mic_muted == false and pushed.mic_read_success == true)
        response = { code=20000, data={{data_id="mic_on",value="{\\"on_off\\":0}"}} }
        GET_CAMERA_SETTINGS()
        assert(pushed.mic_muted == true and pushed.mic_read_success == true)
        response = { code=20000, data={{data_id="mic_on",value="invalid"},{data_id="is_mic_on",value=1}} }
        GET_CAMERA_SETTINGS()
        assert(pushed.mic_muted == false)
        response = { code=20000, data={{data_id="mic_on",value="invalid"}} }
        GET_CAMERA_SETTINGS()
        assert(pushed.mic_muted == nil and pushed.mic_read_success == false)
        response = { result = { data = {data_id="siren_swt",value=0} } }
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.siren_swt == 0)
        response = { data = { devices = {{vid="other",status={{status_key="humanoid_track",status_val=0}}},{vid="target",status="encoded-status"}} } }
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.humanoid_track == "1" and pushed.mic_muted == nil)
        response = { data = { status = {humanoid_track=0, mic_on=0} } }
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.humanoid_track == 0 and pushed.mic_muted == true)
        response = { data = { status = {mic_on=false} } }
        GET_CAMERA_SETTINGS()
        assert(pushed.mic_muted == true)
        response = { data = { status = {{name="humanoid_track",value=false}} } }
        GET_DEVICE_PROPERTY("humanoid_track", function(value) assert(value == false) end)
        assert(requested.method == "GET" and requested.url == "https://example.invalid/api/v3/openapi/devices?vid=target")
        response = { code = 42262, message = "This function is not defined", data = {} }
        GET_CAMERA_SETTINGS()
        assert(pushed.success == false)
        status_code = 503
        local previous_updates = proxy_updates
        GET_CAMERA_SETTINGS()
        assert(pushed.success == false and pushed.settings == nil)
        assert(proxy_updates == previous_updates + 1, "Refresh error did not reach UI proxy 5005")
        status_code = 200
        response = { data = { devices = {{vid="other",status={humanoid_track=1}}} } }
        GET_CAMERA_SETTINGS()
        assert(pushed.success == false)
        response = { code=20000, message="success" }
        assert(UPDATE_CAMERA_SETTING({key="motion.switch",value=0}))
        assert(pushed.setting_saved == true)
        assert(requested.data.motion.switch == 0 and requested.data["motion.switch"] == nil)
        assert(UPDATE_CAMERA_SETTING({key="motion.rec_time",value=60}))
        assert(requested.data.motion.rec_time == 60)
        assert(UPDATE_CAMERA_SETTING({key="motion.interval",value=0}))
        assert(requested.data.motion.interval == 0)
        assert(requested.data.motion.rec_time == 60, "Interval update dropped recording length")
        assert(requested.data.motion.switch == 0, "Motion write dropped the enable switch")
        assert(UPDATE_CAMERA_SETTING({key="motion",value={rec_time=30,interval=3}}))
        assert(requested.data.motion.rec_time == 30 and requested.data.motion.interval == 3)
        assert(UPDATE_CAMERA_SETTING({key="motion",rec_time="30",interval="30"}))
        assert(requested.data.motion.rec_time == 30 and requested.data.motion.interval == 30)
        assert(requested.data.motion.switch == 0 and requested.data.motion.sen ~= nil)
        assert(UPDATE_CAMERA_SETTING({key="motion.x_y_w_h",value="1:2:30:40"}))
        assert(requested.data.motion.x_y_w_h == "1:2:30:40")
        assert(UPDATE_CAMERA_SETTING({key="humanoid_track",value=1}) and requested.data.humanoid_track == 1)
        assert(UPDATE_CAMERA_SETTING({key="record_mode",value=0}) and requested.data.record_mode == 0)
        assert(UPDATE_CAMERA_SETTING({key="mark",value=0}) and requested.data.mark == 0)
        assert(UPDATE_CAMERA_SETTING({key="icut_mode",value=3}) and requested.data.icut_mode == 3)
        local previous_request = requested
        assert(not UPDATE_CAMERA_SETTING({key="motion.rec_time",value=61}))
        assert(not UPDATE_CAMERA_SETTING({key="icut_mode",value=1}))
        assert(not UPDATE_CAMERA_SETTING({key="motion.x_y_w_h",value="1,2,3,4"}))
        assert(not UPDATE_CAMERA_SETTING({key="return_position",value="0,0"}))
        assert(not UPDATE_CAMERA_SETTING({key="stored.capacity",value=128}))
        assert(requested == previous_request)
        assert(not FORMAT_STORAGE({confirmed=false}) and requested == previous_request)
        assert(FORMAT_STORAGE({confirmed=true}))
        assert(requested.url == "https://example.invalid/api/v3/openapi/device/do-action")
        assert(requested.body.action_id == "ac_sd_reset" and requested.body.vid == "target")
        assert(type(requested.input_params.t) == "number" and requested.input_params.t < 100000000000)
        assert(pushed.type == "storage_format" and pushed.success == true)
        response = {code=42262,message="This function is not defined"}
        FORMAT_STORAGE({confirmed=true})
        assert(pushed.success == false)
        local token = _props["Auth Token"]
        _props["Auth Token"] = ""
        local format_request = requested
        assert(not FORMAT_STORAGE({confirmed=true}))
        assert(requested == format_request and pushed.type == "storage_format" and pushed.success == false)
        assert(pushed.error == "Missing device or API credentials")
        _props["Auth Token"] = token
        local previous_mark = camera_settings.mark
        UPDATE_CAMERA_SETTING({key="mark",value=1})
        assert(camera_settings.mark == previous_mark)
        assert(pushed.type == "camera_setting_result" and pushed.success == false)
        assert(pushed.error == "This function is not defined")
        ${micFunctions}
        ${nameFunction}
        response = {code=20000,message="success"}
        SET_MIC_STATE(false)
        assert(pushed.type == "mic_setting_result" and pushed.success == true)
        SET_DEVICE_NAME({name="New name"})
        assert(pushed.type == "device_name_updated" and pushed.device_name_updated == true)
        response = {code=42262,message="Rejected by API"}
        SET_MIC_STATE(true)
        assert(pushed.type == "mic_setting_result" and pushed.success == false)
        SET_DEVICE_NAME({name="Rejected name"})
        assert(pushed.type == "device_name_result" and pushed.success == false)
        local stored_motion = {switch=1,type=1,sen=2,x_y_w_h="0:432:3724:1555",rec_time=15,interval=10}
        response = {code=20000,data={{data_id="motion",value=json.encode(stored_motion)}}}
        GET_CAMERA_SETTINGS()
        local pending = {}
        transport.execute = function(request, callback)
            if request.url:match("/do%-property$") then
                local body = actual_json.decode(request.body)
                local payload = actual_json.decode(body.data)
                stored_motion = payload.motion
                table.insert(pending, {callback=callback,motion=payload.motion})
            else
                callback(200, actual_json.encode({code=20000,data={{data_id="motion",value=actual_json.encode(stored_motion)}}}))
            end
        end
        UPDATE_CAMERA_SETTING({key="motion.rec_time",value=30})
        UPDATE_CAMERA_SETTING({key="motion.interval",value=3})
        assert(#pending == 1, "Concurrent motion writes must be serialized")
        assert(pending[1].motion.rec_time == 30 and pending[1].motion.interval == 10)
        pending[1].callback(200, actual_json.encode({code=20000}))
        assert(#pending == 2 and pending[2].motion.rec_time == 30 and pending[2].motion.interval == 3)
        pending[2].callback(200, actual_json.encode({code=20000}))
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.motion_rec_time == 30 and pushed.settings.motion_interval == 3)
        assert(pushed.settings.motion_switch == 1 and pushed.settings.motion_type == 1 and pushed.settings.motion_sen == 2)
        UPDATE_CAMERA_SETTING({key="motion",value={rec_time=40,interval=5}})
        assert(#pending == 3 and pending[3].motion.rec_time == 40 and pending[3].motion.interval == 5)
        pending[3].callback(200, actual_json.encode({code=20000}))
        assert(pushed.event_time_updated == true)
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.motion_rec_time == 40 and pushed.settings.motion_interval == 5)
        print("Lua API refresh assertions passed")
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Lua API refresh assertions passed/, result.stderr);
    assert.match(result.stdout, /\[PROPERTY-LATEST\] Request URL: https:\/\/example\.invalid\/api\/v3\/openapi\/device\/property-latest/);
    assert.match(result.stdout, /\[PROPERTY-LATEST\] Request body: /);
    assert.match(result.stdout, /\[PROPERTY-LATEST\] HTTP status: 503/);
    assert.match(result.stdout, /\[PROPERTY-LATEST\] Response body: response/);
    assert.match(result.stdout, /\[PROPERTY-LATEST\] Parsed values: /);
    assert.doesNotMatch(result.stdout, /Bearer token|Bearer token:|Bearer token\b/);
});