const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www/contents/index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'www/contents/javascript/index.js'), 'utf8');
const driver = fs.readFileSync(path.join(root, 'driver.lua'), 'utf8');

function eventTarget() {
    const listeners = {};
    return {
        addEventListener(name, callback) { (listeners[name] ||= new Set()).add(callback); },
        removeEventListener(name, callback) { listeners[name]?.delete(callback); },
        dispatch(name, event = {}) {
            for (const callback of listeners[name] || []) {
                try { callback.call(this, { target: this, ...event }); } catch (error) { /* page scripts may throw on commented-out markup */ }
            }
        }
    };
}

function openPage() {
    const elements = {};
    for (const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)) {
        const classes = new Set((match[0].match(/class="([^"]+)"/)?.[1] || '').split(' '));
        const element = {
            ...eventTarget(), checked: false, disabled: false, value: '', innerText: '', children: [], dataset: {}, style: {},
            classList: { add: value => classes.add(value), remove: value => classes.delete(value), contains: value => classes.has(value) },
            appendChild(child) { this.children.push(child); },
            querySelectorAll() { return []; },
            removeAttribute() {}
        };
        Object.defineProperty(element, 'innerHTML', {
            get() { return this.html || ''; },
            set(value) { this.html = value; this.children = []; }
        });
        elements[match[1]] = element;
    }
    const document = {
        ...eventTarget(),
        visibilityState: 'visible',
        getElementById: id => elements[id] || null,
        createElement: () => ({ className: '', innerHTML: '', appendChild() {} }),
        querySelectorAll: selector => selector === '.panel'
            ? Object.values(elements).filter(element => element.classList.contains('panel'))
            : []
    };
    const commands = [];
    let clock = 1_000_000;
    class FakeDate extends Date { static now() { return clock; } }
    const window = eventTarget();
    const context = vm.createContext({
        document, window, Date: FakeDate,
        console: { log() {}, error() {}, warn() {} },
        C4: { sendCommand: (...args) => commands.push(args), subscribeToDataToUi() {}, subscribeToVariable() {} },
        lucide: { createIcons() {} },
        setTimeout() {}
    });
    for (const match of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)) vm.runInContext(match[1], context);
    vm.runInContext(script, context);
    document.dispatch('DOMContentLoaded');
    return {
        context, document, window, elements, commands,
        advance: ms => { clock += ms; },
        faceRequests: () => commands.filter(command => command[0] === 'GET_STRANGER_FACES').length,
        deliver: payload => context.onDataToUi(JSON.stringify(payload)),
        evaluate: code => vm.runInContext(code, context)
    };
}

test('settings page has no face management and never requests face lists', () => {
    const page = openPage();
    assert.equal(page.elements.faceList, undefined);
    assert.equal(page.elements.saveFacesBtn, undefined);
    assert.ok(!html.includes('Face Management'));
    assert.ok(!html.includes('manage enrolled faces'));
    page.window.dispatch('pageshow');
    page.window.dispatch('focus');
    page.advance(2000);
    page.context.show('facialRecPanel');
    page.window.dispatch('focus');
    page.document.dispatch('visibilitychange');
    page.context.onVariable({ name: 'LAST_MENU_SELECTED', value: 'security' });
    assert.equal(page.faceRequests(), 0);
    page.deliver({ type: 'stranger_faces', success: false, error: 'HTTP Error: 503' });
    assert.equal(page.elements.successModal.classList.contains('show'), false);
});

test('driver fetches property-latest when the WebView requests settings, only for the settings binding', () => {
    const handlerStart = driver.indexOf('function ReceivedFromProxy(');
    const handler = driver.slice(handlerStart, driver.indexOf('\nend', handlerStart) + 4);
    const source = `
        local calls = {}
        local function print() end
        local function GET_DEVICE_INFO() calls[#calls + 1] = "info" end
        local function GET_STRANGER_FACES(params) calls[#calls + 1] = "faces" end
        local function GET_DEVICE_PROPERTY(property_name, callback)
            assert(property_name == nil)
            calls[#calls + 1] = "property-latest"
            callback({ unknow_snapswt = 1, unknow_thld = 0.94, unknow_faceq = 2 })
        end
        local function SendDeviceInfoToUI(payload)
            assert(payload.face_settings.unknow_snapswt == 1)
            assert(payload.face_settings.unknow_thld == 0.94)
            assert(payload.face_settings.unknow_faceq == 2)
            calls[#calls + 1] = payload.type
        end
        local function SET_CAMERA_IP() end
        local C4 = { SetTimer = function(self, ms, callback) callback() end }
        ${handler}
        ReceivedFromProxy(5005, "SELECT", { Menu = "security" })
        assert(#calls == 1 and calls[1] == "info", table.concat(calls, ","))
        ReceivedFromProxy(5005, "REQUEST_SETTINGS", {})
        assert(calls[2] == "property-latest" and calls[3] == "device_settings", table.concat(calls, ","))
        calls = {}
        ReceivedFromProxy(5001, "SELECT", {})
        ReceivedFromProxy(5005, "OTHER", {})
        ReceivedFromProxy(5001, "REQUEST_SETTINGS", {})
        assert(#calls == 0, "unrelated commands must not refresh")
        io.write("Lua SELECT assertions passed")
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Lua SELECT assertions passed/);
});

test('device settings update the toggle without exposing API diagnostics', () => {
    const page = openPage();
    page.deliver({ type: 'device_settings', success: true,
        settings: { unknow_snapswt: 1, unknow_thld: 0.94, motion: { switch: 1 } },
        face_settings: { unknow_snapswt: 1, unknow_thld: 0.94 } });
    assert.equal(page.evaluate('latestDeviceSettings.motion.switch'), 1);
    assert.equal(page.elements.faceRecStatus.innerText, 'Enabled');
    assert.equal(page.elements.faceApiSettings, undefined);
    assert.equal(page.elements.faceApiSettingsStatus, undefined);
    assert.ok(!html.includes('Changes are sent to the API'));
});

test('VD05 GET_DEVICE_PROPERTY follows K15 property-latest request and returns parsed data_id values', () => {
    const start = driver.lastIndexOf('function GET_DEVICE_PROPERTY(property_name, callback)');
    const end = driver.indexOf('-- UPDATE STRANGER NOTE (OP12)', start);
    assert.ok(start >= 0 && end > start, 'GET_DEVICE_PROPERTY function not found');
    const getter = driver.slice(start, end);
    const source = `
        local json = require("CldBusApi.dkjson")
        local _props = { ["Auth Token"] = "token", VID = "vid-1" }
        local Properties = { AppId = "app", AppSecret = "secret" }
        local GlobalObject = { LnduBaseUrl = "https://example.invalid" }
        local function GetCldBusCredentials() return "app", "secret" end
        local response = json.encode({ code=20000, message="success", data={
            {data_id="unknow_snapswt",value=1,define="enabled switch"}, {data_id="unknow_thld",value=0.94}, {data_id="motion",value="{\\"switch\\":1}"}
        } })
        local captured
        local transport = { execute = function(request, callback)
            assert(request.url == "https://example.invalid/api/v3/openapi/device/property-latest")
            assert(request.method == "POST")
            local body = json.decode(request.body)
            assert(body.vid == "vid-1" and body.data_source == 0)
            assert(body.data_ids == nil)
            callback(200, response, {}, nil)
        end }
        ${getter}
        GET_DEVICE_PROPERTY(nil, function(values) captured = values end)
        assert(captured.unknow_snapswt == 1 and captured.unknow_thld == 0.94)
        assert(captured.motion == "{\\"switch\\":1}")
        response = json.encode({code=20000,data={{data_id="unknow_snapswt",value=0}}})
        GET_DEVICE_PROPERTY(nil, function(values) captured = values end)
        assert(captured.unknow_snapswt == 0)
        response = json.encode({code=20000,message="success",data={{data_id="motion",value="{}"},{data_id="beep_vol",value=5}}})
        GET_DEVICE_PROPERTY(nil, function(values) captured = values end)
        assert(captured.motion == "{}" and captured.beep_vol == 5)
        print("VD05 GET_DEVICE_PROPERTY assertions passed")
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /VD05 GET_DEVICE_PROPERTY assertions passed/);
    assert.match(result.stdout, /property-latest returned 3 data_id values/);
    assert.match(result.stdout, /face-recognition candidate unknow_snapswt = 1/);
    assert.match(result.stdout, /face-recognition define unknow_snapswt = enabled switch/);
    assert.match(result.stdout, /Facial Recognition: ENABLED \(unknow_snapswt=1\)/);
    assert.match(result.stdout, /Facial Recognition: DISABLED \(unknow_snapswt=0\)/);
    assert.match(result.stdout, /No face-recognition data_id values returned by property-latest/);
});

test('facial recognition state uses the confirmed unknow_snapswt API value', () => {
    const page = openPage();
    for (const value of [1, 0, '1', '0']) {
        page.deliver({ type: 'device_settings', success: true, settings: { unknow_snapswt: value } });
        assert.equal(page.elements.faceRecEnable.checked, Number(value) === 1);
        assert.equal(page.elements.faceRecEnable.disabled, false);
        assert.equal(page.elements.faceRecStatus.innerText, Number(value) === 1 ? 'Enabled' : 'Disabled');
    }
    page.deliver({ type: 'device_settings', success: false, settings: {} });
    assert.equal(page.elements.faceRecEnable.disabled, true);
    assert.equal(page.elements.faceRecStatus.innerText, 'Unavailable');
});

test('face toggle sends the confirmed API key and rolls back on update failure', () => {
    const page = openPage();
    page.deliver({ type: 'device_settings', success: true, settings: { unknow_snapswt: 0 } });
    page.elements.faceRecEnable.checked = true;
    page.elements.faceRecEnable.dispatch('change');
    const command = page.commands.find(command => command[0] === 'SET_FACE_RECOGNITION');
    assert.deepEqual(JSON.parse(command[1]), { unknow_snapswt: 1 });
    assert.equal(page.elements.faceRecEnable.disabled, true);
    assert.equal(page.elements.faceRecStatus.innerText, 'Saving...');
    page.deliver({ type: 'face_recognition_updated', success: false, error: 'API failed' });
    assert.equal(page.elements.faceRecEnable.checked, false);
    assert.equal(page.elements.faceRecEnable.disabled, false);
    page.elements.faceRecEnable.checked = true;
    page.elements.faceRecEnable.dispatch('change');
    page.deliver({ type: 'face_recognition_updated', success: true, unknow_snapswt: 1 });
    assert.equal(page.elements.faceRecEnable.checked, true);
    assert.equal(page.elements.faceRecStatus.innerText, 'Enabled');
    page.elements.faceRecEnable.checked = false;
    page.elements.faceRecEnable.dispatch('change');
    const commands = page.commands.filter(command => command[0] === 'SET_FACE_RECOGNITION');
    assert.deepEqual(JSON.parse(commands.at(-1)[1]), { unknow_snapswt: 0 });
});

test('face toggle command writes numeric API values and rejects API errors', () => {
    const setterStart = driver.indexOf('function SET_DEVICE_PROPERTY(');
    const setterEnd = driver.indexOf('function GET_DEVICE_PROPERTY(', setterStart);
    const faceStart = driver.indexOf('function SET_FACE_RECOGNITION(');
    const faceEnd = driver.indexOf('-- UPDATE STRANGER NOTE (OP12)', faceStart);
    const executeStart = driver.indexOf('function ExecuteCommand(');
    const executeEnd = driver.indexOf('-- OP03.', executeStart);
    const source = `
        local json = require("CldBusApi.dkjson")
        local _props = { ["Auth Token"] = "token", VID = "vid-1" }
        local Properties = {}
        local GlobalObject = { LnduBaseUrl = "https://example.invalid" }
        local function GetCldBusCredentials() return "app", "secret" end
        local sent, payload
        local api_code = 20000
        local function SendDeviceInfoToUI(value) payload = value end
        local transport = { execute = function(request, callback)
            assert(request.url == "https://example.invalid/api/v3/openapi/device/do-property")
            assert(request.method == "POST")
            local body = json.decode(request.body)
            assert(body.vid == "vid-1")
            sent = json.decode(body.data)
            callback(200, json.encode({code=api_code}), {}, nil)
        end }
        ${driver.slice(setterStart, setterEnd)}
        ${driver.slice(faceStart, faceEnd)}
        ${driver.slice(executeStart, executeEnd)}
        for _, state in ipairs({1, 0}) do
            ExecuteCommand("SET_FACE_RECOGNITION", json.encode({unknow_snapswt=state}))
            assert(sent.unknow_snapswt == state)
            assert(payload.success and payload.unknow_snapswt == state)
        end
        api_code = 40001
        SET_FACE_RECOGNITION({unknow_snapswt=1})
        assert(payload.success == false)
        sent = nil
        SET_FACE_RECOGNITION({unknow_snapswt=2})
        assert(payload.success == false and sent == nil)
        _props["Auth Token"] = ""
        SET_FACE_RECOGNITION({unknow_snapswt=1})
        assert(payload.success == false and sent == nil)
        print("Face toggle API assertions passed")
    `;
    const result = spawnSync('npx', ['--yes', '--package=fengari-node-cli', 'fengari', '-e', source], { encoding: 'utf8', cwd: root });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Face toggle API assertions passed/);
    assert.ok(!result.stdout.includes('Using bearer token'));
});
