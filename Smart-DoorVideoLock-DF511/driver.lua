local _props                = {}

local json                  = require("CldBusApi.dkjson")
local http                  = require("CldBusApi.http")
local auth                  = require("CldBusApi.auth")
local transport             = require("CldBusApi.transport_c4")
local util                  = require("CldBusApi.util")
local MQTT                  = require("mqtt_manager")

-- Local state
local LAST_EVENT_ID         = 0
local NOTIFICATION_URLS     = {}
local NOTIFICATION_QUEUE    = {}
PENDING_NOTIFICATION_URL    = nil
ACTIVE_NOTIFICATION_URL     = nil
LAST_NOTIFY_ID              = LAST_NOTIFY_ID or nil
MAX_TIME_DRIFT              = 600  -- seconds (acceptable drift)


local IMAGE_RETRY_COUNT     = tonumber(Properties["Image Retry Count"]) or 6
local IMAGE_RETRY_DELAY     = tonumber(Properties["Image Retry Interval (ms)"]) or 400

local CAMERA_BINDING        = 5001
local EVENT_DELAY_MS        = tonumber(Properties["Event Interval (ms)"]) or 7000
local _pendingAuthToken     = nil
local _tcpConnected         = false
local TCP_BINDING_ID        = 7001
local last_ip_refresh       = 0
local MIN_REFRESH_GAP       = 5


GlobalObject                 = {}
GlobalObject.LnduBaseUrl     = "https://api.arpha-tech.com"
GlobalObject.ClientID        = ""
GlobalObject.ClientSecret    = ""
GlobalObject.AES_KEY         = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV          = "33rj6KNVN4kFvd0s"                --16 bytes
GlobalObject.BaseUrl         = "https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP   = 'tuyadev.slomins.net'
GlobalObject.TCP_SERVER_PORT = 8081
GlobalObject.DeviceModel     = "df511"  
GlobalObject.ProductSubType  = "video_wifi_lock"
GlobalObject.CldBusAppId      = ""
GlobalObject.CldBusSecret     = ""
GlobalObject.CustomerEmail    = ""
GlobalObject.BaseApi          = "https://qa2.slomins.com/QA/OntechSvcs/1.2/ontech"

local last_power_status      = nil


local NOTIFY = {
    ALERT = "ALERT",
    INFO  = "INFO"
}


-- User toggles (bind later to driver properties if needed)
local user_settings           = {
    enable_alerts = true,
    enable_info   = true
}

-- Cooldown windows (seconds)
local COOLDOWN                = {
    motion   = 0,
    human    = 0,
    stranger = 0,
    face     = 120,
    online   = 10,
    offline  = 10,
    restart  = 30,
    battery  = 300,
    power    = 10,
    unlock   = 0,
    lock     = 0

}

-- Track last notification times
local last_sent               = {}

local last_confirmed_online   = nil

_props.MQTT                   = {
    socket_ready = false,
    connected = false,
    packet_id = 1,
    keepalive = 30
}
_props.MQTT.manual_disconnect = false

local PROP_MQTT_HOST          = "MQTT Host"
local PROP_MQTT_PORT          = "MQTT Port"
local PROP_MQTT_CLIENT_ID     = "MQTT Client ID"
local PROP_MQTT_SECRET        = "MQTT Secret"

local EVENT                   = {
    MOTION              = "Motion Detected",
    DOORBELL            = "Doorbell Ring",
    FACE                = "Face Detected",
    CAMERA_ONLINE       = "Camera Online",
    CAMERA_OFFLINE      = "Camera Offline",
    CAMERA_RESTARTED    = "Camera Restarted",
    HUMAN               = "Human Detected",
    STRANGER            = "Stranger Detected",
    LOW_BATTERY         = "Low Battery",
    POWER_ON            = "Power On",
    POWER_OFF           = "Power Off",
    -- 🔐 Lock / Unlock Events
    UNLOCK_PASSWORD     = "Unlock with Password",
    UNLOCK_OFFLINE_PASS = "Offline Password Unlock",
    UNLOCK_DURESS       = "Duress Unlock",
    UNLOCK_FACE         = "Face Recognition Unlock",
    UNLOCK_NFC          = "NFC Unlock",
    UNLOCK_APP          = "App Unlock",
    UNLOCK_ONE_CLICK    = "One-Click Unlock",
    UNLOCK_KEY          = "Key Unlock",
    LOCK_ONE_TOUCH      = "One-Touch Lock",
    LOCK_EVENT          = "Lock Event",
    LOCK_REMOTE         = "Remote Lock",
    LOCKING_STARTED     = "Locking Started",
    LOCKED_OUTSIDE      = "Locked Outside"
}





local MQTT_AUTO_ENABLED  = false
local GET_DEVICES_CALLED = false


local mqtt_enabled      = false
local WAKE_DURATION     = 15    -- seconds
local WAKE_INTERVAL     = 10    -- seconds    -- Wake every 13 seconds
local _initializing     = false -- Flag to prevent multiple initialization attempts

--local state to track timer
local wake_timer_id     = nil
AUTO_LOCK_TIMER         = nil




function WakeCamera(retry)
    retry = retry or 1
    local attempt = 0

    --kill existing time
    if (wake_timer_id) then
        wake_timer_id = C4:KillTimer(wake_timer_id)
    end

    local function try_wake()
        attempt = attempt + 1

        SET_DEVICE_PROPERTY({ action = "ac_wakelocal" })

        if attempt < retry then
            local next_wake_delay = (WAKE_DURATION + WAKE_INTERVAL) * 1000 -- Convert to milliseconds
            C4:SetTimer(next_wake_delay, function(timer)
                try_wake()
            end)
        else
            print("Wake retry sequence complete (" .. retry .. " attempts).")
            wake_timer_id = nil
        end
    end

    -- Start first attempt immediately (runs in parallel with RTSP connection)
    try_wake()
end

--Establishes a TCP connection to the configured server.

function TcpConnection()
    print("TcpConnection established")
    local tPortParams = {
        SUPPRESS_CONNECTION_EVENTS = true,
        AUTO_CONNECT = true,
        MONITOR_CONNECTION = true,
        KEEP_CONNECTION = true,
        KEEP_ALIVE = true,
        DELIMITER = "0d0a"
    }
    C4:CreateNetworkConnection(TCP_BINDING_ID, GlobalObject.TCP_SERVER_IP, "TCP")
    C4:NetPortOptions(TCP_BINDING_ID, GlobalObject.TCP_SERVER_PORT, "TCP", tPortParams)
    C4:NetConnect(TCP_BINDING_ID, GlobalObject.TCP_SERVER_PORT)
end

function SET_CAMERA_IP(ip)
    if not ip or ip == "" then
        print("[CAMERA] Invalid IP, skipping")
        return
    end

    if Properties["IP Address"] == ip then
        print("[CAMERA] IP already set:", ip)
        return
    end

    print("[CAMERA] Setting IP:", ip)

    _props["IP Address"] = ip
    C4:UpdateProperty("IP Address", ip)

    C4:SendToProxy(5001, "ADDRESS_CHANGED", {
        ADDRESS = ip
    })
end



function OnDriverInit()
    TcpConnection()
    print("=== DF511 Driver Initialized ===")
    C4:UpdateProperty("Camera Status", "Unknown")
    -- Initialize properties
    for k, v in pairs(Properties) do
        if k ~= "Password" then
            print("Property [" .. k .. "] = " .. tostring(v))
        end
        _props[k] = v
    end
    MQTT.init(_props, {
        on_connected = function()
            local vid = _props["VID"] or Properties["VID"]
            MQTT.subscribe(vid)
        end,

        on_message = function(topic, payload)
            HANDLE_JSON_EVENT(payload)
        end
    })

    C4:UpdateProperty("Status", "Driver initialized")
end

function OnDriverDestroyed()
    print("=== DF511 Driver Destroyed ===")
    MQTT.disconnect()
end



function ValidateMacAddress(mac)
    local requestBody = '{"MacAddress":"' .. mac .. '"}'  
    local headers = {
        ["Content-Type"] = "application/json"
    }

     C4:urlPost(GlobalObject.BaseApi .. "/IsValidControl4MacAddress", requestBody, headers,true,
        function(ticketId, strData, responseCode, tHeaders, strError)

        if strError ~= nil and strError ~= "" then
            print("Error calling API: " .. strError)
            C4:UpdateProperty("Status","Error calling API: " .. strError)
            return
        end

        if responseCode ~= 200 then
            print("HTTP Error: " .. tostring(responseCode))
            C4:UpdateProperty("Status","HTTP Error: " .. tostring(responseCode))
            return
        end

        local response = C4:JsonDecode(strData)
        if response then
            if response.IsValidMacAddress == true then
                print("MAC Address is valid")
                C4:UpdateProperty("Status","MAC Address is valid")
                
                local strData = response.EncryptMsg
                if string.sub(strData, -2) == "\r\n" then
                  strData = string.sub(strData, 1, -3)
                end
          
                local cipher = 'AES-256-CBC'
                local options = {
                    return_encoding = 'NONE',
                    key_encoding = 'NONE',
                    iv_encoding = 'NONE',
                    data_encoding = 'BASE64',
                    padding = true,
                }

                local decrypted_data, err = C4:Decrypt(cipher, GlobalObject.AES_KEY, GlobalObject.AES_IV, strData, options)
                
                if (decrypted_data ~= nil) then
                 
                  local data = C4:JsonDecode(decrypted_data)
                  extractedData = {}
                
                  if data and data.message and data.message.EventName == "UpdateClientSecretId" and 
                     data.message.MacAddress == C4:GetUniqueMAC() then
                        print("ValidateMacAddress() " , data.message.EventName)
                        
                        GlobalObject.CldBusAppId = data.message.CldBusAppId
                        GlobalObject.CldBusSecret = data.message.CldBusSecret
                        GlobalObject.CustomerEmail = data.message.CustomerEmail or ""
                        
                        C4:UpdateProperty("AppId", data.message.CldBusAppId or "")
                        C4:UpdateProperty("AppSecret", data.message.SecretId or "")
                        C4:UpdateProperty("Account", GlobalObject.CustomerEmail)
                        print("[MAC] Credentials loaded for: " .. GlobalObject.CustomerEmail)
                   end
                end
            else
                print("MAC Address is invalid")
                C4:UpdateProperty("Device Response","MAC Address is invalid")
                GlobalObject.CldBusAppId = ""
                GlobalObject.CldBusSecret = ""
                GlobalObject.CustomerEmail = ""

                C4:UpdateProperty("AppId",  "")
                C4:UpdateProperty("AppSecret", "")
                C4:UpdateProperty("Account", "")
            end
        else
            print("Failed to parse JSON response")
            C4:UpdateProperty("Device Response","Failed to parse JSON response")
        end
    end)
end

function OnDriverLateInit()
    print("=== DF511 Driver Late Init ===")
    C4:UpdateProperty("Status", "Ready")
    
    ValidateMacAddress(C4:GetUniqueMAC())
    
    -- Wait for MAC validation to complete before initializing camera
    C4:SetTimer(5000, function(timer)
        if GlobalObject.CldBusAppId ~= "" and GlobalObject.CldBusSecret ~= "" then
            InitializeCamera()
        else
            print("ERROR: MAC validation did not complete - credentials not loaded")
            C4:UpdateProperty("Status", "MAC validation failed - no credentials")
        end
    end)

    -- Define variables for use inside the timer
  local ip = _props["IP Address"] or Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "3333"
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    local snapshot_path = Properties["Snapshot URL Path"] or "/wps-cgi/image.cgi"
    local snapshot_url = string.format("http://%s:%s%s", ip, http_port, snapshot_path)

    if ip and ip ~= "" then
        -- Step 1: Force Camera Proxy Auth and Port settings (VD05 Fix)
        C4:SendToProxy(CAMERA_BINDING, "RTSP_TRANSPORT", { TRANSPORT = "TCP" })
        C4:SendToProxy(CAMERA_BINDING, "AUTHENTICATION_TYPE_CHANGED", { TYPE = "BASIC" })
        C4:SendToProxy(CAMERA_BINDING, "AUTHENTICATION_REQUIRED", { REQUIRED = "False" })
        C4:SendToProxy(CAMERA_BINDING, "USERNAME_CHANGED", { USERNAME = username })
        C4:SendToProxy(CAMERA_BINDING, "PASSWORD_CHANGED", { PASSWORD = password })

        C4:SendToProxy(CAMERA_BINDING, "ADDRESS_CHANGED", { ADDRESS = ip })
        C4:SendToProxy(CAMERA_BINDING, "HTTP_PORT_CHANGED", { PORT = http_port })
        C4:SendToProxy(CAMERA_BINDING, "RTSP_PORT_CHANGED", { PORT = rtsp_port })

        -- Enable MJPEG capability in the proxy
        C4:SendToProxy(CAMERA_BINDING, "GET_VIDEO_MODES", {})
        C4:SendToProxy(CAMERA_BINDING, "RTSP_AUDIO_ENABLED", { ENABLED = "False" })
        -- Step 2: Wake the camera and push URLs
        print("Waking camera...")
        WakeCamera(3)

        local wake_delay = tonumber(Properties["Wake Delay (ms)"]) or 25000

        C4:SetTimer(wake_delay, function()
            print("Pushing validated MJPEG and RTSP URLs...")

            -- Push RTSP URL
            local rtsp_url = GetRtspUrl()
            if rtsp_url and rtsp_url ~= "" then
                C4:SendToProxy(CAMERA_BINDING, "RTSP_TRANSPORT", { TRANSPORT = "TCP" })
                C4:SendToProxy(CAMERA_BINDING, "RTSP_URL_PUSH", { URL = rtsp_url })
                C4:UpdateProperty("Main Stream URL", rtsp_url)
            else
                C4:SendToProxy(CAMERA_BINDING, "SNAPSHOT_URL_PUSH", { URL = snapshot_url })
                C4:UpdateProperty("Main Stream URL", rtsp_url)
                C4:UpdateProperty("Main Stream URL", snapshot_url)

                StartRtspRetryTimer(snapshot_url)
            end
        end)
        -- Send camera address and ports to Camera Proxy
    end
end

local function update_prop(name, value)
    if not value then value = "" end
    pcall(function() C4:UpdateProperty(name, tostring(value)) end)
    _props[name] = tostring(value)
end

function OnPropertyChanged(strProperty)
    print("Property changed: " .. strProperty)

    if strProperty == "Password" then
        print("Password property updated (value hidden)")
        _props[strProperty] = Properties[strProperty]
        return
    end


    if strProperty == "Enable MQTT" then
        local requested = (Properties[strProperty] == "True")

        -- ✅ Prevent auto-init from being overridden
        if not requested and _initializing then
            print("[MQTT] Ignoring disable during initialization")
            return
        end

        mqtt_enabled = requested

        if mqtt_enabled then
            print("[MQTT] Enabled by user")
            update_prop("Status", "MQTT enabled")
            APPLY_MQTT_INFO()
        else
            print("[MQTT] Disabled by user")
            update_prop("Status", "MQTT disabled")
            local vid = _props["VID"] or Properties["VID"]
            MQTT.unsubscribe(vid)
        end
        return
    end

    if strProperty == "Enable Alert Notifications" then
        user_settings.enable_alerts =
            (Properties[strProperty] == "True")
        print("[NOTIFY] Alert notifications:",
            user_settings.enable_alerts)
        return
    end

    if strProperty == "Enable Info Notifications" then
        user_settings.enable_info =
            (Properties[strProperty] == "True")
        print("[NOTIFY] Info notifications:",
            user_settings.enable_info)
        return
    end
    if strProperty == "Event Interval (ms)" then
        EVENT_DELAY_MS = tonumber(Properties[strProperty]) or 5000
        print("[WAKE] Event interval updated to:", EVENT_DELAY_MS, "ms")
        return
    end
    if strProperty == "Image Retry Count" then
        IMAGE_RETRY_COUNT = tonumber(Properties[strProperty]) or 6
        print("[IMG] Retry count updated:", IMAGE_RETRY_COUNT)
        return
    end

    if strProperty == "Image Retry Interval (ms)" then
        IMAGE_RETRY_DELAY = tonumber(Properties[strProperty]) or 400
        print("[IMG] Retry delay updated:", IMAGE_RETRY_DELAY)
        return
    end

    local value = Properties[strProperty]
    print("Property [" .. strProperty .. "] changed to: " .. tostring(value))
    _props[strProperty] = value

    -- If IP Address changes, regenerate camera URLs
    if strProperty == "IP Address" and value and value ~= "" then
        local ip = value
        local rtsp_port = Properties["RTSP Port"] or "554"
        local http_port = Properties["HTTP Port"] or "3333"
        local auth_type = Properties["Authentication Type"] or "NONE"
        local username = Properties["Username"] or "SystemConnect"
        local password = Properties["Password"] or "123456"

        C4:SendToProxy(CAMERA_BINDING, "RTSP_TRANSPORT", { TRANSPORT = "TCP" })

        local rtsp_url
        if auth_type ~= "NONE" then
            rtsp_url = string.format("rtsp://%s:%s@%s:%s/streamtype=0", username, password, ip, rtsp_port)
        else
            rtsp_url = string.format("rtsp://%s:%s/streamtype=0", ip, rtsp_port)
        end


        local snapshot_url
        if auth_type ~= "NONE" then
            -- Add username and password directly into the URL for the Proxy
            snapshot_url = string.format("http://%s:%s@%s:%s/wps-cgi/image.cgi?resolution=640x480", username, password,
                ip, http_port)
        else
            snapshot_url = string.format("http://%s:%s/wps-cgi/image.cgi?resolution=640x480", ip, http_port)
        end


        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", rtsp_url) -- Set Sub stream to use streamtype=0 as well
        print("Locked RTSP to: " .. rtsp_url)


        C4:SendToProxy(CAMERA_BINDING, "SNAPSHOT_INVALIDATE", {})
        C4:SendToProxy(CAMERA_BINDING, "SNAPSHOT_URL_PUSH", { URL = snapshot_url })
        C4:SendToProxy(CAMERA_BINDING, "RTSP_URL_PUSH", { URL = rtsp_url })


        SendUpdateCameraProp()
    end

    if strProperty == "Auth Token" then
        UpdateAuthToken(value)
        C4:UpdateProperty("Status", "Authenticated")
    end

    if strProperty == "AppId" then
        print("[PROP] AppId manually changed => " .. tostring(Properties[strProperty]))
        _props["AppId"] = Properties[strProperty]
        return
    end

    if strProperty == "AppSecret" then
        print("[PROP] AppSecret manually changed (hidden)")
        _props["AppSecret"] = Properties[strProperty]
        return
    end
end

function ReceivedFromNetwork(id, port, data)
    MQTT.onData(id, port, data)

    if id ~= TCP_BINDING_ID or not data or data == "" then return end

    print("[TCP RX] Encrypted:", data)

    -- Strip CRLF delimiter if present
    if string.sub(data, -2) == "\r\n" then
        data = string.sub(data, 1, -3)
    end

    local cipher = "AES-256-CBC"
    local options = {
        return_encoding = "NONE",
        key_encoding    = "NONE",
        iv_encoding     = "NONE",
        data_encoding   = "BASE64",
        padding         = true,
    }

    local decrypted, err = C4:Decrypt(
        cipher,
        GlobalObject.AES_KEY,
        GlobalObject.AES_IV,
        data,
        options
    )

    if not decrypted then
        print("[TCP] Decryption failed:", tostring(err))
        return
    end

    print("[TCP RX] Decrypted:", decrypted)

    local ok, decoded = pcall(json.decode, decrypted)
    if not ok or type(decoded) ~= "table" then
        print("[TCP] JSON decode failed (dkjson)")
        return
    end
    local payload = decoded.message or decoded

    if payload.C4UniqueMac and payload.C4UniqueMac ~= C4:GetUniqueMAC() then
        print("[TCP] Unique MAC mismatch. Ignoring message.", tostring(payload.C4UniqueMac))
        return
    end

    -- Handle UpdateClientSecretId event FIRST (before filtering for LnduUpdate)
    if payload.EventName == "UpdateClientSecretId" and payload.MacAddress == C4:GetUniqueMAC() then
        print("ReceivedFromNetwork() UpdateClientSecretId")
        GlobalObject.CldBusAppId = payload.CldBusAppId
        GlobalObject.CldBusSecret = payload.CldBusSecret
        C4:UpdateProperty("AppId", payload.CldBusAppId or "")
        C4:UpdateProperty("AppSecret", payload.CldBusSecret or "")
        print("[TCP] Credentials updated via TCP")
        return
    end

    -- Filter for LnduUpdate events only
    if payload.EventName ~= "LnduUpdate" then
        print("[TCP] Ignoring Event:", tostring(payload.EventName))
        return
    end

    print("[TCP] Processing LnduUpdate payload")

    -- Token
    if payload.Token and payload.Token ~= "" then
        print("[TCP] Auth Token received")
        UpdateAuthToken(payload.Token)
    else
        print("[TCP] Token missing in payload")
    end

    -- AppId
    if payload.AppId and payload.AppId ~= "" then
        GlobalObject.CldBusAppId = payload.AppId
        _props["AppId"] = payload.AppId
        C4:UpdateProperty("AppId", payload.AppId)
        print(string.format("[PROP] AppId updated => %s", payload.AppId))
    end

    -- AppSecret
    if payload.AppSecret and payload.AppSecret ~= "" then
        GlobalObject.CldBusSecret = payload.AppSecret
        _props["AppSecret"] = payload.AppSecret
        C4:UpdateProperty("AppSecret", payload.AppSecret)
        print("[PROP] AppSecret updated (hidden)")
    end

    print("[TCP] LnduUpdate processing complete")
end

function OnNetworkBindingChanged(idBinding, bIsBound)
    if (idBinding == 6001 and bIsBound) then
        local ssdp_ip = Properties["IP Address"] or _props["IP Address"]
        local binding_ip = C4:GetBindingAddress(6001)
        
        print("[BINDING] SSDP Property IP: " .. tostring(ssdp_ip))
        print("[BINDING] Binding Address IP: " .. tostring(binding_ip))
        
        local ip_to_use = nil
        
        if ssdp_ip and ssdp_ip ~= "" and ssdp_ip ~= "127.0.0.1" then
            ip_to_use = ssdp_ip
        end
        
        if not ip_to_use and binding_ip and binding_ip ~= "" and binding_ip ~= "127.0.0.1" then
            ip_to_use = binding_ip
        end
        
        if ip_to_use then
            C4:UpdateProperty("IP Address", ip_to_use)
            _props["IP Address"] = ip_to_use
            C4:SendToProxy(5001, "ADDRESS_CHANGED", { ADDRESS = ip_to_use })
            print("[BINDING] Camera IP auto-configured: " .. ip_to_use)
        else
            print("[BINDING] No local IP found from SSDP. Manual configuration required.")
        end
    end
end

function OnConnectionStatusChanged(id, status, connected)
    if id ~= TCP_BINDING_ID then return end

    _tcpConnected = (connected == "ONLINE")

    print(string.format("[TCP] Status: %s | Connected: %s", status, tostring(_tcpConnected)))

    if _tcpConnected and _pendingAuthToken then
        print("[AUTH] TCP online, sending queued token")
        UpdateAuthToken(_pendingAuthToken)
        _pendingAuthToken = nil
    end
end

function UpdateAuthToken(token)
    if not token or token == "" then return end

    if not _tcpConnected then
        print("[AUTH] TCP offline, queueing token")
        _pendingAuthToken = token
        return
    end

    _props["Auth Token"] = token
    C4:UpdateProperty("Auth Token", token)
    print("[AUTH] Auth Token updated:", token)
end

function ExecuteCommand(strCommand, tParams)
    print("ExecuteCommand called: " .. strCommand)

    if strCommand == "GET_STREAM" then
        return ""
    end

    if strCommand == "InitializeCamera" or strCommand == "INITIALIZE_CAMERA" then
        InitializeCamera()
        return
    end

    if strCommand == "LoginOrRegister" or strCommand == "LOGIN_OR_REGISTER" then
        local country_code = (tParams and tParams.country_code) or "N"
        local account = Properties["Account"] or GlobalObject.CustomerEmail or ""

        if account == "" then
            print("ERROR: Account is required for login")
            C4:UpdateProperty("Status", "Login failed: No account specified")
            return
        end

        LoginOrRegister(country_code, account)
        return
    end

    if strCommand == "GET_SNAPSHOT_URL" then
        GET_SNAPSHOT_URL(tParams)
        return
    end

    if strCommand == "TEST_MAIN_STREAM" then
        TEST_MAIN_STREAM(tParams)
        return
    end
    if strCommand == "TEST_SUB_STREAM" then
        TEST_SUB_STREAM(tParams)
        return
    end



    if strCommand == "DISCOVER_CAMERAS" then
        DISCOVER_CAMERAS(tParams)
        return
    end
    if strCommand == "DISCOVER_CAMERAS_SDDP" then
        DISCOVER_CAMERAS_SDDP(tParams)
        return
    end
    if strCommand == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(tParams)
        return
    end
    if strCommand == "TEST_WAKE_LOCAL" then
        TEST_WAKE_LOCAL()
        return
    end
    if strCommand == "TEST_PUSH_NOTIFICATION" then
        SEND_TEST_NOTIFICATION()
        return
    end

    if strCommand == "UPDATE_UI_PROPERTIES" then
        SendUpdateCameraProp()
        return
    end

    if strCommand == "Lock" then
        SEND_LOCK_COMMAND(true, tParams)
        return
    end
    if strCommand == "Unlock" then
        SEND_LOCK_COMMAND(false, tParams)
        return
    end

    if strCommand == "GET_LATEST_SNAPSHOT" or strCommand == "QUERY_NOTIFICATIONS" then
        QUERY_NOTIFICATIONS()
        return
    end

    if strCommand == "CAMERA_LIVE_PREVIEW" then
        return ""
    end

    local cmd = strCommand:match("^%s*(.-)%s*$")
    local cmdLower = cmd:lower()

    print("ExecuteCommand called:", cmd, "params:", tParams.command)

    -- =========================
    -- Handle SetLockUnlock (PADLOCK SOURCE)
    -- =========================
    if cmdLower == "setlockunlock" then
        local action = (tParams.command or ""):lower()

        print("ExecuteCommand → SetLockUnlock action:", action)

        if action == "lock" then
            SEND_LOCK_COMMAND(true)
        elseif action == "unlock" then
            SEND_LOCK_COMMAND(false)
        else
            print("Unknown SetLockUnlock action:", action)
        end
        return
    end

    -- Handle LUA_ACTION wrapper
    if strCommand == "LUA_ACTION" and tParams then
        if tParams.ACTION then
            ExecuteCommand(tParams.ACTION, tParams)
        end
    end
end


function InitializeCamera()
    print("================================================================")
    print("                 INITIALIZE CAMERA CALLED                        ")
    print("================================================================")

    -- Generate required values
    local client_id = util.uuid_v4()
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"

    print("Client ID: " .. client_id)
    print("Request ID: " .. request_id)
    print("Time: " .. time)
    print("Version: " .. version)

    -- Build the message to sign (MUST match Postman format exactly)
    local message = string.format("client_id=%s&request_id=%s&time=%s&version=%s",
        client_id, request_id, time, version)

    print("String to sign: " .. message)

    -- Generate HMAC-SHA256 signature
    local signature = util.hmac_sha256_hex(message, app_secret)

    print("Generated signature: " .. signature)

    -- Build request body
    local body_tbl = {
        sign = signature,
        client_id = client_id,
        request_id = request_id,
        time = time,
        version = version
    }

    local body_json = json.encode(body_tbl)
    print("Request body: " .. body_json)

    -- Update status
    C4:UpdateProperty("Status", "Initializing camera...")

    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/init"

    local headers = {
        ["Content-Type"] = "application/json",
        ["App-Name"] = GlobalObject.CldBusAppId
    }

    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = body_json
    }

    print("Sending request to: " .. url)
    print("Method: POST")
    print("Headers: " .. json.encode(headers))

    -- Send request
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))
        if err then
            print("Error: " .. tostring(err))
        end
        print("----------------------------------------------------------------")

        if code == 200 then
            print("Camera initialization succeeded")

            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                local public_key = parsed.data.public_key

                if public_key then
                    print("Received public key: " .. public_key)

                    -- Store public key
                    C4:UpdateProperty("Public Key", public_key)
                    C4:UpdateProperty("Status", "Camera initialized successfully")
                    C4:UpdateProperty("ClientID", client_id)

                    _props["Public Key"] = public_key
                    print("Public key stored successfully")
                else
                    print("No public key in response")
                    C4:UpdateProperty("Status", "Initialization failed: No public key")
                end
            else
                print("Failed to parse response: " .. tostring(resp))
                C4:UpdateProperty("Status", "Initialization failed: Invalid response")
            end
        else
            print("Camera initialization failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Initialization failed: " .. tostring(err or code))
        end
    end)

    print("================================================================")
end

-- RSA OAEP Encryption using External API
function RsaOaepEncrypt(data, publicKey, callback)
    print("RsaOaepEncrypt called (using external encryption API)")
    print("Data to encrypt: " .. data)
    print("Public key length: " .. #publicKey)

    -- Parse the data to get country_code and account
    local data_obj = json.decode(data)

    -- Build request body for encryption API
    local body_tbl = {
        publicKey = publicKey,
        payload = {
            country_code = data_obj.country_code,
            account = data_obj.account
        }
    }

    local body_json = json.encode(body_tbl)
    print("Encryption API request body: " .. body_json)

    -- Call external encryption API
    local url = "http://54.90.205.243:5000/lndu-encrypt"

    local headers = {
        ["Content-Type"] = "application/json"
    }

    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = body_json
    }

    print("Calling encryption API: " .. url)

    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Encryption API Response code: " .. tostring(code))
        print("Encryption API Response body: " .. tostring(resp))
        if err then
            print("Encryption API Error: " .. tostring(err))
        end
        print("----------------------------------------------------------------")

        if code == 200 then
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.encrypted then
                print("Encryption successful!")
                print("Encrypted data received from API")

                -- Return encrypted data via callback
                callback(true, parsed.encrypted, nil)
            else
                print("ERROR: Invalid response from encryption API")
                callback(false, nil, "Invalid response from encryption API")
            end
        else
            print("Encryption API failed with code: " .. tostring(code))
            callback(false, nil, "Encryption API failed: " .. tostring(err or code))
        end
    end)
end

-- Convert binary data to hex string
function BinaryToHex(binary)
    return (binary:gsub('.', function(c)
        return string.format('%02x', string.byte(c))
    end))
end

function LoginOrRegister(country_code, account)
    print("================================================================")
    print("              LOGIN OR REGISTER CALLED                          ")
    print("================================================================")

    -- Check if we have a public key from initialization
    local public_key = _props["Public Key"] or Properties["Public Key"]

    if not public_key or public_key == "" then
        print("ERROR: No public key available. Please run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No public key")
        return
    end

    print("Using public key: " .. public_key)
    print("Country Code: " .. country_code)
    print("Account: " .. account)

    -- Generate required values
    local client_id = Properties["ClientID"] or util.uuid_v4()
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"

    print("Client ID: " .. client_id)
    print("Request ID: " .. request_id)
    print("Time: " .. time)

    -- Prepare post_data (to be encrypted)
    local post_data_obj = {
        country_code = country_code,
        account = account
    }

    local post_data_json = json.encode(post_data_obj)
    print("Post data JSON: " .. post_data_json)

    -- Update status
    C4:UpdateProperty("Status", "Encrypting credentials...")

    -- Encrypt post_data with RSA-OAEP using external API
    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)
        if not success or not encrypted_data then
            print("ERROR: Failed to encrypt post_data: " .. tostring(error_msg))
            C4:UpdateProperty("Status", "Login failed: Encryption error")
            return
        end

        print("Encrypted data received: " .. encrypted_data)

        -- The encrypted data from API is already in hex format
        local post_data_hex = encrypted_data

        -- Build the message to sign
        local message = string.format("client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, post_data_hex, request_id, time)

        print("String to sign: " .. message)

        -- Generate HMAC-SHA256 signature
        local signature = util.hmac_sha256_hex(message, app_secret)
        print("Generated signature: " .. signature)

        -- Build request body
        local body_tbl = {
            sign = signature,
            post_data = post_data_hex,
            client_id = client_id,
            request_id = request_id,
            time = time
        }

        local body_json = json.encode(body_tbl)
        print("Request body: " .. body_json)

        -- Update status
        C4:UpdateProperty("Status", "Logging in...")

        -- Build request
        local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
        local url = base_url .. "/api/v3/openapi/auth/login-or-register"

        local headers = {
            ["Content-Type"] = "application/json",
            ["Accept-Language"] = "en",
            ["App-Name"] = GlobalObject.CldBusAppId
        }

        local req = {
            url = url,
            method = "POST",
            headers = headers,
            body = body_json
        }

        print("Sending request to: " .. url)
        print("Method: POST")
        print("Headers: " .. json.encode(headers))

        -- Send request
        transport.execute(req, function(code, resp, resp_headers, err)
            print("----------------------------------------------------------------")
            print("Response code: " .. tostring(code))
            print("Response body: " .. tostring(resp))
            if err then
                print("Error: " .. tostring(err))
            end
            print("----------------------------------------------------------------")

            if code == 200 then
                print("Login/Register succeeded")

                -- Parse response
                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed then
                    print("Response data: " .. json.encode(parsed))

                    -- Store any tokens or session data
                    if parsed.data then
                        if parsed.data.token then
                            _props["Auth Token"] = parsed.data.token
                            C4:UpdateProperty("Auth Token", parsed.data.token)
                            print("Auth token stored")
                        end
                        if parsed.data.user_id then
                            _props["User ID"] = parsed.data.user_id
                            print("User ID: " .. parsed.data.user_id)
                        end
                    end

                    C4:UpdateProperty("Status", "Login successful")

                    -- Update UI with camera properties after successful login
                    SendUpdateCameraProp()
                else
                    print("Failed to parse response: " .. tostring(resp))
                    C4:UpdateProperty("Status", "Login failed: Invalid response")
                end
            else
                print("Login/Register failed with code: " .. tostring(code))
                C4:UpdateProperty("Status", "Login failed: " .. tostring(err or code))
            end
        end)
    end)

    print("================================================================")
end

-- Get Devices
function GET_DEVICES(p_vid)
    print("================================================================")
    print("                GET_DEVICES CALLED                              ")
    print("================================================================")

    -- Get auth token from properties (bearer token)
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]

    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available. Please run LoginOrRegister first.")
        --C4:UpdateProperty("Status", "Get devices failed: No auth token")
        return
    end

    print("Using bearer token: " .. auth_token)

    -- Update status
    --C4:UpdateProperty("Status", "Getting devices...")

    -- Build request
    local base_url = GlobalObject.LnduBaseUrl
    local url = base_url .. "/api/v3/openapi/devices-v2"

    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. auth_token,
        ["App-Name"] = GlobalObject.CldBusAppId
    }

    local req = {
        url = url,
        method = "GET",
        headers = headers
    }

    print("Sending request to: " .. url)

    -- Send request
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))
        if err then
            print("Error: " .. tostring(err))
        end
        print("----------------------------------------------------------------")

        if code == 200 or code == 20000 then
            print("Get devices succeeded")
            --C4:UpdateProperty("Status", "Devices retrieved successfully")

            -- Parse and print response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.devices then
                local devices = parsed.data.devices

                print("Parsed response:")
                print(json.encode(parsed, { indent = true }))

                local ip = _props["IP Address"] or Properties["IP Address"]
                
                local target_device = nil
                for i, device in ipairs(devices) do
                    -- If IP is set, match by IP address
                    if ip and ip ~= "" and device.local_ip == ip then
                        target_device = device
                        print("Found device matching IP " .. ip .. " at index " .. i)
                        print("  Device Name: " .. (device.device_name or "N/A"))
                        print("  Model: " .. (device.model or "N/A"))
                        print("  Product Subtype: " .. (device.product_subtype or "N/A"))
                        break
                    -- If no IP set, filter by model or product subtype
                    elseif (not ip or ip == "") then
                        local model_match = device.model and string.lower(device.model) == string.lower(GlobalObject.DeviceModel)
                        local subtype_match = device.product_subtype and string.find(string.lower(device.product_subtype), string.lower(GlobalObject.ProductSubType))
                        
                        if model_match or subtype_match then
                            target_device = device
                            print("Found DF511 device (no IP filter) at index " .. i)
                            print("  Model: " .. (device.model or "N/A"))
                            print("  Product Subtype: " .. (device.product_subtype or "N/A"))
                            print("  Local IP: " .. (device.local_ip or "N/A"))
                            break
                        end
                    end
                end
                if p_vid and target_device and target_device.vid == p_vid then
                    print("Device VID matches requested VID: " .. tostring(p_vid))
                    SET_CAMERA_IP(target_device.local_ip)
                elseif target_device and target_device.vid then
                    print("Storing device information for DF511:")
                    print("  VID: " .. target_device.vid)
                    print("  Device Name: " .. (target_device.device_name or "N/A"))
                    print("  Model: " .. (target_device.model or "N/A"))
                    print("  Local IP: " .. (target_device.local_ip or "N/A"))

                    -- Store VID
                    _props["VID"] = target_device.vid

                    C4:UpdateProperty("VID", target_device.vid)

                    -- Set IP Address if found and not already set
                    if target_device.local_ip and target_device.local_ip ~= "" then
                        if not ip or ip == "" then
                            SET_CAMERA_IP(target_device.local_ip)
                            print("  IP Address property updated to: " .. target_device.local_ip)
                        else
                            print("  IP Address already set to: " .. ip)
                        end
                    end
                    -- Enable MQTT after VID is set
                    if not MQTT_AUTO_ENABLED and Properties["Enable MQTT"] ~= "True" then
                        print("[MQTT] Auto enabling MQTT after device discovery")

                        mqtt_enabled = true
                        MQTT_AUTO_ENABLED = true

                        C4:UpdateProperty("Enable MQTT", "True")
                        _props["Enable MQTT"] = "True"

                        APPLY_MQTT_INFO()
                    end
                    -- Store device name if available
                    if target_device.device_name and target_device.device_name ~= "" then
                        _props["Device Name"] = target_device.device_name
                        C4:UpdateProperty("Device Name", target_device.device_name)
                        print("  Device Name property updated to: " .. target_device.device_name)
                    end

                    print("DF511 properties updated successfully")
                else
                    print("ERROR: No DF511 camera device found or vid missing")
                end
            end
        else
            print("Get devices failed with code: " .. tostring(code))
            --C4:UpdateProperty("Status", "Get devices failed: " .. tostring(err or code))
        end
    end)

    print("================================================================")
end
-- Set Device Property
function SET_DEVICE_PROPERTY(tParams)
    print("================================================================")
    print("              SET_DEVICE_PROPERTY CALLED                        ")
    print("================================================================")

    -- Get auth token from properties (bearer token)
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]

    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available. Please run LoginOrRegister first.")
        C4:UpdateProperty("Status", "Set property failed: No auth token")
        return
    end

    -- Get VID from properties
    local vid = _props["VID"] or Properties["VID"]

    if not vid or vid == "" then
        print("ERROR: No VID available. Please set VID property.")
        C4:UpdateProperty("Status", "Set property failed: No VID")
        return
    end

    print("Using bearer token: " .. auth_token)
    print("Using VID: " .. vid)

    -- Update status
    C4:UpdateProperty("Status", "Waking up camera...")

    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/device/do-action"

    -- Get current timestamp
    local current_time = os.time()

    -- Build input_params for wake-up action
    local input_params = {
        t = current_time,
        type = 0
    }

    -- Build request body for wake-up action
    local body = {
        vid = vid,
        action_id = "ac_wakelocal",
        input_params = json.encode(input_params),
        check_t = 0,
        is_async = 0
    }

    local headers = {
        ["Content-Type"] = "application/json",
        ["Accept-Language"] = "en",
        ["App-Name"] = GlobalObject.CldBusAppId,
        ["Authorization"] = "Bearer " .. auth_token
    }

    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = json.encode(body)
    }

    print("Sending request to: " .. url)
    print("Method: POST")
    print("Headers: " .. json.encode(headers))
    print("Body: " .. json.encode(body))

    -- Send request
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))
        if err then
            print("Error: " .. tostring(err))
        end
        print("----------------------------------------------------------------")

        if code == 200 or code == 20000 then
            print("Wake-up camera command succeeded")
            C4:UpdateProperty("Status", "Camera wake-up successful")

            local rtsp_url = GetRtspUrl() -- Call the helper to get the fresh URL
            C4:SendToProxy(CAMERA_BINDING, "RTSP_TRANSPORT", { TRANSPORT = "TCP" })
            C4:SendToProxy(CAMERA_BINDING, "RTSP_URL_PUSH", { URL = rtsp_url })
        else
            print("Wake-up camera command failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Wake-up failed: " .. tostring(err or code))
        end
    end)

    print("================================================================")
end

-- -----------------------
--  Apply MQTT Info
-- -----------------------

local function MQTT_GET_PASSWORD(clientId, clientSecret, callback)
    local url = "http://54.90.205.243:5000/generate-mqtt-credentials"

    transport.execute({
        url = url,
        method = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body = json.encode({
            clientId = clientId,
            clientSecret = clientSecret
        })
    }, function(code, resp)
        print("[MQTT] Generate Credentials API:", code, resp)

        if code ~= 200 then
            return callback(nil, nil)
        end

        local ok, parsed = pcall(json.decode, resp)
        if not ok or not parsed.password then
            return callback(nil, nil)
        end

        -- return both username and password
        callback(parsed.username, parsed.password)
    end)
end

function APPLY_MQTT_INFO()
    print("APPLY_MQTT_INFO called")
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["Device ID"] or _props["VID"] or Properties["Device ID"] or Properties["VID"]

    if not auth_token or auth_token == "" then
        print("APPLY_MQTT_INFO: missing auth token")
        update_prop("Status", "MQTT info failed: no auth token")
        return
    end
    if not vid or vid == "" then
        print("APPLY_MQTT_INFO: missing VID")
        update_prop("Status", "MQTT info failed: no vid")
        return
    end

    update_prop("Status", "Fetching MQTT info...")
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/apply-mqtt-info"

    local body_tbl = { vid = vid }
    local body_json = json.encode(body_tbl)

    local headers = {
        ["Content-Type"]  = "application/json",
        ["Authorization"] = "Bearer " .. auth_token,
        ["App-Name"]      = GlobalObject.CldBusAppId
    }

    local req = { url = url, method = "POST", headers = headers, body = body_json }

    transport.execute(req, function(code, resp, resp_headers, err)
        print("APPLY_MQTT_INFO response code:", tostring(code))
        if err then print("APPLY_MQTT_INFO error:", tostring(err)) end

        if code == 200 or code == 20000 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                local d = parsed.data

                local raw_host = d.mqtt_host or ""
                local secure = false

                if raw_host:match("^mqtts://") then
                    secure = true
                    raw_host = raw_host:gsub("^mqtts://", "")
                elseif raw_host:match("^mqtt://") then
                    raw_host = raw_host:gsub("^mqtt://", "")
                end


                local port = tonumber(d.mqtt_port)
                if not port then
                    port = secure and 8884 or 1883
                end


                if d.mqtt_host then update_prop(PROP_MQTT_HOST, raw_host) end
                if d.mqtt_port then update_prop(PROP_MQTT_PORT, tostring(port)) end
                if d.mqtt_client_id then update_prop(PROP_MQTT_CLIENT_ID, d.mqtt_client_id) end
                if d.mqtt_client_secret then update_prop(PROP_MQTT_SECRET, d.mqtt_client_secret) end


                _props.MQTT.host      = raw_host
                _props.MQTT.port      = d.mqtt_port
                _props.MQTT.client_id = d.mqtt_client_id
                _props.MQTT.secret    = d.mqtt_client_secret
                _props.MQTT.secure    = secure
                _props.MQTT.keepalive = 60
                _props.MQTT.packet_id = 1

                update_prop("Status", "MQTT info loaded")

                MQTT_GET_PASSWORD(_props.MQTT.client_id, _props.MQTT.secret, function(username, pwd)
                    if not pwd or not username then
                        update_prop("Status", "MQTT credentials error")
                        return
                    end

                    _props.MQTT.username = username
                    _props.MQTT.password = pwd

                    print("[MQTT] ✅ Username: " .. username)
                    print("[MQTT] ✅ Password received (len = " .. #pwd .. ")")

                    print("--------------------------------------------------")
                    print("[MQTT] 🔍 FINAL CONNECTION DATA")
                    print("[MQTT] Host:       " .. tostring(_props.MQTT.host))
                    print("[MQTT] Port:       " .. tostring(_props.MQTT.port))
                    print("[MQTT] Client ID:  " .. tostring(_props.MQTT.client_id))
                    print("[MQTT] Username:   " .. tostring(_props.MQTT.username))
                    print("[MQTT] Password:   " .. tostring(_props.MQTT.password))
                    print("[MQTT] KeepAlive:  " .. tostring(_props.MQTT.keepalive))
                    print("--------------------------------------------------")

                    MQTT.connect()
                end)

                return
            end
            update_prop("Status", "MQTT info parse error")
        else
            update_prop("Status", "MQTT info failed: " .. tostring(err or code))
        end
    end)
end

function OnConnectionStatusChanged(id, port, status)
    MQTT.onConnectionStatusChanged(id, port, status)

    if id ~= TCP_BINDING_ID then return end

    print("Connection status changed. ID:", id, "Port:", port, "Status:", status)

    -- Mark TCP as connected if status is ONLINE or CONNECTED
    local s = tostring(status):upper()
    _tcpConnected = (s == "ONLINE" or s == "CONNECTED")
    print("TCP Connected =", _tcpConnected)

    -- Send any pending auth token
    if _pendingAuthToken and _tcpConnected then
        UpdateAuthToken(_pendingAuthToken)
    end
end

function ReceivedFromNetwork(id, port, data)
    MQTT.onData(id, port, data)

    --Receives data through tcp and process
    if id ~= TCP_BINDING_ID or not data or data == "" then return end

    print("[TCP RX] Encrypted:", data)

    -- Strip CRLF delimiter if present
    if string.sub(data, -2) == "\r\n" then
        data = string.sub(data, 1, -3)
    end

    local cipher = "AES-256-CBC"
    local options = {
        return_encoding = "NONE",
        key_encoding    = "NONE",
        iv_encoding     = "NONE",
        data_encoding   = "BASE64",
        padding         = true,
    }

    local decrypted, err = C4:Decrypt(
        cipher,
        GlobalObject.AES_KEY,
        GlobalObject.AES_IV,
        data,
        options
    )

    if not decrypted then
        print("[TCP] Decryption failed:", tostring(err))
        return
    end

    print("[TCP RX] Decrypted:", decrypted)

    local ok, decoded = pcall(json.decode, decrypted)
    if not ok or type(decoded) ~= "table" then
        print("[TCP] JSON decode failed (dkjson)")
        return
    end


    local payload = decoded.message or decoded

    if payload.EventName ~= "LnduUpdate" then
        print("[TCP] Ignoring Event:", tostring(payload.EventName))
        return
    end

    print("[TCP] Processing LnduUpdate payload")

    -- Token
    if payload.Token and payload.Token ~= "" then
        print("[TCP] Auth Token received")
        UpdateAuthToken(payload.Token)
    else
        print("[TCP] Token missing in payload")
    end

    -- AppId
    if payload.AppId and payload.AppId ~= "" then
        GlobalObject.AppId = payload.AppId
        _props["AppId"] = payload.AppId
        C4:UpdateProperty("AppId", payload.AppId)
        print(string.format("[PROP] AppId updated => %s", payload.AppId))
    end

    -- AppSecret
    if payload.AppSecret and payload.AppSecret ~= "" then
        GlobalObject.AppSecret = payload.AppSecret
        _props["AppSecret"] = payload.AppSecret
        C4:UpdateProperty("AppSecret", payload.AppSecret)
        print("[PROP] AppSecret updated (hidden)")
    end

    C4:UpdateProperty("Status", "Authenticated via TCP")
    print("[TCP] LnduUpdate processing complete")
end

--Updates the authentication token.

function UpdateAuthToken(token)
    if not token or token == "" then return end

    if not _tcpConnected then
        print("[AUTH] TCP offline, queueing token")
        _pendingAuthToken = token
        return
    end

    GlobalObject.AccessToken = token
    _props["Auth Token"] = token
    C4:UpdateProperty("Auth Token", token)
    C4:UpdateProperty("Status", "Token received from Driver 1")
    print("[AUTH] Auth Token updated:", token)
    if not GET_DEVICES_CALLED then
        print("[DEVICE] Fetching device list")
        GET_DEVICES(nil)
        GET_DEVICES_CALLED = true
    end
    _pendingAuthToken = nil
end

local function can_notify(key, cooldown)
    local now = os.time()
    local last = last_sent[key] or 0
    cooldown = tonumber(cooldown) or 0
    if (now - last) < cooldown then
        return false
    end

    last_sent[key] = now
    return true
end


local function extract_filename(url)
    if not url then return nil end
    return url:match("([^/]+%.jpg)")
end
-- Replace normalize_signed_url with this:
local function normalize_http_url(url)
    if not url or url == "" then return url end
    -- Convert JSON-style escaped ampersands and slashes to raw
    url = url:gsub("\\u0026", "&") -- JSON escape → raw &
    url = url:gsub("&amp;", "&")   -- Defensive: HTML entity → raw &
    url = url:gsub("\\/", "/")     -- JSON-escaped slashes → raw /
    -- Trim whitespace
    url = url:gsub("^%s+", ""):gsub("%s+$", "")
    return url
end
function GetImageForEvent(extp, done)
    local vid   = Properties["VID"]
    local token = Properties["Auth Token"]
    local base  = Properties["Base API URL"] or "https://api.arpha-tech.com"

    if not extp then
        return done(nil)
    end

    local wanted_file = extp:match("([^/]+%.jpg)")
    if not wanted_file then
        return done(nil)
    end

    local url = base .. "/api/v3/openapi/notifications/query"

    transport.execute({
        url = url,
        method = "POST",
        headers = {
            ["Content-Type"]  = "application/json",
            ["Authorization"] = "Bearer " .. token,
            ["App-Name"]      = GlobalObject.CldBusAppId
        },
        body = json.encode({ page = 1, page_size = 10, vids = { vid } })
    }, function(code, resp)
        if code ~= 200 and code ~= 20000 then
            return done(nil)
        end

        local ok, parsed = pcall(json.decode, resp or "")
        if not ok or not parsed or not parsed.data then
            return done(nil)
        end

        local list = parsed.data.notifications
        if not list then return done(nil) end

        for _, n in ipairs(list) do
            local img = normalize_http_url(n.image_url)
            local fname = extract_filename(img)

            if fname == wanted_file then
                print("[MATCH] Found image for event:", fname)
                return done(img)
            end
        end

        print("[MATCH] No matching image yet")
        return done(nil)
    end)
end

local function record_history(severity, event_type, subcategory)
    local description = tostring(event_type or "Camera Event")

    if severity ~= "Info" and severity ~= "Warning" and severity ~= "Critical" then
        severity = "Info"
    end

    local uuid = C4:RecordHistory(
        severity,
        description,
        "Cameras",
        subcategory or "IP Camera"
    )

    if uuid then
        print("[HISTORY] Recorded OK:", description)
    else
        print("[HISTORY] FAILED")
    end

    return uuid
end



local function send_notification(category, event_name, cooldown_key, cooldown_sec, filename, extp)
    if category == NOTIFY.ALERT and not user_settings.enable_alerts then return end
    if category == NOTIFY.INFO and not user_settings.enable_info then return end
    if not can_notify(cooldown_key, cooldown_sec) then return end
    if not extp or extp == "" then
        print("[NOTIFY] no ext_p → skipping image fetch, firing event directly")
        record_history(
            category == NOTIFY.ALERT and "Critical" or "Info",
            event_name,
            "IP Camera"
        )
        C4:FireEvent(event_name, CAMERA_BINDING)
        return
    end
    local tries = 0

    local function fetch()
        tries = tries + 1

        GetImageForEvent(extp, function(url)
            if not url and tries < IMAGE_RETRY_COUNT then
                print("[IMG] retry", tries, "/", IMAGE_RETRY_COUNT)
                C4:SetTimer(IMAGE_RETRY_DELAY, fetch)
                return
            end

            LAST_EVENT_ID = LAST_EVENT_ID + 1
            local id = LAST_EVENT_ID

            if url then
                NOTIFICATION_URLS[id] = url
                table.insert(NOTIFICATION_QUEUE, id)
                print("[NOTIFY] image attached", url)
            else
                print("[NOTIFY] no image after retry")
            end
            record_history(
                category == NOTIFY.ALERT and "Critical" or "Info",
                event_name,
                "IP Camera"
            )
            C4:SetTimer(EVENT_DELAY_MS, function()
                C4:FireEvent(event_name, CAMERA_BINDING)
            end)
        end)
    end

    fetch()
end

local function handle_stranger(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.STRANGER, "stranger", COOLDOWN.stranger, filename, extp)
end

local function handle_motion(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.MOTION, "motion", COOLDOWN.motion, filename, extp)
end

local function handle_doorbell(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.DOORBELL, "doorbell", COOLDOWN.doorbell, filename, extp)
end


local function handle_unlock(event_name, filename, extp)
    print("[LOCK EVENT] Unlock detected:", event_name)

    updateLockState("UNLOCKED")

    send_notification(
        NOTIFY.INFO,
        event_name,
        "unlock",
        5,
        filename,
        extp
    )
end


local function handle_lock(event_name, filename, extp)
    print("[LOCK EVENT] Lock detected:", event_name)

    updateLockState("LOCKED")

    send_notification(
        NOTIFY.INFO,
        event_name,
        "lock",
        5,
        filename,
        extp
    )
end

local function handle_restart()
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_RESTARTED, "restart", COOLDOWN.restart)
end

local function handle_low_battery()
    send_notification(NOTIFY.ALERT, EVENT.LOW_BATTERY, "battery", COOLDOWN.battery)
end
local function handle_online_status(new_online)
    local now = os.time()

    -- Always handle ONLINE event
    if new_online then
        print("[STATUS] ONLINE event received")

        -- Prevent too frequent calls (very important)
        if now - last_ip_refresh >= MIN_REFRESH_GAP then
            print("[STATUS] Calling GET_DEVICES (allowed)")
            GET_DEVICES(Properties["VID"] or _props["VID"])
            last_ip_refresh = now
        else
            print("[STATUS] Skipped GET_DEVICES (too frequent)")
        end
    end

    -- Detect real state change (for notifications)
    if last_confirmed_online == nil or new_online ~= last_confirmed_online then
        last_confirmed_online = new_online

        if new_online then
            C4:UpdateProperty("Camera Status", "Online")
            _props["Camera Status"] = "Online"
            send_notification(
                NOTIFY.INFO,
                EVENT.CAMERA_ONLINE,
                "online",
                COOLDOWN.online
            )
        else
            C4:UpdateProperty("Camera Status", "Offline")
            _props["Camera Status"] = "Offline"
            send_notification(
                NOTIFY.ALERT,
                EVENT.CAMERA_OFFLINE,
                "offline",
                COOLDOWN.offline
            )
        end
    end
end

local function handle_device_status(msg)
    if not msg.status then return end

    for _, s in ipairs(msg.status) do
        if s.status_key == "is_online" then
            local is_online = (s.status_val == 1)
            handle_online_status(is_online)
            return
        end
    end
end


function HANDLE_JSON_EVENT(payload)
    local ok, msg = pcall(json.decode, payload)
    if not ok or type(msg) ~= "table" then
        return false
    end

    local now = os.time()

    ------------------------------------------------
    -- DEVICE EVENTS
    ------------------------------------------------
    if msg.method == "deviceEvent" and msg.event then
        local id     = msg.event.identifier or ""
        local params = msg.event.params or {}

        ------------------------------------------------
        -- 🎥 log_rec (Motion / Human / Doorbell)
        ------------------------------------------------
        if id == "log_rec" then
            local filename = nil
            local extp = params.ext_p

            if extp then
                filename = extp:match("([^/]+%.jpg)")
            end
            local t = tonumber(params.type)
            if t == 10021 then
                handle_motion(filename, extp)
                return true
            end

            if t == 10024 then
                handle_doorbell(filename, extp)
                return true
            end

            -- Unlock Events
            if t == 10004 then
                handle_unlock(EVENT.UNLOCK_PASSWORD, filename, extp)
                return true
            end
            if t == 10026 then
                handle_unlock(EVENT.UNLOCK_OFFLINE_PASS, filename, extp)
                return true
            end
            if t == 10005 then
                handle_unlock(EVENT.UNLOCK_PASSWORD, filename, extp)
                return true
            end
            if t == 10001 then
                handle_unlock(EVENT.UNLOCK_FACE, filename, extp)
                return true
            end
            if t == 10002 then
                handle_unlock(EVENT.UNLOCK_NFC, filename, extp)
                return true
            end
            if t == 10006 then
                handle_unlock(EVENT.UNLOCK_APP, filename, extp)
                return true
            end
            if t == 10009 then
                handle_unlock(EVENT.UNLOCK_ONE_CLICK, filename, extp)
                return true
            end
            if t == 10003 then
                handle_unlock(EVENT.UNLOCK_KEY, filename, extp)
                return true
            end

            -- Lock Events
            if t == 10007 then
                handle_lock(EVENT.LOCK_ONE_TOUCH, filename, extp)
                return true
            end
            if t == 10008 then
                handle_lock(EVENT.LOCK_EVENT, filename, extp)
                return true
            end
            if t == 10025 then
                handle_lock(EVENT.LOCK_REMOTE, filename, extp)
                return true
            end
            if t == 10028 then
                handle_lock(EVENT.LOCKING_STARTED, filename, extp)
                return true
            end
            if t == 10029 then
                handle_lock(EVENT.LOCKED_OUTSIDE, filename, extp)
                return true
            end


            return true
        end

        ------------------------------------------------
        -- 🚨 alarm_rec_v2 (Critical Alerts)
        ------------------------------------------------
        if id == "alarm_rec_v2" then
            local extp = params.ext_p
            local filename = extp and extp:match("([^/]+%.jpg)")
            local t = tonumber(params.type)

            print("[ALARM_REC_V2] type =", t)

            if t == 1 then
                handle_low_battery()
                return true
            end


            if t == 21 then
                print("[ALARM_REC_V2] motion → delayed fetch")
                handle_stranger(filename, extp)
                return true
            end


            if t == 24 or t == 10024 then
                print("[ALARM_REC_V2] doorbell → delayed fetch")
                handle_doorbell(filename, extp)
                return true
            end
            if t == 3 then
                -- Offline alert comes here but still
                -- needs stability confirmation
                pending_online = false
                pending_since  = now
                return true
            end

            return true
        end

        ------------------------------------------------
        -- 🔄 Camera Restart
        ------------------------------------------------
        if id == "stored_reset" then
            handle_restart()
            return true
        end

        return true
    end

    ------------------------------------------------
    -- DEVICE STATUS (ONLINE / OFFLINE)
    ------------------------------------------------
    if msg.method == "updateDeviceStatus" then
        handle_device_status(msg, now)
        return true
    end




    return false
end

function SEND_TEST_NOTIFICATION()
    print("===================================")
    print("[TEST] 🔔 START: Test Notifications")
    print("===================================")

    send_notification(NOTIFY.INFO, EVENT.MOTION, "test_motion", 0)
    send_notification(NOTIFY.INFO, EVENT.HUMAN, "test_human", 0)
    send_notification(NOTIFY.ALERT, EVENT.STRANGER, "test_stranger", 0)
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_OFFLINE, "test_offline", 0)
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_ONLINE, "test_online", 0)
end

------------------------MQTT EVENT HANDLERS-----------------------

-- Camera On/Off Commands
function CAMERA_ON(idBinding, tParams)
    print("================================================================")
    print("                  CAMERA_ON CALLED                              ")
    print("================================================================")

    -- For IP cameras that are always on, this is mostly informational
    -- You could wake camera from sleep mode via API if supported

    print("Camera power on requested")
    C4:UpdateProperty("Status", "Camera On")

    -- Send notification back to Control4
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "CAMERA_ON_NOTIFY", {})
    end

    print("================================================================")
end

function CAMERA_OFF(idBinding, tParams)
    print("================================================================")
    print("                  CAMERA_OFF CALLED                             ")
    print("================================================================")


    print("Camera power off requested")
    C4:UpdateProperty("Status", "Camera Off")

    -- Send notification back to Control4
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "CAMERA_OFF_NOTIFY", {})
    end

    print("================================================================")
end

-- Send Camera Properties to Control4 UI
function SendUpdateCameraProp(extractedData)
    print("================================================================")
    print("           SENDING CAMERA PROPERTIES TO UI                      ")
    print("================================================================")

    -- Extract data or use current properties if not provided
    local cameraData = extractedData or {}

    -- Get current camera properties
    local camera_props = {
        address = cameraData.address or Properties["IP Address"] or "",
        http_port = cameraData.http_port or Properties["HTTP Port"] or "3333",
        rtsp_port = cameraData.rtsp_port or Properties["RTSP Port"] or "554",
        authentication_required = cameraData.authentication_required or (Properties["Authentication Type"] ~= "NONE"),
        authentication_type = cameraData.authentication_type or Properties["Authentication Type"] or "NONE",
        username = cameraData.username or Properties["Username"] or "",
        password = "***HIDDEN***", -- Never send actual password to UI
        publicly_accessible = cameraData.publicly_accessible or false,
        vid = cameraData.vid or Properties["VID"] or "",
        product_id = cameraData.product_id or Properties["Product ID"] or "DF511",
        device_name = cameraData.device_name or Properties["Device Name"] or "LNDU Camera",
        status = cameraData.status or Properties["Status"] or "Unknown"
    }

    print("Camera Properties:")
    print("  Address: " .. camera_props.address)
    print("  HTTP Port: " .. camera_props.http_port)
    print("  RTSP Port: " .. camera_props.rtsp_port)
    print("  Auth Required: " .. tostring(camera_props.authentication_required))
    print("  Auth Type: " .. camera_props.authentication_type)
    print("  Username: " .. camera_props.username)
    print("  VID: " .. camera_props.vid)
    print("  Product: " .. camera_props.product_id)
    print("  Device Name: " .. camera_props.device_name)

    -- Encode as JSON
    local jsonString = json.encode(camera_props)
    print("JSON Data: " .. jsonString)

    -- Build XML wrapper for Control4 UI
    local xmlData = string.format([[
        <CameraProperties>
            <Command>UpdateUI</Command>
            <Data>%s</Data>
        </CameraProperties>
    ]], jsonString)

    -- Send to Control4 UI
    if C4 and C4.SendDataToUI then
        C4:SendDataToUI(xmlData)
        print("Camera properties sent to Control4 UI")
    else
        print("WARNING: C4:SendDataToUI not available")
    end

    print("================================================================")
end

function TEST_MAIN_STREAM(tParams)
    print("================================================================")
    print("              TEST_MAIN_STREAM CALLED                           ")
    print("================================================================")

  local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["RTSP Port"] or "554"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Build RTSP URL for main stream (stream0)
    local rtsp_url = string.format("rtsp://%s:%s/streamtype=0", ip, port)

    print("Main Stream RTSP URL: " .. rtsp_url)
    C4:UpdateProperty("Status", "Main stream URL generated")

    -- Store in properties if available
    if Properties["Main Stream URL"] then
        C4:UpdateProperty("Main Stream URL", rtsp_url)
    end

    print("================================================================")
end

-- 5. Test Sub Stream
function TEST_SUB_STREAM(tParams)
    print("================================================================")
    print("              TEST_SUB_STREAM CALLED                            ")
    print("================================================================")

  local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["RTSP Port"] or "554"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Build RTSP URL for sub stream (stream1)
    local rtsp_url = string.format("rtsp://%s:%s/streamtype=0", ip, port)

    print("Sub Stream RTSP URL: " .. rtsp_url)
    C4:UpdateProperty("Status", "Sub stream URL generated")

    -- Store in properties if available
    if Properties["Sub Stream URL"] then
        C4:UpdateProperty("Sub Stream URL", rtsp_url)
    end

    print("================================================================")
end

function GET_SNAPSHOT_URL(tParams)
    print("GET_SNAPSHOT_URL called")
    tParams = tParams or {}

    WakeCamera(3)

  local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["HTTP Port"] or "3333"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"


    local path = Properties["Snapshot URL Path"] or "/wps-cgi/image.cgi"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Optional resolution from tParams
    local width  = tParams.SIZE_X or 640
    local height = tParams.SIZE_Y or 480



    local snapshot_url
    if username ~= "" and password ~= "" then
        snapshot_url = string.format("http://%s:%s@%s:%s%s?resolution=%dx%d", username, password, ip, port, path, width,
            height)
    else
        snapshot_url = string.format("http://%s:%s%s?resolution=%dx%d", ip, port, path, width, height)
    end

    print("Generated snapshot URL: " .. snapshot_url)
    C4:UpdateProperty("Status", "Snapshot URL generated")

    -- Send to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "SNAPSHOT_URL", { URL = snapshot_url })
        print("Snapshot URL sent to proxy")
    end
end

function DISCOVER_CAMERAS_SDDP(tParams)
    print("================================================================")
    print("           DISCOVER CAMERAS VIA SDDP PROTOCOL                    ")
    print("================================================================")

    C4:UpdateProperty("Status", "Starting SDDP camera discovery...")

    print("SDDP (Simple Device Discovery Protocol) Discovery")
    print("This implementation scans the local network for SDDP-capable cameras")
    print("")

    local cameras_found = {}
    local scan_count = 0
    local responses_received = 0

    -- Get controller's network to determine scan range
    local controller_ip = C4:GetControllerNetworkAddress() or "192.168.1.1"
    print("Controller IP: " .. controller_ip)

    -- Extract network prefix (e.g., "192.168.1")
    local network_prefix = controller_ip:match("^(%d+%.%d+%.%d+)%.")
    if not network_prefix then
        print("ERROR: Could not determine network prefix from controller IP")
        C4:UpdateProperty("Status", "Discovery failed: Invalid network")
        return
    end

    print("Network prefix: " .. network_prefix .. ".x")
    print("")

    -- SDDP typically uses port 1902, but we'll also check ONVIF and HTTP ports

    local sddp_ports = {
        1902, -- Standard SDDP port
        80,   -- HTTP
        3333, -- Alternate HTTP
        8000, -- Common camera port
        554,  -- RTSP (some cameras respond here)
    }

    -- SDDP discovery endpoints and paths
    local sddp_paths = {
        "/sddp",                                      -- SDDP endpoint
        "/sddp/discover",                             -- SDDP discovery
        "/onvif/device_service",                      -- ONVIF (often supports SSDP/SDDP)
        "/cgi-bin/magicBox.cgi?action=getSystemInfo", -- Dahua cameras
        "/ISAPI/System/deviceInfo",                   -- Hikvision cameras
        "/api/system/deviceinfo",                     -- Generic camera API
        "/",                                          -- Root (check for device info)
    }

    -- We'll scan a smaller range for SDDP (last 50 IPs) for faster discovery
    local start_ip = 1
    local end_ip = Properties["IP Scan Range End"] or 50

    print("Scanning " .. network_prefix .. "." .. start_ip .. " to " .. network_prefix .. "." .. end_ip)
    print("Checking SDDP ports: 1902, 80, 3333, 8000, 554")
    print("")

    -- Function to check if response indicates a camera
    local function is_camera_response(data, response_code, headers)
        if not response_code then return false end

        -- Any response on SDDP port 1902 is likely a device
        if response_code == 200 or response_code == 401 or response_code == 400 then
            if data then
                local data_lower = string.lower(data)
                -- Check for camera/device indicators
                if data_lower:match("sddp") or
                    data_lower:match("onvif") or
                    data_lower:match("camera") or
                    data_lower:match("ipcam") or
                    data_lower:match("device") or
                    data_lower:match("dahua") or
                    data_lower:match("hikvision") or
                    data_lower:match("rtsp") or
                    data_lower:match("h264") or
                    data_lower:match("h265") or
                    data_lower:match("video") or
                    data_lower:match("stream") then
                    return true
                end
            end

            -- Check headers for device info
            if headers then
                for k, v in pairs(headers) do
                    local header_lower = string.lower(k .. " " .. tostring(v))
                    if header_lower:match("camera") or
                        header_lower:match("ipcam") or
                        header_lower:match("onvif") then
                        return true
                    end
                end
            end

            -- 401 (Auth required) often indicates a camera
            if response_code == 401 then
                return true
            end
        end

        return false
    end

    -- Scan network range
    for ip_suffix = start_ip, end_ip do
        local ip = network_prefix .. "." .. ip_suffix

        for _, port in ipairs(sddp_ports) do
            for _, path in ipairs(sddp_paths) do
                local test_url = "http://" .. ip .. ":" .. port .. path
                scan_count = scan_count + 1

                -- Probe the endpoint
                C4:urlGet(test_url, {}, false,
                    function(strError, responseCode, tHeaders, data, context, url)
                        responses_received = responses_received + 1

                        if is_camera_response(data, responseCode, tHeaders) then
                            -- Check if we already found this IP
                            local already_found = false
                            for _, cam in ipairs(cameras_found) do
                                if cam.ip == ip then
                                    already_found = true
                                    break
                                end
                            end

                            if not already_found then
                                local camera_info = {
                                    ip = ip,
                                    port = port,
                                    path = path,
                                    response_code = responseCode,
                                    requires_auth = (responseCode == 401),
                                    method = "SDDP Discovery",
                                    is_sddp_port = (port == 1902)
                                }

                                table.insert(cameras_found, camera_info)

                                print("")
                                print("*** CAMERA DISCOVERED VIA SDDP ***")
                                print("  IP Address: " .. ip)
                                print("  Port: " .. port .. (port == 1902 and " (SDDP)" or ""))
                                print("  Endpoint: " .. path)
                                print("  Response Code: " .. responseCode)
                                print("  Auth Required: " .. (responseCode == 401 and "Yes" or "No"))
                                print("")
                            end
                        end
                    end
                )
            end
        end
    end

    print("SDDP discovery scan initiated...")
    print("Probing " .. scan_count .. " endpoints")
    print("Waiting for responses...")
    print("")

    -- Wait for async responses (8 seconds for network probing)
    C4:SetTimer(8000, function(timer)
        print("")
        print("================================================================")
        print("          SDDP DISCOVERY SCAN COMPLETE                          ")
        print("================================================================")
        print("Probed: " .. scan_count .. " endpoints")
        print("Responses received: " .. responses_received)
        print("Cameras found: " .. #cameras_found)
        print("")

        if #cameras_found > 0 then
            print("Discovered Cameras via SDDP:")
            print("")
            for idx, cam in ipairs(cameras_found) do
                print(string.format("  [%d] %s:%d", idx, cam.ip, cam.port))
                print(string.format("      Endpoint: %s", cam.path))
                print(string.format("      Auth Required: %s", cam.requires_auth and "Yes" or "No"))
                print(string.format("      SDDP Port: %s", cam.is_sddp_port and "Yes" or "No"))
                print("")
            end

            -- Auto-map the first camera found (prefer SDDP port 1902)
            local first_camera = cameras_found[1]

            -- Prefer camera on SDDP port if available
            for _, cam in ipairs(cameras_found) do
                if cam.is_sddp_port then
                    first_camera = cam
                    break
                end
            end

            print("Auto-mapping first discovered camera...")
            print("  IP Address: " .. first_camera.ip)
            print("  HTTP Port: " .. (first_camera.port == 1902 and "3333" or tostring(first_camera.port)))
            print("  RTSP Port: 554")
            print("")

            C4:UpdateProperty("IP Address", first_camera.ip)
            C4:UpdateProperty("HTTP Port", first_camera.port == 1902 and "3333" or tostring(first_camera.port))
            C4:UpdateProperty("RTSP Port", "554")

            local status_msg = string.format("SDDP: Found %d camera(s), mapped %s",
                #cameras_found, first_camera.ip)
            C4:UpdateProperty("Status", status_msg)

            print("Camera mapped successfully!")
            print("You can now test snapshot/streaming functions.")
        else
            print("No cameras found via SDDP discovery.")
            print("")
            print("Troubleshooting:")
            print("  1. Ensure cameras are powered on and connected to network")
            print("  2. Verify cameras support SDDP protocol")
            print("  3. Check if cameras are on the same subnet as Control4")
            print("  4. Try 'Discover Cameras (HTTP Scan)' for broader search")
            print("  5. Some cameras may require SDDP to be enabled in settings")
            print("")
            C4:UpdateProperty("Status", "SDDP: No cameras found")
        end

        print("================================================================")
    end)
end

function DISCOVER_CAMERAS(tParams)
    print("================================================================")
    print("           DISCOVER CAMERAS VIA HTTP SCAN                        ")
    print("================================================================")

    C4:UpdateProperty("Status", "Scanning network for cameras...")

    -- Get Control4 controller's IP address to determine network range
    local controller_ip = C4:GetControllerNetworkAddress() or "192.168.1.1"
    print("Controller IP: " .. controller_ip)

    -- Extract network prefix (e.g., 192.168.1)
    local network_prefix = controller_ip:match("^(%d+%.%d+%.%d+)%.")
    if not network_prefix then
        print("ERROR: Could not determine network range from controller IP")
        C4:UpdateProperty("Status", "Discovery failed: Invalid network")
        return
    end

    print("Network prefix: " .. network_prefix)
    print("Scanning network range: " .. network_prefix .. ".1-254")
    print("")

    local cameras_found = {}
    local scan_count = 0
    local common_camera_ports = { 80, 3333, 554, 8000 }

    -- Scan common IP range (first 30 IPs for testing, can be expanded)
    for i = 1, 999 do
        local test_ip = network_prefix .. "." .. i
        scan_count = scan_count + 1

        --print("[" .. scan_count .. "] Probing: " .. test_ip)

        -- Try common camera ports
        for _, port in ipairs(common_camera_ports) do
            local test_url = "http://" .. test_ip .. ":" .. port .. "/"
            print("[" .. test_url .. "] ")
            -- Use C4:urlGet for non-blocking network check with short timeout
            local ticketId = C4:urlGet(test_url, {}, false,
                function(strError, responseCode, tHeaders, data, context, url)
                    if responseCode and (responseCode == 200 or responseCode == 401 or responseCode == 403) then
                        -- Camera likely found (200=ok, 401/403=auth required but device responds)
                        local camera_info = {
                            ip = test_ip,
                            port = port,
                            response_code = responseCode,
                            requires_auth = (responseCode == 401)
                        }

                        table.insert(cameras_found, camera_info)

                        print("")
                        print("*** CAMERA FOUND ***")
                        print("  IP: " .. test_ip)
                        print("  Port: " .. port)
                        print("  Response Code: " .. responseCode)
                        print("  Authentication: " .. (camera_info.requires_auth and "Required" or "Not Required"))
                        print("")
                    end
                end
            )
        end
    end

    -- Wait for async responses to complete
    C4:SetTimer(10000, function(timer)
        print("")
        print("================================================================")
        print("                  DISCOVERY SCAN COMPLETE                        ")
        print("================================================================")
        print("Scanned " .. scan_count .. " IP addresses")
        print("Found " .. #cameras_found .. " potential camera(s)")
        print("")

        if #cameras_found > 0 then
            print("Discovered Cameras:")
            for idx, cam in ipairs(cameras_found) do
                print(string.format("  [%d] %s:%d (Auth: %s, Response: %d)",
                    idx, cam.ip, cam.port, cam.requires_auth and "Yes" or "No", cam.response_code))
            end
            print("")

            -- Auto-map the first camera found
            local first_camera = cameras_found[1]
            print("Auto-mapping first camera to driver...")
            print("  Setting IP Address: " .. first_camera.ip)
            print("  Setting HTTP Port: " .. first_camera.port)

            C4:UpdateProperty("IP Address", first_camera.ip)
            C4:UpdateProperty("HTTP Port", tostring(first_camera.port))

            local status_msg = string.format("Found %d camera(s), mapped %s:%d",
                #cameras_found, first_camera.ip, first_camera.port)
            C4:UpdateProperty("Status", status_msg)

            print("")
            print("Camera mapped successfully!")
            print("You can now test snapshot/streaming functions.")
        else
            print("No cameras found on network.")
            print("Suggestions:")
            print("  - Verify cameras are powered on")
            print("  - Check cameras are on same network as Control4")
            print("  - Try manually setting IP Address if camera is known")
            C4:UpdateProperty("Status", "No cameras found")
        end

        print("================================================================")
    end)
end

function UIRequest(strCommand, tParams)
    print("================================================================")
    print("UIRequest called: " .. tostring(strCommand))
    if tParams then
        print("UIRequest Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    print("================================================================")

    -- Route camera commands and RETURN their results FIRST, then wake camera
    if strCommand == "GET_SNAPSHOT_QUERY_STRING" then
        local result = "<snapshot_query_string>" ..
            C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>"
        return result
    elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
        local result = "<rtsp_h264_query_string>" ..
            C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(5001, tParams)) .. "</rtsp_h264_query_string>"
        return result
    elseif strCommand == "GET_MJPEG_QUERY_STRING" then
        return "<mjpeg_query_string>" ..
            C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(5001, tParams)) .. "</mjpeg_query_string>"
    elseif strCommand == "GET_STREAM_URLS" then
        return GET_STREAM_URLS(5001, tParams)
    elseif strCommand == "URL_GET" then
        return URL_GET(5001, tParams)
    elseif strCommand == "RTSP_URL_PUSH" then
        return RTSP_URL_PUSH(5001, tParams)
    end

    -- Legacy support
    if strCommand == "GET_CAMERA_URL" or strCommand == "GET_SNAPSHOT_URL" then
        GET_SNAPSHOT_URL(tParams)
        return
    end
end

function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("================================================================")
    print("ReceivedFromProxy: binding=" .. tostring(idBinding) .. " command=" .. tostring(strCommand))

    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    print("================================================================")
   -- Handle IP change from Camera Proxy
    if strCommand == "SET_ADDRESS" then
        local new_ip = tParams["ADDRESS"]

        if new_ip == "127.0.0.1" then
            print("[CAMERA] Ignoring default proxy IP")
            return
        end

        print("[CAMERA] Proxy IP updated:", new_ip)

        SET_CAMERA_IP(new_ip)

        return
    end

    -- Handle camera proxy commands
    if idBinding == 5003 or idBinding == 8001 then
        if strCommand == "SELECT" then
            -- Send current lock state to UI
            local currentLockState = _props["Lock Status"] or "UNKNOWN"
            local iconState = (currentLockState == "LOCKED" and "locked") or
                (currentLockState == "UNLOCKED" and "unlocked") or "unknown"
            local jsonString = "{ \"state\": \"" .. iconState .. "\" }"
            C4:SendToProxy(8001, "ICON_CHANGED", { icon = iconState, icon_description = jsonString })
            C4:SendToProxy(8001, "UPDATE_UI", {})
            return
        end

        if strCommand == "CAMERA_LIVE_PREVIEW" then
            return ""
        end
    end

    if idBinding == 5001 then
        -- Camera properties
      local ip = _props["IP Address"] or Properties["IP Address"]
        local http_port = Properties["HTTP Port"] or "3333"
        local rtsp_port = Properties["RTSP Port"] or "554"
        local username = Properties["Username"] or "SystemConnect"
        local password = Properties["Password"] or "123456"

        if not ip or ip == "" then
            print("ERROR: IP Address not configured")
            C4:UpdateProperty("Status", "Camera command failed: No IP Address")
            return
        end

        if strCommand == "GET_SNAPSHOT_URL" then
            GET_SNAPSHOT_URL(tParams)
            return
        end

        if strCommand == "GET_STREAM_URLS" then
            -- Check if authentication is required
            local auth_required = Properties["Authentication Type"] ~= "NONE"

            local main_rtsp, sub_rtsp
            if auth_required and username ~= "" and password ~= "" then
                main_rtsp = string.format("rtsp://%s:%s@%s:%s/streamtype=0", username, password, ip, rtsp_port)
                sub_rtsp  = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, ip, rtsp_port)
            else
                main_rtsp = string.format("rtsp://%s:%s/streamtype=0", ip, rtsp_port)
                sub_rtsp  = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
            end

            print("Sending Stream URLs")
            print("  Main RTSP: " .. main_rtsp)
            print("  Sub RTSP: " .. sub_rtsp)


            C4:SendToProxy(5001, "RTSP_URL_CHANGED", { URL = main_rtsp }, "TEXT")

            C4:UpdateProperty("Main Stream URL", main_rtsp)
            C4:UpdateProperty("Sub Stream URL", sub_rtsp)
            C4:UpdateProperty("Status", "Stream URLs sent")
            return
        end

        if tParams then
            print("Parameters:")
            for k, v in pairs(tParams) do
                print("  " .. tostring(k) .. " = " .. tostring(v))
            end
        end
        print("================================================================")
        -- Handle camera proxy commands
        if strCommand == "CAMERA_ON" then
            CAMERA_ON(5001, tParams)
        elseif strCommand == "CAMERA_OFF" then
            CAMERA_OFF(5001, tParams)
        elseif strCommand == "GET_SNAPSHOT_QUERY_STRING" then
            local result = "<snapshot_query_string>" ..
                C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>"
            return result
        elseif strCommand == "GET_STREAM_URLS" then
            GET_STREAM_URLS(5001, tParams)
        elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
            local result = "<rtsp_h264_query_string>" ..
                C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(5001, tParams)) .. "</rtsp_h264_query_string>"
            return result
        elseif strCommand == "GET_MJPEG_QUERY_STRING" then
            return "<mjpeg_query_string>" ..
                C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(5001, tParams)) .. "</mjpeg_query_string>"
        elseif strCommand == "URL_GET" then
            URL_GET(5001, tParams)
        elseif strCommand == "RTSP_URL_PUSH" then
            RTSP_URL_PUSH(5001, tParams)
        end
    end
    --lock biding id
    if idBinding == 5002 then
        if strCommand == "LOCK" then
            LockDoorHardware()
            return
        elseif strCommand == "UNLOCK" then
            UnlockDoorHardware()
            return
        elseif strCommand == "QUERY_STATE" then
            ReportDoorState()
            return
        elseif strCommand == "REQUEST_SETTINGS" then
            C4:SendToProxy(5002, "SETTINGS", { supports_lock = true })
            return
        elseif strCommand == "REQUEST_CUSTOM_SETTINGS" then
            C4:SendToProxy(5002, "CUSTOM_SETTINGS", {})
            return
        else
            print("Unknown Lock command: " .. strCommand)
            return
        end
    end
end

function GetNotificationAttachmentURL(id)
    print("GetNotificationAttachmentURL called")

    local event_id = table.remove(NOTIFICATION_QUEUE, 1)
    if not event_id then
        print("no event id")
        return nil
    end

    local url = NOTIFICATION_URLS[event_id]
    print("returning url for", event_id, url)
    return url
end

function GetNotificationAttachmentFile()
    print("GetNotificationAttachmentFile()")
    local fileName = "/mnt/internal/c4z/notification_driver/www/snap1vga.jpg"

    return fileName
end

function GetNotificationAttachmentBytes()
    print("GetNotificationAttachmentBytes()")
    local fileData = ""
    C4:FileSetDir("/mnt/internal/c4z/notification_driver/www")

    if (C4:FileExists("snap1vga.jpg")) then
        print("File Exists")
        local fh = C4:FileOpen("snap1vga.jpg")
        if (fh == -1) then
            print("Error opening jpg file")
            return
        end
        if (C4:FileIsValid(fh)) then
            print("FileIsValid")
            C4:FileSetPos(fh, 0)
            fileData = C4:FileRead(fh, 20000)
        else
            print("Error: file is invalid")
        end
        C4:FileClose(fh)
    else
        print("Error image File does not exist")
    end

    --local encoded = C4:Base64Encode(fileData)
    return C4:Base64Encode(fileData)
end

function FinishedWithNotificationAttachment(id)
    print("FinishedWithNotificationAttachment id =", id)

    if (id == 1001) then
        -- do some cleanup for Memory
        print("Memory cleanup")
    elseif (id == 1002) then
        print("File cleanup")
    elseif (id == 1003) then
        print("[NOTIFY] URL cleanup (safe)")
    else
        print("invalid id")
    end
end

-- =====================================
-- SEND LOCK COMMAND (High-level)
-- =====================================
function SEND_LOCK_COMMAND(isLock)
    print("SEND_LOCK_COMMAND called, isLock =", tostring(isLock))
    if type(isLock) ~= "boolean" then return end

    if isLock then
        LockDoorHardware()
    else
        UnlockDoorHardware()
    end
end

-- After telling the control4 that user wants to lock or unlock door, it calls ON_PROXY_COMMAND
function ON_PROXY_COMMAND(proxy_id, command, tParams)
    print("ON_PROXY_COMMAND called. proxy_id:", proxy_id, "command:", command)

    -- Lock Proxy
    if proxy_id == 5002 then
        if command == "LOCK" then
            LockDoorHardware()
        elseif command == "UNLOCK" then
            UnlockDoorHardware()
        elseif command == "QUERY_STATE" then
            -- Optional: cloud query
        end
        return
    end
end

-- =====================================
-- CLOUD COMMANDS
-- =====================================
function LockDoorHardware()
    print("LockDoorHardware called")

    if AUTO_LOCK_TIMER then
        AUTO_LOCK_TIMER:Cancel()
        AUTO_LOCK_TIMER = nil
    end

    local vid = _props["VID"] or Properties["VID"]
    local token = _props["Auth Token"] or Properties["Auth Token"]

    if not vid or not token then
        print("ERROR: Missing VID or Auth Token")
        C4:FireEvent("Lock")
        updateLockState("UNKNOWN")
        return
    end

    local url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
        .. "/api/v3/openapi/device/remote-lock"

    local body = {
        vid = vid,
        cmd = 2 -- 2 = lock
    }

    -- Send the cloud command and update state only if successful
    sendCloudbusRequest(url, token, body, function(success)
        if success then
            C4:FireEvent("Lock")  -- triggers physical lock in smart lock module
            updateLockState("LOCKED")
        else
            updateLockState("UNKNOWN")
        end
    end)
end

function UnlockDoorHardware()
    print("UnlockDoorHardware called")

    local vid = _props["VID"] or Properties["VID"]
    local token = _props["Auth Token"] or Properties["Auth Token"]

    if not vid or not token then
        print("ERROR: Missing VID or Auth Token")
        C4:FireEvent("Lock")
        updateLockState("UNKNOWN")
        return
    end

    local url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
        .. "/api/v3/openapi/device/remote-lock"

    local body = {
        vid = vid,
        cmd = 1 -- 1 = unlock
    }

    -- Send the cloud command and update state only if successful
    sendCloudbusRequest(url, token, body, function(success)
        if success then
            C4:FireEvent("Unlock")
            updateLockState("UNLOCKED")
            --trigger the autorelock
            StartAutoRelock()
        else
            updateLockState("UNKNOWN")
        end
    end)
end

-- =====================================
-- Send HTTP Request
-- =====================================
function sendCloudbusRequest(url, token, body, callback)
    local headers = {
        ["Authorization"] = "Bearer " .. token,
        ["Content-Type"] = "application/json",
        ["Accept-Language"] = "en"
    }

    transport.execute({
        url = url,
        method = "POST",
        headers = headers,
        body = json.encode(body)
    }, function(code, resp, _, err)
        print("Cloudbus response code:", code)
        print("Cloudbus response body:", resp or "nil")

        if code ~= 200 or not resp then
            if err then print("Error:", err) end
            callback(false)
            return
        end

        local ok, decoded = pcall(json.decode, resp)
        if not ok or decoded.code ~= 20000 then
            callback(false)
            return
        end

        callback(true)
    end)
end

-- =====================================
-- Update Lock State & Animate
-- =====================================
function updateLockState(state)
    -- Normalize state
    local normalized = (state == "LOCKED" and "LOCKED") or (state == "UNLOCKED" and "UNLOCKED") or "UNKNOWN"
    print("Updating lock state:", normalized)

    --  Update Lock Status property (for automation)
    C4:UpdateProperty("Lock Status", normalized)

    -- Force padlock update
    local iconState = (normalized == "LOCKED" and "locked") or (normalized == "UNLOCKED" and "unlocked") or "unknown"
    local jsonString = "{ \"status\": \"" .. normalized .. "\" }"

    if C4 and C4.SendToProxy then
        C4:SetTimer(100, function()
            -- Lock proxy (automation)
            C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = iconState })

            -- UI proxy (padlock icon)
            C4:SendToProxy(5003, "ICON_CHANGED", { icon = iconState, icon_description = jsonString })
            C4:SendToProxy(5003, "UPDATE_UI", {})
        end)
    end

    -- Fire events for automation
    if normalized == "LOCKED" then
        C4:FireEvent("Lock")
    elseif normalized == "UNLOCKED" then
        C4:FireEvent("Unlock")
    else
        C4:FireEvent("Lock Error")
        C4:FireEvent("Unlock Error")
    end
end

-- =====================================
-- Optional: Report Door State
-- =====================================
function ReportDoorState()
    print("ReportDoorState called")
    local state = Properties["Status"]
    if state ~= "LOCKED" and state ~= "UNLOCKED" then
        updateLockState("UNKNOWN")
    end
end

-- =====================================
-- Handle UIRequest from Control4 (padlock)
-- =====================================
function HandleSelect(bindingID, strValue, tParams)
    print("HandleSelect called")

    -- tParams is sent from UI;
    tParams = tParams or {}

    local menu = tParams.Menu or strValue or "unknown"
    print("Menu selected:", menu)

    -- Call lock/unlock based on UI selection
    if menu == "security" then
        if tParams.action == "lock" then
            SEND_LOCK_COMMAND(true)
        elseif tParams.action == "unlock" then
            SEND_LOCK_COMMAND(false)
        else
            print("Unknown HandleSelect action:", tParams.action or "none")
        end
    else
        print("Unknown menu selected:", menu)
    end
end

function SetLockUnlock(bindingID, strValue, tParams)
    tParams = tParams or {}

    local commandRaw = tParams.command or strValue or ""
    commandRaw = commandRaw:match("^%s*(.-)%s*$")

    -- Capitalize first letter for LUA_ACTION / padlock
    local commandCap = commandRaw:sub(1, 1):upper() .. commandRaw:sub(2)

    print("SetLockUnlock called. raw:", commandRaw, "capitalized:", commandCap)

    -- Trigger hardware
    if commandRaw == "lock" or commandRaw == "Lock" then
        SEND_LOCK_COMMAND(true)
    elseif commandRaw == "unlock" or commandRaw == "Unlock" then
        SEND_LOCK_COMMAND(false)
    else
        print("Unknown SetLockUnlock command:", commandRaw)
    end

    -- Force LUA_ACTION / padlock animation to fire
    if C4 and C4.ExecuteCommand then
        C4:ExecuteCommand("LUA_ACTION", commandCap)
    end
end

function StartAutoRelock()
    local seconds = tonumber(Properties["Lock Seconds"]) or 0

    if seconds <= 0 then
        print("Auto relock disabled")
        return
    end

    print("Auto relock in", seconds, "seconds")

    if AUTO_LOCK_TIMER then
        AUTO_LOCK_TIMER:Cancel()
        AUTO_LOCK_TIMER = nil
    end

    AUTO_LOCK_TIMER = C4:SetTimer(seconds * 1000, function()
        print("Auto relock timer fired")

        LockDoorHardware()
    end)
end

function QUERY_NOTIFICATIONS(tParams)
    print("QUERY_NOTIFICATIONS called")

    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["VID"] or Properties["VID"] or ""

    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available")
        return
    end

    -- Build request body based on your specification
    local body_tbl = {
        page = 0,
        page_size = 1, -- We only need the latest one for the snapshot
        group_type = {},
        probe_type = {},
        storage_type = {},
        start_timestamp = 0,
        end_timestamp = 0,
        isread = 0,
        vids = { vid } -- Filter by this specific camera's VID
    }

    local body_json = json.encode(body_tbl)
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/notifications/query"

    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. auth_token,
        ["App-Name"] = GlobalObject.CldBusAppId
    }

    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = body_json
    }

    transport.execute(req, function(code, resp, resp_headers, err)
        if code == 200 or code == 20000 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.notifications then
                local latest = parsed.data.notifications[1]
                if latest and latest.image_url and latest.image_url ~= "" then
                    print("Latest snapshot URL found: " .. latest.image_url)

                    -- Push the URL to the Control4 Proxy
                    C4:SendToProxy(5001, "SNAPSHOT_URL_PUSH", { URL = latest.image_url })

                    -- Update the property so it shows in Composer
                    if (Properties["Snapshot URL"]) then
                        C4:UpdateProperty("Snapshot URL", latest.image_url)
                    end
                end
            end
        else
            print("Query notifications failed: " .. tostring(err or code))
        end
    end)
end

function GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)
    -- The proxy already has the IP and Port. Only return the query path.
    local snapshot_path = "wps-cgi/image.cgi?resolution=640x480"

    print("Snapshot Path returned: " .. snapshot_path)
    return snapshot_path
end

-- GET_STREAM_URLS - Return streaming URLs for various codecs
function GET_STREAM_URLS(idBinding, tParams)
    print("================================================================")
    print("              GET_STREAM_URLS CALLED                            ")
    print("================================================================")

    if tParams then
        print("Requested stream parameters:")
        for k, v in pairs(tParams) do
            print("  " .. k .. " = " .. tostring(v))
        end
    end

    -- Get camera properties
  local ip = _props["IP Address"] or Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get Stream URLs failed: No IP Address")
        return
    end


    local auth_required = Properties["Authentication Type"] ~= "NONE"

    local rtsp_main, rtsp_sub
    if auth_required and username ~= "" and password ~= "" then
        rtsp_main = string.format("rtsp://%s:%s@%s:%s/streamtype=0",
            username, password, ip, rtsp_port)
        rtsp_sub = string.format("rtsp://%s:%s@%s:%s/streamtype=1",
            username, password, ip, rtsp_port)
    else
        rtsp_main = string.format("rtsps://%s:%s/streamtype=0",
            ip, rtsp_port)
        rtsp_sub = string.format("rtsps://%s:%s/streamtype=0",
            ip, rtsp_port)
    end

    print("Main Stream URL (H264): " .. rtsp_main)
    print("Sub Stream URL (H264): " .. rtsp_sub)

    -- Store URLs in properties
    C4:UpdateProperty("Main Stream URL", rtsp_main)
    C4:UpdateProperty("Sub Stream URL", rtsp_sub)

    -- Send response back to proxy
    if C4 and C4.SendToProxy then
        -- Send H264 URLs
        C4:SendToProxy(5001, "RTSP_H264_URL", {
            URL = rtsp_main,
            RESOLUTION = "640x480"
        })

        C4:SendToProxy(5001, "RTSP_H264_SUB_URL", {
            URL = rtsp_sub,
            RESOLUTION = "640x480"
        })

        print("Sent stream URLs to proxy")
    end

    C4:UpdateProperty("Status", "Stream URLs generated")
    print("================================================================")

    return {
        RTSP_H264_MAIN = rtsp_main,
        RTSP_H264_SUB = rtsp_sub
    }
end

-- GET_RTSP_H264_QUERY_STRING - Return H264 RTSP stream URL
function GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
    print("================================================================")
    print("        GET_RTSP_H264_QUERY_STRING (WITH CREDENTIALS)           ")
    print("================================================================")

    local user = Properties["Username"] or "SystemConnect"
    local pass = Properties["Password"] or "123456"

    -- 1. Setup the Protocol FIRST
    C4:SendToProxy(5001, "AUTHENTICATION_TYPE_CHANGED", { TYPE = "NONE" })
    C4:SendToProxy(5001, "RTSP_TRANSPORT", { TRANSPORT = "TCP" })

    -- 2. Push the Credentials (Only if you feel the proxy 'forgot' them)
    C4:SendToProxy(5001, "USERNAME_CHANGED", { USERNAME = user })
    C4:SendToProxy(5001, "PASSWORD_CHANGED", { PASSWORD = pass })

    -- 3. Wake the hardware
    WakeCamera(3)


    local rtsp_path = "streamtype=0"

    print("RTSP Path generated: " .. rtsp_path)
    return rtsp_path
end

-- GET_MJPEG_QUERY_STRING - Return MJPEG stream URL
function GET_MJPEG_QUERY_STRING(idBinding, tParams)
    print("================================================================")
    print("GET_MJPEG_QUERY_STRING CALLED")
    print("================================================================")

    local width = tonumber((tParams and (tParams.SIZE_X or tParams.WIDTH)) or 640)
    local height = tonumber((tParams and (tParams.SIZE_Y or tParams.HEIGHT)) or 480)
    local rate = tonumber((tParams and tParams.RATE) or 15)

    print("Requested MJPEG stream:")
    print("Resolution: " .. width .. "x" .. height)
    print("Frame rate: " .. rate .. " fps")

    local mjpeg_query = string.format(
        "video.mjpg?resolution=%dx%d&fps=%d",
        width,
        height,
        rate
    )

    print("Returning MJPEG query string: " .. mjpeg_query)

    C4:UpdateProperty("Status", "MJPEG query generated")

    return mjpeg_query
end

-- URL_GET - Control4 app requests camera URLs for streaming
function URL_GET(idBinding, tParams)
    print("================================================================")
    print("                  URL_GET CALLED                                ")
    print("================================================================")

    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. k .. " = " .. tostring(v))
        end
    end

    -- Get camera properties
  local ip = _props["IP Address"] or Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "URL_GET failed: No IP Address")
        return
    end

    -- Check if authentication is required
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    -- Build URLs for different stream types
    local rtsp_main_url, rtsp_sub_url, snapshot_url, mjpeg_url

    if auth_required and username ~= "" and password ~= "" then
        rtsp_main_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1",
            username, password, ip, rtsp_port)
        rtsp_sub_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1",
            username, password, ip, rtsp_port)

        mjpeg_url = string.format("http://%s:%s@%s:%s/video.mjpg",
            username, password, ip, http_port)
    else
        rtsp_main_url = string.format("rtsp://%s:%s/streamtype=1",
            ip, rtsp_port)
        rtsp_sub_url = string.format("rtsp://%s:%s/streamtype=1",
            ip, rtsp_port)

        mjpeg_url = string.format("http://%s:%s/video.mjpg",
            ip, http_port)
    end

    print("Generated URLs:")
    print("  RTSP Main: " .. rtsp_main_url)
    print("  RTSP Sub: " .. rtsp_sub_url)
    print("  Snapshot: " .. snapshot_url)
    print("  MJPEG: " .. mjpeg_url)

    -- Send URLs back to proxy for Control4 app
    if C4 and C4.SendToProxy then
        -- Send primary RTSP URL for main stream
        C4:SendToProxy(5001, "RTSP_H264_URL", {
            URL = rtsp_main_url
        })


        -- Send MJPEG URL for live view
        C4:SendToProxy(5001, "MJPEG_URL", {
            URL = mjpeg_url
        })

        print("Sent URLs to proxy for Control4 app")
    end

    C4:UpdateProperty("Status", "Camera URLs sent to app")
    print("================================================================")

    return {
        RTSP_H264_MAIN = rtsp_main_url,
        RTSP_H264_SUB = rtsp_sub_url,
        SNAPSHOT = snapshot_url,
        MJPEG = mjpeg_url
    }
end

-- RTSP_URL_PUSH - Push RTSP URL to Control4 app for streaming
function RTSP_URL_PUSH(idBinding, tParams)
    print("================================================================")
    print("               RTSP_URL_PUSH CALLED                             ")
    print("================================================================")

    -- Get camera properties
  local ip = _props["IP Address"] or Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "RTSP_URL_PUSH failed: No IP Address")
        return
    end

    -- Check if authentication is required
    --changed here
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    -- Build RTSP URL for main stream (high quality for Control4 app)
    local rtsp_url
    if auth_required and username ~= "" and password ~= "" then
        rtsp_url = string.format("rtsp://%s:%s@%s:%s/streamtype=0",
            username, password, ip, rtsp_port)
    else
        rtsp_url = string.format("rtsp://%s:%s/streamtype=0",
            ip, rtsp_port)
    end

    print("Pushing RTSP URL: " .. rtsp_url)

    -- Update property
    C4:UpdateProperty("Main Stream URL", rtsp_url)

    -- Send to Control4 app via proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "RTSP_URL", {
            URL = rtsp_url,
            USERNAME = username,
            PASSWORD = password,
            IP = ip,
            PORT = rtsp_port
        })

        print("RTSP URL pushed to Control4 app")
    end

    C4:UpdateProperty("Status", "RTSP streaming ready")
    print("================================================================")
    return rtsp_url
end

function GetRtspUrl()
  local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["RTSP Port"] or "554"
    local user = Properties["Username"] or "SystemConnect" -- or whatever DF511 uses
    local pass = Properties["Password"] or "123456"
    if user and pass and pass ~= "" then
        return string.format("rtsp://%s:%s@%s:%s/streamtype=0", user, pass, ip, port)
    else
        return string.format("rtsp://%s:%s/streamtype=0", ip, port)
    end
end
