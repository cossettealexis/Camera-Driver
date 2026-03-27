local _props             = {}
local json               = require("CldBusApi.dkjson")
local http               = require("CldBusApi.http")
local auth               = require("CldBusApi.auth")
local transport          = require("CldBusApi.transport_c4")
local util               = require("CldBusApi.util")
local MQTT               = require("mqtt_manager")
-- Local state
local LAST_EVENT_ID      = 0
local NOTIFICATION_URLS  = {}
local NOTIFICATION_QUEUE = {}
PENDING_NOTIFICATION_URL = nil
ACTIVE_NOTIFICATION_URL  = nil
LAST_NOTIFY_ID           = LAST_NOTIFY_ID or nil
MAX_TIME_DRIFT           = 600    -- seconds (acceptable drift)

local CAMERA_BINDING     = 5001
local EVENT_DELAY_MS     = tonumber(Properties["Event Interval (ms)"]) or 7000

local last_ip_refresh    = 0
local MIN_REFRESH_GAP    = 5     -- seconds (small gap, not too strict)
-- Camera wake timing constants (global)
CAMERA_WAKE_DURATION_SEC = 10    -- Camera stays awake for 10 seconds after wake call
CAMERA_WAKE_COOLDOWN_SEC = 5     -- Must wait 5 seconds before next wake call


-- Track first RTSP call to skip wake on initial attempt
local rtsp_first_call       = true

local NOTIFY                = {
    ALERT = "ALERT",
    INFO  = "INFO"
}

-- User toggles (bind later to driver properties if needed)
local user_settings         = {
    enable_alerts = true,
    enable_info   = true
}

-- Cooldown windows (seconds)
local COOLDOWN              = {
    motion   = 0,
    human    = 0,
    online   = 10,
    offline  = 10,
    restart  = 30,
    stranger = 0

}

-- Track last notification times
local last_sent             = {}
local last_confirmed_online = nil


--TCP variables
local _pendingAuthToken       = nil
local _tcpConnected           = false
local TCP_BINDING_ID          = 7001

GlobalObject                  = {}
GlobalObject.LnduBaseUrl      = "https://api.arpha-tech.com"
GlobalObject.ClientID         = ""
GlobalObject.ClientSecret     = ""
GlobalObject.AES_KEY          = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV           = "33rj6KNVN4kFvd0s"                 --16 bytes
GlobalObject.BaseUrl          = ""
GlobalObject.TCP_SERVER_IP    = 'tuyadev.slomins.net'
GlobalObject.TCP_SERVER_PORT  = 8081
GlobalObject.DeviceModel      = "vd05"
GlobalObject.ProductSubType   = "video_bell"
GlobalObject.CldBusAppId      = ""
GlobalObject.CldBusSecret     = ""
GlobalObject.CustomerEmail    = ""
GlobalObject.BaseApi          = "https://qa2.slomins.com/QA/OntechSvcs/1.2/ontech"


CameraDefaultProps             = {}
CameraDefaultProps.IPAddress   = ""
CameraDefaultProps.HTTPPort    = "8080"
CameraDefaultProps.RTSPPort    = "8554"
CameraDefaultProps.MainStream  = "stream0"
CameraDefaultProps.SubStream   = "stream1"
CameraDefaultProps.SnapshotURL = "tmp/snap.jpeg"
CameraDefaultProps.MJPEGURL    = "video.mjpg"

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


local EVENT = {
    MOTION           = "Motion Detected",
    DOORBELL         = "Doorbell Ring",
    CAMERA_ONLINE    = "Camera Online",
    CAMERA_OFFLINE   = "Camera Offline",
    CAMERA_RESTARTED = "Camera Restarted",
    HUMAN            = "Human Detected",
    LOW_BATTERY      = "Low Battery",
    STRANGER         = "Stranger Detected"
}


local mqtt_enabled       = false
local WAKE_DURATION      = 17 -- seconds
local WAKE_INTERVAL      = 23 -- seconds

local MQTT_AUTO_ENABLED  = false
local GET_DEVICES_CALLED = false
-- Wake Camera with Retry and stop retry after retry attempts
function WakeCamera(retry)
    retry = retry or 1
    local attempt = 0

    local function try_wake()
        attempt = attempt + 1

        AWAKE_CAMERA({})

        if attempt < retry then
            local next_wake_delay = (WAKE_DURATION + WAKE_INTERVAL) * 1000 -- Convert to milliseconds
            C4:SetTimer(next_wake_delay, function(timer)
                try_wake()
            end)
        else
            print("Wake retry " .. retry .. " times done")
        end
    end

    -- Start first attempt immediately (runs in parallel with RTSP connection)
    try_wake()
end

--[[
    Establishes a TCP connection to the configured server.
    Creates the network connection, applies TCP port options
    (auto-connect, keep-alive, monitoring, etc.), and initiates
    the connection using the global server IP and port.
]]

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

--[[
    Logs property changes for debugging purposes.
    Displays the property name and its new value, or indicates
    when the property is hidden and its value should not be shown.
]]


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
    --Call TCP upon driver initialization
    TcpConnection()
    print("=== VD05 Driver Initialized ===")
    C4:UpdateProperty("Camera Status", "Unknown")
    -- Initialize properties
    for k, v in pairs(Properties) do
        if k ~= "Password" then
            print("Property [" .. k .. "] = " .. tostring(v))
        end
        _props[k] = v
    end
    
    -- Sync IP Address property with Camera Proxy
    local ip_address = Properties["IP Address"]
    if ip_address and ip_address ~= "" and ip_address ~= "127.0.0.1" then
        print("[INIT] Setting Camera Proxy IP to: " .. ip_address)
        C4:SendToProxy(5001, "ADDRESS_CHANGED", { ADDRESS = ip_address })
    else
        print("[INIT] No valid IP Address set, keeping default")
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
    print("=== VD05 Driver Destroyed ===")
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
    print("=== VD05 Driver Late Init ===")
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

    -- Send camera configuration to Camera Proxy
    local ip = _props["IP Address"]
    local http_port = CameraDefaultProps.HTTPPort or "8080"
    local rtsp_port = CameraDefaultProps.RTSPPort or "8554"

    if ip and ip ~= "" then
        print("Sending camera configuration to Camera Proxy:")

        -- Send camera address and ports to Camera Proxy
        if C4 and C4.SendToProxy then
            -- Send HTTP port
            C4:SendToProxy(5001, "HTTP_PORT_CHANGED", { PORT = http_port })
            print("  Sent HTTP_PORT_CHANGED to Camera Proxy")

            -- Send RTSP port
            C4:SendToProxy(5001, "RTSP_PORT_CHANGED", { PORT = rtsp_port })
            print("  Sent RTSP_PORT_CHANGED to Camera Proxy")

            -- Send authentication settings
            C4:SendToProxy(5001, "AUTHENTICATION_REQUIRED", { REQUIRED = "False" })
            print("  Sent AUTHENTICATION_REQUIRED: True to Camera Proxy")

            print("Camera Proxy configuration complete!")
        end
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

    if strProperty == "IP Address" then
        local ip = Properties["IP Address"]

        if ip and ip ~= "" then
            C4:SendToProxy(5001, "SET_ADDRESS", {
                ADDRESS = ip
            })
        end
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

    local value = Properties[strProperty]
    print("Property [" .. strProperty .. "] changed to: " .. tostring(value))
    _props[strProperty] = value

    -- If IP Address changes, regenerate camera URLs
    if strProperty == "IP Address" and value and value ~= "" then
        print("IP Address changed, updating camera URLs...")

        local rtsp_port = Properties["RTSP Port"] or "8554"
        local auth_required = Properties["Authentication Type"] ~= "NONE"
        local username = Properties["Username"] or "SystemConnect"
        local password = Properties["Password"] or "123456"

        local rtsp_url
        if auth_required and username ~= "" and password ~= "" then
            rtsp_url = "stream0"
        else
            rtsp_url = "stream0"
        end

        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", string.gsub(rtsp_url, "stream0", "stream1"))
        print("Updated RTSP URL: " .. rtsp_url)

        -- Update UI with new camera properties
        --SendUpdateCameraProp()
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

function ExecuteCommand(strCommand, tParams)
    print("ExecuteCommand called: " .. strCommand)

    if strCommand == "InitializeCamera" or strCommand == "INITIALIZE_CAMERA" then
        InitializeCamera()
        return
    end

    if strCommand == "LoginOrRegister" or strCommand == "LOGIN_OR_REGISTER" then
        local country_code = (tParams and tParams.country_code) or "N"
        local account = Properties["Account"]
        if not account or account == "" then
            account = GlobalObject.CustomerEmail
        end

        LoginOrRegister(country_code, account)
        return
    end

    if strCommand == "GET_SNAPSHOT_URL" then
        GET_SNAPSHOT_URL(tParams)
        return
    end
    if strCommand == "GET_TEMP_TOKEN" then
        GET_TEMP_TOKEN(tParams)
        return
    end
    if strCommand == "GET_EXCHANGE_TOKEN" then
        GET_EXCHANGE_TOKEN(tParams)
        return
    end
    if strCommand == "GET_DEVICES" then
        GET_DEVICES(tParams)
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
    if strCommand == "AWAKE_CAMERA" then
        AWAKE_CAMERA(tParams)
        return
    end
    if strCommand == "TEST_PUSH_NOTIFICATION" then
        SEND_TEST_NOTIFICATION()
        return
    end
    if strCommand == "GET_CAMERA_PROPERTIES" then
        local props = GET_CAMERA_PROPERTIES()
        SendUpdateCameraProp(props)
        return
    end
    if strCommand == "UPDATE_UI_PROPERTIES" then
        SendUpdateCameraProp()
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
    C4:UpdateProperty("Status", "InitializeCamera....")
    -- Generate a single ClientID for this session
    local client_id = util.uuid_v4()
    GlobalObject.ClientID = client_id

    -- Generate other values for init
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = GlobalObject.CldBusSecret

    -- Prepare message and signature
    local message = string.format("client_id=%s&request_id=%s&time=%s&version=%s",
        client_id, request_id, time, version)
    local signature = util.hmac_sha256_hex(message, app_secret)

    -- Build request body
    local body_tbl = {
        sign       = signature,
        client_id  = client_id,
        request_id = request_id,
        time       = time,
        version    = version
    }
    local body_json = json.encode(body_tbl)

    -- Send request to camera init API
    local base_url = GlobalObject.LnduBaseUrl
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
    print("[Camera Init] Sending request to:", url)
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response body: " .. tostring(resp))
        if err then print("Error: " .. tostring(err)) end
        print("----------------------------------------------------------------")
        C4:UpdateProperty("Status", "Camera init response received: " .. tostring(code))
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.public_key then
                local public_key = parsed.data.public_key

                local country_code = "N"
                local account = Properties["Account"]
                if not account or account == "" then
                    account = GlobalObject.CustomerEmail
                end
                
                if not account or account == "" then
                    print("ERROR: No customer email available")
                    C4:UpdateProperty("Status", "Login failed: No email")
                    return
                end

                LoginOrRegister(country_code, account, public_key)
            else
                print("ERROR: No public key in response")
                C4:UpdateProperty("Status", "Init failed: No public key")
            end
        else
            print("Camera init failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Init failed: " .. tostring(err or code))
        end
    end)

    print("================================================================")
end


-- Convert binary data to hex string
function BinaryToHex(binary)
    return (binary:gsub('.', function(c)
        return string.format('%02x', string.byte(c))
    end))
end

function LoginOrRegister(country_code, account, public_key)
    print("================================================================")
    print("              LOGIN OR REGISTER CALLED                          ")
    print("================================================================")

    print("[Login] Using public key:", public_key)
    C4:UpdateProperty("Status", "LoginOrRegister ")
    -- Use stored ClientID
    local client_id = GlobalObject.ClientID
    if not client_id or client_id == "" then
        print("ERROR: No ClientID available. Must run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No ClientID")
        return
    end
    print("[Login] Using ClientID:", client_id)

    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = GlobalObject.CldBusSecret

    local post_data_obj = { country_code = country_code, account = account }
    local post_data_json = json.encode(post_data_obj)

    C4:UpdateProperty("Status", "Encrypting credentials...")

    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)
        if not success or not encrypted_data then
            print("ERROR: Encryption failed:", error_msg)
            return
        end

        local post_data_hex = encrypted_data
        local message = string.format("client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, post_data_hex, request_id, time)
        local signature = util.hmac_sha256_hex(message, app_secret)

        local body_tbl = {
            sign       = signature,
            post_data  = post_data_hex,
            client_id  = client_id,
            request_id = request_id,
            time       = time
        }
        local body_json = json.encode(body_tbl)


        local base_url = GlobalObject.LnduBaseUrl
        local url = base_url .. "/api/v3/openapi/auth/login-or-register"

        local headers = {
            ["Content-Type"] = "application/json",
            ["Accept-Language"] = "en",
            ["App-Name"] =  GlobalObject.CldBusAppId
        }

        local req = {
            url = url,
            method = "POST",
            headers = headers,
            body = body_json
        }

        transport.execute(req, function(code, resp, _, err)
            print("----------------------------------------------------------------")
            print("Response code: " .. tostring(code))
            print("Response body: " .. tostring(resp))
            if err then print("Error: " .. tostring(err)) end
            print("----------------------------------------------------------------")

            if code == 200 then
                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed and parsed.data then
                    local token =
                        parsed.data.token or
                        parsed.data.access_token or
                        parsed.data.jwt

                    if token and token ~= "" then
                        _props["Auth Token"] = token
                        GlobalObject.AccessToken = token
                        C4:UpdateProperty("Auth Token", token)
                        print("[Login] Auth token stored:", token)

                        -- Send token + ClientID to NODE API
                        SendTokenToNodeAPI(token)
                    else
                        print("ERROR: Login succeeded but no token found")
                    end

                    C4:UpdateProperty("Status", "Login successful")
                    GET_DEVICES() -- set camera properties after login
                else
                    print("ERROR: Failed to parse login response")
                    C4:UpdateProperty("Status", "Login failed: Invalid response")
                end
            else
                print("Login failed with code:", code)
                C4:UpdateProperty("Status", "Login failed: " .. tostring(err or code))
            end
        end)
    end)
end

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

-- Sends the token to Node API with retries and async handling
function SendTokenToNodeAPI(token)
    local attempt = 1
    local max_attempts = 5

    local app_secret = GlobalObject.CldBusSecret
    local function SendTokenRetry()
        local url = "http://54.90.205.243:3000/send-to-control4"

        local body = {
            message = {
                EventName   = "LnduUpdate",
                Token       = token,
                ClientID    = GlobalObject.ClientID,
                AppId       = GlobalObject.CldBusAppId,
                AppSecret   = app_secret,
                AccountName = GlobalObject.AccountName,
                C4UniqueMac = C4:GetUniqueMAC()
            }
        }

        local req = {
            url = url,
            method = "POST",
            headers = {
                ["Content-Type"]    = "application/json",
                ["Accept-Language"] = "en",
                ["App-Name"]        = GlobalObject.CldBusAppId
            },
            body = json.encode(body),
            timeout = 10
        }

        print("[NodeAPI] Sending token , App Id and App Secret to Node API...")

        transport.execute(req, function(code, resp, headers, err)
            if code == 200 then
                print("[NodeAPI] SUCCESS: Token delivered!")
            else
                print(string.format("[NodeAPI] Response: %s | Error: %s", tostring(code), tostring(err)))
                if attempt < max_attempts then
                    attempt = attempt + 1
                    C4:SetTimer(5000, SendTokenRetry)
                end
            end
        end)
    end

    SendTokenRetry()
end

-- 3. Get Devices
function GET_DEVICES(p_vid)
    print("================================================================")
    print("                GET_DEVICES CALLED                              ")
    print("================================================================")


    local ip = _props["IP Address"] or Properties["IP Address"]

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
                            print("Found VD05 device (no IP filter) at index " .. i)
                            print("  Model: " .. (device.model or "N/A"))
                            print("  Product Subtype: " .. (device.product_subtype or "N/A"))
                            print("  Local IP: " .. (device.local_ip or "N/A"))
                            break
                        end
                    end
                end
                
                if not target_device and ip then
                    print("WARNING: No device found matching IP " .. ip .. " in GET_DEVICES response")
                    print("Keeping SDDP-discovered IP, waiting for correct device match")
                    return
                end
                
                if target_device and target_device.vid then
                    print("Storing device information for VD05:")
                    print("  VID: " .. target_device.vid)
                    print("  Device Name: " .. (target_device.device_name or "N/A"))
                    print("  Model: " .. (target_device.model or "N/A"))
                    print("  Local IP: " .. (target_device.local_ip or "N/A"))

                    _props["VID"] = target_device.vid
                    C4:UpdateProperty("VID", target_device.vid)

                    if target_device.device_name and target_device.device_name ~= "" then
                        _props["Device Name"] = target_device.device_name
                        C4:UpdateProperty("Device Name", target_device.device_name)
                        print("  Device Name property updated to: " .. target_device.device_name)
                    end

                    -- Set IP Address if found and not already set
                    if target_device.local_ip and target_device.local_ip ~= "" then
                        if not ip or ip == "" then
                            SET_CAMERA_IP(target_device.local_ip)
                            print("  IP Address property updated to: " .. target_device.local_ip)
                        else
                            print("  IP Address already set to: " .. ip)
                        end
                    end
                    
                    if not MQTT_AUTO_ENABLED and Properties["Enable MQTT"] ~= "True" then
                        print("[MQTT] Auto enabling MQTT after device discovery")

                        mqtt_enabled = true
                        MQTT_AUTO_ENABLED = true

                        C4:UpdateProperty("Enable MQTT", "True")
                        _props["Enable MQTT"] = "True"

                        APPLY_MQTT_INFO()
                    end
                    
                    print("VD05 properties updated successfully")
                else
                    print("ERROR: No VD05 camera device found or vid missing")
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
function AWAKE_CAMERA(tParams)
    print("================================================================")
    print("              AWAKE_CAMERA CALLED                        ")
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

    -- Update status
    C4:UpdateProperty("Status", "Waking up camera...")

    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/device/do-action"

    -- Build request body with ac_wakelocal action
    local body = {
        vid = vid,
        action_id = "ac_wakelocal",
        input_params = json.encode({ t = os.time(), type = 0 }),
        check_t = 0,
        is_async = 0
    }

    local headers = {
        ["Content-Type"] = "application/json",
        ["Accept-Language"] = "en",
        ["Authorization"] = "Bearer " .. auth_token
    }

    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = json.encode(body)
    }


    -- Send request
    transport.execute(req, function(code, resp, resp_headers, err)
        if err then
            print("Error: " .. tostring(err))
        end

        if code == 200 or code == 20000 then
            C4:UpdateProperty("Status", "Camera wake-up successful")
            print("Camera wake-up successful")

            -- FORCE CONTROL4 TO DROP CACHE AND RECONNECT
            if C4 and C4.SendToProxy then
                -- C4:SendToProxy(5001, "RTSP_URL_PUSH", {})

                -- C4:SendToProxy(5001, "SNAPSHOT_INVALIDATE", {})
            end
        else
            print("Wake-up failed with code: " .. tostring(code))
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
        ["App-Name"]      = "cldbus"
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

    if payload.C4UniqueMac ~= C4:GetUniqueMAC() then
        print("[TCP] Unique MAC mismatch. Ignoring message.", tostring(payload.C4UniqueMac))
        return
    end
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

    --AccountName
    if payload.AccountName and payload.AccountName ~= "" then
        GlobalObject.AccountName = payload.AccountName
        _props["AccountName"] = payload.AccountName
        C4:UpdateProperty("AccountName", payload.AccountName)
        print("[PROP] AccountName updated => " .. payload.AccountName)
    end
    C4:UpdateProperty("Status", "Authenticated via TCP")
    print("[TCP] LnduUpdate processing complete")
end

--[[
    Updates the authentication token.
    If TCP is offline, the token is queued and sent once the
    connection is established.
]]
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
    _pendingAuthToken = nil
    if not GET_DEVICES_CALLED then
        print("[DEVICE] Fetching device list")
        GET_DEVICES(nil)
        GET_DEVICES_CALLED = true
    end
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
            ["App-Name"]      = "cldbus"
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

    local tries = 0

    local function fetch()
        tries = tries + 1

        GetImageForEvent(extp, function(url)
            if not url and tries < 6 then
                C4:SetTimer(400, fetch)
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

local function handle_human(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.HUMAN, "human", COOLDOWN.human, filename, extp)
end
local function handle_doorbell(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.DOORBELL, "doorbell", COOLDOWN.doorbell, filename, extp)
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
            if params.type == 10021 then
                handle_motion(filename, extp)
                return true
            end

            if params.type == 10022 then
                handle_human(filename, extp)
                return true
            end

            if params.type == 10024 then
                handle_doorbell(filename, extp)
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
            if params.type == 21 then
                handle_stranger(filename, extp)
                return true
            end

            if params.type == 1 then
                handle_low_battery()
                return true
            end

            if params.type == 3 then
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

    handle_online_status(true)

    C4:SetTimer(2000, function()
        print("[TEST] Simulating OFFLINE event")
        handle_online_status(false)
    end)
end

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
        C4:SendToProxy(idBinding, "CAMERA_ON_NOTIFY", {})
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
        C4:SendToProxy(idBinding, "CAMERA_OFF_NOTIFY", {})
    end

    print("================================================================")
end

-- Get Camera Snapshot (as image data, not just URL)
function GET_CAMERA_SNAPSHOT(idBinding, tParams)
    print("================================================================")
    print("            GET_CAMERA_SNAPSHOT CALLED                          ")
    print("================================================================")

    -- Get snapshot resolution from params or use defaults
    local width = tonumber((tParams and tParams.WIDTH) or 1920)
    local height = tonumber((tParams and tParams.HEIGHT) or 1080)

    print("Requested snapshot resolution: " .. width .. "x" .. height)

    -- Get camera properties
    local ip = _props["IP Address"] or Properties["IP Address"]
    local username = Properties["Username"] or ""
    local password = Properties["Password"] or ""
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Snapshot failed: No IP Address")
        return
    end

    -- Build snapshot URL
    local snapshot_url
    if auth_required and username ~= "" and password ~= "" then
        snapshot_url = string.format("http://%s:%s@%s:8080/tmp/snap.jpeg",
            username, password, ip, width, height)
    else
        snapshot_url = string.format("http://%s:8080/tmp/snap.jpeg",
            ip, width, height)
    end

    print("Fetching snapshot from: " .. snapshot_url)

    -- Fetch the actual image data
    C4:urlGet(snapshot_url, {}, false, function(strError, responseCode, tHeaders, data, context, url)
        if responseCode == 200 and data then
            print("Snapshot retrieved successfully (" .. #data .. " bytes)")

            -- Send image data back to Control4
            if C4 and C4.SendToProxy then
                C4:SendToProxy(idBinding, "SNAPSHOT", {
                    DATA = data,
                    WIDTH = tostring(width),
                    HEIGHT = tostring(height),
                    FORMAT = "JPEG"
                })
                print("Snapshot sent to Control4 app")
            end

            C4:UpdateProperty("Status", "Snapshot captured")
        else
            print("ERROR: Failed to get snapshot. Response code: " .. tostring(responseCode))
            if strError then
                print("Error: " .. strError)
            end
            C4:UpdateProperty("Status", "Snapshot failed")
        end
    end)

    print("================================================================")
end

-- Get Current Camera Properties (for external requests)
function GET_CAMERA_PROPERTIES()
    print("================================================================")
    print("           GET_CAMERA_PROPERTIES CALLED                         ")
    print("================================================================")

    local camera_props = {
        address = Properties["IP Address"] or "",
        http_port = Properties["HTTP Port"] or "8080",
        rtsp_port = Properties["RTSP Port"] or "8554",
        authentication_required = (Properties["Authentication Type"] ~= "NONE"),
        authentication_type = Properties["Authentication Type"] or "NONE",
        username = Properties["Username"] or "",
        password = Properties["Password"] or "", -- Full password for internal use
        publicly_accessible = false,
        vid = Properties["VID"] or "",
        product_id = Properties["Product ID"] or "VD05",
        device_name = Properties["Device Name"] or "LNDU Camera",
        main_stream_url = Properties["Main Stream URL"] or "",
        sub_stream_url = Properties["Sub Stream URL"] or "",
        status = Properties["Status"] or "Unknown"
    }

    print("Returning camera properties")
    print("================================================================")

    return camera_props
end

-- 4. Test Main Stream
function TEST_MAIN_STREAM(tParams)
    print("================================================================")
    print("              TEST_MAIN_STREAM CALLED                           ")
    print("================================================================")

    local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["RTSP Port"] or "8554"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Build RTSP URL for main stream (stream0)
    local rtsp_url = string.format("rtsp://%s:%s/stream0", ip, port)

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
    local port = Properties["RTSP Port"] or "8554"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Build RTSP URL for sub stream (stream1)
    local rtsp_url = "stream1"
    -- string.format("rtsp://%s:%s/stream1", ip, port)

    print("Sub Stream RTSP URL: " .. rtsp_url)
    C4:UpdateProperty("Status", "Sub stream URL generated")

    -- Store in properties if available
    if Properties["Sub Stream URL"] then
        C4:UpdateProperty("Sub Stream URL", rtsp_url)
    end

    print("================================================================")
end

function GET_SNAPSHOT_URL(params)
    print("GET_SNAPSHOT_URL called")
    params = params or {}

    local ip = _props["IP Address"] or Properties["IP Address"]
    local port = Properties["HTTP Port"] or "8080"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    local path = Properties["Snapshot Path"] or "tmp/snap.jpeg"

    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end

    -- Build URL
    local url
    if username ~= "" and password ~= "" then
        url = "tmp/snap.jpeg"
    else
        url = "tmp/snap.jpeg"
    end

    local newsnapshot_url
    if username ~= "" and password ~= "" then
        newsnapshot_url = "tmp/snap.jpeg"
    else
        newsnapshot_url = "tmp/snap.jpeg"
    end

    print("Generated snapshot URL: " .. url)
    print("Generated new snapshot URL: " .. newsnapshot_url)
    C4:UpdateProperty("Status", "Snapshot URL generated")

    -- Send to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "SNAPSHOT_URL", { URL = url })
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
    -- Since UDP multicast isn't available, we'll probe HTTP endpoints that respond to SDDP queries
    local sddp_ports = {
        1902, -- Standard SDDP port
        80,   -- HTTP
        8080, -- Alternate HTTP
        8000, -- Common camera port
        8554, -- RTSP (some cameras respond here)
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
    print("Checking SDDP ports: 1902, 80, 8080, 8000, 8554")
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
            print("  HTTP Port: " .. (first_camera.port == 1902 and "8080" or tostring(first_camera.port)))
            print("  RTSP Port: 8554")
            print("")

            C4:UpdateProperty("IP Address", first_camera.ip)
            C4:UpdateProperty("HTTP Port", first_camera.port == 1902 and "8080" or tostring(first_camera.port))
            C4:UpdateProperty("RTSP Port", "8554")

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
    local common_camera_ports = { 80, 8080, 8554, 8000 }

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
        local result = "<snapshot_query_string>" ..
            C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>"
        return result
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
    -- if strCommand == "CAMERA_ON" then
    --     CAMERA_ON(idBinding, tParams)
    -- elseif strCommand == "CAMERA_OFF" then
    --     CAMERA_OFF(idBinding, tParams)
    -- elseif strCommand == "GET_CAMERA_SNAPSHOT" then
    --     return GET_CAMERA_SNAPSHOT(idBinding, tParams)
    -- elseif strCommand == "GET_SNAPSHOT_QUERY_STRING" then
    --     local result = "<snapshot_query_string>" ..
    --     C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>"
    --     return result
    -- elseif strCommand == "GET_STREAM_URLS" then
    --     GET_STREAM_URLS(idBinding, tParams)
    -- elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
    --     local result = "<rtsp_h264_query_string>" ..
    --     C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(5001, tParams)) .. "</rtsp_h264_query_string>"
    --     return result
    -- elseif strCommand == "GET_MJPEG_QUERY_STRING" then
    --     return "<mjpeg_query_string>" ..
    --     C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(idBinding, tParams)) .. "</mjpeg_query_string>"
    -- elseif strCommand == "URL_GET" then
    --     URL_GET(idBinding, tParams)
    -- elseif strCommand == "RTSP_URL_PUSH" then
    --     RTSP_URL_PUSH(idBinding, tParams)
    -- else
    --     print("Unknown command from proxy: " .. strCommand)
    -- end
end

-- GET_SNAPSHOT_QUERY_STRING - Return snapshot URL query string
function GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)
    print("================================================================")
    print("           GET_SNAPSHOT_QUERY_STRING CALLED                     ")
    print("================================================================")

    -- Control4 uses SIZE_X and SIZE_Y, not WIDTH and HEIGHT
    local width = tonumber((tParams and (tParams.SIZE_X or tParams.WIDTH)) or 640)
    local height = tonumber((tParams and (tParams.SIZE_Y or tParams.HEIGHT)) or 480)

    print("Requested resolution: " .. width .. "x" .. height)

    -- Get camera properties
    local ip = _props["IP Address"] or Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "8080"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get Snapshot URL failed: No IP Address")
        return ""
    end

    -- Camera Proxy will build: http://username:password@ip:port/path
    local snapshot_path = string.format("tmp/snap.jpeg", width, height)

    print("Snapshot Path: " .. snapshot_path)
    print("Camera Proxy will build full URL with IP: " .. ip .. " and port: " .. http_port)

    C4:UpdateProperty("Status", "Snapshot path generated")
    print("================================================================")
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
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get Stream URLs failed: No IP Address")
        return
    end

    -- Build RTSP URLs for VD05 camera
    -- Main stream (high quality): stream0
    -- Sub stream (low quality): stream1

    -- Check if authentication is required
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    local rtsp_main, rtsp_sub
    if auth_required and username ~= "" and password ~= "" then
        rtsp_main = "stream0"
        rtsp_sub = "stream1"
    else
        rtsp_main = "stream0"
        rtsp_sub = "stream1"
    end

    print("Main Stream URL (H264): " .. rtsp_main)
    print("Sub Stream URL (H264): " .. rtsp_sub)

    -- Store URLs in properties
    C4:UpdateProperty("Main Stream URL", rtsp_main)
    C4:UpdateProperty("Sub Stream URL", rtsp_sub)

    -- Send response back to proxy
    if C4 and C4.SendToProxy then
        -- Send H264 URLs
        C4:SendToProxy(idBinding, "RTSP_H264_URL", {
            URL = rtsp_main,
            RESOLUTION = "1920x1080"
        })

        C4:SendToProxy(idBinding, "RTSP_H264_SUB_URL", {
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
    print("         GET_RTSP_H264_QUERY_STRING CALLED                      ")
    print("================================================================")

    -- Control4 uses SIZE_X and SIZE_Y, not WIDTH and HEIGHT
    local width = tonumber((tParams and (tParams.SIZE_X or tParams.WIDTH)) or 320)
    local height = tonumber((tParams and (tParams.SIZE_Y or tParams.HEIGHT)) or 240)
    local rate = tonumber((tParams and tParams.RATE) or 15)

    print("Requested H264 stream:")
    print("  Resolution: " .. width .. "x" .. height)
    print("  Frame rate: " .. rate .. " fps")

    -- Get camera properties
    local ip = _props["IP Address"] or Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    local wake_delay = tonumber(Properties["Event Interval (ms)"]) or 5000

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get H264 URL failed: No IP Address")
        return
    end

    -- Skip wake on first call, only wake on subsequent calls
    if rtsp_first_call then
        print("[RTSP] First call - skipping wake")
        rtsp_first_call = false
    else
        print("[RTSP] Subsequent call - waking camera for streaming session...")
        WakeCamera(1)
    end

    -- Determine stream type based on resolution
    -- Higher resolution -> main stream (stream0)
    -- Lower resolution -> sub stream (stream1)
    local streamtype = 0
    if width >= 1280 or height >= 720 then
        streamtype = 0
        print("Using main stream (high quality)")
    else
        streamtype = 1
        print("Using sub stream (low quality)")
    end

    -- Camera Proxy will build: rtsp://username:password@ip:port/streamtype=X
    local rtsp_path = "stream" .. streamtype

    print("RTSP Path: " .. rtsp_path)
    print("Camera Proxy will build full URL with IP: " .. ip .. " and port: " .. rtsp_port)

    C4:UpdateProperty("Status", "H264 stream path generated")
    print("================================================================")
    return rtsp_path
end

-- GET_MJPEG_QUERY_STRING - Return MJPEG stream URL
function GET_MJPEG_QUERY_STRING(idBinding, tParams)
    print("================================================================")
    print("           GET_MJPEG_QUERY_STRING CALLED                        ")
    print("================================================================")

    -- Control4 uses SIZE_X and SIZE_Y, not WIDTH and HEIGHT
    local width = tonumber((tParams and (tParams.SIZE_X or tParams.WIDTH)) or 320)
    local height = tonumber((tParams and (tParams.SIZE_Y or tParams.HEIGHT)) or 240)
    local rate = tonumber((tParams and tParams.RATE) or 5)

    print("Requested MJPEG stream:")
    print("  Resolution: " .. width .. "x" .. height)
    print("  Frame rate: " .. rate .. " fps")

    -- Get camera properties
    local ip = _props["IP Address"] or Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "8080"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get MJPEG URL failed: No IP Address")
        return
    end

    -- Build MJPEG stream URL for VD05 camera
    local mjpeg_path = "/video.mjpg"

    -- Check if authentication is required
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    -- Build complete URL with or without authentication
    local mjpeg_url
    if auth_required and username ~= "" and password ~= "" then
        mjpeg_url = string.format("http://%s:%s@%s:%s%s?resolution=%dx%d&fps=%d",
            username, password, ip, http_port, mjpeg_path, width, height, rate)
    else
        mjpeg_url = string.format("http://%s:%s%s?resolution=%dx%d&fps=%d",
            ip, http_port, mjpeg_path, width, height, rate)
    end

    print("MJPEG URL: " .. mjpeg_url)

    -- Send response back to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(idBinding, "MJPEG_URL", {
            URL = mjpeg_url,
            WIDTH = tostring(width),
            HEIGHT = tostring(height),
            RATE = tostring(rate)
        })
        print("Sent MJPEG_URL to proxy")
    end

    C4:UpdateProperty("Status", "MJPEG stream URL generated")
    print("================================================================")
    return mjpeg_url
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
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local http_port = Properties["HTTP Port"] or "8080"
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
    rtsp_main_url = "stream0"
    rtsp_sub_url = "stream1"
    snapshot_url = "tmp/snap.jpeg"
    mjpeg_url = "/video.mjpg"

    print("Generated URLs:")
    print("  RTSP Main: " .. rtsp_main_url)
    print("  RTSP Sub: " .. rtsp_sub_url)
    print("  Snapshot: " .. snapshot_url)
    print("  MJPEG: " .. mjpeg_url)

    -- Send URLs back to proxy for Control4 app
    if C4 and C4.SendToProxy then
        -- Send primary RTSP URL for main stream
        C4:SendToProxy(idBinding, "RTSP_H264_URL", {
            URL = rtsp_main_url
        })

        -- Send snapshot URL
        C4:SendToProxy(idBinding, "SNAPSHOT_URL", {
            URL = snapshot_url
        })

        -- Send MJPEG URL for live view
        C4:SendToProxy(idBinding, "MJPEG_URL", {
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
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "RTSP_URL_PUSH failed: No IP Address")
        return
    end

    -- Check if authentication is required
    local auth_required = Properties["Authentication Type"] ~= "NONE"

    -- Build RTSP URL for main stream (high quality for Control4 app)
    local rtsp_url
    if auth_required and username ~= "" and password ~= "" then
        rtsp_url = "stream0"
    else
        rtsp_url = "stream0"
    end

    print("Pushing RTSP URL: " .. rtsp_url)

    -- Update property
    C4:UpdateProperty("Main Stream URL", rtsp_url)

    -- Send to Control4 app via proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(idBinding, "RTSP_URL", {
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
