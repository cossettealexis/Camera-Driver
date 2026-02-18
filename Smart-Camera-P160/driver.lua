local _props = {}

local json = require("CldBusApi.dkjson")
local http = require("CldBusApi.http")
local auth = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util = require("CldBusApi.util")

-- Local state
local LAST_EVENT_ID          = 0
local NOTIFICATION_URLS      = {}
local NOTIFICATION_QUEUE     = {}
PENDING_NOTIFICATION_URL     = nil
ACTIVE_NOTIFICATION_URL      = nil
LAST_NOTIFY_ID               = LAST_NOTIFY_ID or nil
MAX_TIME_DRIFT               = 600 -- seconds (acceptable drift)

local MQTT = require("mqtt_manager")
local CAMERA_BINDING = 5001
local EVENT_DELAY_MS = tonumber(Properties["Event Interval (ms)"]) or 5000

local NOTIFY = {
    ALERT = "ALERT",
    INFO  = "INFO"
}

-- User toggles (bind later to driver properties if needed)
local user_settings = {
    enable_alerts = true,
    enable_info   = true
}

-- Cooldown windows (seconds)
local COOLDOWN = {
    motion   = 0,
    human    = 0,
    online   = 0,   
    offline  = 0,
    restart  = 0,

}

-- Track last notification times
local last_sent = {}


local ONLINE_STABLE_SEC  = 5      
local OFFLINE_STABLE_SEC = 30     
local last_confirmed_online = nil
local pending_online = nil
local online_timer = nil

--TCP variables
local _pendingAuthToken = nil
local _tcpConnected = false
local TCP_BINDING_ID = 7001

GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl = "" 
GlobalObject.TCP_SERVER_IP = 'tuyadev.slomins.net'
GlobalObject.TCP_SERVER_PORT = 8081

_props.MQTT                      = {
    socket_ready = false,
    connected = false,
    packet_id = 1,
    keepalive = 30
}
_props.MQTT.manual_disconnect    = false

local PROP_MQTT_HOST             = "MQTT Host"
local PROP_MQTT_PORT             = "MQTT Port"
local PROP_MQTT_CLIENT_ID        = "MQTT Client ID"
local PROP_MQTT_SECRET           = "MQTT Secret"


local EVENT                      = {
    MOTION           = "Motion Detected",
    CAMERA_ONLINE    = "Camera Online",
    CAMERA_OFFLINE   = "Camera Offline",
    CAMERA_RESTARTED = "Camera Restarted",
    HUMAN            = "Human Detected",

}


local mqtt_enabled               = false

local last_power_status = nil
local LOW_BATTERY_THRESHOLD = 20 
local last_battery_low = false


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

local function log_prop_change(name, value, hidden)
    if hidden then
        print(string.format("[PROP] %s updated (hidden)", name))
    else
        print(string.format("[PROP] %s updated => %s", name, tostring(value)))
    end
end

function OnDriverInit()
    --Call TCP upon driver initialization
    TcpConnection()
    print("=== P160-SL Driver Initialized ===")
    
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
    print("=== K26 Driver Destroyed ===")
    MQTT.disconnect()
end

function OnDriverLateInit()
    print("=== P160-SL Driver Late Init ===")
    C4:UpdateProperty("Status", "Ready")
    
    -- Send camera configuration to Camera Proxy
    local ip = Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "3333"
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if ip and ip ~= "" then
        print("Sending camera configuration to Camera Proxy:")
        print("  IP Address: " .. ip)
        print("  HTTP Port: " .. http_port)
        print("  RTSP Port: " .. rtsp_port)
        print("  Username: " .. username)
        
        -- Send camera address and ports to Camera Proxy
        if C4 and C4.SendToProxy then
            -- Step 1: Send authentication type FIRST
            C4:SendToProxy(5001, "AUTHENTICATION_TYPE_CHANGED", {TYPE = "BASIC"})
            print("  Sent AUTHENTICATION_TYPE_CHANGED: BASIC to Camera Proxy")
            
            -- Step 2: Send authentication required
            C4:SendToProxy(5001, "AUTHENTICATION_REQUIRED", {REQUIRED = "True"})
            print("  Sent AUTHENTICATION_REQUIRED: True to Camera Proxy")
            
            -- Step 3: Send username
            C4:SendToProxy(5001, "USERNAME_CHANGED", {USERNAME = username})
            print("  Sent USERNAME_CHANGED to Camera Proxy")
            
            -- Step 4: Send password
            C4:SendToProxy(5001, "PASSWORD_CHANGED", {PASSWORD = password})
            print("  Sent PASSWORD_CHANGED to Camera Proxy")
            
            -- Step 5: Small delay to ensure auth is processed before address/ports
            C4:SetTimer(100, function()
                -- Step 6: NOW send camera address and ports
                C4:SendToProxy(5001, "ADDRESS_CHANGED", {ADDRESS = ip})
                print("  Sent ADDRESS_CHANGED to Camera Proxy")
                
            -- Send HTTP port
                C4:SendToProxy(5001, "HTTP_PORT_CHANGED", {PORT = http_port})
                print("  Sent HTTP_PORT_CHANGED to Camera Proxy")
                
            -- Send RTSP port
                C4:SendToProxy(5001, "RTSP_PORT_CHANGED", {PORT = rtsp_port})
                print("  Sent RTSP_PORT_CHANGED to Camera Proxy")
                
                print("Camera Proxy configuration complete!")
            end)
        end
        
        -- Generate and push initial URLs to Control4 app
        local rtsp_url = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
        local snapshot_url = string.format("http://%s:%s/wps-cgi/image.cgi", ip, http_port)


        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", string.format("rtsp://%s:%s/streamtype=0", ip, rtsp_port))
        
        print("Camera URLs initialized:")
        print("  RTSP Main: " .. rtsp_url)
        print("  Snapshot: " .. snapshot_url)
        
        -- Send initial camera properties to UI
        SendUpdateCameraProp()
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
        mqtt_enabled = (Properties[strProperty] == "True")

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
        print("[EVENT_DELAY_MS] Event interval updated to:", EVENT_DELAY_MS, "ms")
        return
    end
    local value = Properties[strProperty]
    print("Property [" .. strProperty .. "] changed to: " .. tostring(value))
    _props[strProperty] = value
    
    -- If IP Address changes, regenerate camera URLs
    if strProperty == "IP Address" and value and value ~= "" then
        print("IP Address changed, updating camera URLs...")
        
        local rtsp_port = Properties["RTSP Port"] or "554"
        local auth_required = Properties["Authentication Type"] ~= "NONE"
        local username = Properties["Username"] or "SystemConnect"
        local password = Properties["Password"] or "123456"
        
        local rtsp_main, rtsp_sub
        if auth_required and username ~= "" and password ~= "" then
            rtsp_main = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, value, rtsp_port)
            rtsp_sub = string.format("rtsp://%s:%s@%s:%s/streamtype=0", username, password, value, rtsp_port)
        else
            rtsp_main = string.format("rtsp://%s:%s/streamtype=1", value, rtsp_port)
            rtsp_sub = string.format("rtsp://%s:%s/streamtype=0", value, rtsp_port)
        end
        
        C4:UpdateProperty("Main Stream URL", rtsp_main)
        C4:UpdateProperty("Sub Stream URL", rtsp_sub)
        print("Updated RTSP Main URL: " .. rtsp_main)
        print("Updated RTSP Sub URL: " .. rtsp_sub)
        
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
        local account = Properties["Account"] or "pyabu@slomins.com"
        
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
    if strCommand == "SEND_TEST_NOTIFICATION_HUMAN" then
        SEND_TEST_NOTIFICATION_HUMAN()
        return
    end
    -- Handle LUA_ACTION wrapper
    if strCommand == "LUA_ACTION" and tParams then
        if tParams.ACTION then
            ExecuteCommand(tParams.ACTION, tParams)
        end
    end
end
function SEND_NOTIFICATION(tParams)
     print("================================================================")
    print("                 SEND_NOTIFICATION CALLED                        ")
    print("================================================================")
    C4:SendToProxy(5001, "Awsome! You got notification!", tParams, "NOTIFY")
    
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
    local app_secret = Properties["AppSecret"] or ""
    
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
        ["App-Name"] = "cldbus"
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
    local app_secret = Properties["AppSecret"] or ""
    
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
            ["App-Name"] = "cldbus"
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
        password = "***HIDDEN***",  -- Never send actual password to UI
        publicly_accessible = cameraData.publicly_accessible or false,
        vid = cameraData.vid or Properties["VID"] or "",
        product_id = cameraData.product_id or Properties["Product ID"] or "P160-SL",
        device_name = cameraData.device_name or Properties["Device Name"] or "LNDU Camera",
        main_stream_url = cameraData.main_stream_url or Properties["Main Stream URL"] or "",
        sub_stream_url = cameraData.sub_stream_url or Properties["Sub Stream URL"] or "",
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

-- 1. Get Temporary Token
function GET_TEMP_TOKEN(tParams)
    print("================================================================")
    print("              GET_TEMP_TOKEN CALLED                             ")
    print("================================================================")
    
    local duration = (tParams and tParams.duration) or 300
    
    print("Duration: " .. duration)
    
    -- Build request body
    local body_tbl = {
        duration = duration
    }
    
    local body_json = json.encode(body_tbl)
    print("Request body: " .. body_json)
    
    -- Update status
    C4:UpdateProperty("Status", "Getting temporary token...")
    
    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/temperate-token"
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]

    local headers = {
        ["Content-Type"] = "application/json",
        ["App-Name"] = "cldbus",
        ["Authorization"] = "Bearer " .. auth_token
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
        
        if code == 200 or code == 20000 then
            print("Get temp token succeeded")
            
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                local temp_token = parsed.data.token
                
                if temp_token then
                    print("Received temp token: " .. temp_token)
                    
                    -- Store temp token
                    C4:UpdateProperty("Temp Token", temp_token)
                    C4:UpdateProperty("Status", "Temp token retrieved successfully")
                    
                    _props["Temp Token"] = temp_token
                    print("Temp token stored successfully")
                else
                    print("No temp token in response")
                    C4:UpdateProperty("Status", "Get temp token failed: No token in response")
                end
            else
                print("Failed to parse response: " .. tostring(resp))
                C4:UpdateProperty("Status", "Get temp token failed: Invalid response")
            end
        else
            print("Get temp token failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Get temp token failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

-- 2. Get Exchange Token
function GET_EXCHANGE_TOKEN(tParams)
    print("================================================================")
    print("            GET_EXCHANGE_TOKEN CALLED                           ")
    print("================================================================")
    
    -- Get temp token from properties
    local temp_token = _props["Temp Token"] or Properties["Temp Token"]
    
    if not temp_token or temp_token == "" then
        print("ERROR: No temp token available. Please run GET_TEMP_TOKEN first.")
        C4:UpdateProperty("Status", "Exchange token failed: No temp token")
        return
    end
    
    print("Using temp token: " .. temp_token)
    
    -- Build request body
    local body_tbl = {
        token = temp_token
    }
    
    local body_json = json.encode(body_tbl)
    print("Request body: " .. body_json)
    
    -- Update status
    C4:UpdateProperty("Status", "Exchanging token...")
    
    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/auth/exchange-identity"
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["App-Name"] = "cldbus"
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
        
        if code == 200 or code == 20000 then
            print("Exchange token succeeded")
            
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                local exchange_token = parsed.data.data
                
                if exchange_token then
                    print("Received exchange token: " .. exchange_token)
                    
                    -- Store exchange token
                    C4:UpdateProperty("Exchange Token", exchange_token)
                    C4:UpdateProperty("Status", "Exchange token retrieved successfully")
                    
                    _props["Exchange Token"] = exchange_token
                    print("Exchange token stored successfully")
                else
                    print("No exchange token in response")
                    C4:UpdateProperty("Status", "Exchange token failed: No token in response")
                end
            else
                print("Failed to parse response: " .. tostring(resp))
                C4:UpdateProperty("Status", "Exchange token failed: Invalid response")
            end
        else
            print("Exchange token failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Exchange token failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

-- 3. Get Devices
function GET_DEVICES(tParams)
    print("================================================================")
    print("                GET_DEVICES CALLED                              ")
    print("================================================================")
    
    -- Get auth token from properties (bearer token)
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    
    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available. Please run LoginOrRegister first.")
        C4:UpdateProperty("Status", "Get devices failed: No auth token")
        return
    end
    
    print("Using bearer token: " .. auth_token)
    
    -- Update status
    C4:UpdateProperty("Status", "Getting devices...")
    
    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/devices-v2"
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. auth_token,
        ["App-Name"] = "cldbus"
    }
    
    local req = {
        url = url,
        method = "GET",
        headers = headers
    }
    
    print("Sending request to: " .. url)
    print("Method: GET")
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
        
        if code == 200 or code == 20000 then
            print("Get devices succeeded")
            C4:UpdateProperty("Status", "Devices retrieved successfully")
            
            -- Parse and print response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed then
                print("Parsed response:")
                print(json.encode(parsed, { indent = true }))
            end
        else
            print("Get devices failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Get devices failed: " .. tostring(err or code))
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
                _props.MQTT.keepalive =  60
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

            C4:SetTimer(EVENT_DELAY_MS, function()
                C4:FireEvent(event_name, CAMERA_BINDING)
            end)
        end)
    end

    fetch()
end



local function handle_motion(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.MOTION, "motion", COOLDOWN.motion, filename, extp)
end

local function handle_human(filename, extp)
    send_notification(NOTIFY.INFO, EVENT.HUMAN, "human", COOLDOWN.human, filename, extp)
end


local function handle_restart()
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_RESTARTED, "restart", COOLDOWN.restart)
end

local function handle_low_battery()
    send_notification(NOTIFY.ALERT, EVENT.LOW_BATTERY, "battery", COOLDOWN.battery)
end


local function confirm_online_state(new_online)

    last_confirmed_online = new_online
    pending_online = nil
    online_timer = nil

    if new_online then
        print("[EVENT] ✅ Camera ONLINE (confirmed)")
        send_notification(
            NOTIFY.INFO,
            EVENT.CAMERA_ONLINE,
            "online",
            COOLDOWN.online
        )
    else
        print("[EVENT] ❌ Camera OFFLINE (confirmed)")
        send_notification(
            NOTIFY.ALERT,
            EVENT.CAMERA_OFFLINE,
            "offline",
            COOLDOWN.offline
        )
    end
end

local function handle_online_status(new_online)

    -- First ever state → set baseline only
    if last_confirmed_online == nil then
        last_confirmed_online = new_online
        print("[STATUS] Initial online state:", new_online)
        return
    end

    -- No change → ignore
    if new_online == last_confirmed_online then
        return
    end

    -- New transition detected
    if pending_online ~= new_online then
        pending_online = new_online

        local delay = new_online and ONLINE_STABLE_SEC or OFFLINE_STABLE_SEC
        print("[STATUS] Pending online changed:", new_online, "confirm in", delay, "sec")

        -- Cancel any previous confirmation
        if online_timer then
            C4:KillTimer(online_timer)
            online_timer = nil
        end

        -- Start confirmation timer
        online_timer = C4:SetTimer(delay * 1000, function()
            confirm_online_state(new_online)
        end)
    end
end
local function handle_power_on()
    send_notification(
        NOTIFY.ALERT,
        EVENT.POWER_ON,
        "power_on",
        COOLDOWN.power
    )
end

local function handle_power_off()
    send_notification(
        NOTIFY.ALERT,
        EVENT.POWER_OFF,
        "power_off",
        COOLDOWN.power
    )
end


local function handle_device_status(msg)
    if not msg.status then return end

    local is_online = nil
    local is_power_on = nil
    local battery_percent = nil
    local power_status = nil

    -- 🔍 FIRST PASS: collect values
    for _, s in ipairs(msg.status) do
        if s.status_key == "is_online" then
            is_online = (s.status_val == 1)
        end

        if s.status_key == "power_status" then
            power_status = tonumber(s.status_val)

            -- your existing power logic
            if power_status == 1 then
                is_power_on = true      -- charging
            elseif power_status == 2 then
                is_power_on = false     -- discharging
            end
        end

        if s.status_key == "e" then
            battery_percent = tonumber(s.status_val)
        end
    end

    ------------------------------------------------
    -- 🌐 ONLINE / OFFLINE (unchanged behavior)
    ------------------------------------------------
    if is_online ~= nil then
        handle_online_status(is_online)
    end

    ------------------------------------------------
    -- 🔌 POWER ON / OFF (existing logic preserved)
    ------------------------------------------------
    if is_power_on ~= nil then
        if last_power_status == nil then
            last_power_status = is_power_on
            print("[POWER] Initial power state:", is_power_on)
        elseif last_power_status ~= is_power_on then
            last_power_status = is_power_on
            if is_power_on then
                print("[POWER] 🔌 Power restored")
                handle_power_on()
            else
                print("[POWER] 🔋 Power lost")
                handle_power_off()
            end
        end
    end

    ------------------------------------------------
    -- 🔋 LOW BATTERY DETECTION (NEW)
    ------------------------------------------------
    local is_low_battery = false

    -- Method 1: explicit low-battery flag
    if power_status == 4 then
        is_low_battery = true
    end

    -- Method 2: percentage threshold
    if battery_percent and battery_percent <= LOW_BATTERY_THRESHOLD then
        is_low_battery = true
    end

    -- Fire ONLY on transition
    if is_low_battery and not last_battery_low then
        print("[BATTERY] 🔋 Low battery:", battery_percent or "unknown", "%")
        handle_low_battery()
        last_battery_low = true
    end

    -- Reset when recovered
    if not is_low_battery and last_battery_low then
        print("[BATTERY] ✅ Battery recovered:", battery_percent or "unknown", "%")
        last_battery_low = false
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
        -- 🎥 log_rec (Continuous Motion / Human)
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

            return true
        end

        ------------------------------------------------
        -- 🚨 alarm_rec_v2 (Critical Alerts)
        ------------------------------------------------
        if id == "alarm_rec_v2" then

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


function OP07_PROCESS_NOTIFICATION(n)
    print("[OP07] Event:", n.message_type, "VID:", n.vid)

    -- motion
    if n.message_type == "move_detect"
        or n.message_type == "human_shape_detect"
        or n.message_type == "package_detect" then
        C4:FireEvent(1)

        -- doorbell
    elseif n.message_type == "door_bell" then
        C4:FireEvent(2)

        -- face
    elseif n.message_type == "face_open" then
        C4:FireEvent(3)

        -- clip available
    elseif n.has_video == 1 then
        C4:FireEvent(4)
    end

    if n.image_url then
        update_prop("Last Image URL", n.image_url)
    end
    if n.video_url then
        update_prop("Last Video URL", n.video_url)
    end
end

function FETCH_NOTIFICATIONS(minutes)
    print("================================================")
    print("           OP07 FETCH_NOTIFICATIONS              ")
    print("================================================")

    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["Device ID"] or Properties["Device ID"]

    if not auth_token or not vid then
        print("[OP07] Missing auth token or VID")
        return
    end

    minutes = minutes or 10
    local now = os.time()
    local start_ts = now - (minutes * 60)

    local body = {
        page = 1,
        page_size = 20,
        group_type = { "video", "bell_alert", "open" },
        probe_type = { "face_probe" },
        storage_type = { "cloud", "local" },
        start_timestamp = start_ts,
        end_timestamp = now,
        vids = { vid },
        isread = 0
    }

    local req = {
        url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
            .. "/api/v3/openapi/notifications/query",
        method = "POST",
        headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer " .. auth_token,
            ["Accept-Language"] = "en"
        },
        body = json.encode(body)
    }

    transport.execute(req, function(code, resp)
        print("[OP07] HTTP:", code)

        if code ~= 200 then return end

        local ok, parsed = pcall(json.decode, resp)
        if not ok or not parsed.data then return end

        local list = parsed.data.notifications or {}
        print("[OP07] Notifications received:", #list)

        for _, n in ipairs(list) do
            OP07_PROCESS_NOTIFICATION(n)
        end
    end)
end

function TEST_WAKE_LOCAL()
    print("[OP04] TEST_WAKE_LOCAL called")

    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["Device ID"] or _props["VID"] or Properties["Device ID"] or Properties["VID"]

    if not auth_token or not vid then
        print("[OP04] Missing auth token or VID")
        return
    end

    local body = {
        vid = vid,
        action_id = "ac_wakelocal",
        input_params = json.encode({
            t = os.time(),
            type = 1
        }),
        check_t = 0,
        is_async = 0
    }

    transport.execute({
        url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
            .. "/api/v3/openapi/device/do-action",
        method = "POST",
        headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer " .. auth_token
        },
        body = json.encode(body)
    }, function(code, resp)
        print("[OP04] HTTP:", code)
        print("[OP04] Response:", resp)
    end)
end

function SEND_TEST_NOTIFICATION()
    print("===================================")
    print("[TEST] 🔔 START: Test Notifications")
    print("===================================")

    -- Informational notifications
    send_notification(NOTIFY.INFO, EVENT.MOTION, "test_motion", 0)
    send_notification(NOTIFY.INFO, EVENT.HUMAN, "test_human", 0)
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_RESTARTED, "test_restart", 0)
    send_notification(NOTIFY.ALERT, EVENT.CAMERA_OFFLINE, "test_offline", 0)
   send_notification(NOTIFY.ALERT, EVENT.CAMERA_ONLINE, "test_online", 0)
    print("[TEST] ✅ Test notifications fired")
end

function SEND_TEST_NOTIFICATION_HUMAN()
    print("===================================")
    print("[TEST] 📸 TEST_IMAGE_PUSH triggered")
    print("===================================")

    -- 🔴 Replace this with ANY snapshot URL that is reachable
    -- (cloud snapshot OR local snapshot)
    local test_snapshot_url =
        "https://picsum.photos/640/480"

    -- TEMP payload (image-based push)
    local payload = {
        TITLE = "🔔 Test Image Push",
        MESSAGE = "This is a test notification with snapshot",
        IMAGE_URL = test_snapshot_url
    }

    print("[TEST] Snapshot URL:", test_snapshot_url)

    -- ⚠️ IMPORTANT:
    -- This does NOT use Notifications Agent
    -- This is a custom push-style payload
    C4:SendToProxy(5001, "PUSH_NOTIFICATION", payload)

    print("[TEST] ✅ Image push sent")
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
    
    -- For IP cameras, you might put camera to sleep or disable streaming
    -- This depends on your camera API capabilities
    
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
    local ip = Properties["IP Address"]
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
        snapshot_url = string.format("http://%s:%s@%s:3333/wps-cgi/image.cgi?resolution=%dx%d",
            username, password, ip, width, height)
    else
        snapshot_url = string.format("http://%s:3333/wps-cgi/image.cgi?resolution=%dx%d",
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

-- PTZ Commands
function PTZ_COMMAND(idBinding, strCommand, tParams)
    print("================================================================")
    print("              PTZ_COMMAND: " .. strCommand .. "                ")
    print("================================================================")
    
    -- Get VID and auth token for API calls
    local vid = _props["VID"] or Properties["VID"]
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    
    if not vid or vid == "" then
        print("ERROR: No VID available")
        return
    end
    
    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available")
        return
    end
    
    -- Map Control4 commands to camera PTZ directions
    local direction_map = {
        PAN_LEFT = "left",
        PAN_RIGHT = "right",
        TILT_UP = "up",
        TILT_DOWN = "down",
        ZOOM_IN = "zoom_in",
        ZOOM_OUT = "zoom_out"
    }
    
    local direction = direction_map[strCommand]
    if not direction then
        print("Unknown PTZ command: " .. strCommand)
        return
    end
    
    local speed = (tParams and tonumber(tParams.SPEED)) or 1
    
    print("PTZ Direction: " .. direction)
    print("PTZ Speed: " .. speed)
    
    -- Build API request for PTZ control
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/device/do-action"
    
    local input_params = {
        dir = direction,
        speed = speed
    }
    
    local body = {
        vid = vid,
        action_id = "ac_ptz",
        input_params = json.encode(input_params),
        check_t = 0,
        is_async = 0
    }
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. auth_token
    }
    
    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = json.encode(body)
    }
    
    print("Sending PTZ command to API...")
    
    transport.execute(req, function(code, resp, resp_headers, err)
        if code == 200 or code == 20000 then
            print("PTZ command successful")
            C4:UpdateProperty("Status", "PTZ " .. direction)
        else
            print("PTZ command failed: " .. tostring(code))
            if err then
                print("Error: " .. err)
            end
        end
    end)
    
    print("================================================================")
end

function PTZ_HOME(idBinding, tParams)
    print("================================================================")
    print("                  PTZ_HOME CALLED                               ")
    print("================================================================")
    
    -- Return camera to home position
    print("Returning camera to home position...")
    C4:UpdateProperty("Status", "PTZ Home")
    
    -- You would call your camera's home position API here
    -- For now, this is a placeholder
    
    print("================================================================")
end

-- Get Current Camera Properties (for external requests)
function GET_CAMERA_PROPERTIES()
    print("================================================================")
    print("           GET_CAMERA_PROPERTIES CALLED                         ")
    print("================================================================")
    
    local camera_props = {
        address = Properties["IP Address"] or "",
        http_port = Properties["HTTP Port"] or "80",
        rtsp_port = Properties["RTSP Port"] or "554",
        authentication_required = (Properties["Authentication Type"] ~= "NONE"),
        authentication_type = Properties["Authentication Type"] or "NONE",
        username = Properties["Username"] or "",
        password = Properties["Password"] or "",  -- Full password for internal use
        publicly_accessible = false,
        vid = Properties["VID"] or "",
        product_id = Properties["Product ID"] or "K26-SL",
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
    
    local ip = Properties["IP Address"]
    local port = Properties["RTSP Port"] or "554"
    
    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end
    
    -- Build RTSP URL for main stream (streamtype=1)
    local rtsp_url = string.format("rtsp://%s:%s/streamtype=1", ip, port)
    
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
    
    local ip = Properties["IP Address"]
    local port = Properties["RTSP Port"] or "554"
    
    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end
    
    -- Build RTSP URL for sub stream (streamtype=0)
    local rtsp_url = string.format("rtsp://%s:%s/streamtype=0", ip, port)
    
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
    
    local ip = Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "3333"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end
    
    -- Build URL
    local snapshot_url
    if username ~= "" and password ~= "" then
        snapshot_url = string.format("http://%s:%s@%s:%s/wps-cgi/image.cgi", 
            username, password, ip, http_port)
    else
        snapshot_url = string.format("http://%s:%s/wps-cgi/image.cgi", 
            ip, http_port)
    end
    
    print("Generated snapshot URL: " .. snapshot_url)
    C4:UpdateProperty("Status", "Snapshot URL generated")
    
    -- Send to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "SNAPSHOT_URL", {URL = snapshot_url})
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
        1902,  -- Standard SDDP port
        80,    -- HTTP
        8080,  -- Alternate HTTP
        8000,  -- Common camera port
        554,   -- RTSP (some cameras respond here)
    }
    
    -- SDDP discovery endpoints and paths
    local sddp_paths = {
        "/sddp",                    -- SDDP endpoint
        "/sddp/discover",           -- SDDP discovery
        "/onvif/device_service",    -- ONVIF (often supports SSDP/SDDP)
        "/cgi-bin/magicBox.cgi?action=getSystemInfo",  -- Dahua cameras
        "/ISAPI/System/deviceInfo", -- Hikvision cameras
        "/api/system/deviceinfo",   -- Generic camera API
        "/",                        -- Root (check for device info)
    }
    
    -- We'll scan a smaller range for SDDP (last 50 IPs) for faster discovery
    local start_ip = 1
    local end_ip = Properties["IP Scan Range End"] or 50
    
    print("Scanning " .. network_prefix .. "." .. start_ip .. " to " .. network_prefix .. "." .. end_ip)
    print("Checking SDDP ports: 1902, 80, 8080, 8000, 554")
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
            print("  HTTP Port: " .. (first_camera.port == 1902 and "80" or tostring(first_camera.port)))
            print("  RTSP Port: 554")
            print("")
            
            C4:UpdateProperty("IP Address", first_camera.ip)
            C4:UpdateProperty("HTTP Port", first_camera.port == 1902 and "80" or tostring(first_camera.port))
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
    local common_camera_ports = {80, 8080, 554, 8000}
    
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

-- GET_STREAM_URLS - Return streaming URLs for various codecs
function GET_STREAM_URLS(idBinding, tParams)
    print("================================================================")
    print("              GET_STREAM_URLS CALLED                            ")
    print("================================================================")
    
    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or ""
    local password = Properties["Password"] or ""
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        return
    end
    
    -- Build RTSP URLs for P160 camera
    local auth_required = Properties["Authentication Type"] ~= "NONE"
    
    local rtsp_main, rtsp_sub
    if auth_required and username ~= "" and password ~= "" then
        rtsp_main = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, ip, rtsp_port)
        rtsp_sub = string.format("rtsp://%s:%s@%s:%s/streamtype=0", username, password, ip, rtsp_port)
    else
        rtsp_main = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
        rtsp_sub = string.format("rtsp://%s:%s/streamtype=0", ip, rtsp_port)
    end
    
    print("Main Stream URL (H264): " .. rtsp_main)
    print("Sub Stream URL (H264): " .. rtsp_sub)
    
    -- Store URLs in properties
    C4:UpdateProperty("Main Stream URL", rtsp_main)
    C4:UpdateProperty("Sub Stream URL", rtsp_sub)
    
    -- Send response back to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(idBinding, "STREAM_URL", {
            H264_MAIN = rtsp_main,
            H264_SUB = rtsp_sub
        })
        print("Sent stream URLs to proxy")
    end
    
    print("================================================================")
    
    return {
        h264_main = rtsp_main,
        h264_sub = rtsp_sub
    }
end

-- URL_GET - Control4 app requests camera URLs
function URL_GET(idBinding, tParams)
    print("================================================================")
    print("                  URL_GET CALLED                                ")
    print("================================================================")
    
    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local http_port = Properties["HTTP Port"] or "3333"
    local username = Properties["Username"] or ""
    local password = Properties["Password"] or ""
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        return
    end
    
    local auth_required = Properties["Authentication Type"] ~= "NONE"
    
    local rtsp_main_url, rtsp_sub_url, snapshot_url
    
    if auth_required and username ~= "" and password ~= "" then
        rtsp_main_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, ip, rtsp_port)
        rtsp_sub_url = string.format("rtsp://%s:%s@%s:%s/streamtype=0", username, password, ip, rtsp_port)
        snapshot_url = string.format("http://%s:%s@%s:%s/wps-cgi/image.cgi", username, password, ip, http_port)
    else
        rtsp_main_url = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
        rtsp_sub_url = string.format("rtsp://%s:%s/streamtype=0", ip, rtsp_port)
        snapshot_url = string.format("http://%s:%s/wps-cgi/image.cgi", ip, http_port)
    end
    
    print("Generated URLs:")
    print("  RTSP Main: " .. rtsp_main_url)
    print("  RTSP Sub: " .. rtsp_sub_url)
    print("  Snapshot: " .. snapshot_url)
    
    -- Send URLs back to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(idBinding, "CAMERA_URLS", {
            RTSP_MAIN = rtsp_main_url,
            RTSP_SUB = rtsp_sub_url,
            SNAPSHOT = snapshot_url
        })
        print("Sent URLs to proxy for Control4 app")
    end
    
    print("================================================================")
    
    return {
        rtsp_main = rtsp_main_url,
        rtsp_sub = rtsp_sub_url,
        snapshot = snapshot_url
    }
end

-- RTSP_URL_PUSH - Push RTSP URL to Control4 app
function RTSP_URL_PUSH(idBinding, tParams)
    print("================================================================")
    print("               RTSP_URL_PUSH CALLED                             ")
    print("================================================================")
    
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or ""
    local password = Properties["Password"] or ""
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        return
    end
    
    local auth_required = Properties["Authentication Type"] ~= "NONE"
    
    local rtsp_url
    if auth_required and username ~= "" and password ~= "" then
        rtsp_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, ip, rtsp_port)
    else
        rtsp_url = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
    end
    
    print("Pushing RTSP URL: " .. rtsp_url)
    
    C4:UpdateProperty("Main Stream URL", rtsp_url)
    
    -- Send to Control4 app via proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(idBinding, "RTSP_URL", {URL = rtsp_url})
        print("RTSP URL pushed to Control4 app")
    end
    
    print("================================================================")
    return rtsp_url
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
    
    -- Route camera commands and RETURN their results
    if strCommand == "GET_SNAPSHOT_QUERY_STRING" then
        local result = GET_SNAPSHOT_QUERY_STRING(5001, tParams)
        return "<snapshot_query_string>" .. C4:XmlEscapeString(result or "") .. "</snapshot_query_string>" 
    elseif strCommand == "GET_SNAPSHOT_URLS" then
        -- Return snapshot path for Camera Proxy to build full URL
        local result = GET_SNAPSHOT_QUERY_STRING(5001, tParams)
        return "<snapshot_query_string>" .. C4:XmlEscapeString(result or "") .. "</snapshot_query_string>"
    elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
        local result = GET_RTSP_H264_QUERY_STRING(5001, tParams)
        return "<rtsp_h264_query_string>" .. C4:XmlEscapeString(result or "") .. "</rtsp_h264_query_string>"
    elseif strCommand == "GET_MJPEG_QUERY_STRING" then
        local result = GET_MJPEG_QUERY_STRING(5001, tParams)
        if result then
            return "<mjpeg_query_string>" .. C4:XmlEscapeString(result) .. "</mjpeg_query_string>"
        else
            return "<mjpeg_query_string></mjpeg_query_string>"
        end
    elseif strCommand == "GET_STREAM_URLS" then
        return GET_STREAM_URLS(5001, tParams)
    elseif strCommand == "URL_GET" then
        return URL_GET(5001, tParams)
    elseif strCommand == "RTSP_URL_PUSH" then
        return RTSP_URL_PUSH(5001, tParams)
    end
    
    -- Legacy support
    if strCommand == "GET_CAMERA_URL" or strCommand == "GET_SNAPSHOT_URL" then
        return "<snapshot_query_string>" .. C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>" 
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
   
    -- Handle camera proxy commands
    if strCommand == "CAMERA_ON" then
        CAMERA_ON(idBinding, tParams)
        
    elseif strCommand == "CAMERA_OFF" then
        CAMERA_OFF(idBinding, tParams)
        
    elseif strCommand == "GET_CAMERA_SNAPSHOT" then
       return GET_CAMERA_SNAPSHOT(idBinding, tParams)
        
    elseif strCommand == "GET_SNAPSHOT_QUERY_STRING" then
        local result = GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)
        return "<snapshot_query_string>" .. C4:XmlEscapeString(result or "") .. "</snapshot_query_string>" 
        
    elseif strCommand == "GET_SNAPSHOT_URLS" then
        -- Return snapshot path for Camera Proxy to build full URL
        local result = GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)
        return "<snapshot_query_string>" .. C4:XmlEscapeString(result or "") .. "</snapshot_query_string>"
        
    elseif strCommand == "GET_STREAM_URLS" then
        GET_STREAM_URLS(idBinding, tParams)
        
    elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
        local result = GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
        return "<rtsp_h264_query_string>" .. C4:XmlEscapeString(result or "") .. "</rtsp_h264_query_string>"
        
    elseif strCommand == "GET_MJPEG_QUERY_STRING" then
        local result = GET_MJPEG_QUERY_STRING(idBinding, tParams)
        if result then
            return "<mjpeg_query_string>" .. C4:XmlEscapeString(result) .. "</mjpeg_query_string>"
        else
            return "<mjpeg_query_string></mjpeg_query_string>"
        end
        
    elseif strCommand == "URL_GET" then
        URL_GET(idBinding, tParams)
        
    elseif strCommand == "RTSP_URL_PUSH" then
        RTSP_URL_PUSH(idBinding, tParams)
        
    elseif strCommand == "PAN_LEFT" or strCommand == "PAN_RIGHT" or 
           strCommand == "TILT_UP" or strCommand == "TILT_DOWN" or
           strCommand == "ZOOM_IN" or strCommand == "ZOOM_OUT" then
        PTZ_COMMAND(idBinding, strCommand, tParams)
        
    elseif strCommand == "HOME" then
        PTZ_HOME(idBinding, tParams)
        
    else
        print("Unknown command from proxy: " .. strCommand)
    end
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
    local ip = Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "3333"
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get Snapshot URL failed: No IP Address")
        return ""
    end
    
    -- Camera Proxy will build: http://username:password@ip:port/path
    local snapshot_path = string.format("wps-cgi/image.cgi?resolution=%dx%d", width, height)
    
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
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get Stream URLs failed: No IP Address")
        return
    end
    
    -- Build RTSP URLs for P160-SL camera
    -- Main stream (high quality): streamtype=1
    -- Sub stream (low quality): streamtype=0
    
    -- Check if authentication is required
    local auth_required = Properties["Authentication Type"] ~= "NONE"
    
    local rtsp_main, rtsp_sub
    if auth_required and username ~= "" and password ~= "" then
        rtsp_main = string.format("rtsp://%s:%s@%s:%s/streamtype=1",
            username, password, ip, rtsp_port)
        rtsp_sub = string.format("rtsp://%s:%s@%s:%s/streamtype=0",
            username, password, ip, rtsp_port)
    else
        rtsp_main = string.format("rtsp://%s:%s/streamtype=1",
            ip, rtsp_port)
        rtsp_sub = string.format("rtsp://%s:%s/streamtype=0",
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
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get H264 URL failed: No IP Address")
        return
    end
    
    -- Determine stream type based on resolution
    -- Higher resolution -> main stream (streamtype=1)
    -- Lower resolution -> sub stream (streamtype=0)
    local streamtype = 0
    if width >= 1280 or height >= 720 then
        streamtype = 1
        print("Using main stream (high quality)")
    else
        print("Using sub stream (low quality)")
    end
    
    -- Per Eldon Greenwood's guidance: Return ONLY the path WITHOUT leading slash
    -- Camera Proxy will build: rtsp://username:password@ip:port/streamtype=X
    local rtsp_path = "streamtype=" .. streamtype
    
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
    local ip = Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "80"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        C4:UpdateProperty("Status", "Get MJPEG URL failed: No IP Address")
        return
    end
    
    -- Build MJPEG stream URL for P160-SL camera
    local mjpeg_path = "video.mjpg"
    local mjpeg_url = string.format("%s?resolution=%dx%d&fps=%d",
            mjpeg_path, width, height, rate)
        
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
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
    local http_port = Properties["HTTP Port"] or "80"
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
        rtsp_sub_url = string.format("rtsp://%s:%s@%s:%s/streamtype=0",
            username, password, ip, rtsp_port)
        snapshot_url = string.format("http://%s:%s@%s:3333/wps-cgi/image.cgi?resolution=3840x2160",
            username, password, ip)
        mjpeg_url = string.format("http://%s:%s@%s:%s/video.mjpg",
            username, password, ip, http_port)
    else
        rtsp_main_url = string.format("rtsp://%s:%s/streamtype=1",
            ip, rtsp_port)
        rtsp_sub_url = string.format("rtsp://%s:%s/streamtype=0",
            ip, rtsp_port)
        snapshot_url = string.format("http://%s:3333/wps-cgi/image.cgi?resolution=3840x2160",
            ip)
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
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "554"
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
        rtsp_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1",
            username, password, ip, rtsp_port)
    else
        rtsp_url = string.format("rtsp://%s:%s/streamtype=1",
            ip, rtsp_port)
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

function GetNotificationAttachmentFile()
    print("GetNotificationAttachmentFile()")
    local fileName = "/mnt/internal/c4z/notification_driver/www/snap1vga.jpg"

    return fileName
end

function GetNotificationAttachmentBytes()
    print("GetNotificationAttachmentBytes()")
    return nil
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
