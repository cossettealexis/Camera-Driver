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
        success: true, settings: { motion_rec_time: 30, motion_interval: 60 } }));
    assert.equal(document.getElementById('saveEventTimes').disabled, false);
    document.getElementById('eventRecordingTime').value = '45';
    document.getElementById('eventInterval').value = '90';
    document.getElementById('saveEventTimes').dispatch('click');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion', rec_time: 45, interval: 90 });
    assert.equal(document.getElementById('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true,
        settings: { motion_rec_time: 45, motion_interval: 90 } }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    assert.match(driver, /motion\.rec_time = change\.rec_time[\s\S]*motion\.interval = change\.interval/);
});

test('P160 restart waits for a result and video choices come from camera metadata', () => {
    const { context, document } = fixture();
    context.handleReboot();
    assert.equal(document.getElementById('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'restart_result', success: true }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    context.updateCameraSettingsUI({ icut_mode: 3,
        choices: { icut_mode: [{ value: 3, label: 'Camera supplied mode' }] } });
    assert.equal(document.getElementById('nightVisionMode').disabled, false);
    assert.equal(document.getElementById('nightVisionModeValue').textContent, 'Camera supplied mode');
    assert.match(driver, /definition\.enumOptions/);
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
    const { context } = fixture();
    const presentation = context.describeP160Notification({ message_type: 'door bell', device_name: 'Plug-In Camera' });
    assert.equal(presentation.title, 'Camera Event');
    assert.equal(presentation.detail, 'Reported type: door bell');
    assert.equal(presentation.description, 'Plug-In Camera');
    assert.doesNotMatch(javascript, /received a visitor click on the doorbell/);
});