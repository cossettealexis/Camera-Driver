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
        local read_count = 0
        local transport = { execute = function(request, callback)
            if request.url:match('/property%-latest$') then
            read_count = read_count + 1
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
        assert(type(FORMAT_STORAGE)=='function', 'format handler must be available before any setting writes')

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
        facial_values = {icut_mode='0', anti_flicker='0', flip_swt='1', mark='1',indicator_swt=1}
        GET_CAMERA_SETTINGS()
        assert(pushed.settings.icut_mode=='0' and pushed.settings.mark=='1')
        for key, value in pairs({icut_mode=1, anti_flicker=2, flip_swt=0, mark=0,indicator_swt=0}) do
            local before = #pending_writes
            UPDATE_CAMERA_SETTING({key=key,value=tostring(value)})
            assert(#pending_writes==before+1 and pending_writes[#pending_writes].data[key]==value)
            if key=='indicator_swt' then assert(table.concat(requested_ids,',')=='indicator_swt') end
            pending_writes[#pending_writes].callback(200,json.encode({code=20000}),{},nil)
            assert(pushed.setting_saved and pushed.settings[key]==value)
        end
        count = #pending_writes
        for key, value in pairs({icut_mode=3,anti_flicker=3,flip_swt=2,mark=-1,indicator_swt=2}) do
            UPDATE_CAMERA_SETTING({key=key,value=value})
            assert(#pending_writes==count and pushed.success==false)
        end
        facial_values = {beep_vol='8',stored=json.encode({status=0,capacity=29,usage=25}),indicator_swt=1}
        local groups = {
            home='indicator_swt,beep_vol',
            motion='motion,unknow_snapswt,unknow_thld,unknow_faceq',
            video='icut_mode,anti_flicker,flip_swt,mark',audio='beep_vol',storage='stored'
        }
        for scope, expected in pairs(groups) do
            GET_CAMERA_SETTINGS({scope=scope,request_id='page-'..scope})
            assert(table.concat(requested_ids,',')==expected, 'cross-page properties requested by '..scope)
            assert(pushed.scope==scope and pushed.request_id=='page-'..scope)
        end
        assert(pushed.settings.stored_capacity==29 and pushed.settings.stored_usage==25)
        local reads = read_count
        GET_CAMERA_SETTINGS({scope='notifications',request_id='notify'})
        assert(read_count==reads and pushed.supported==false and pushed.scope=='notifications')
        UPDATE_CAMERA_SETTING({key='beep_vol',value='10'})
        assert(table.concat(requested_ids,',')=='beep_vol', 'speaker write must not read all camera fields')
        assert(pending_writes[#pending_writes].data.beep_vol==10)
        pending_writes[#pending_writes].callback(200,json.encode({code=20000}),{},nil)
        assert(pushed.settings.beep_vol==10)
        count = #pending_writes
        UPDATE_CAMERA_SETTING({key='beep_vol',value=11})
        assert(#pending_writes==count and pushed.success==false)
        local formats, format_code = 0, 20000
        transport.execute = function(request, callback)
            formats = formats + 1
            local body = json.decode(request.body)
            assert(request.method=='POST' and request.url=='https://example.invalid/api/v3/openapi/device/do-action')
            assert(body.vid=='vid-1' and body.action_id=='ac_sd_reset')
            local input = json.decode(body.input_params)
            assert(type(input.t)=='number' and input.t > 0 and input.t < 100000000000)
            callback(200,json.encode({code=format_code,message='response'}),{},nil)
        end
        FORMAT_STORAGE({confirmed=false})
        FORMAT_STORAGE({confirmed='false'})
        FORMAT_STORAGE({})
        assert(formats==0, 'unconfirmed formatting must never issue a request')
        FORMAT_STORAGE({confirmed='true'})
        assert(formats==1 and pushed.type=='storage_format' and pushed.success)
        format_code=400
        FORMAT_STORAGE(json.encode({confirmed=true}))
        assert(formats==2 and pushed.success==false)
        _props['Auth Token']=''
        FORMAT_STORAGE({confirmed=true})
        assert(formats==2 and pushed.error=='Missing device or API credentials')
        _props['Auth Token']='token'
        local response = {code=20000,data={devices={
            {vid='other',status={{status_key='unknow_snapswt',status_val=1}}},
            {vid='vid-1',status=json.encode({
                {status_key='motion',status_val=json.encode({switch=1,type=0,sen=2,x_y_w_h='0:0:0:0'})},
                {status_key='unknow_snapswt',status_val=0},
                {status_key='beep_vol',status_val=8}
            })}
        }}}
        transport.execute=function(request, callback) callback(200,json.encode(response),{},nil) end
        GET_CAMERA_SETTINGS({scope='motion',request_id='wrapped'})
        assert(pushed.complete and pushed.settings.motion_switch==1 and pushed.settings.motion_sen==2)
        assert(pushed.settings.unknow_snapswt==0 and pushed.request_id=='wrapped')
        GET_DEVICE_PROPERTY('beep_vol',function(value) assert(value==8) end)
        response={code=20000,data={devices={{vid='other',status={}}}}}
        GET_CAMERA_SETTINGS({scope='motion'})
        assert(pushed.success==false, 'a different device must not supply K26')
        response={code=20000,data={{data_id='motion.switch',value=0},{data_id='unknow_snapswt',value=0}}}
        GET_CAMERA_SETTINGS({scope='motion'})
        assert(pushed.settings.motion_switch==0 and pushed.settings.unknow_snapswt==0)
        io.write('K26 camera settings assertions passed')
    `;

    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], {
        encoding: 'utf8',
        cwd: root
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /K26 camera settings assertions passed/);
});

test('existing GET_DEVICE_PROPERTY Lua command reads all fields and redacts sensitive response values', () => {
    const start = driver.indexOf('local settings_property_groups =');
    const section = driver.slice(start, driver.indexOf('function GET_CAMERA_SETTINGS(', start));
    assert.doesNotMatch(driver, /LOG_CAMERA_PROPERTIES/);
    const source = `
        local json = require('CldBusApi.dkjson')
        local _props = {VID='test-vid', ['Auth Token']='auth-token-test'}
        local Properties = {}
        local GlobalObject = {LnduBaseUrl='https://example.invalid'}
        local function GetCldBusCredentials() return 'app', 'app-secret-test' end
        local count = 0
        local transport = {execute=function(request, callback)
            count=count+1
            assert(request.method=='POST' and request.url=='https://example.invalid/api/v3/openapi/device/property-latest')
            local body=json.decode(request.body)
            assert(body.vid=='test-vid' and body.data_source==0 and body.data_ids==nil, 'diagnostic must request ALL properties')
            callback(200,json.encode({code=20000,data={
                {data_id='indicator_candidate',value=1,define={type='bool'}},
                {data_id='auth_token',value='auth-token-test'},
                {data_id='config',value=json.encode({password='password-test',nested={AppSecret='app-secret-test'}})}
            }}),{},nil)
        end}
        ${section}
        assert(type(GET_DEVICE_PROPERTY)=='function', 'existing function must be callable from Composer Lua Command')
        GET_DEVICE_PROPERTY(nil, nil, false)
        assert(count==1)
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /ALL \(manual diagnostic\)/);
    assert.match(result.stdout, /HTTP status: 200/);
    assert.match(result.stdout, /indicator_candidate/);
    assert.match(result.stdout, /\[REDACTED\]/);
    assert.match(result.stdout, /Parsed properties:/);
    assert.doesNotMatch(result.stdout, /auth-token-test|app-secret-test|password-test/);
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
    document.getElementById('storageFormatDialog').hidden = true;
    document.getElementById('faceNamingSheet').hidden = true;
    document.getElementById('faceDeleteConfirmation').hidden = true;
    const context = vm.createContext({
        document,
        C4: { sendCommand: (...args) => commands.push(args) },
        console,
        JSON,
        URL,
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
    assert.equal(document.getElementById('motionDetectionType').value, '1');
    assert.equal(document.getElementById('motionZoneOpen').disabled, false);

    document.getElementById('motionDetectionToggle').checked = false;
    document.getElementById('motionDetectionToggle').dispatch('change');
    assert.equal(commands.at(-1)[0], 'SET_CAMERA_SETTING');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'motion.switch', value: 0 });

    context.updateCameraSettingsUI({ motion_switch: '0' });
    assert.equal(document.getElementById('motionSettingsGroup').hidden, true);
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
    assert.equal(element('nightVisionModeValue').textContent, 'Infrared mode');
    assert.equal(element('antiFlickerValue').textContent, 'OFF');
    assert.equal(element('flipImageToggle').checked, false);
    assert.equal(element('timeWatermarkToggle').checked, true);
    context.requestCameraSettings('video');
    assert.equal(element('nightVisionModeValue').textContent, '...');
    assert.equal(element('antiFlickerValue').textContent, '...');
    assert.equal(element('timeWatermarkToggle').disabled, true);
    respond({ icut_mode: 3, anti_flicker: 2, flip_swt: 1, mark: 1 });
    assert.equal(element('nightVisionMode').disabled, true);
    assert.equal(element('settingSaveOverlay').hidden, false);
});

test('K26 video sheets match the supplied options and send confirmed API mappings immediately', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.updateCameraSettingsUI({ icut_mode: 0, anti_flicker: 0, flip_swt: 1, mark: 1 });
    const modes = [[0, 'Infrared mode'], [1, 'Unenabled'], [2, 'Color light mode']];
    let options;
    for (const [index, [value, label]] of modes.entries()) {
        const previousLabel = element('nightVisionModeValue').textContent;
        context.openMotionOption('nightVisionMode');
        options = element('motionOptionBody').children;
        assert.equal(element('motionOptionTitle').textContent, 'Night Vision Mode');
        assert.equal(element('motionOptionConfirm').hidden, true);
        assert.deepEqual(options.map(option => option.children[0].textContent), modes.map(mode => mode[1]));
        assert.deepEqual(options.map(option => option.children[1].value), ['0', '1', '2']);
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

test('K26 motion loads without unrelated alarm fields and completed missing data does not wait for timeout', () => {
    const { context, document, navigation, timers } = fixture();
    const element = id => document.getElementById(id);
    context.requestCameraSettings('motion');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, complete: true, scope: 'motion',
        settings: { motion_switch: 1, motion_type: 0, motion_sen: 2, motion_x_y_w_h: '0:0:0:0', unknow_snapswt: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('motionSettingsGroup').hidden, false);
    assert.equal(element('faceSimilarity').hidden, true);
    assert.equal([...timers.values()].some(timer => timer.delay === 20000), false);
    context.requestCameraSettings('motion');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, complete: true, scope: 'motion',
        settings: { motion_switch: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(navigation.at(-1), 'homePanel');
    assert.equal(element('settingSaveToast').textContent, 'Required settings were not returned by the camera');
    assert.equal([...timers.values()].some(timer => timer.delay === 20000), false);
});

test('K26 motion and facial sections match the screenshots for all enabled combinations', () => {
    for (const motion of [0, 1]) {
        for (const facial of [0, 1]) {
            const { context, document } = fixture();
            const element = id => document.getElementById(id);
            context.requestCameraSettings('motion');
            context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, complete: true, scope: 'motion', settings: {
                motion_switch: motion, unknow_snapswt: facial,
                ...(motion ? { motion_type: 0, motion_sen: 2, motion_x_y_w_h: '0:0:0:0' } : {}),
                ...(facial ? { unknow_thld: .94, unknow_faceq: 2 } : {})
            } }));
            assert.equal(element('settingSaveOverlay').hidden, true);
            assert.equal(element('motionDetectionToggle').checked, motion === 1);
            assert.equal(element('faceRecEnable').checked, facial === 1);
            assert.equal(element('facialRecognitionRow').style.borderBottom, facial ? '' : '0');
            assert.equal(element('motionSettingsGroup').hidden, motion === 0);
            assert.equal(element('faceSimilarity').hidden, facial === 0);
            assert.equal(element('faceQuality').hidden, facial === 0);
            assert.equal(element('k26FaceManagement').hidden, facial === 0);
            if (motion) assert.equal(element('motionDetectionTypeValue').textContent, 'Motion Detection');
            if (facial) assert.equal(element('faceSimilarityValue').textContent, '94%');
        }
    }
    const panel = html.match(/<section id="motionDetectionPanel"[\s\S]*?<\/section>/)[0];
    for (const text of ['Motion Detection', 'Facial Recognition', 'Detection Type', 'Detection Sensitivity', 'Set Detection Zone',
        'Set the alarm area you are concerned about.', 'Face Similarity Threshold', 'Face Image Quality Threshold', 'Face Management']) {
        assert.ok(panel.includes(text), text + ' missing');
    }
    assert.doesNotMatch(panel, /Audible and Visual Alarm|motionAlarmToggle/);
    assert.match(html, /id="statusLightValue">\.\.\.<\/span>/);
});

test('K26 subsettings share readable fixed text, row, and switch sizes instead of compact overrides', () => {
    const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.match(css, /--setting-label-size:\s*20px/);
    assert.match(css, /--setting-value-size:\s*18px/);
    assert.match(css, /--setting-help-size:\s*16px/);
    assert.match(css, /--setting-row-height:\s*72px/);
    assert.match(css, /--setting-toggle-width:\s*80px/);
    assert.match(css, /\.settings-subpage \.settings-row, \.k26-motion-row\s*\{[^}]*min-height: var\(--setting-row-height\)/);
    assert.match(css, /\.panel:not\(#homePanel\) \.toggle\s*\{[^}]*width: var\(--setting-toggle-width\)/);
    assert.doesNotMatch(css, /(?:\.video-settings|#motionDetectionPanel) [^{]+\{[^}]*min-height:\s*44px/);
    assert.doesNotMatch(css, /(?:\.video-settings|#motionDetectionPanel) [^{]+\{[^}]*font-size:\s*(?:12|14)px/);
    assert.doesNotMatch(css, /font-size:\s*[^;}]*\b(?:vw|cqw)\b/);
    assert.doesNotMatch(css, /\.(?:face-name-input|face-meta|empty-faces)\s*\{[^}]*font-size:\s*\d+px/);
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
    context.updateFacesFromDriver([{ id: 11, face_id: 'one', note: 'One' }]);
    context.openFaceNaming('one');
    element('faceNamingInput').value = 'Renamed';
    context.confirmFaceNaming();
    assert.equal(element('settingSaveOverlay').hidden, false);
    assert.equal(commands.filter(command => command[0] === 'UPDATE_STRANGER_NOTE').length, 1);
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('faceNamingSheet').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Settings saved');
});

test('K26 Face Management matches VD05 list, naming sheet, pagination, and safe names', () => {
    const { context, document, commands, app } = fixture();
    const element = id => document.getElementById(id);
    context.loadFaces();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { page: 1, page_size: 50 });
    assert.equal(element('faceList').textContent, 'Loading faces...');
    context.onDataToUi(JSON.stringify({ type: 'stranger_faces', success: true, data: { page: 1, total: 3, notes: [
        { id: 17, face_id: 'face-one', note: '<img src=x onerror=alert(1)>', face_img_url: 'javascript:alert(1)', updated_at: '1792141615' },
        { id: 18, face_id: 'face-two', note: 'Visitor Two', face_img_url: 'https://example.invalid/face.jpg', updated_at: '2026-10-16 12:30:00' }
    ] } }));
    assert.equal(element('faceList').children.length, 2);
    assert.equal(element('faceList').children[0].children[1].children[0].textContent, '<img src=x onerror=alert(1)>');
    assert.equal(element('faceList').children[0].children[1].children[1].textContent,
        `Last Updated Time:${context.formatFaceTimestamp('1792141615')}`);
    assert.equal(element('faceLoadMore').hidden, false);
    assert.match(element('faceList').children[0].children[0].className, /face-image-placeholder/);
    context.openFaceNaming('face-one');
    assert.equal(element('faceNamingSheet').hidden, false);
    assert.equal(element('faceNamingInput').value, '<img src=x onerror=alert(1)>');
    assert.equal(app.inert, true);
    element('faceNamingInput').value = 'Front Door Guest';
    context.confirmFaceNaming();
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { face_id: 'face-one', note: 'Front Door Guest' });
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'stranger_note_updated', success: true, face_id: 'face-one', note: 'Front Door Guest' }));
    assert.equal(element('faceNamingSheet').hidden, true);
    assert.equal(element('faceList').children[0].children[1].children[0].textContent, 'Front Door Guest');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { page: 1, page_size: 50 });
    context.onDataToUi(JSON.stringify({ type: 'stranger_faces', success: true, data: { page: 1, total: 2, notes: [
        { id: 17, face_id: 'face-one', note: 'Front Door Guest' }, { id: 18, face_id: 'face-two', note: 'Visitor Two' }
    ] } }));
    context.toggleFaceEditMode();
    assert.equal(element('faceEditToolbar').hidden, false);
    context.selectAllFaces(true);
    assert.equal(element('faceSelectedCount').textContent, '2');
    context.openFaceDeleteConfirmation();
    assert.equal(element('faceDeleteConfirmation').hidden, false);
    context.confirmFaceDeletion();
    assert.equal(commands.at(-1)[0], 'DELETE_STRANGER_FACES');
    assert.deepEqual(JSON.parse(JSON.parse(commands.at(-1)[1]).ids_json), [17, 18]);
    context.onDataToUi(JSON.stringify({ type: 'stranger_faces_deleted', success: true }));
    assert.equal(element('faceList').children.length, 1);
    assert.equal(element('faceList').children[0].className, 'face-empty');
    assert.equal(element('faceEditToolbar').hidden, true);
    assert.match(html, /id="faceEditButton"/);
    assert.match(html, /id="faceNamingSheet"/);
    assert.match(html, /id="faceDeleteConfirmation"/);
    assert.doesNotMatch(html, /saveFacesBtn|Save Name Changes/);
});

test('K26 face deletion validates numeric note IDs and reports the API acknowledgement', () => {
    const start = driver.indexOf('function DELETE_STRANGER_FACES(');
    const section = driver.slice(start, driver.indexOf('function TAKE_SNAPSHOT_FOR_UI(', start));
    const lua = `
        local json = require('CldBusApi.dkjson')
        local _props = { VID='camera-1', ['Auth Token']='token' }
        local Properties = {}
        local GlobalObject = {LnduBaseUrl='https://example.invalid', CldBusAppId='test'}
        local output, requests = {}, {}
        local api_code = 20000
        local function SendStrangerFacesToUI(data) output[#output+1]=data end
        local function print() end
        local transport = {execute=function(request, callback)
            local body=json.decode(request.body)
            assert(request.url=='https://example.invalid/api/v3/openapi/stranger-note-del')
            assert(request.method=='POST' and body.vid=='camera-1')
            assert(type(body.ids)=='table' and body.ids[1]==17 and body.ids[2]==18)
            requests[#requests+1]=body
            callback(200,json.encode({code=api_code,message='rejected'}),{},nil)
        end}
        ${section}
        DELETE_STRANGER_FACES({ids_json='[17,"18"]'})
        assert(#requests==1 and output[#output].type=='stranger_faces_deleted' and output[#output].success)
        DELETE_STRANGER_FACES({ids_json='[0]'}); assert(#requests==1 and output[#output].success==false)
        DELETE_STRANGER_FACES({ids_json='["not-an-id"]'}); assert(#requests==1 and output[#output].success==false)
        api_code=400
        DELETE_STRANGER_FACES({ids_json='[17,18]'})
        assert(#requests==2 and output[#output].type=='stranger_faces_deleted' and output[#output].success==false)
        io.write('K26 face delete assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', lua], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /K26 face delete assertions passed/);
    assert.match(driver, /if strCommand == "DELETE_STRANGER_FACES" then\s+DELETE_STRANGER_FACES\(tParams\)/);
    assert.match(fs.readFileSync(path.join(root, 'driver.xml'), 'utf8'), /<name>DELETE_STRANGER_FACES<\/name>/);
});

test('K26 home follows the reference groups and keeps Audio Settings focused on speaker volume', () => {
    const section = id => html.match(new RegExp('<section id="' + id + '"[\\s\\S]*?<\\/section>'))[0];
    const viewer = section('viewerPanel');
    const home = section('homePanel');
    const power = section('powerManagementPanel');
    assert.match(html, /<section id="viewerPanel" class="panel active">/);
    assert.match(viewer, /id="viewerDeviceName"/);
    assert.match(viewer, /class="camera-view"[\s\S]*class="camera-stage"[\s\S]*class="camera-frame"[\s\S]*id="k26StreamStatus"/);
    assert.match(viewer, /class="camera-footer"[\s\S]*id="k26ViewerFullscreen"/);
    assert.match(viewer, /class="toolbar"[\s\S]*id="k26ViewerSnapshot"[\s\S]*id="k26ViewerMic"/);
    const alternateToolbar = viewer.match(/<div class="toolbar" id="k26ViewerAlternateToolbar"[\s\S]*?<\/div>/)[0];
    assert.match(alternateToolbar, /id="k26ViewerAlarm"[\s\S]*id="k26ViewerAlbum"[\s\S]*id="k26ViewerNotifications"[\s\S]*id="k26ViewerToolbarBack"/);
    assert.match(alternateToolbar, /id="k26ViewerAlarm"[^>]*disabled/);
    assert.match(html, /#k26ViewerAlarm:disabled \{ opacity: \.4; cursor: not-allowed; \}/);
    assert.doesNotMatch(alternateToolbar, /k26ViewerReboot|k26ViewerSettings/);
    assert.match(javascript, /function openK26ViewerNotifications\([\s\S]*?requestK26Notifications\(1\)/);
    assert.match(javascript, /C4\.sendCommand\('GET_NOTIFICATION_HISTORY'/);
    assert.match(driver, /function GET_NOTIFICATION_HISTORY\([\s\S]*?\/api\/v3\/openapi\/notifications\/query/);
    assert.match(fs.readFileSync(path.join(root, 'driver.xml'), 'utf8'), /<name>GET_NOTIFICATION_HISTORY<\/name>/);
    assert.match(viewer, /id="k26ViewerZoom"[^>]*disabled/);
    assert.match(viewer, /id="k26ViewerSnapshot"[^>]*disabled/);
    assert.doesNotMatch(viewer, /id="k26ViewerMic"[^>]*disabled/);
    assert.doesNotMatch(viewer, /id="k26ViewerEndCall"[^>]*disabled/);
    assert.match(javascript, /function updateViewerSpeaker\([\s\S]*?button\.disabled = false/);
    assert.match(javascript, /addEventListener\('click', toggleK26ViewerSpeaker\)/);
    assert.match(viewer, /id="k26ZoomChip"[^>]*aria-label="Change zoom"/);
    assert.match(html, /id="k26ViewerAlternateToolbar"[^>]*hidden/);
    assert.match(javascript, /function fitK26LivePreviewFrame\([\s\S]*?stage\.clientHeight \* 4 \/ 3/);
    assert.match(javascript, /addEventListener\('click', cycleK26LiveZoom\)/);
    assert.match(viewer, /onclick="show\('homePanel'\)" aria-label="Settings"/);
    assert.match(home, /onclick="show\('viewerPanel'\)" aria-label="Back to camera"/);
    assert.match(home, /id="firmwareAvailability"/);
    assert.match(home, /onclick="openC4AuthenticationService\(\)"[\s\S]*?C4 Authentication Service/);
    assert.doesNotMatch(home, /<button class="settings-row" disabled[^>]*>[\s\S]*?C4 Authentication Service/);
    assert.match(section('c4AuthenticationPanel'), /id="copyUserIdentifier"[\s\S]*Device Pairing Mode/);
    assert.match(home, /onclick="show\('powerManagementPanel'\)"[^>]*><i data-lucide="battery-charging"><\/i><span>Power Management<\/span>/);
    assert.match(power, /Battery Level[\s\S]*id="powerBatteryLevel"/);
    assert.match(html, /id === 'powerManagementPanel'[\s\S]*requestCameraSettings\('information'\)/);
    const labels = ['Motion Detection', 'Power Management', 'Status Light', 'Video Settings', 'Audio Settings',
        'Notification Settings', 'Internal Storage', 'Device Information', 'Check Firmware Update', 'C4 Authentication Service', 'Delete Device'];
    let previous = -1;
    for (const label of labels) {
        const position = home.indexOf('>' + label + '<');
        assert.ok(position > previous, label + ' missing or out of order');
        previous = position;
    }
    assert.doesNotMatch(home, /Start or end a call|K26 Camera Controls|Take Snapshot|Reboot/);
    assert.doesNotMatch(section('audioSettingsPanel'), /show\('micPanel'\)|>Microphone</);
    assert.match(section('micPanel'), /show\('audioSettingsPanel'\)/);
    assert.match(section('rebootPanel'), /show\('deviceInformationPanel'\)/);
    assert.doesNotMatch(section('deviceInformationPanel'), /Last Updated|informationLastUpdated/);
    assert.match(section('deviceInformationPanel'), /information-protection|Wi-Fi Name/);
    assert.match(home, /id="statusLight"[^>]*disabled/);
    assert.doesNotMatch(home, /current version is|checked/);
    assert.match(html, /<footer class="footer" hidden>[\s\S]*id="footerDeviceVersion"[\s\S]*id="footerFirmwareVersion"[\s\S]*id="footerReleaseDate"/);
    assert.match(html, /document\.querySelector\('\.footer'\)\.hidden = id === 'viewerPanel' \|\| id === 'facialRecPanel'/);
    assert.match(html, /\.information-serial > span[^\n]*white-space:nowrap/);
    assert.match(home, /id="homeModelName" class="settings-device-name">Outdoor Camera \(Solar\)<\/div>/);
    assert.match(home, /id="homeDeviceName" class="settings-device-type">\.\.\.<\/div>/);
    const { context, document } = fixture();
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, device_name: 'Outdoor Camera', version: '4.2', release_date: '2026-10-16', battery: 76 }));
    assert.equal(document.getElementById('homeDeviceName').innerText, 'Outdoor Camera');
    assert.equal(document.getElementById('viewerDeviceName').innerText, 'Outdoor Camera');
    assert.equal(document.getElementById('firmwareVersion').innerText, '4.2');
    assert.equal(document.getElementById('powerBatteryLevel').textContent, '76%');
    assert.equal(document.getElementById('footerDeviceVersion').textContent, 'Device: Outdoor Camera');
    assert.equal(document.getElementById('footerFirmwareVersion').textContent, 'Firmware: 4.2');
    assert.equal(document.getElementById('footerReleaseDate').textContent, 'Release: 2026-10-16');
    context.onDataToUi(JSON.stringify({ device_name_updated: true, device_name: 'Driveway' }));
    assert.equal(document.getElementById('homeDeviceName').innerText, 'Driveway');
    assert.equal(document.getElementById('viewerDeviceName').innerText, 'Driveway');
    assert.equal(document.getElementById('deviceVersion').innerText, 'Driveway');
});

test('K26 notification cards use VD05 event titles and descriptions', () => {
    const { context, document } = fixture();
    context.renderK26Notifications([
        { message_type: 'move detect', device_name: 'CA Outdoor Camera' },
        { message_type: 'door bell', device_name: 'CA Outdoor Camera' }
    ]);
    const cards = document.getElementById('notificationHistoryList').children;
    assert.equal(cards[0].children[1].children[0].textContent, 'Motion Detection Event');
    assert.equal(cards[0].children[1].children[1].textContent, 'CA Outdoor Camera detected motion');
    assert.equal(cards[1].children[1].children[0].textContent, 'Doorbell Call Event');
    assert.equal(cards[1].children[1].children[1].textContent, 'CA Outdoor Camera received a visitor click on the doorbell');
    assert.match(html, /\.notification-history-detail\s*\{/);
});

test('K26 viewer shows the VD05 unavailable message without attempting a live stream', () => {
    const { context, document } = fixture();
    const status = document.getElementById('k26StreamStatus');
    assert.equal(status.textContent, 'Live stream not available');
    context.onDataToUi(JSON.stringify({ type: 'device_info', success: true, ip: '192.0.2.20' }));
    assert.equal(status.textContent, 'Live stream not available');
    assert.doesNotMatch(javascript, /updateK26LiveStream|video\.mjpg|Connecting to live stream/);
});

test('K26 initial page requests only device info and Status Light, ignoring unrelated and stale responses', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    context.requestCameraSettings('home');
    assert.equal(commands.length, 2);
    assert.equal(commands[0][0], 'GET_DEVICE_INFO');
    assert.equal(commands[1][0], 'GET_CAMERA_SETTINGS');
    const homeRequest = JSON.parse(commands[0][1]);
    assert.equal(homeRequest.scope, 'home');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', scope: 'video', request_id: homeRequest.request_id,
        success: true, settings: { icut_mode: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'device_info', ...homeRequest, success: true, device_name: 'Outdoor Camera' }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...homeRequest, success: true, complete: true, settings: { indicator_swt: 1 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    context.requestCameraSettings('video');
    const videoRequest = JSON.parse(commands.at(-1)[1]);
    assert.equal(videoRequest.scope, 'video');
    context.onDataToUi(JSON.stringify({ type: 'device_info', ...homeRequest, success: false, error: 'Late home response' }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...videoRequest, success: true,
        settings: { icut_mode: 0, anti_flicker: 0, flip_swt: 0, mark: 1 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    const startup = javascript.slice(javascript.indexOf("document.addEventListener('DOMContentLoaded'"), javascript.indexOf('function requestCameraSettings('));
    assert.match(startup, /requestCameraSettings\('home'\)/);
    assert.doesNotMatch(startup, /requestDeviceInfo\(\)/);
});

test('K26 Status Light uses indicator_swt and home waits only for its two responses in either order', () => {
    for (const lightFirst of [true, false]) {
        const { context, document, commands } = fixture();
        const element = id => document.getElementById(id);
        context.requestCameraSettings('home');
        const request = JSON.parse(commands[0][1]);
        const info = { type: 'device_info', ...request, success: true, device_name: 'Outdoor Camera' };
        const light = { type: 'camera_settings', ...request, success: true, complete: true, settings: { indicator_swt: 1 } };
        assert.equal(commands.length, 2);
        assert.equal(element('statusLight').disabled, true);
        assert.equal(element('statusLight').indeterminate, true);
        context.onDataToUi(JSON.stringify(lightFirst ? light : info));
        assert.equal(element('settingSaveOverlay').hidden, false);
        context.onDataToUi(JSON.stringify(lightFirst ? info : light));
        assert.equal(element('settingSaveOverlay').hidden, true);
        assert.equal(element('statusLight').checked, true);
        assert.equal(element('statusLight').indeterminate, false);
        assert.equal(element('statusLight')['aria-busy'], 'false');
        assert.equal(element('statusLightValue').textContent, 'On');
        assert.equal(element('statusLightValue').hidden, true);
        element('statusLight').checked = false;
        element('statusLight').dispatch('change');
        assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'indicator_swt', value: 0 });
        assert.equal(element('settingSaveOverlay').hidden, false);
        context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Rejected' }));
        assert.equal(element('statusLight').checked, true);
        element('statusLight').checked = false;
        element('statusLight').dispatch('change');
        context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { indicator_swt: 0 } }));
        assert.equal(element('statusLight').checked, false);
        assert.equal(element('statusLightValue').textContent, 'Off');
        context.requestCameraSettings('motion');
        context.updateCameraSettingsUI({ motion_switch: 0, unknow_snapswt: 0 });
        assert.equal(element('statusLight').checked, false);
        assert.equal(element('statusLight').disabled, false);
        context.requestCameraSettings('home');
        assert.equal(element('statusLight').disabled, true);
        assert.equal(element('statusLight').indeterminate, true);
        assert.equal(element('statusLightValue').textContent, '...');
    }
});

test('K26 audio requests only speaker volume and waits for its API value and save acknowledgement', () => {
    const { context, document, commands } = fixture();
    const element = id => document.getElementById(id);
    const viewerSpeaker = element('k26ViewerSpeaker');
    assert.equal(viewerSpeaker.disabled, false);
    assert.equal(viewerSpeaker.title, 'Load speaker volume');
    context.requestCameraSettings('audio');
    const request = JSON.parse(commands[0][1]);
    assert.equal(request.scope, 'audio');
    assert.equal(element('speakerVolume').disabled, true);
    assert.equal(element('speakerVolumeValue').textContent, '...');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true, settings: { icut_mode: 0 } }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true, settings: { beep_vol: '8' } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('speakerVolume').value, '8');
    assert.equal(element('speakerVolumeValue').textContent, '8');
    assert.equal(viewerSpeaker.disabled, false);
    assert.equal(viewerSpeaker.title, 'Sound on');
    assert.equal(viewerSpeaker.getAttribute('aria-label'), 'Sound on');
    viewerSpeaker.dispatch('click');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'beep_vol', value: 0 });
    assert.equal(viewerSpeaker.disabled, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { beep_vol: 0 } }));
    assert.equal(viewerSpeaker.disabled, false);
    assert.equal(viewerSpeaker.title, 'Sound off');
    assert.equal(viewerSpeaker.getAttribute('aria-label'), 'Sound off');
    assert.equal(element('settingSaveToast').textContent, 'Sound off');
    element('speakerVolume').value = '10';
    element('speakerVolume').dispatch('input');
    assert.equal(commands.length, 2);
    element('speakerVolume').dispatch('change');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'beep_vol', value: 10 });
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_setting_result', success: false, error: 'Rejected' }));
    assert.equal(element('speakerVolume').value, '8');
    element('speakerVolume').value = '0';
    element('speakerVolume').dispatch('change');
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { beep_vol: 0 } }));
    assert.equal(element('speakerVolumeValue').textContent, '0');
    assert.equal(element('settingSaveOverlay').hidden, true);
});

test('K26 viewer speaker loads volume on demand and then toggles to Sound off', () => {
    const { context, document, commands } = fixture();
    const speaker = document.getElementById('k26ViewerSpeaker');
    assert.equal(speaker.disabled, false);
    speaker.dispatch('click');
    assert.equal(commands.at(-1)[0], 'GET_CAMERA_SETTINGS');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { scope: 'audio' });
    assert.equal(speaker.disabled, true);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', scope: 'audio', success: true, settings: { beep_vol: 6 } }));
    assert.equal(commands.at(-1)[0], 'SET_CAMERA_SETTING');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { key: 'beep_vol', value: 0 });
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', success: true, setting_saved: true, settings: { beep_vol: 0 } }));
    assert.equal(speaker.disabled, false);
    assert.equal(speaker.title, 'Sound off');
    assert.equal(speaker.getAttribute('aria-label'), 'Sound off');
});

test('K26 storage matches VD05 and sends the format action after one confirmation', () => {
    const { context, document, commands, app } = fixture();
    const element = id => document.getElementById(id);
    context.requestCameraSettings('storage');
    const request = JSON.parse(commands[0][1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true, settings: { stored_status: 0, stored_capacity: 29 } }));
    assert.equal(element('settingSaveOverlay').hidden, false);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true, settings: { stored_usage: 25 } }));
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('storageTotal').textContent, '29 GB');
    assert.equal(element('storageAvailable').textContent, '21.75 GB');
    assert.match(html, /storage-protection-title">41 Days/);
    assert.match(html, /class="storage-footer"[\s\S]*id="formatStorageButton"/);
    context.openStorageFormat();
    assert.equal(element('storageFormatDialog').hidden, false);
    assert.equal(app.inert, true);
    context.closeStorageFormat();
    assert.equal(commands.length, 1);
    assert.equal(app.inert, false);
    context.openStorageFormat();
    context.confirmStorageFormat();
    assert.equal(commands.at(-1)[0], 'FORMAT_STORAGE');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { confirmed: true });
    assert.equal(element('storageFormatDialog').hidden, true);
    assert.equal(element('settingSaveLabel').textContent, 'Formatting...');
    context.closeStorageFormat();
    assert.equal(element('storageFormatDialog').hidden, true);
    context.onDataToUi(JSON.stringify({ type: 'storage_format', success: false, error: 'Rejected' }));
    assert.equal(element('storageFormatDialog').hidden, true);
    assert.equal(element('settingSaveOverlay').hidden, true);
    context.openStorageFormat();
    context.confirmStorageFormat();
    context.onDataToUi(JSON.stringify({ type: 'storage_format', success: true }));
    assert.equal(element('storageFormatDialog').hidden, true);
    assert.equal(element('settingSaveToast').textContent, 'Format command accepted');
    assert.equal(element('formatStorageButton').disabled, true);
    context.requestCameraSettings('storage');
    const noCard = JSON.parse(commands.at(-1)[1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...noCard, success: true, settings: { stored_status: 1 } }));
    assert.equal(element('storageStatus').textContent, 'No SD card');
    assert.equal(element('settingSaveOverlay').hidden, true);
    assert.equal(element('formatStorageButton').disabled, true);
    assert.equal(element('storageAvailable').textContent, '...');
    context.requestCameraSettings('storage');
    const uninitialized = JSON.parse(commands.at(-1)[1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...uninitialized, success: true, settings: { stored_status: 2 } }));
    assert.equal(element('storageStatus').textContent, 'Filesystem not initialized');
    assert.equal(element('formatStorageButton').disabled, false);
    assert.doesNotMatch(html, /37 Days|29 GB/);
});

test('K26 app-notification layout does not reuse Control4 notification properties or invent states', () => {
    const { context, document, commands } = fixture();
    context.requestCameraSettings('notifications');
    const request = JSON.parse(commands[0][1]);
    context.onDataToUi(JSON.stringify({ type: 'camera_settings', ...request, success: true, supported: false, settings: {} }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    for (const id of ['appAlertNotification', 'appMotionNotification', 'appOfflineNotification', 'appEventNotification']) {
        assert.equal(document.getElementById(id).disabled, true);
        assert.equal(document.getElementById(id).indeterminate, true);
    }
    assert.equal(commands.length, 1);
    const panel = html.match(/<section id="notificationSettingsPanel"[\s\S]*?<\/section>/)[0];
    for (const label of ['Receive App Notifications', 'Alert Notification', 'Motion Detection', 'Offline Notification', 'Event Notification']) assert.ok(panel.includes(label));
    assert.doesNotMatch(panel, /Enable Alert Notifications|Enable Info Notifications/);
});

test('K26 Device Information has its own request and displays API data without sample identities', () => {
    const { context, document, commands } = fixture();
    context.requestCameraSettings('information');
    assert.equal(commands[0][0], 'GET_DEVICE_INFO');
    const request = JSON.parse(commands[0][1]);
    context.onDataToUi(JSON.stringify({ type: 'device_info', ...request, success: true, device_name: 'Driveway',
        user_identifier: 'installer@example.com', can_update: false,
        serial: 'serial-from-api', timezone: 'Asia/Manila', ip: '192.0.2.1', mac: 'api-mac', wifi: 'API SSID', rssi: 0 }));
    assert.equal(document.getElementById('settingSaveOverlay').hidden, true);
    for (const [id, expected] of Object.entries({ deviceSerial: 'serial-from-api', deviceTimezone: 'Asia/Manila',
        deviceIp: '192.0.2.1', deviceMac: 'api-mac', deviceWifi: 'API SSID', deviceSignal: '0' })) {
        assert.equal(document.getElementById(id).textContent, expected);
    }
    assert.equal(document.getElementById('copyDeviceSerial').disabled, false);
    assert.equal(document.getElementById('c4UserIdentifier').textContent, 'installer@example.com');
    assert.equal(document.getElementById('copyUserIdentifier').disabled, false);
    assert.equal(document.getElementById('firmwareAvailability').textContent, 'The current version is the latest.');
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

test('K26 device-name results are sent through the UI proxy channel', () => {
    const start = driver.indexOf('function SET_DEVICE_NAME(');
    const end = driver.indexOf('function REBOOT_DEVICE(', start);
    const handler = driver.slice(start, end);
    assert.ok(start >= 0 && end > start, 'device-name handler boundaries missing');
    assert.match(handler, /local function send_name_result\([\s\S]*?SendDeviceInfoToUI\(/);
    assert.match(handler, /send_name_result\(true\)/);
    assert.match(handler, /send_name_result\(false,/);
    assert.doesNotMatch(handler, /C4:SendDataToUI/);
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

test('K26 restart submits ac_restart and reports the verified API result', () => {
    const start = driver.indexOf('function REBOOT_DEVICE(');
    const end = driver.indexOf('\nfunction DELETE_STRANGER_FACES(', start);
    const handler = driver.slice(start, end);
    assert.ok(start >= 0 && end > start, 'restart handler boundaries missing');

    const source = `
        local json = require('CldBusApi.dkjson')
        local _props = { VID='camera-1', ['Auth Token']='token' }
        local Properties = { ['Base API URL']='https://example.invalid', AppId='test-app' }
        local GlobalObject = { LnduBaseUrl='https://example.invalid', CldBusAppId='test-app' }
        local requests, messages = {}, {}
        local status_code, api_code, transport_error = 200, 20000, nil
        local function SendDeviceInfoToUI(value) messages[#messages+1]=value end
        local function print() end
        local C4 = { UpdateProperty=function() end }
        local transport = { execute=function(request, callback)
            requests[#requests+1]=request
            callback(status_code, json.encode({code=api_code,message='success'}), {}, transport_error)
        end }
        ${handler}
        assert(REBOOT_DEVICE({}) == true)
        local request=requests[1]
        local body=json.decode(request.body)
        assert(request.url=='https://example.invalid/api/v3/openapi/device/do-action')
        assert(request.method=='POST' and request.headers['Authorization']=='Bearer token')
        assert(request.headers['App-Name']=='test-app')
        assert(body.vid=='camera-1' and body.action_id=='ac_restart')
        local params=json.decode(body.input_params)
        assert(type(params.t)=='number' and params.t>0)
        assert(messages[#messages].type=='restart_result' and messages[#messages].success==true)

        api_code=400
        REBOOT_DEVICE({})
        assert(messages[#messages].type=='restart_result' and messages[#messages].success==false)

        api_code=20000
        status_code=503
        REBOOT_DEVICE({})
        assert(messages[#messages].success==false)

        local request_count=#requests
        _props['Auth Token']=''
        assert(REBOOT_DEVICE({})==false and #requests==request_count)
        assert(messages[#messages].type=='restart_result' and messages[#messages].success==false)
        io.write('K26 restart assertions passed')
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /K26 restart assertions passed/);
});
