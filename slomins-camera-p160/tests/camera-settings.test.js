const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
const javascript = fs.readFileSync(path.join(root, 'www/contents/javascript/index.js'), 'utf8');
const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');

function fixture() {
    const elements = new Map();
    const commands = [];
    const app = {};
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, {
                value: '', hidden: true, disabled: true, checked: false, listeners: {},
                style: { setProperty() {} }, classList: { toggle() {} },
                setAttribute(name, value) { this[name] = value; },
                addEventListener(name, handler) { this.listeners[name] = handler; },
                focus() {}, select() {}, replaceChildren() {},
                dispatch(name) { this.listeners[name]?.({ target: this }); }
            });
            return elements.get(id);
        },
        querySelector() { return app; },
        addEventListener() {}
    };
    const context = vm.createContext({
        document, console, setTimeout() { return 1; }, clearTimeout() {},
        C4: { sendCommand: (...args) => commands.push(args) },
        show() {}, window: { addEventListener() {} }
    });
    vm.runInContext(javascript, context);
    context.initCameraSettings();
    return { context, document, commands };
}

test('P160 opens the viewer and has the screenshot home labels in order', () => {
    const xml = fs.readFileSync(path.join(root, 'driver.xml'), 'utf8');
    const icons = xml.match(/<navigator_display_option[\s\S]*?<\/navigator_display_option>/)[0];
    assert.equal((icons.match(/icons\/device\/blank\.png/g) || []).length, 3);
    assert.doesNotMatch(icons, /settings_\d+\.png/);
    assert.match(html, /id="viewerPanel" class="panel active"/);
    assert.match(html, /onclick="show\('homePanel'\)" aria-label="Settings"/);
    assert.match(home, /onclick="handleReboot\(\)"[^>]*><span>Restart<\/span>/);
    assert.doesNotMatch(html, /id="rebootPanel"|id="rebootBtn"/);
    const toolbar = html.match(/<div class="toolbar" id="p160ViewerAlternateToolbar"[\s\S]*?<\/div>/)[0];
    assert.match(toolbar, /id="p160ViewerAlbum"[\s\S]*id="p160ViewerVideo"[\s\S]*id="p160ViewerAlarm"[\s\S]*id="p160ViewerToolbarBack"/);
    assert.doesNotMatch(toolbar, /Notifications|rotate-ccw/);
    assert.match(toolbar, /id="p160ViewerVideo"[^>]*disabled/);
    assert.match(toolbar, /id="p160ViewerAlarm"[^>]*disabled/);
    const home = html.match(/<section id="homePanel"[\s\S]*?<\/section>/)[0];
    const labels = ['Plug-In Camera', 'Motion Detection', 'Event Time Settings', 'Video Settings',
        'Audio Settings', 'Notification Settings', 'Internal Storage', 'Device Information',
        'Check Firmware Update', 'C4 Authentication Service', 'Restart', 'Delete Device'];
    let previous = -1;
    for (const label of labels) {
        const position = home.indexOf('>' + label + '<');
        assert.ok(position > previous, label);
        previous = position;
    }
    assert.doesNotMatch(home, /Power Management/);
    assert.doesNotMatch(home, /Status Light/);
    assert.doesNotMatch(html, /41 Days|We have provided 41/);
    assert.ok(html.indexOf('<footer') > html.indexOf('</head>'));
});

test('P160 video settings use API recording-mode choices and values', () => {
    const video = html.match(/<section id="videoSettingsPanel"[\s\S]*?<\/section>/)[0];
    const controls = ['Recording Mode', 'Night Vision Mode', 'Anti-Flicker', 'Flip Image', 'Time Watermark'];
    let previous = -1;
    for (const label of controls) {
        const position = video.indexOf('>' + label + '<');
        assert.ok(position > previous, label);
        previous = position;
    }
    assert.match(driver, /video = \{ "record_mode", "icut_mode", "anti_flicker", "flip_swt", "mark" \}/);
    assert.match(driver, /elseif key == "record_mode" or key == "icut_mode"/);

    const { context, document, commands } = fixture();
    context.requestCameraSettings('video');
    const request = JSON.parse(commands[0][1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, complete: true, success: true,
        settings: { record_mode: 1, choices: { record_mode: [
            { value: 0, label: 'Event Recording Mode' }, { value: 1, label: '24hr Continuous Record' }
        ], icut_mode: [{ value: 0, label: 'Automatic' }], anti_flicker: [{ value: 0, label: 'OFF' }] },
        icut_mode: 0, anti_flicker: 0, flip_swt: 0, mark: 1 } }));
    assert.equal(document.getElementById('recordingMode').disabled, false);
    assert.equal(document.getElementById('recordingModeValue').textContent, '24hr Continuous Record');
    context.openMotionOption('recordingMode');
    assert.equal(document.getElementById('motionOptionTitle').textContent, 'Recording Mode');
    assert.equal(document.getElementById('motionOptionBody').children[1].children[0].textContent, '24hr Continuous Record');
    context.motionOptionDraft.value = 0;
    context.confirmMotionOption();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'record_mode', value: 0 });
});

test('P160 startup device-info loading finishes from the correlated API response', () => {
    const { context, document, commands } = fixture();
    context.requestCameraSettings('home');
    assert.equal(commands.length, 1);
    assert.equal(commands[0][0], 'GET_DEVICE_INFO');
    assert.equal(document.getElementById('settingSaveOverlay').hidden, false);
    const request = JSON.parse(commands[0][1]);
    context.onDataToUi(JSON.stringify({ type: 'device_info', ...request, success: true,
        device_name: 'Kitchen', version: '1.2.3', can_update: false }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    assert.equal(document.getElementById('viewerDeviceName').innerText, 'Kitchen');
    assert.equal(document.getElementById('footerFirmwareVersion').textContent, 'Firmware: 1.2.3');
});

test('P160 event timing is API-loaded and both times are sent in one acknowledged save', () => {
    const { context, document, commands } = fixture();
    context.requestCameraSettings('event');
    const request = JSON.parse(commands.at(-1)[1]);
    assert.equal(document.getElementById('saveEventTimes').disabled, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, complete: true,
        success: true, settings: { motion_rec_time: 15, motion_interval: 60 } }));
    assert.equal(document.getElementById('saveEventTimes').disabled, false);
    assert.equal(document.getElementById('eventRecordingTimeValue').textContent, '15');
    assert.equal(document.getElementById('eventIntervalValue').textContent, '60');
    document.getElementById('eventRecordingTime').value = '10';
    document.getElementById('eventInterval').value = '90';
    document.getElementById('eventRecordingTime').dispatch('input');
    document.getElementById('eventInterval').dispatch('input');
    assert.equal(commands.length, 1, 'dragging sliders must not issue API writes');
    assert.equal(document.getElementById('eventRecordingTimeValue').textContent, '10');
    assert.equal(document.getElementById('eventIntervalValue').textContent, '90');
    document.getElementById('saveEventTimes').dispatch('click');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion', rec_time: 10, interval: 90 });
    assert.equal(document.getElementById('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true,
        settings: { motion_rec_time: 10, motion_interval: 90 } }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    assert.match(driver, /motion\.rec_time = change\.rec_time[\s\S]*motion\.interval = change\.interval/);
});

test('P160 motion only shows toggle and type and waits only for those API fields', () => {
    const panel = html.match(/<section id="motionDetectionPanel"[\s\S]*?<\/section>/)[0];
    assert.match(panel, /id="motionDetectionToggle"/);
    assert.match(panel, /id="motionDetectionType"/);
    assert.doesNotMatch(panel, /Detection Sensitivity|Set Detection Zone|Facial Recognition|Face Management/);
    const { context, document, commands } = fixture();
    context.requestCameraSettings('motion');
    const request = JSON.parse(commands.at(-1)[1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true,
        settings: { motion_switch: 1, motion_type: 1 }, complete: true }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    assert.equal(document.getElementById('motionDetectionToggle').checked, true);
    assert.equal(document.getElementById('motionDetectionTypeValue').textContent, 'Person Detection');
});

test('P160 timing sliders match the screenshot and reject out-of-range API values', () => {
    const panel = html.match(/<section id="eventTimePanel"[\s\S]*?<\/section>/)[0];
    assert.match(panel, /Maximum Event Recording Length/);
    assert.match(panel, /Event Trigger Interval/);
    assert.match(panel, /id="eventRecordingTime" type="range" min="10" max="15"/);
    assert.match(panel, /id="eventInterval" type="range" min="0" max="120"/);
    assert.match(panel, /class="storage-footer"[\s\S]*id="saveEventTimes"/);
    const { context, document, commands } = fixture();
    context.updateCameraSettingsUI({ motion_rec_time: 30, motion_interval: 60 });
    assert.equal(document.getElementById('saveEventTimes').disabled, true);
    document.getElementById('saveEventTimes').dispatch('click');
    assert.equal(commands.length, 0);
    assert.match(driver, /rec_time < 10 or rec_time > 15/);
});

test('P160 storage format keeps the loading state long enough for the API result', () => {
    const start = driver.indexOf('function FORMAT_STORAGE(');
    const end = driver.indexOf('function ExecuteCommand(', start);
    const format = driver.slice(start, end);
    assert.match(javascript, /kind === 'format' \? 120000 : 20000/);
    assert.match(javascript, /Format request timed out/);
    assert.match(javascript, /Formatted Successfully/);
    assert.doesNotMatch(javascript, /Format request submitted/);
    assert.doesNotMatch(javascript, /Format command accepted/);
    assert.match(format, /action_id = "ac_sd_reset"/);
    assert.doesNotMatch(format, /Format confirmation required/);
    assert.match(format, /\[FORMAT\] Response body:/);
    assert.match(format, /send_result\(success, error_message\)/);
});

test('P160 restart waits for a result and video choices use camera metadata with screenshot wording', () => {
    const { context, document, commands, app } = fixture();
    context.handleReboot();
    assert.equal(document.getElementById('restartConfirmationDialog').hidden, false);
    assert.equal(commands.length, 0);
    assert.match(html, /Are you sure you want to restart this device\?/);
    context.closeRestartConfirmation();
    assert.equal(commands.length, 0);
    context.handleReboot();
    context.confirmRestart();
    assert.equal(commands.at(-1)[0], 'REBOOT_DEVICE');
    assert.equal(document.getElementById('settingSaveOverlay').hidden, false);
    assert.equal(document.getElementById('settingSaveLabel').textContent, 'Restarting device please wait');
    assert.equal(app.inert, true);
    context.onDataToUi(JSON.stringify({ type: 'restart_result', success: true }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    assert.equal(document.getElementById('settingSaveToast').hidden, true);
    context.updateCameraSettingsUI({ record_mode: 1, icut_mode: 0, anti_flicker: 0,
        choices: {
            record_mode: [{ value: 0, label: '事件录像' }, { value: 1, label: '循环录像' }],
            icut_mode: [{ value: 0, label: 'Automatic', description: 'API automatic description' },
                { value: 1, label: 'OFF', description: 'API off description' }, { value: 2, label: 'ON', description: 'API on description' }],
            anti_flicker: [{ value: 0, label: '0：关闭功能' }, { value: 1, label: '1：50Hz' }, { value: 2, label: '2：60Hz' }]
        } });
    assert.equal(document.getElementById('recordingModeValue').textContent, '24hr Continuous Record');
    assert.equal(document.getElementById('nightVisionModeValue').textContent, 'Automatic');
    assert.equal(document.getElementById('antiFlickerValue').textContent, 'OFF');
    context.openMotionOption('recordingMode');
    assert.equal(document.getElementById('motionOptionBody').children[0].children[0].textContent, 'Event Recording Mode');
    assert.equal(document.getElementById('motionOptionBody').children[1].children[0].textContent, '24hr Continuous Record');
    context.closeMotionOption();
    context.openMotionOption('nightVisionMode');
    assert.equal(document.getElementById('motionOptionBody').children[0].children[0].textContent, 'Automatic');
    assert.equal(document.getElementById('motionOptionBody').children[0].children[1].textContent, 'API automatic description');
    assert.equal(document.getElementById('motionOptionBody').children[1].children[0].textContent, 'OFF');
    assert.equal(document.getElementById('motionOptionBody').children[2].children[0].textContent, 'ON');
    context.closeMotionOption();
    assert.match(driver, /\[P160_VIDEO_SETTINGS\]/);
    assert.equal(document.getElementById('nightVisionMode').disabled, false);
    assert.equal(document.getElementById('nightVisionModeValue').textContent, 'Automatic');
    assert.match(driver, /option\.value or option\.val/);
    assert.match(driver, /option\.title or option\.name or option\.label/);
    assert.match(driver, /option\.desc/);
    assert.match(driver, /definition\.mapping/);
    assert.match(driver, /type = "restart_result"/);
    assert.match(driver, /return ExecuteCommand\(strCommand, tParams\)/);
});

test('P160 history verifies returned VID and does not invent doorbell visitor events', () => {
    const handler = driver.slice(driver.indexOf('function GET_NOTIFICATION_HISTORY('), driver.indexOf('-- Reliable send to UI Proxy'));
    assert.match(handler, /vids = \{ vid \}/);
    assert.match(handler, /\[NOTIFICATIONS\] Request body:/);
    assert.match(handler, /\[NOTIFICATIONS\] HTTP status:/);
    assert.match(handler, /\[NOTIFICATIONS\] Transport error:/);
    assert.match(handler, /\[NOTIFICATIONS\] Response body:/);
    assert.ok(handler.indexOf('[NOTIFICATIONS] Response body:') < handler.indexOf('local api_code'));
    assert.match(handler, /item\.vid == tostring\(vid\)/);
    assert.doesNotMatch(handler, /vid = item\.vid or vid/);
    assert.match(handler, /has_more = #notifications >= page_size/);
    assert.match(handler, /desc = type\(item\.desc\) == "string" and item\.desc or ""/);
    const { context } = fixture();
    const presentation = context.describeP160Notification({ message_type: 'door bell', device_name: 'Plug-In Camera' });
    assert.equal(presentation.title, 'Camera Event');
    assert.equal(presentation.detail, 'Reported type: door bell');
    assert.equal(presentation.description, 'Plug-In Camera');
    assert.doesNotMatch(javascript, /received a visitor click on the doorbell/);
});

test('P160 uses API descriptions when message_type conflicts with the actual event', () => {
    const { context } = fixture();
    const examples = [
        { message_type: 'door_bell', desc: "CA Plug-In Camera detected someone's presence", title: 'Human Detection Event' },
        { message_type: 'door_bell', desc: 'CA Plug-In Camera detected abnormal movement', title: 'Motion Detection Event' },
        { message_type: 'move_detect', desc: 'CA Plug-In Camera has entered offline mode', title: 'Camera Offline Event' },
        { message_type: 'door_bell', desc: 'Camera supplied description', title: 'Camera Event' }
    ];
    for (const example of examples) {
        const presentation = context.describeP160Notification({ ...example, device_name: 'CA Plug-In Camera' });
        assert.equal(presentation.title, example.title);
        assert.equal(presentation.description, example.desc);
        assert.equal(presentation.detail, undefined);
    }
});