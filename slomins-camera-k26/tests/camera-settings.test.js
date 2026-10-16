const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');
const javascript = fs.readFileSync(path.join(root, 'www/contents/javascript/index.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');

test('K26 reads verified properties and serializes complete motion updates', () => {
    const writeStart = driver.indexOf('function SET_DEVICE_PROPERTY(');
    const readStart = driver.indexOf('local settings_property_groups =');
    const settingsEnd = driver.indexOf('local function MQTT_GET_PASSWORD(', readStart);
    assert.ok(writeStart >= 0, 'property write helper missing');
    assert.ok(readStart >= 0, 'property read helper missing');
    assert.ok(settingsEnd > readStart, 'settings section boundary missing');
    const writer = driver.slice(writeStart, driver.indexOf('-- Get Device Property', writeStart));
    const settings = driver.slice(readStart, settingsEnd);

    const source = `
        local actual_json = require('CldBusApi.dkjson')
        local json = actual_json
        local _props = { VID = 'vid-1', ['Auth Token'] = 'token' }
        local Properties = {}
        local GlobalObject = { LnduBaseUrl = 'https://example.invalid' }
        local function GetCldBusCredentials() return 'app', 'secret' end
        local function print() end
        local camera_settings = {}
        local pushed
        local function SendDeviceInfoToUI(data) pushed = data end
        local stored_motion = { switch=1, type=0, sen=2, x_y_w_h='2:3:400:500', rec_time=15, interval=60 }
        local facial_values = {}
        local pending_writes = {}
        local requested_ids
        local transport = { execute = function(request, callback)
            if request.url:match('/property%-latest$') then
                local body = json.decode(request.body)
                requested_ids = body.data_ids
                assert(body.vid == 'vid-1' and body.data_source == 0)
                local data = {
                    {data_id='motion',value=json.encode(stored_motion)},
                    {data_id='siren_swt',value='0'},
                    {data_id='light_swt',value='1'}
                }
                for key, value in pairs(facial_values) do table.insert(data, {data_id=key,value=value}) end
                callback(200, json.encode({code=20000,data=data}), {}, nil)
            else
                assert(request.url:match('/do%-property$'))
                local body = json.decode(request.body)
                local data = json.decode(body.data)
                assert(body.vid == 'vid-1')
                if data.motion then stored_motion = data.motion end
                pending_writes[#pending_writes + 1] = { callback=callback, data=data }
            end
        end }
        ${writer}
        ${settings}

        GET_CAMERA_SETTINGS()
        assert(pushed.type == 'camera_settings' and pushed.success)
        assert(pushed.settings.motion_switch == 1 and pushed.settings.motion_x_y_w_h == '2:3:400:500')
        assert(pushed.settings.siren_swt == '0' and pushed.settings.light_swt == '1')
        local requested = {}
        for _, key in ipairs(requested_ids) do requested[key] = true end
        assert(requested.motion and requested.siren_swt and requested.light_swt)
        assert(requested.unknow_thld and requested.unknow_faceq and requested.unknow_snapswt)
        assert(requested.icut_mode and requested.anti_flicker and requested.flip_swt and requested.mark)

        UPDATE_CAMERA_SETTING({key='motion.sen', value=0})
        UPDATE_CAMERA_SETTING({key='motion.x_y_w_h', value='8:9:600:700'})
        assert(#pending_writes == 1, 'motion writes must serialize')
        local first = pending_writes[1].data.motion
        assert(first.sen == 0 and first.switch == 1 and first.type == 0)
        assert(first.x_y_w_h == '2:3:400:500' and first.rec_time == 15 and first.interval == 60)

        pending_writes[1].callback(200, json.encode({code=20000}), {}, nil)
        assert(#pending_writes == 2, 'queued write should start after the first acknowledgement')
        local second = pending_writes[2].data.motion
        assert(second.sen == 0 and second.x_y_w_h == '8:9:600:700')
        assert(second.switch == 1 and second.type == 0 and second.rec_time == 15 and second.interval == 60)
        pending_writes[2].callback(200, json.encode({code=20000}), {}, nil)
        assert(pushed.type == 'camera_settings' and pushed.setting_saved == true)
        assert(pushed.settings.motion_sen == 0 and pushed.settings.motion_x_y_w_h == '8:9:600:700')

        UPDATE_CAMERA_SETTING({key='motion.sen', value=3})
        assert(#pending_writes == 2, 'out-of-range settings must not issue API writes')
        UPDATE_CAMERA_SETTING({key='unknow_snapswt', value=1})
        assert(#pending_writes == 2, 'unavailable facial properties must not issue API writes')
        assert(pushed.type == 'camera_setting_result' and pushed.success == false)
        facial_values = {unknow_snapswt='1', unknow_thld='0.75', unknow_faceq='2'}
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.unknow_snapswt=='1' and pushed.settings.unknow_thld=='0.75' and pushed.settings.unknow_faceq=='2')
        for key, value in pairs({unknow_snapswt=0, unknow_thld=0.85, unknow_faceq=0}) do
            local count = #pending_writes
            UPDATE_CAMERA_SETTING(json.encode({key=key,value=tostring(value)}))
            assert(#pending_writes==count+1 and pending_writes[#pending_writes].data[key]==value)
            pending_writes[#pending_writes].callback(200, json.encode({code=20000}), {}, nil)
            assert(pushed.setting_saved==true and pushed.settings[key]==value)
        end
        local count = #pending_writes
        UPDATE_CAMERA_SETTING({key='unknow_thld', value=0})
        UPDATE_CAMERA_SETTING({key='unknow_faceq', value=3})
        UPDATE_CAMERA_SETTING({key='unknow_snapswt', value=2})
        assert(#pending_writes==count and pushed.success==false)
        UPDATE_CAMERA_SETTING({key='flip_swt',value=1})
        assert(#pending_writes==count and pushed.success==false, 'absent video fields must not be written')
        facial_values = {icut_mode='0', anti_flicker='0', flip_swt='1', mark='1'}
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.icut_mode=='0' and pushed.settings.mark=='1')
        for key, value in pairs({icut_mode=2, anti_flicker=2, flip_swt=0, mark=0}) do
            local before = #pending_writes
            UPDATE_CAMERA_SETTING({key=key,value=tostring(value)})
            assert(#pending_writes==before+1 and pending_writes[#pending_writes].data[key]==value)
            pending_writes[#pending_writes].callback(200,json.encode({code=20000}),{},nil)
            assert(pushed.setting_saved and pushed.settings[key]==value)
        end
        count = #pending_writes
        for key, value in pairs({icut_mode=1,anti_flicker=3,flip_swt=2,mark=-1}) do
            UPDATE_CAMERA_SETTING({key=key,value=value})
            assert(#pending_writes==count and pushed.success==false)
        end
        io.write('K26 camera settings assertions passed')
    `;

    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], {
        encoding: 'utf8',
        cwd: root
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /K26 camera settings assertions passed/);
});

function fixture() {
    class Element {
        constructor(id) {
            this.id = id;
            this.disabled = true;
            this.hidden = false;
            this.checked = false;
            this.value = '';
            this.listeners = {};
            this.style = { setProperty() {} };
            this.children = [];
        }
        setAttribute(name, value) { this[name] = value; }
        focus() { document.activeElement = this; }
        select() { this.selected = true; }
        appendChild(child) { this.children.push(child); }
        replaceChildren() { this.children = []; }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        removeEventListener() {}
        dispatch(type) { this.listeners[type]?.({ target: this }); }
    }

    const elements = new Map();
    const app = { inert: false };
    const navigation = [];
    const timers = new Map();
    let timerSequence = 0;
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, new Element(id));
            return elements.get(id);
        },
        querySelector() { return app; },
        createElement(tag) { return new Element(tag); },
        addEventListener() {}
    };
    const commands = [];
    document.getElementById('deviceNameSheet').hidden = true;
    const context = vm.createContext({
        document,
        C4: { sendCommand: (...args) => commands.push(args) },
        console,
        JSON,
        show(id) { navigation.push(id); },
        setTimeout(callback, delay) {
            const id = ++timerSequence;
            timers.set(id, { callback, delay });
            return id;
        },
        clearTimeout(id) { timers.delete(id); },
        window: { addEventListener() {} }
    });
    vm.runInContext(javascript, context);
    context.initCameraSettings();
    return { context, document, commands, app, timers, navigation };
}

test('K26 controls hydrate from API values and send settings commands', () => {
    const { context, document, commands } = fixture();
    context.updateCameraSettingsUI({
        motion_switch: '1', motion_type: '1', motion_sen: '2',
        motion_x_y_w_h: '1:2:300:400', siren_swt: '1', light_swt: '1'
    });

    assert.equal(document.getElementById('motionSettingsGroup').hidden, false);
    assert.equal(document.getElementById('motionAlarmGroup').hidden, false);
    assert.equal(document.getElementById('motionDetectionType').value, '1');
    assert.equal(document.getElementById('motionZoneOpen').disabled, false);
    assert.equal(document.getElementById('motionAlarmToggle').checked, true);

    document.getElementById('motionDetectionToggle').checked = false;
    document.getElementById('motionDetectionToggle').dispatch('change');
    assert.equal(commands.at(-1)[0], 'SET_CAMERA_SETTING');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.switch', value: 0 });

    context.updateCameraSettingsUI({ motion_switch: '0' });
    assert.equal(document.getElementById('motionSettingsGroup').hidden, true);
    assert.equal(document.getElementById('motionAlarmGroup').hidden, true);
    assert.match(html, /id="k26FaceManagement"[\s\S]*?show\('facialRecPanel'\)/);
});

test('K26 uses the VD05 loading overlay until data arrives and recovers from failures and timeouts', () => {
    const { context, document, commands, app, timers, navigation } = fixture();
    const element = id => document.getElementById(id);
    context.requestCameraSettings();
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SETTINGS');
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('settingSaveOverlay')['data-loading'], 'true');
    assert.equal(element('settingSaveLabel').textContent, 'Loading...');
    assert.equal(app.inert, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 0 } }));
    assert.equal(app.inert, true);
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('faceRecEnable').disabled, true);
    assert.equal(element('faceSimilarity').disabled, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { unknow_snapswt: 0 } }));
    assert.equal(app.inert, false);
    assert.equal(element('settingSaveOverlay').hidden, true);
    context.requestCameraSettings();
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: false }));
    assert.equal(navigation.at(-1), 'homePanel');
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Unable to load camera settings');
    context.requestCameraSettings();
    [...timers.values()].find(timer => timer.delay === 20000).callback();
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(element('settingSaveToast').textContent, 'Settings request timed out');
});

test('K26 never reveals empty or partially loaded settings and does not reuse previous API values', () => {
    const { context, document, app } = fixture();
    const element = id => document.getElementById(id);
    const respond = settings => context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings }));
    assert.match(html, /<div class="app" inert>/);
    const overlayMarkup = html.match(/<div id="settingSaveOverlay"[^>]*>/)[0];
    assert.match(overlayMarkup, /data-loading="true"/);
    assert.doesNotMatch(overlayMarkup, /\bhidden\b/);
    context.requestCameraSettings();
    respond({});
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('motionDetectionType').value, '');
    respond({ motion_switch: 1, unknow_snapswt: 1 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    respond({ motion_type: 1, motion_sen: 2, motion_x_y_w_h: '1:2:300:400', siren_swt: 0, light_swt: 0 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    respond({ unknow_thld: .81 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    respond({ unknow_faceq: 1 });
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(element('faceSimilarityValue').textContent, '81%');
    assert.equal(element('faceQualityValue').textContent, 'Medium');
    context.requestCameraSettings();
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('motionDetectionType').value, '');
    assert.equal(element('faceSimilarityValue').textContent, '...');
    respond({ motion_switch: 1, unknow_snapswt: 1 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('faceSimilarity').disabled, true);
});

test('K26 facial toggle and thresholds are independent of motion and saves wait for acknowledgement', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.updateCameraSettingsUI({ motion_switch: 0, unknow_snapswt: 1, unknow_thld: .75, unknow_faceq: 0 });
    assert.equal(element('motionSettingsGroup').hidden, true);
    assert.equal(element('faceRecEnable').checked, true);
    assert.equal(element('faceSimilarity').hidden, false);
    assert.equal(element('faceQuality').hidden, false);
    assert.equal(element('faceSimilarityValue').textContent, '75%');
    assert.equal(element('faceQualityValue').textContent, 'Low');
    assert.equal(element('k26FaceManagement').hidden, false);
    element('faceRecEnable').checked = false;
    element('faceRecEnable').dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'unknow_snapswt', value: 0 });
    assert.equal(element('faceSimilarity').hidden, true);
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings: { motion_switch: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Rejected' }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Rejected');
    assert.equal(element('faceRecEnable').checked, true);
    element('faceRecEnable').checked = false;
    element('faceRecEnable').dispatch('change');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { unknow_snapswt: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
    assert.equal(element('k26FaceManagement').hidden, true);
    context.requestCameraSettings();
    context.updateCameraSettingsUI({ unknow_snapswt: 1 });
    assert.equal(element('faceSimilarity').hidden, true);
    assert.equal(element('faceSimilarity').disabled, true);
});

test('K26 option sheets use VD05 radio and slider behavior and confirmed API labels', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.updateCameraSettingsUI({ motion_type: 0, motion_sen: 1, unknow_snapswt: 1, unknow_thld: .7, unknow_faceq: 2 });
    context.openMotionOption('motionDetectionType');
    assert.equal(element('motionOptionSheet').hidden, false);
    assert.equal(element('motionOptionConfirm').hidden, false);
    element('motionOptionBody').children[1].children[1].dispatch('change');
    assert.equal(commands.length, 0);
    context.confirmMotionOption();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.type', value: 1 });
    context.openMotionOption('faceSimilarity');
    const similarity = element('motionOptionBody').children[0].children[1];
    assert.equal(similarity.type, 'range');
    similarity.value = '83';
    similarity.dispatch('input');
    context.confirmMotionOption();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'unknow_thld', value: .83 });
    context.openMotionOption('motionSensitivity');
    assert.equal(element('motionOptionConfirm').hidden, true);
    const sensitivity = element('motionOptionBody').children[0].children[1];
    sensitivity.value = '2';
    sensitivity.dispatch('input');
    sensitivity.dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.sen', value: 2 });
    context.openMotionOption('faceQuality');
    element('motionOptionBody').children[0].children[1].dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'unknow_faceq', value: 0 });
    assert.equal(element('faceQualityValue').textContent, 'High');
    assert.doesNotMatch(html, /<select\b/);
});

test('K26 Video Settings waits for all four API values and never uses previous or default states', () => {
    const { context, document, commands, app } = fixture();
    const element = id => document.getElementById(id);
    const respond = settings => context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, settings }));
    context.requestCameraSettings('video');
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SETTINGS');
    assert.equal(element('settingSaveLabel').textContent, 'Loading...');
    assert.equal(element('nightVisionMode').value, '');
    assert.equal(element('flipImageToggle').disabled, true);
    assert.equal(element('flipImageToggle').indeterminate, true);
    respond({ motion_switch: 0, unknow_snapswt: 0 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    respond({ icut_mode: '0', anti_flicker: '0', flip_swt: '0' });
    assert.equal(element('settingSaveOverlay').hidden, false);
    respond({ mark: '1' });
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(element('nightVisionModeValue').textContent, 'Infrared night vision');
    assert.equal(element('antiFlickerValue').textContent, 'OFF');
    assert.equal(element('flipImageToggle').checked, false);
    assert.equal(element('timeWatermarkToggle').checked, true);
    context.requestCameraSettings('video');
    assert.equal(element('nightVisionModeValue').textContent, '...');
    assert.equal(element('antiFlickerValue').textContent, '...');
    assert.equal(element('timeWatermarkToggle').disabled, true);
    respond({ icut_mode: 1, anti_flicker: 2, flip_swt: 1, mark: 1 });
    assert.equal(element('nightVisionMode').disabled, true);
    assert.equal(element('settingSaveOverlay').hidden, false);
});

test('K26 video sheets match the supplied options and send confirmed API mappings immediately', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.updateCameraSettingsUI({ icut_mode: 0, anti_flicker: 0, flip_swt: 1, mark: 1 });
    const modes = [[0, 'Infrared night vision'], [2, 'Color night vision'], [3, 'Smart night vision']];
    let options;
    for (const [index, [value, label]] of modes.entries()) {
        const previousLabel = element('nightVisionModeValue').textContent;
        context.openMotionOption('nightVisionMode');
        options = element('motionOptionBody').children;
        assert.equal(element('motionOptionTitle').textContent, 'Night Vision Mode');
        assert.equal(element('motionOptionConfirm').hidden, true);
        assert.deepEqual(options.map(option => option.children[0].textContent), modes.map(mode => mode[1]));
        assert.deepEqual(options.map(option => option.children[1].value), ['0', '2', '3']);
        assert.ok(options.every(option => option.children[1].disabled === false));
        options[index].children[1].dispatch('change');
        assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'icut_mode', value });
        assert.equal(element('motionOptionSheet').hidden, true);
        assert.equal(element('settingSaveOverlay').hidden, false);
        assert.equal(element('nightVisionModeValue').textContent, previousLabel);
        context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { icut_mode: value } }));
        assert.equal(element('settingSaveOverlay').hidden, true);
        assert.equal(element('nightVisionModeValue').textContent, label);
    }
    for (const [value, label] of [[0, 'OFF'], [1, '50Hz'], [2, '60Hz']]) {
        context.openMotionOption('antiFlicker');
        options = element('motionOptionBody').children;
        assert.deepEqual(options.map(option => option.children[0].textContent), ['OFF', '50Hz', '60Hz']);
        options[value].children[1].dispatch('change');
        assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'anti_flicker', value });
        context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { anti_flicker: value } }));
        assert.equal(element('antiFlickerValue').textContent, label);
    }
});

test('K26 video toggles wait for acknowledgement, restore rejected values, and retain the four-row layout', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.updateCameraSettingsUI({ flip_swt: 0, mark: 1 });
    element('flipImageToggle').checked = true;
    element('flipImageToggle').dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'flip_swt', value: 1 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Rejected' }));
    assert.equal(element('flipImageToggle').checked, false);
    assert.equal(element('settingSaveOverlay').hidden, true);
    element('timeWatermarkToggle').checked = false;
    element('timeWatermarkToggle').dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'mark', value: 0 });
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { mark: 0 } }));
    assert.equal(element('timeWatermarkToggle').checked, false);
    assert.equal(element('settingSaveOverlay').hidden, true);
    const video = html.match(/<section id="videoSettingsPanel"[\s\S]*?<\/section>/)[0];
    let previous = -1;
    for (const label of ['Night Vision Mode', 'Anti-Flicker', 'Flip Image', 'Time Watermark']) {
        const position = video.indexOf('>' + label + '<');
        assert.ok(position > previous, label + ' missing or out of order');
        previous = position;
    }
    assert.doesNotMatch(video, /checked|Take Snapshot|<select/);
    assert.match(html, /id === 'videoSettingsPanel'[\s\S]*?requestCameraSettings\('video'\)/);
});

test('K26 microphone matches VD05 initial prompt, pending call overlay, and confirmed call feedback', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.initMicrophone();
    assert.equal(element('micStatus').innerText, 'Switch on to start a call.');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: true }));
    assert.equal(element('micStatus').innerText, 'Switch on to start a call.');
    context.sendMicCommand(false);
    assert.equal(commands.at(-1)[0], 'UNMUTE_MIC');
    assert.equal(element('settingSaveLabel').textContent, 'Starting call...');
    context.onDataToUi(JSON.stringify({ type: 'mic_update', mic_muted: false }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'mic_result', success: true, mic_muted: false }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('micStatus').innerText, 'Call Started');
    assert.equal(element('settingSaveToast').textContent, 'Call Started');
    context.sendMicCommand(true);
    assert.equal(element('settingSaveLabel').textContent, 'Ending call...');
    context.onDataToUi(JSON.stringify({ type: 'mic_result', success: false, error: 'Rejected' }));
    assert.equal(element('mic').checked, true);
    assert.equal(element('micStatus').innerText, 'Call Started');
    context.sendMicCommand(true);
    context.onDataToUi(JSON.stringify({ type: 'mic_result', success: true, mic_muted: true }));
    assert.equal(element('micStatus').innerText, 'Call Ended');
    assert.equal(element('settingSaveToast').textContent, 'Call Ended');
});

test('K26 device-name and face-name updates use the same overlay until all replies arrive', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.initDeviceName();
    element('deviceNameInput').value = 'New camera name';
    element('updateNameBtn').dispatch('click');
    assert.equal(commands.at(-1)[0], 'SET_DEVICE_NAME');
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('settingSaveLabel').textContent, 'Setting up...');
    context.onDataToUi(JSON.stringify({ device_name_updated: true }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
    vm.runInContext("faces = [{face_id:'one',name:'One'},{face_id:'two',name:'Two'}]; facesDirty = true;", context);
    context.initSaveFacesButton();
    element('saveFacesBtn').dispatch('click');
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(commands.filter(command => command[0] === 'UPDATE_STRANGER_NOTE').length, 2);
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
});

test('K26 home follows the reference groups and places Microphone inside Audio Settings', () => {
    const section = id => html.match(new RegExp('<section id="' + id + '"[\\s\\S]*?<\\/section>'))[0];
    const home = section('homePanel');
    const labels = ['Motion Detection', 'Power Management', 'Status Light', 'Video Settings', 'Audio Settings',
        'Notification Settings', 'Internal Storage', 'Device Information', 'Check Firmware Update', 'C4 Authentication Service', 'Delete Device'];
    let previous = -1;
    for (const label of labels) {
        const position = home.indexOf('>' + label + '<');
        assert.ok(position > previous, label + ' missing or out of order');
        previous = position;
    }
    assert.doesNotMatch(home, /Start or end a call|K26 Camera Controls|Take Snapshot|Reboot/);
    assert.match(section('audioSettingsPanel'), /show\('micPanel'\)[\s\S]*?>Microphone</);
    assert.match(section('micPanel'), /show\('audioSettingsPanel'\)/);
    assert.match(section('rebootPanel'), /show\('deviceInformationPanel'\)/);
    assert.match(section('deviceInformationPanel'), /id="snapshotHomeBtn"/);
    assert.match(home, /id="statusLight"[^>]*disabled/);
    assert.doesNotMatch(home, /current version is|checked/);
    assert.doesNotMatch(html, /<footer\b/);
    assert.match(home, /id="homeModelName" class="settings-device-name">Outdoor Camera \(Solar\)<\/div>/);
    assert.match(home, /id="homeDeviceName" class="settings-device-type">\.\.\.<\/div>/);
    const { context, document } = fixture();
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'Outdoor Camera', version: '4.2', release_date: '2026-10-16' }));
    assert.equal(document.getElementById('homeDeviceName').innerText, 'Outdoor Camera');
    assert.equal(document.getElementById('firmwareVersion').innerText, '4.2');
    assert.equal(document.getElementById('releaseDate').innerText, '2026-10-16');
    context.onDataToUi(JSON.stringify({ device_name_updated: true, device_name: 'Driveway' }));
    assert.equal(document.getElementById('homeDeviceName').innerText, 'Driveway');
    assert.equal(document.getElementById('deviceVersion').innerText, 'Driveway');
});

test('K26 fills laptop width and edits the API device name in a cancellable bottom sheet', () => {
    const { context, document, commands, app } = fixture();
    const element = id => document.getElementById(id);
    context.initDeviceName();
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'Outdoor Camera' }));
    context.openDeviceNameSheet();
    assert.equal(element('deviceNameSheet').hidden, false);
    assert.equal(element('deviceNameInput').value, 'Outdoor Camera');
    assert.equal(element('deviceNameInput').selected, true);
    assert.equal(app.inert, true);
    assert.equal(commands.at(-1)[0], 'GET_DEVICE_INFO');
    element('deviceNameInput').value = 'Driveway draft';
    element('deviceNameInput').dispatch('input');
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'Updated by API' }));
    assert.equal(element('deviceNameInput').value, 'Driveway draft');
    context.closeDeviceNameSheet();
    assert.equal(element('deviceNameSheet').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(commands.filter(command => command[0] === 'SET_DEVICE_NAME').length, 0);
    context.openDeviceNameSheet();
    assert.equal(element('deviceNameInput').value, 'Updated by API');
    context.clearDeviceName();
    assert.equal(element('deviceNameInput').value, '');
    assert.equal(element('updateNameBtn').disabled, true);
    element('updateNameBtn').dispatch('click');
    assert.equal(commands.filter(command => command[0] === 'SET_DEVICE_NAME').length, 0);
    element('deviceNameInput').value = 'Driveway';
    element('deviceNameInput').dispatch('input');
    element('updateNameBtn').dispatch('click');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { name: 'Driveway' });
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(element('updateNameBtn').disabled, true);
    context.closeDeviceNameSheet();
    assert.equal(element('deviceNameSheet').hidden, false);
    context.onDataToUi(JSON.stringify({ error: 'Name rejected' }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('deviceNameSheet').hidden, false);
    assert.equal(element('deviceNameInput').value, 'Driveway');
    assert.equal(element('updateNameBtn').disabled, false);
    assert.equal(element('deviceNameStatus').innerText, 'Name rejected');
    element('updateNameBtn').dispatch('click');
    context.onDataToUi(JSON.stringify({ device_name_updated: true, device_name: 'Driveway' }));
    assert.equal(element('deviceNameSheet').hidden, true);
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(app.inert, false);
    assert.equal(element('homeDeviceName').innerText, 'Driveway');
    assert.match(html, /onclick="openDeviceNameSheet\(\)"/);
    assert.match(html, /id="deviceNameSheet"[^>]*role="dialog"/);
    assert.match(html, />Change Device Name<\/h2>/);
    assert.doesNotMatch(html, /id="deviceNamePanel"/);
    assert.doesNotMatch(html, /\.(?:settings-home|settings-bar|settings-subpage|video-settings)\s*\{[^}]*max-width:/);
});

test('K26 call commands use LAN channel 2 and return success and failure acknowledgements', () => {
    const start = driver.indexOf('function SET_MIC_STATE(');
    const section = driver.slice(start, driver.indexOf('function GET_DEVICE_INFO(', start));
    const source = `
        local json = require('CldBusApi.dkjson')
        local _props = {VID='camera-1', ['Auth Token']='token'}
        local Properties = {}
        local GlobalObject = {LnduBaseUrl='https://example.invalid', CldBusAppId='test'}
        local conditional_state = {MIC_MUTED=true, MIC_UNMUTED=false}
        local messages, requests = {}, {}
        local function SendDeviceInfoToUI(value) messages[#messages+1]=value end
        local function PushMicStateToUI() end
        local function print() end
        local C4 = {UpdateProperty=function()end}
        local api_code = 20000
        local transport = {execute=function(request, callback)
            local body=json.decode(request.body)
            local params=json.decode(body.input_params)
            assert(body.action_id=='ac_talk' and body.vid=='camera-1')
            requests[#requests+1]=params.on_off
            callback(200,json.encode({code=api_code}),{},nil)
        end}
        ${section}
        SET_MIC_STATE(false)
        assert(requests[1]==2 and messages[#messages].type=='mic_result' and messages[#messages].success)
        assert(conditional_state.MIC_MUTED==false)
        api_code=400
        SET_MIC_STATE(true)
        assert(requests[2]==0 and messages[#messages].success==false and conditional_state.MIC_MUTED==false)
        api_code=20000
        SET_MIC_STATE(true)
        assert(requests[3]==0 and messages[#messages].success and conditional_state.MIC_MUTED==true)
        _props['Auth Token']=''
        SET_MIC_STATE(false)
        assert(#requests==3 and messages[#messages].error=='Missing Auth Token')
        io.write('K26 call assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /K26 call assertions passed/);
});