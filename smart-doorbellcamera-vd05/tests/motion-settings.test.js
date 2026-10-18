const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'www/contents/javascript/index.js'), 'utf8');

function fixture() {
    const elements = new Map();
    const faceRows = Array.from({ length: 3 }, () => ({ hidden: true }));
    const commands = [];
    const lifecycle = {};
    const navigation = [];
    const timers = new Map();
    let timerSequence = 0;
    const app = { inert: false };
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            checked: false, hidden: false, value: '', textContent: '',
            style: {},
            classList: { contains: name => id === 'viewerPanel' && name === 'active' },
            focus() {},
            removeAttribute(name) { delete this[name]; },
            listeners: {},
            children: [],
            setAttribute(name, value) { this[name] = value; },
            appendChild(child) { this.children.push(child); },
            replaceChildren() { this.children = []; this.textContent = ''; },
            addEventListener(name, callback) { this.listeners[name] = callback; },
            change() { this.listeners.change({ target: this }); }
        });
        return elements.get(id);
    };
    const context = vm.createContext({
        document: {
            visibilityState: 'visible',
            addEventListener(name, callback) { (lifecycle[name] ||= []).push(callback); },
            getElementById: element,
            querySelector: () => app,
            createElement: tag => ({
                tagName: tag, children: [], listeners: {},
                style: { setProperty(name, value) { this[name] = value; } },
                setAttribute(name, value) { this[name] = value; },
                appendChild(child) { this.children.push(child); },
                addEventListener(name, callback) { this.listeners[name] = callback; }
            }),
            querySelectorAll: () => faceRows
        },
        window: { addEventListener(name, callback) { (lifecycle[name] ||= []).push(callback); } },
        C4: {
            sendCommand: (...args) => commands.push(args),
            subscribeToDataToUi() {},
            subscribeToVariable() {}
        },
        show: id => navigation.push(id),
        setTimeout(callback, delay) { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        console
    });
    vm.runInContext(source, context);
    context.initMotionSettings();
    return { context, element, faceRows, commands, timers, app, navigation, lifecycle };
}

test('VD05 opens into live camera view and the gear opens the existing settings menu', () => {
    const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
    assert.match(html, /<section id="viewerPanel" class="panel active">/);
    assert.match(html, /<section id="homePanel" class="panel">/);
    assert.match(html, /<footer class="footer" hidden>/);
    assert.match(html, /onclick="show\('homePanel'\)" aria-label="Settings"/);
    assert.match(html, /onclick="show\('viewerPanel'\)" aria-label="Back to camera"/);
    assert.match(html, /<img id="livePreview"/);
    assert.match(html, /<div class="camera-frame" id="cameraFrame">[\s\S]*?<img id="livePreview"/);
    assert.match(html, /\.camera-frame\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/);
    assert.match(html, /id="viewerMic"/);
    assert.match(html, /id="viewerSpeaker"[^>]*disabled/);
    assert.match(html, /\.tool-btn\s*\{[^}]*background:\s*#070a0f/);
    assert.match(html, /\.tool-btn\.primary\s*\{[^}]*width:\s*88px[^}]*height:\s*88px/);
    assert.match(html, /id="viewerSnapshot"[^>]*>[\s\S]*?data-lucide="circle-dot"/);
    assert.match(html, /id="viewerEndCall"[^>]*>[\s\S]*?data-lucide="circle-arrow-left"/);
    assert.match(html, /if \(id === 'homePanel'\)[\s\S]*requestInitialState\(\)[\s\S]*initDeviceInfo\(\)[\s\S]*REQUEST_SETTINGS/);
    const startup = source.slice(source.indexOf("document.addEventListener('DOMContentLoaded'"), source.indexOf('function isLiveViewerActive()'));
    assert.match(startup, /startLiveSnapshotPolling\(\)/);
    assert.match(startup, /requestInitialState\(\)/);
    assert.match(startup, /initDeviceInfo\(\)/);
    assert.doesNotMatch(startup, /REQUEST_SETTINGS|GET_STRANGER_FACES/);
    const { context, commands } = fixture();
    context.initializeControl4();
    assert.equal(commands.some(command => command[0] === 'REQUEST_SETTINGS'), false);
});

test('VD05 live viewer requests snapshots sequentially and does not open the settings snapshot modal', () => {
    const { context, element, commands, timers } = fixture();
    context.initLiveView();
    context.startLiveSnapshotPolling();
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SNAPSHOT');
    const initialCommandCount = commands.length;
    context.onDataToUi(JSON.stringify({ type: 'snapshot_result', success: true, image_url: 'http://camera.local/snapshot.jpg' }));
    assert.match(element('livePreview').src, /^http:\/\/camera\.local\/snapshot\.jpg\?t=/);
    assert.equal(element('livePreview').style.display, 'block');
    assert.equal(element('snapshotModal').classList?.contains('show') || false, false);
    const pollTimer = [...timers.values()].find(timer => timer.delay === 1200);
    assert.ok(pollTimer);
    assert.equal(commands.length, initialCommandCount);
    pollTimer.callback();
    assert.equal(commands.length, initialCommandCount + 1);
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SNAPSHOT');
    context.stopLiveSnapshotPolling();
});

test('VD05 snapshot frame stays 4:3 and centers inside portrait or landscape stages', () => {
    const { context, element } = fixture();
    const stage = element('cameraStage');
    const frame = element('cameraFrame');
    stage.clientWidth = 382;
    stage.clientHeight = 529;
    context.fitLivePreviewFrame();
    assert.equal(frame.style.width, '382px');
    assert.equal(frame.style.height, '286.5px');
    stage.clientWidth = 1358;
    stage.clientHeight = 581;
    context.fitLivePreviewFrame();
    assert.equal(frame.style.width, String(581 * 4 / 3) + 'px');
    assert.equal(frame.style.height, '581px');
    assert.match(fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8'), /\.camera-stage[\s\S]*?place-items:\s*center/);
});

test('Microphone focus, visibility, and Control4 variable events never request stranger faces', () => {
    const { context, element, commands, lifecycle } = fixture();
    let activePanel = 'micPanel';
    element('facialRecPanel').classList = { contains: () => activePanel === 'facialRecPanel' };
    for (const name of ['focus', 'pageshow', 'visibilitychange']) {
        lifecycle[name].forEach(callback => callback());
    }
    context.onVariable({ name: 'LAST_MENU_SELECTED', value: 'security' });
    assert.equal(commands.length, 0);
    context.sendMicCommand(false);
    assert.equal(commands.at(-1)[0], 'UNMUTE_MIC');
    assert.equal(commands.some(args => args[0] === 'GET_STRANGER_FACES'), false);
    activePanel = 'facialRecPanel';
    context.refreshFaces();
    assert.equal(commands.at(-1)[0], 'GET_STRANGER_FACES');
    const count = commands.length;
    context.refreshFaces();
    assert.equal(commands.length, count);
});

test('initial settings stay covered until both API snapshots arrive, in either order', () => {
    for (const cameraFirst of [true, false]) {
        const { context, element, commands, app } = fixture();
        context.requestMotionSettings();
        assert.equal(element('settingSaveOverlay').hidden, false);
        assert.equal(element('settingSaveOverlay')['data-loading'], 'true');
        assert.equal(element('settingSaveLabel').textContent, 'Loading...');
        assert.equal(app.inert, true);
        assert.deepEqual(commands.map(args => args[0]), ['GET_CAMERA_SETTINGS', 'REQUEST_SETTINGS']);
        const camera = { type: 'camera_settings', success: true, settings: { motion_switch: 0 } };
        const facial = { type: 'device_settings', settings: { unknow_snapswt: 1 } };
        context.onDataToUi(JSON.stringify(cameraFirst ? camera : facial));
        assert.equal(element('settingSaveOverlay').hidden, false);
        context.onDataToUi(JSON.stringify(cameraFirst ? facial : camera));
        assert.equal(element('settingSaveOverlay').hidden, true);
        assert.equal(app.inert, false);
        assert.equal(element('settingSaveToast').hidden, true);
        assert.equal(element('motionSettingsStatus').textContent, '');
    }
});

test('settings load failures and timeouts return to the menu without exposing partial values', () => {
    const { context, element, navigation, timers } = fixture();
    context.requestMotionSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 1 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(navigation.at(-1), 'homePanel');
    assert.equal(element('settingSaveToast').textContent, 'Unable to load camera settings');
    context.requestMotionSettings();
    [...timers.values()].find(timer => timer.delay === 20000).callback();
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(navigation.at(-1), 'homePanel');
    assert.equal(element('settingSaveToast').textContent, 'Settings request timed out');
});

test('save acknowledgment leaves no persistent status text on the settings page', () => {
    const { context, element } = fixture();
    context.sendMotionSetting('motion.sen', 2);
    assert.equal(element('motionSettingsStatus').textContent, '');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { motion_sen: 2 } }));
    assert.equal(element('motionSettingsStatus').textContent, '');
    assert.equal(element('motionZoneStatus').textContent, '');
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
});

test('save overlay waits for acknowledgment, ignores refreshes, and displays a transient success toast', () => {
    const { context, element, timers, app } = fixture();
    context.sendMotionSetting('motion.sen', 2);
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(app.inert, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: {} }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: {} }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
    [...timers.values()].find(timer => timer.delay === 2500).callback();
    assert.equal(element('settingSaveToast').hidden, true);
});

test('failed, timed out, and concurrent saves cannot produce premature success', () => {
    const { context, element, timers } = fixture();
    context.sendMotionSetting('motion.sen', 2);
    context.sendMotionSetting('motion.type', 1);
    context.finishSettingSave('camera', true);
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Rejected' }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Rejected');
    context.sendMotionSetting('motion.type', 0);
    [...timers.values()].find(timer => timer.delay === 20000).callback();
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Setting update timed out');
    context.finishSettingSave('camera', true);
    assert.equal(element('settingSaveToast').textContent, 'Setting update timed out');
});

test('motion and facial recognition control their own dependent groups', () => {
    const { context, element, faceRows, commands } = fixture();
    assert.equal(element('motionOptions').hidden, true);
    assert.equal(element('motionAlarmGroup').hidden, true);
    context.hydrateMotionSettings({ motion_switch: 0 });
    element('faceRecEnable').indeterminate = false;
    element('faceRecEnable').checked = true;
    element('faceRecEnable').change();
    assert.ok(faceRows.every(row => !row.hidden));
    assert.equal(element('motionOptions').hidden, true);
    element('motionDetection').checked = true;
    element('motionDetection').change();
    assert.equal(element('motionOptions').hidden, false);
    assert.equal(element('motionAlarmGroup').hidden, false);
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.switch', value: 1 });
    context.hydrateMotionSettings({ motion_switch: 0, motion_type: 1, motion_sen: 2, motion_x_y_w_h: '1:2:30:40', siren_swt: 1, light_swt: 0 });
    assert.equal(element('motionOptions').hidden, true);
    assert.ok(faceRows.every(row => !row.hidden));
    assert.equal(element('detectionType').value, '1');
    assert.equal(element('zoneWidth').value, '30');
    assert.equal(element('motionAlarm').indeterminate, false);
    assert.equal(element('motionAlarm').checked, true);
    element('motionAlarm').checked = true;
    element('motionAlarm').change();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'alarm', value: 1 });
    element('faceRecEnable').checked = false;
    element('faceRecEnable').change();
    assert.ok(faceRows.every(row => row.hidden));
});

test('settings have no assumed values and only valid API fields enable their controls', () => {
    const { context, element } = fixture();
    for (const id of ['motionDetection', 'motionAlarm', 'faceRecEnable']) {
        assert.equal(element(id).disabled, true);
        assert.equal(element(id).indeterminate, true);
    }
    for (const id of ['detectionType', 'detectionSensitivity', 'faceSimilarity', 'faceQuality']) {
        assert.equal(element(id).value, '');
        assert.equal(element(id).disabled, true);
    }
    context.hydrateMotionSettings({ motion_switch: null, motion_type: '', motion_sen: 99, siren_swt: null, light_swt: 0 });
    assert.equal(element('motionDetection').disabled, true);
    assert.equal(element('detectionType').disabled, true);
    assert.equal(element('detectionSensitivity').disabled, true);
    assert.equal(element('motionAlarm').disabled, true);
    context.hydrateMotionSettings({ motion_switch: '1', motion_type: 1, motion_sen: 0, siren_swt: 0, light_swt: 0 });
    assert.equal(element('motionDetection').disabled, false);
    assert.equal(element('motionDetection').checked, true);
    assert.equal(element('detectionType').value, '1');
    assert.equal(element('detectionSensitivity').value, '0');
    assert.equal(element('motionAlarm').disabled, false);
    assert.equal(element('motionAlarm').checked, false);
    assert.equal(element('faceRecEnable').disabled, true);
    context.requestMotionSettings();
    assert.equal(element('motionDetection').disabled, true);
    assert.equal(element('detectionType').value, '');
});

test('face naming uses face_id, deletion uses note IDs, and list timestamps are API supplied', () => {
    const { context, element, commands } = fixture();
    context.updateFacesFromDriver([
        { id: 17, face_id: 'face-a', note: '<b>Name</b>', updated_at: '2026-10-15 18:37:31' },
        { face_id: 'face-b', note: '' }
    ], 1, 3);
    assert.equal(element('faceLoadMore').hidden, false);
    assert.equal(element('faceList').children[0].children[1].children[0].textContent, '<b>Name</b>');
    context.openFaceNaming('face-a');
    element('faceNamingInput').value = 'Updated';
    context.confirmFaceNaming();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { face_id: 'face-a', note: 'Updated' });
    assert.equal(element('faceList').children[0].children[1].children[0].textContent, '<b>Name</b>');
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true, face_id: 'face-a', note: 'Updated' }));
    assert.equal(element('faceNamingSheet').hidden, true);
    assert.equal(element('faceList').children[0].children[1].children[0].textContent, 'Updated');
    context.updateFacesFromDriver([{ id: 18, face_id: 'face-c', note: 'Second page' }], 2, 3);
    context.toggleFaceEditMode();
    context.selectAllFaces(true);
    assert.equal(element('faceSelectedCount').textContent, '2');
    context.openFaceDeleteConfirmation();
    assert.equal(element('faceDeleteConfirmation').hidden, false);
    context.closeFaceDeleteConfirmation();
    assert.notEqual(commands.at(-1)[0], 'DELETE_STRANGER_FACES');
    context.openFaceDeleteConfirmation();
    context.confirmFaceDeletion();
    assert.equal(commands.at(-1)[0], 'DELETE_STRANGER_FACES');
    const deletion = JSON.parse(commands.at(-1)[1]);
    assert.equal(typeof deletion.ids_json, 'string');
    assert.deepEqual(JSON.parse(deletion.ids_json), [17, 18]);
});

test('face timestamps display readable local seconds, milliseconds, and API date strings', () => {
    const { context, element } = fixture();
    const date = new Date(2026, 9, 15, 18, 37, 31);
    const expected = '2026-10-15 18:37:31';
    assert.equal(context.formatFaceTimestamp(date.getTime()), expected);
    assert.equal(context.formatFaceTimestamp(String(date.getTime())), expected);
    assert.equal(context.formatFaceTimestamp(Math.floor(date.getTime() / 1000)), expected);
    assert.equal(context.formatFaceTimestamp(expected), expected);
    for (const value of [null, undefined, '', 'not-a-date', 0]) {
        assert.equal(context.formatFaceTimestamp(value), '');
    }
    context.updateFacesFromDriver([{ id: 17, face_id: 'face-a', note: '', updated_at: date.getTime() }], 1, 1);
    const timestampLabel = element('faceList').children[0].children[1].children[1];
    assert.equal(timestampLabel.textContent, `Last Updated Time:${expected}`);
});

test('empty face API results show the illustrated empty state, not loading or failure', () => {
    const { context, element } = fixture();
    context.loadFaces();
    assert.equal(element('faceList').textContent, 'Loading faces...');
    context.onDataToUi(JSON.stringify({ type: 'stranger_faces', success: true, data: { notes: [], total: 0, page: 1 } }));
    const empty = element('faceList').children[0];
    assert.equal(empty.className, 'face-empty');
    assert.equal(empty.children[0].children[0]['data-lucide'], 'scan');
    assert.equal(empty.children[0].children[1]['data-lucide'], 'user-round');
    assert.equal(empty.children[1].textContent, 'No face detected yet');
    context.onDataToUi(JSON.stringify({ type: 'stranger_faces', success: false, error: 'Unable to load faces' }));
    assert.equal(element('faceList').textContent, 'Unable to load faces');
});

test('merged facial API handler works inside Motion Detection without the old panel status element', () => {
    const { context, element, commands } = fixture();
    const getElement = context.document.getElementById;
    context.document.getElementById = id => id === 'faceRecStatus' ? null : getElement(id);
    context.initFacialRecognition();
    context.onDataToUi(JSON.stringify({ type: 'device_settings', settings: { unknow_snapswt: 1 } }));
    assert.equal(element('faceRecEnable').checked, true);
    assert.equal(element('faceRecEnable').disabled, false);
    assert.equal(element('faceRecEnable').indeterminate, false);
    element('faceRecEnable').checked = false;
    element('faceRecEnable').change();
    assert.equal(commands.at(-1)[0], 'SET_FACE_RECOGNITION');
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'face_recognition_updated', success: true, unknow_snapswt: 0 }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('faceRecEnable').checked, false);
    assert.equal(element('faceRecEnable').disabled, false);
    const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
    assert.equal((html.match(/id="faceRecEnable"/g) || []).length, 1);
});

test('facial thresholds hydrate from the supplied API values and use slider/options drafts', () => {
    const { context, element, commands } = fixture();
    context.onDataToUi(JSON.stringify({ type: 'device_settings', settings: {
        unknow_snapswt: 1, unknow_thld: 0.94, unknow_faceq: 2
    } }));
    assert.equal(element('faceSimilarity').value, '0.94');
    assert.equal(element('faceSimilarity').disabled, false);
    assert.equal(element('faceSimilarityValue').textContent, '94%');
    assert.equal(element('faceQualityValue').textContent, 'High');
    context.openMotionOption('faceSimilarity');
    assert.equal(element('motionOptionTitle').textContent, 'Face Similarity Threshold');
    assert.equal(element('motionOptionDescription').textContent,
        'The higher the threshold, the fewer misjudgments in facial recognition, but the probability of missed judgments may increase');
    const slider = element('motionOptionBody').children[0].children[1];
    assert.equal(slider.min, '1');
    assert.equal(slider.max, '99');
    assert.equal(slider.value, '94');
    slider.value = '82';
    slider.listeners.input();
    assert.equal(commands.length, 0);
    context.closeMotionOption();
    assert.equal(commands.length, 0);
    context.openMotionOption('faceSimilarity');
    context.confirmMotionOption();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'unknow_thld', value: 0.94 });
    context.finishSettingSave('camera', true);
    context.openMotionOption('faceQuality');
    const options = element('motionOptionBody').children;
    assert.deepEqual(options.map(row => row.children[0].textContent), ['Low', 'Medium', 'High']);
    assert.equal(options[2].children[1].checked, true);
    options[0].children[1].listeners.change();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'unknow_faceq', value: 0 });
    assert.equal(element('faceQualityValue').textContent, 'High');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true,
        settings: { unknow_faceq: 0 } }));
    assert.equal(element('faceQualityValue').textContent, 'Low');
});

test('Microphone initially prompts to start a call, then shows Call Started and Call Ended', () => {
    const { context, element, commands } = fixture();
    element('mic').removeEventListener = () => {};
    context.initMicrophone();
    assert.equal(element('micStatus').innerText, 'Switch on to start a call.');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: true }));
    assert.equal(element('micStatus').innerText, 'Switch on to start a call.');
    context.sendMicCommand(false);
    assert.equal(commands.at(-1)[0], 'UNMUTE_MIC');
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('settingSaveLabel').textContent, 'Starting call...');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: false }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'mic_result', success: true, mic_muted: false }));
    assert.equal(element('mic').checked, true);
    assert.equal(element('micStatus').innerText, 'Call Started');
    assert.equal(element('settingSaveToast').textContent, 'Call Started');
    context.sendMicCommand(true);
    assert.equal(element('settingSaveLabel').textContent, 'Ending call...');
    context.onDataToUi(JSON.stringify({ type: 'mic_result', success: true, mic_muted: true }));
    assert.equal(element('mic').checked, false);
    assert.equal(element('micStatus').innerText, 'Call Ended');
    assert.equal(element('settingSaveToast').textContent, 'Call Ended');
    const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
    assert.match(html, /class="h2">Microphone<\/div>/);
    assert.match(html, /id="mic" aria-label="Microphone"/);
    assert.match(html, /class="subtitle">Start or end a call<\/div>/);
    assert.match(html, /id="micStatus" aria-live="polite">Switch on to start a call\.<\/div>/);
});

test('ac_talk starts LAN channel 2, stops with 0, and respects top-level API success', () => {
    const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');
    const section = driver.slice(driver.indexOf('function SET_MIC_STATE('), driver.indexOf('function SET_ANTI_PRY_STATE('));
    const statusChecks = driver.match(/local micOn = [\s\S]*?(?=\r?\n\s*conditional_state\.MIC_MUTED)/g);
    assert.equal(statusChecks?.length, 2);
    const lua = `
        local json = require('CldBusApi.dkjson')
        local _props = {VID='camera-1', ['Auth Token']='token'}
        local Properties = {}
        local GlobalObject = {LnduBaseUrl='https://example.invalid', CldBusAppId='test'}
        local conditional_state = {MIC_MUTED=true, MIC_UNMUTED=false}
        local messages, requests = {}, {}
        local function SendDeviceInfoToUI(value) messages[#messages+1]=value end
        local function print() end
        local C4 = {UpdateProperty=function()end, SetTimer=function()return 1 end}
        local api_code, action_result = 20000, 0
        local transport = {execute=function(request, callback)
            local body=json.decode(request.body)
            local params=json.decode(body.input_params)
            assert(request.method=='POST' and request.url:match('/device/do%-action$'))
            assert(body.action_id=='ac_talk' and body.vid=='camera-1')
            requests[#requests+1]=params.on_off
            callback(200,json.encode({code=api_code,data={output_params=json.encode({result=action_result})}}),{},nil)
        end}
        ${section}
        local function result()
            for index=#messages,1,-1 do
                if messages[index].type=='mic_result' then return messages[index] end
            end
        end
        SET_MIC_STATE(false)
        assert(requests[1]==2 and result().success and result().mic_muted==false)
        assert(messages[#messages].type=='mic_update')
        action_result=1
        SET_MIC_STATE(false)
        assert(requests[2]==2 and result().success and result().mic_muted==false)
        assert(conditional_state.MIC_MUTED==false)
        action_result=0
        api_code=400
        SET_MIC_STATE(true)
        assert(requests[3]==0 and result().success==false and conditional_state.MIC_MUTED==false)
        api_code=20000
        SET_MIC_STATE(true)
        assert(requests[4]==0 and result().success and result().mic_muted==true)
        ${statusChecks.map(check => `
            for _, key in ipairs({'ac_talk', 'mic_on', 'talk_on', 'microphone'}) do
                for _, val in ipairs({0, 1, 2, '2'}) do
                    local s = {status_key=key, status_val=val}
                    ${check}
                    local expected = tonumber(val)==1 or (key=='ac_talk' and tonumber(val)==2)
                    assert(micOn==expected, 'Incorrect audio status for '..key..'='..tostring(val))
                end
            end
        `).join('\n')}
        io.write('VD05 call assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', lua], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VD05 call assertions passed/);
});

test('OP28 sends numeric note IDs and reports API rejection without deleting locally', () => {
    const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');
    const section = driver.slice(driver.indexOf('function DELETE_STRANGER_FACES('), driver.indexOf('function SendStrangerFacesToUI('));
    const lua = `
        local json = require('CldBusApi.dkjson')
        local _props = { VID='camera-1', ['Auth Token']='token' }
        local Properties = {}
        local GlobalObject = { LnduBaseUrl='https://example.invalid', CldBusAppId='test' }
        local messages, requests = {}, {}
        local expected_ids = {17,18}
        local response_code = 400
        local function SendStrangerFacesToUI(message) messages[#messages+1]=message end
        local transport = {execute=function(request, callback)
            requests[#requests+1]=request
            assert(request.method=='POST' and request.url:match('/stranger%-note%-del$'))
            local body=json.decode(request.body)
            assert(body.vid=='camera-1' and #body.ids==#expected_ids)
            for index, id in ipairs(expected_ids) do assert(body.ids[index]==id) end
            callback(200,json.encode({code=response_code,message='Rejected'}),{},nil)
        end}
        ${section}
        DELETE_STRANGER_FACES(json.encode({ids={17,18}}))
        assert(#requests==1 and messages[#messages].success==false)
        assert(messages[#messages].error=='Rejected')
        DELETE_STRANGER_FACES({ids={'face-a'}})
        DELETE_STRANGER_FACES({ids={}})
        assert(#requests==1)
        response_code = 20000
        expected_ids = {11156}
        DELETE_STRANGER_FACES({ids=[=[ 0="11156"]=]})
        assert(#requests==2 and messages[#messages].success==true)
        expected_ids = {17,18}
        DELETE_STRANGER_FACES({ids_json='[17,18]'})
        assert(#requests==3 and messages[#messages].success==true)
        DELETE_STRANGER_FACES({ids=[=[0="17" 1="18"]=]})
        assert(#requests==4 and messages[#messages].success==true)
        DELETE_STRANGER_FACES({ids=[=[0="17" junk]=]})
        DELETE_STRANGER_FACES({ids=[=[0="17" 0="18"]=]})
        DELETE_STRANGER_FACES({ids=[=[0="face-a"]=]})
        assert(#requests==4 and messages[#messages].success==false)
        io.write('OP28 assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', lua], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /OP28 assertions passed/);
});

test('driver uses property-latest and preserves the full motion struct on updates', () => {
    const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');
    const writeHelper = driver.slice(driver.indexOf('function SET_DEVICE_PROPERTY('), driver.indexOf('function GET_DEVICE_PROPERTY('));
    const section = driver.slice(driver.indexOf('function GET_DEVICE_PROPERTY('), driver.indexOf('function InitializeCamera()'));
    const lua = `
        local json = require('CldBusApi.dkjson')
        local _props = { VID = 'camera-1', ['Auth Token'] = 'test-token' }
        local Properties = {}
        local GlobalObject = { LnduBaseUrl = 'https://example.invalid' }
        local function GetCldBusCredentials() return 'test-app', 'test-secret' end
        local messages, writes = {}, {}
        local function SendDeviceInfoToUI(value) messages[#messages+1] = value end
        local function print() end
        local motion = { switch=1, type=0, sen=1, x_y_w_h='0:0:0:0', rec_time=15, interval=60 }
        local write_api_code = 20000
        local write_message = 'success'
        local transport = { execute = function(request, callback)
            local body = json.decode(request.body)
            assert(body.vid == 'camera-1')
            if request.url:match('property%-latest$') then
                assert(request.method == 'POST' and body.data_source == 0)
                callback(200, json.encode({code=20000,data={
                    {data_id='motion',value=json.encode(motion)},
                    {data_id='siren_swt',value=1}, {data_id='light_swt',value=0},
                    {data_id='unknow_thld',value=0.94}, {data_id='unknow_faceq',value=2}
                }}), {}, nil)
            else
                assert(request.url:match('do%-property$'))
                assert(request.headers['Accept-Language'] == 'en')
                local data = json.decode(body.data)
                writes[#writes+1] = data
                if data.motion then
                    assert(data.motion.rec_time == 15 and data.motion.interval == 60)
                    assert(data.motion.x_y_w_h == '0:0:0:0')
                    motion = data.motion
                end
                callback(200, json.encode({code=write_api_code,message=write_message}), {}, nil)
            end
        end }
        ${writeHelper}
        ${section}
        GET_CAMERA_SETTINGS()
        assert(messages[#messages].settings.motion_switch == 1)
        assert(messages[#messages].settings.unknow_thld == 0.94)
        assert(messages[#messages].settings.unknow_faceq == 2)
        UPDATE_CAMERA_SETTING(json.encode({key='motion.sen',value=2}))
        assert(writes[1].motion.sen == 2 and writes[1].motion.type == 0)
        UPDATE_CAMERA_SETTING({key='motion.type',value='1'})
        assert(writes[2].motion.type == 1 and writes[2].motion.sen == 2)
        UPDATE_CAMERA_SETTING({key='alarm',value=1})
        assert(writes[3].siren_swt == 1 and writes[3].light_swt == nil)
        UPDATE_CAMERA_SETTING({key='motion.sen',value=99})
        assert(#writes == 3 and messages[#messages].success == false)
        UPDATE_CAMERA_SETTING({key='unknow_thld',value='0.94'})
        assert(writes[4].unknow_thld == 0.94 and writes[4].motion == nil)
        UPDATE_CAMERA_SETTING({key='unknow_faceq',value='2'})
        assert(writes[5].unknow_faceq == 2)
        UPDATE_CAMERA_SETTING({key='unknow_thld',value=94})
        UPDATE_CAMERA_SETTING({key='unknow_thld',value=0.945})
        UPDATE_CAMERA_SETTING({key='unknow_faceq',value=3})
        assert(#writes == 5 and messages[#messages].success == false)
        write_api_code = 408
        write_message = '设备响应超时，请重试'
        UPDATE_CAMERA_SETTING({key='alarm',value=0})
        assert(#writes == 6 and writes[6].siren_swt == 0 and writes[6].light_swt == nil)
        assert(messages[#messages].type == 'camera_setting_result' and messages[#messages].success == false)
        assert(messages[#messages].error == 'Device response timed out. Please try again.')
        assert(messages[#messages-1].settings.siren_swt == 1)
        assert(messages[#messages-1].setting_saved == false)
        write_api_code = 20000
        write_message = 'success'
        UPDATE_CAMERA_SETTING({key='alarm',value=0})
        assert(#writes == 7 and messages[#messages].setting_saved == true)
        assert(messages[#messages].settings.siren_swt == 0)
        io.write('VD05 motion assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', lua], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VD05 motion assertions passed/);
});