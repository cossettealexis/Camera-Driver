-- =============================================================================
--  event_logger.lua
--  Logs camera events to the Slomins Smart Log API.
--  Place this file in the root of SLOMINS-CAMERA-K26/ next to driver.lua
--
--  ⚡ FAULT-ISOLATED: Every API operation is wrapped in pcall.
--     Any failure (network, encode, decode, callback crash) is caught,
--     logged to print(), and NEVER propagates to the caller.
--     The driver will always continue normally regardless of logger state.
-- =============================================================================

local EventLogger  = {}

local _transport   = nil
local _json        = nil
local _getGlobals  = nil

local LOG_ENDPOINT = "https://qa2.slomins.com/QA/OntechSvcs/1.1/ontech/CreateSlominsSmartLog"

local FIXED = {
    appSid       = "B71AFA96-839D-4F2A-AFB2-15CA60DD5464",
    checkVersion = "",
    appNamespace = "",
    latitude     = "",
    longitude    = "",
    AppName      = "OntechSvs",
    AppVersion   = "1.0.0",
    AppOS        = "Android",
    UserAgent    = "Control4Driver",
    CreatedBy    = "System",
}

local _req_counter = 0
local function next_request_id()
    -- pcall-wrapped so even a broken os.time() won't escape
    local ok, result = pcall(function()
        _req_counter = _req_counter + 1
        return string.format("REQ-%d-%d", os.time(), _req_counter)
    end)
    return ok and result or ("REQ-fallback-" .. tostring(_req_counter))
end

-- ── safe_print ────────────────────────────────────────────────────────────────
--  A print() wrapper that itself never throws.
local function safe_print(msg)
    pcall(print, tostring(msg))
end

-- ── safe_encode ───────────────────────────────────────────────────────────────
--  Returns (true, jsonString) or (false, fallbackString).
local function safe_encode(json, tbl, fallback_id, event_type)
    local ok, result = pcall(json.encode, tbl)
    if ok then
        return true, result
    end
    safe_print(string.format("[EVENT_LOGGER]   JSON encode failed | id=%s type=%s err=%s",
        tostring(fallback_id), tostring(event_type), tostring(result)))
    return false, string.format(
        '{"device_id":"%s","event_type":"%s","error":"encode_failed"}',
        tostring(fallback_id), tostring(event_type))
end

-- ── safe_transport ────────────────────────────────────────────────────────────
--  Fires the HTTP request; the callback itself is also pcall-wrapped so a
--  crash inside the callback can never escape into the driver event loop.
local function safe_transport(req, on_done)
    -- Wrap the callback the transport will call
    local function safe_cb(code, resp, headers, err)
        pcall(on_done, code, resp, headers, err)
    end

    local ok, err = pcall(_transport.execute, req, safe_cb)
    if not ok then
        safe_print(string.format(
            "[EVENT_LOGGER]   transport.execute threw: %s", tostring(err)))
        -- Fire the callback with a synthetic error so callers still resolve
        pcall(on_done, nil, nil, nil, tostring(err))
    end
end

-- ── init ─────────────────────────────────────────────────────────────────────
--  Call once from OnDriverInit after transport/json are loaded.
--  getGlobals: function() → { BaseApi, DeviceId, DeviceName, UserId, IpAddress }
function EventLogger.init(transport, json, getGlobals)
    -- Even init is guarded — a bad argument must not crash the driver
    local ok, err = pcall(function()
        _transport  = transport
        _json       = json
        _getGlobals = getGlobals
        safe_print("[EVENT_LOGGER] Initialized")
    end)
    if not ok then
        safe_print("[EVENT_LOGGER]   init() failed (non-fatal): " .. tostring(err))
    end
end

-- ── _get_globals_safe ─────────────────────────────────────────────────────────
--  Returns the globals table or nil without throwing.
local function _get_globals_safe()
    if type(_getGlobals) ~= "function" then return nil end
    local ok, result = pcall(_getGlobals)
    if ok then return result end
    safe_print("[EVENT_LOGGER]   getGlobals() threw: " .. tostring(result))
    return nil
end

-- ── core log ─────────────────────────────────────────────────────────────────
--
--  eventType       : string  — e.g. "MotionDetected"
--  eventPayload    : table   — event-specific fields (merged with identity fields)
--  eventDescription: string  — human-readable summary
--
--    This function is FULLY ISOLATED.
--     It always returns immediately; failures are printed only.
--
function EventLogger.log(eventType, eventPayload, eventDescription)
    -- Top-level pcall: nothing inside can ever reach the caller
    local ok, err = pcall(function()

        if not _transport or not _json or not _getGlobals then
            safe_print("[EVENT_LOGGER] Not initialized — skipping log")
            return
        end

        local g = _get_globals_safe()
        if not g or not g.BaseApi or g.BaseApi == "" then
            safe_print("[EVENT_LOGGER] BaseApi not available — skipping log")
            return
        end

        -- ── Build the self-describing EventLog object ─────────────────────
        local logObj = {
            device_id     = tostring(g.DeviceId   or ""),
            device_name   = tostring(g.DeviceName or ""),
            ip_address    = tostring(g.IpAddress  or ""),
            user_id       = tostring(g.UserId     or ""),
            event_type    = tostring(eventType or ""),
            description   = tostring(eventDescription or eventType or ""),
            logged_at     = os.time(),
            logged_at_iso = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        }

        -- Merge caller payload (identity keys are never overwritten)
        if type(eventPayload) == "table" then
            local merge_ok, merge_err = pcall(function()
                for k, v in pairs(eventPayload) do
                    if logObj[k] == nil then
                        logObj[k] = v
                    end
                end
            end)
            if not merge_ok then
                safe_print("[EVENT_LOGGER]   Payload merge failed: " .. tostring(merge_err))
            end
        end

        local _, eventLogStr = safe_encode(_json, logObj,
            tostring(g.DeviceId or ""), tostring(eventType or ""))

        -- ── Outer POST body ───────────────────────────────────────────────
        local body = {
            appSid           = FIXED.appSid,
            checkVersion     = FIXED.checkVersion,
            appNamespace     = FIXED.appNamespace,
            latitude         = FIXED.latitude,
            longitude        = FIXED.longitude,
            AppName          = FIXED.AppName,
            AppVersion       = FIXED.AppVersion,
            AppOS            = FIXED.AppOS,
            DeviceId         = tostring(g.DeviceId  or ""),
            UserId           = tostring(g.UserId    or ""),
            EventName        = "CameraEvent",
            EventType        = tostring(eventType   or ""),
            EventLog         = eventLogStr,
            EventDescription = tostring(eventDescription or eventType or ""),
            IpAddress        = tostring(g.IpAddress or ""),
            UserAgent        = FIXED.UserAgent,
            CreatedBy        = FIXED.CreatedBy,
            RequestId        = next_request_id(),
        }

        local authToken = tostring(g.AuthToken or "")

        --   Safe partial token print
        safe_print("--------------------------------------------------")
        safe_print("[DEBUG] AuthToken (partial): "
            .. string.sub(authToken, 1, 25) .. "..."
            .. " (len=" .. string.len(authToken) .. ")")

        local _, bodyStr = safe_encode(_json, body,
            tostring(g.DeviceId or ""), tostring(eventType or ""))

        safe_print("[DEBUG] Request Body:")
        safe_print(bodyStr)
        safe_print("--------------------------------------------------")

        safe_print(string.format(
            "[EVENT_LOGGER] POST %s | DeviceId=%s | EventType=%s | Auth=%s",
            LOG_ENDPOINT, tostring(g.DeviceId or ""), tostring(eventType or ""),
            authToken ~= "" and "present" or "MISSING"))

        local req = {
            url     = LOG_ENDPOINT,
            method  = "POST",
            headers = {
                ["Content-Type"]  = "application/json",
                ["Authorization"] = "Bearer " .. authToken,
            },
            body = bodyStr,
        }

        -- Callback is itself pcall-wrapped inside safe_transport
        safe_transport(req, function(code, resp, _, err2)
            if code == 200 or code == 201 then
                safe_print(string.format(
                    "[EVENT_LOGGER]   Logged '%s' for device '%s' (HTTP %s)",
                    tostring(eventType), tostring(g.DeviceId or ""), tostring(code)))
            else
                safe_print(string.format(
                    "[EVENT_LOGGER]   Log failed '%s' | device=%s | HTTP %s | err=%s",
                    tostring(eventType), tostring(g.DeviceId or ""),
                    tostring(code), tostring(err2)))
            end
        end)

    end) -- end top-level pcall

    if not ok then
        -- Last-resort: even if everything above exploded, just print and move on
        safe_print("[EVENT_LOGGER] ❌ Unexpected error in log() (non-fatal): " .. tostring(err))
    end
end

-- ── convenience wrappers ─────────────────────────────────────────────────────
--  Each wrapper is itself pcall-guarded so a bad `params` table can never
--  crash the caller.

local function safe_wrap(fn)
    -- NOTE: table.unpack does not exist in Lua 5.1 (Control4 environment).
    -- All callers pass a zero-argument closure, so no unpack is needed.
    local ok, err = pcall(fn)
    if not ok then
        safe_print("[EVENT_LOGGER]  Wrapper error (non-fatal): " .. tostring(err))
    end
end

function EventLogger.logMotion(params)
    safe_wrap(function()
        EventLogger.log("MotionDetected", {
            motion_type  = params and params.type,
            timestamp    = params and params.t,
            thumbnail    = params and params.ext_p     or nil,
            video_path   = params and params.cld_v     or nil,
            video_local  = params and params.ext_v     or nil,
            start_at     = params and params.start_at  or nil,
            end_at       = params and params.end_at    or nil,
            v_duration   = params and params.v_duration or nil,
        }, "Motion Detected")
    end)
end

function EventLogger.logHuman(params)
    safe_wrap(function()
        EventLogger.log("HumanDetected", {
            motion_type  = params and params.type,
            timestamp    = params and params.t,
            thumbnail    = params and params.ext_p     or nil,
            video_path   = params and params.cld_v     or nil,
            video_local  = params and params.ext_v     or nil,
            start_at     = params and params.start_at  or nil,
            end_at       = params and params.end_at    or nil,
            v_duration   = params and params.v_duration or nil,
        }, "Human Detected")
    end)
end


function EventLogger.logCameraOnline()
    safe_wrap(function()
        EventLogger.log("CameraOnline", { status = "Online" }, "Camera came online")
    end)
end

function EventLogger.logCameraOffline()
    safe_wrap(function()
        EventLogger.log("CameraOffline", { status = "Offline" }, "Camera went offline")
    end)
end

function EventLogger.logCameraRestarted()
    safe_wrap(function()
        EventLogger.log("CameraRestarted", { status = "Restarted" }, "Camera restarted")
    end)
end

function EventLogger.logLowBattery(pct)
    safe_wrap(function()
        EventLogger.log("LowBattery",
            { battery_percent = pct },
            string.format("Low battery: %s%%", tostring(pct)))
    end)
end

function EventLogger.logMemoryCardMissing(params)
    safe_wrap(function()
        EventLogger.log("MemoryCardMissing", {
            motion_type  = params and params.type,
            timestamp    = params and params.t,
            thumbnail    = params and params.ext_p     or nil,
            video_path   = params and params.cld_v     or nil,
            video_local  = params and params.ext_v     or nil,
            start_at     = params and params.start_at  or nil,
            end_at       = params and params.end_at    or nil,
            v_duration   = params and params.v_duration or nil,
        }, "Memory Card Missing")
    end)
end



function EventLogger.logLock(eventName, params)
    safe_wrap(function()
        local eventType = eventName or "LockEvent"

        print("[EVENT_LOGGER] Logging lock: " .. tostring(eventType))

        EventLogger.log(eventType, {
            lock_type  = eventName,
            timestamp  = params and params.t     or nil,
            thumbnail  = params and params.ext_p or nil,
        }, eventName or "Lock Event")
    end)
end

function EventLogger.logUnlock(eventName, params)
    safe_wrap(function()
        local eventType = eventName or "UnlockEvent"

        print("[EVENT_LOGGER] Logging unlock: " .. tostring(eventType))

        EventLogger.log(eventType, {
            unlock_type  = eventName,
            timestamp    = params and params.t       or nil,
            thumbnail    = params and params.ext_p   or nil,
            face_kid     = params and params.k_id    or nil,
            user_id_lock = params and params.u_id    or nil,
        }, eventName or "Unlock Event")
    end)
end


function EventLogger.logDoorbell(params)
    safe_wrap(function()
        EventLogger.log("DoorbellRing", {
            timestamp   = params and params.t,
            thumbnail   = params and params.ext_p or nil,
            video_path  = params and params.cld_v or nil,
        }, "Doorbell Ring")
    end)
end

function EventLogger.logStranger(params)
    safe_wrap(function()
        EventLogger.log("StrangerDetected", {
            timestamp  = params and params.t,
            thumbnail  = params and params.ext_p or nil,
            face_kid   = params and params.k_id  or nil,
        }, "Stranger Detected")
    end)
end

function EventLogger.logFace(params)
    safe_wrap(function()
        EventLogger.log("FaceDetected", {
            timestamp  = params and params.t,
            thumbnail  = params and params.ext_p or nil,
            face_kid   = params and params.k_id  or nil,
        }, "Face Detected")
    end)
end

return EventLogger