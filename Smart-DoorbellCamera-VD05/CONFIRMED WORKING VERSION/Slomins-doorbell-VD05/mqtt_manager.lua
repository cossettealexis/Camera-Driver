local MQTT = {}
local json = require("CldBusApi.dkjson")

-- =========================
-- INTERNAL STATE
-- =========================
MQTT.BINDING = 6001

MQTT.state = {
    connected = false,
    packet_id = 1,
    manual_disconnect = false,
    subscribed = false,
    ping_timer = nil
}

MQTT.props = nil
MQTT.callbacks = nil

-- =========================
-- INIT
-- =========================
function MQTT.init(props, callbacks)
    MQTT.props = props
    MQTT.callbacks = callbacks or {}
end

-- =========================
-- LOW-LEVEL HELPERS
-- =========================
local function u16(n)
    return string.char(math.floor(n / 256), n % 256)
end

local function str(s)
    return u16(#s) .. s
end

local function enc_len(len)
    local out = ""
    repeat
        local d = len % 128
        len = math.floor(len / 128)
        if len > 0 then d = d + 128 end
        out = out .. string.char(d)
    until len == 0
    return out
end

-- =========================
-- KEEPALIVE (PINGREQ)
-- =========================
local function send_ping()
    if not MQTT.state.connected then return end
    C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, string.char(0xC0, 0x00))
    print("[MQTT] → PINGREQ")
end

-- =========================
-- CONNECT / DISCONNECT
-- =========================
function MQTT.connect()
    local M = MQTT.props.MQTT
    if not (M and M.host and M.port) then return end

    print("[MQTT] Connecting:", M.host, M.port)
    C4:CreateNetworkConnection(MQTT.BINDING, M.host, "TCP")

    C4:SetTimer(300, function()
        C4:NetConnect(MQTT.BINDING, M.port)
    end)
end

function MQTT.disconnect()
    if not MQTT.state.connected then return end

    print("[MQTT] DISCONNECT")
    C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, string.char(0xE0, 0x00))

    MQTT.state.connected = false
    MQTT.state.manual_disconnect = true
    MQTT.state.subscribed = false

    C4:NetDisconnect(MQTT.BINDING, MQTT.props.MQTT.port)
end

function MQTT.reconnect()
    print("[MQTT] Reconnecting...")
    MQTT.state.connected = false
    MQTT.state.subscribed = false
    MQTT.state.packet_id = 1
    MQTT.connect()
end

-- =========================
-- MQTT CONNECT PACKET
-- =========================
local function build_connect_packet()
    local M = MQTT.props.MQTT

    local vh =
        str("MQTT") ..
        string.char(4) ..
        string.char(0xC2) ..
        u16(M.keepalive or 30)

    local payload =
        str(M.client_id) ..
        str(M.username) ..
        str(M.password)

    return string.char(0x10) ..
        enc_len(#vh + #payload) ..
        vh .. payload
end

local function send_connect()
    local pkt = build_connect_packet()
    C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, pkt)
    print("[MQTT] CONNECT sent")
end

-- =========================
-- SUBSCRIBE / UNSUBSCRIBE
-- =========================
function MQTT.subscribe(vid)
    if not vid then return end

    local topic = "$push/down/device/" .. vid
    local pid = MQTT.state.packet_id
    MQTT.state.packet_id = pid + 1

    local payload = str(topic) .. string.char(1) -- QoS1
    local vh = u16(pid)
    local packet = string.char(0x82) .. enc_len(#vh + #payload) .. vh .. payload

    C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, packet)
    print("[MQTT] SUBSCRIBE →", topic)
end

function MQTT.unsubscribe(vid)
    if not vid then return end

    local topic = "$push/down/device/" .. vid
    local pid = MQTT.state.packet_id
    MQTT.state.packet_id = pid + 1

    local vh = u16(pid)
    local payload = str(topic)
    local packet = string.char(0xA2) .. enc_len(#vh + #payload) .. vh .. payload

    C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, packet)
    print("[MQTT] UNSUBSCRIBE →", topic)
     C4:SetTimer(300, function()
        MQTT.disconnect()
    end)
end

-- =========================
-- NETWORK CALLBACKS
-- =========================
function MQTT.onConnectionStatusChanged(id, port, status)
    if id ~= MQTT.BINDING then return end

    if status == "ONLINE" then
        print("[MQTT] TCP ONLINE")
        C4:SetTimer(200, send_connect)

    elseif status == "OFFLINE" then
        print("[MQTT] TCP OFFLINE")
        if MQTT.state.manual_disconnect then
            MQTT.state.manual_disconnect = false
            return
        end
        C4:SetTimer(5000, MQTT.reconnect)
    end
end

function MQTT.onData(id, port, data)
    if id ~= MQTT.BINDING then return end
    MQTT.handle_packet(data)
end

-- =========================
-- PACKET HANDLING
-- =========================
function MQTT.handle_packet(data)
    local ptype = math.floor(string.byte(data, 1) / 16)

    if ptype == 2 then
        MQTT.handle_connack(data)
    elseif ptype == 3 then
        MQTT.handle_publish(data)
    elseif ptype == 9 then
        MQTT.handle_suback(data)
    elseif ptype == 11 then
        MQTT.handle_unsuback(data)
    elseif ptype == 13 then
        print("[MQTT] ← PINGRESP")
    end
end

function MQTT.handle_connack(data)
    local rc = string.byte(data, 4)
    print("[MQTT] CONNACK rc =", rc)

    if rc == 0 then
        MQTT.state.connected = true

        -- Start keepalive
        C4:SetTimer((MQTT.props.MQTT.keepalive or 30) * 1000, send_ping, true)

        if MQTT.callbacks.on_connected then
            MQTT.callbacks.on_connected()
        end
    end
end

function MQTT.handle_suback(data)
    MQTT.state.subscribed = true
    print("[MQTT] SUBACK received")
end

function MQTT.handle_unsuback(data)
    MQTT.state.subscribed = false
    print("[MQTT] UNSUBACK received")
end

-- =========================
-- PUBLISH + PUBACK
-- =========================
local function decode_remaining_length(data, pos)
    local multiplier, value, digit = 1, 0, 0
    repeat
        digit = string.byte(data, pos)
        pos = pos + 1
        value = value + (digit % 128) * multiplier
        multiplier = multiplier * 128
    until digit < 128
    return value, pos
end

function MQTT.handle_publish(data)
    local pos = 2
    local _, p = decode_remaining_length(data, pos)
    pos = p

    local tlen = string.byte(data, pos) * 256 + string.byte(data, pos + 1)
    pos = pos + 2
    local topic = data:sub(pos, pos + tlen - 1)
    pos = pos + tlen

    -- QoS handling
    local qos = math.floor((string.byte(data, 1) % 8) / 2)
    local pid

    if qos == 1 then
        pid = string.byte(data, pos) * 256 + string.byte(data, pos + 1)
        pos = pos + 2

        -- PUBACK (CRITICAL)
        local puback = string.char(0x40, 0x02) .. u16(pid)
        C4:SendToNetwork(MQTT.BINDING, MQTT.props.MQTT.port, puback)
        print("[MQTT] → PUBACK pid =", pid)
    end

    local payload = data:sub(pos)

    print("[MQTT] Topic:", topic)
    print("[MQTT] Payload:", payload)

    if MQTT.callbacks.on_message then
        MQTT.callbacks.on_message(topic, payload)
    end
end

return MQTT
