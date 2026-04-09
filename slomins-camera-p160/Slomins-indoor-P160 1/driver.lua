local json = require("CldBusApi.dkjson")
local http = require("CldBusApi.http")
local auth = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util = require("CldBusApi.util")

-- Local state
local _props = {}
local _mqtt_config = {}
local _mqtt_connected = false
local _mqtt_reconnect_timer = nil


function OnDriverInit()
    print("=== P160-SL Driver Initialized ===")
    
    -- Initialize properties
    for k, v in pairs(Properties) do
        if k ~= "Password" then
            print("Property [" .. k .. "] = " .. tostring(v))
        end
        _props[k] = v
    end
    
    C4:UpdateProperty("Status", "Driver initialized")
end

function OnDriverDestroyed()
    print("=== P160-SL Driver Destroyed ===")
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
            -- Send camera address
            C4:SendToProxy(5001, "ADDRESS_CHANGED", {ADDRESS = ip})
            print("  Sent ADDRESS_CHANGED to Camera Proxy")
            
            -- Send HTTP port
            C4:SendToProxy(5001, "HTTP_PORT_CHANGED", {PORT = http_port})
            print("  Sent HTTP_PORT_CHANGED to Camera Proxy")
            
            -- Send RTSP port
            C4:SendToProxy(5001, "RTSP_PORT_CHANGED", {PORT = rtsp_port})
            print("  Sent RTSP_PORT_CHANGED to Camera Proxy")
            
            -- Send authentication settings
            C4:SendToProxy(5001, "AUTHENTICATION_REQUIRED", {REQUIRED = "True"})
            print("  Sent AUTHENTICATION_REQUIRED: True to Camera Proxy")
            
            -- Send username
            C4:SendToProxy(5001, "USERNAME_CHANGED", {USERNAME = username})
            print("  Sent USERNAME_CHANGED to Camera Proxy")
            
            -- Send password
            C4:SendToProxy(5001, "PASSWORD_CHANGED", {PASSWORD = password})
            print("  Sent PASSWORD_CHANGED to Camera Proxy")
            
            print("Camera Proxy configuration complete!")
        end
        
        -- Generate and push initial URLs to Control4 app
        local rtsp_url = string.format("rtsp://%s:%s/streamtype=1", ip, rtsp_port)
        local snapshot_url = string.format("http://%s:3333/wps-cgi/image.cgi?resolution=3840x2160", ip)
        
        -- Store in properties
        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", string.gsub(rtsp_url, "streamtype=1", "streamtype=0"))
        
        print("Camera URLs initialized:")
        print("  RTSP: " .. rtsp_url)
        print("  Snapshot: " .. snapshot_url)
        
        -- Send initial camera properties to UI
        SendUpdateCameraProp()
    end
end

function OnPropertyChanged(strProperty)
    print("Property changed: " .. strProperty)
    
    if strProperty == "Password" then
        print("Password property updated (value hidden)")
        _props[strProperty] = Properties[strProperty]
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
        
        local rtsp_url
        if auth_required and username ~= "" and password ~= "" then
            rtsp_url = string.format("rtsp://%s:%s@%s:%s/streamtype=1", username, password, value, rtsp_port)
        else
            rtsp_url = string.format("rtsp://%s:%s/streamtype=1", value, rtsp_port)
        end
        
        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", string.gsub(rtsp_url, "streamtype=1", "streamtype=0"))
        print("Updated RTSP URL: " .. rtsp_url)
        
        -- Update UI with new camera properties
        SendUpdateCameraProp()
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
    if strCommand == "GET_MQTT_INFO" then
        GET_MQTT_INFO(tParams)
        return
    end
    if strCommand == "CONNECT_MQTT" then
        CONNECT_MQTT()
        return
    end
    if strCommand == "DISCONNECT_MQTT" then
        DISCONNECT_MQTT()
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
    if strCommand == "START_HTTP_POLLING" then
        START_HTTP_POLLING()
        return
    end
    if strCommand == "STOP_HTTP_POLLING" then
        STOP_HTTP_POLLING()
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
    C4:UpdateProperty("Status", "Setting device property...")
    
    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/device/do-property"
    
    -- Build request body with sddp_swt property
    local body = {
        vid = vid,
        data = json.encode({ sddp_swt = 1 })
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
            print("Set device property succeeded")
            C4:UpdateProperty("Status", "Device property set successfully")
            
            -- Parse and print response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed then
                print("Parsed response:")
                print(json.encode(parsed, { indent = true }))
            end
        else
            print("Set device property failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Set property failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

-- Get MQTT Connection Info
function GET_MQTT_INFO(tParams)
    print("================================================================")
    print("              GET_MQTT_INFO CALLED                              ")
    print("================================================================")
    
    -- Get auth token and VID from properties
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["VID"] or Properties["VID"]
    
    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available. Please run LoginOrRegister first.")
        C4:UpdateProperty("Status", "Get MQTT info failed: No auth token")
        return
    end
    
    if not vid or vid == "" then
        print("ERROR: No VID available. Please set VID property.")
        C4:UpdateProperty("Status", "Get MQTT info failed: No VID")
        return
    end
    
    print("Using bearer token: " .. auth_token)
    print("Using VID: " .. vid)
    
    -- Update status
    C4:UpdateProperty("Status", "Getting MQTT info...")
    
    -- Build request
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local url = base_url .. "/api/v3/openapi/apply-mqtt-info"
    
    local body = {
        vid = vid
    }
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Authorization"] = "Bearer " .. auth_token,
        ["App-Name"] = "cldbus"
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
            print("Get MQTT info succeeded")
            
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                _mqtt_config = {
                    host = parsed.data.mqtt_host,
                    port = parsed.data.mqtt_port,
                    client_id = parsed.data.mqtt_client_id,
                    client_secret = parsed.data.mqtt_client_secret,
                    vid = vid
                }
                
                print("MQTT Config:")
                print("  Host: " .. _mqtt_config.host)
                print("  Port: " .. _mqtt_config.port)
                print("  Client ID: " .. _mqtt_config.client_id)
                print("  VID: " .. _mqtt_config.vid)
                
                C4:UpdateProperty("Status", "MQTT info retrieved successfully")
                
                -- Automatically generate credentials and connect
                GENERATE_MQTT_CREDENTIALS()
            else
                print("Failed to parse response: " .. tostring(resp))
                C4:UpdateProperty("Status", "Get MQTT info failed: Invalid response")
            end
        else
            print("Get MQTT info failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Get MQTT info failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

-- Generate MQTT Credentials
function GENERATE_MQTT_CREDENTIALS()
    print("================================================================")
    print("          GENERATE_MQTT_CREDENTIALS CALLED                      ")
    print("================================================================")
    
    if not _mqtt_config.client_id or not _mqtt_config.client_secret then
        print("ERROR: MQTT config not available. Please run GET_MQTT_INFO first.")
        C4:UpdateProperty("Status", "Generate MQTT credentials failed: No config")
        return
    end
    
    print("Client ID: " .. _mqtt_config.client_id)
    
    -- Update status
    C4:UpdateProperty("Status", "Generating MQTT credentials...")
    
    -- Build request body
    local body = {
        clientId = _mqtt_config.client_id,
        clientSecret = _mqtt_config.client_secret
    }
    
    local headers = {
        ["Content-Type"] = "application/json"
    }
    
    local url = "http://54.90.205.243:5000/generate-mqtt-credentials"
    
    local req = {
        url = url,
        method = "POST",
        headers = headers,
        body = json.encode(body)
    }
    
    print("Sending request to: " .. url)
    print("Method: POST")
    
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
            print("Generate MQTT credentials succeeded")
            
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.username and parsed.password then
                _mqtt_config.username = parsed.username
                _mqtt_config.password = parsed.password
                _mqtt_config.expire_time = parsed.expireTime
                
                print("MQTT Credentials:")
                print("  Username: " .. _mqtt_config.username)
                print("  Expire Time: " .. _mqtt_config.expire_time)
                
                C4:UpdateProperty("Status", "MQTT credentials generated successfully")
                
                -- Automatically connect to MQTT
                CONNECT_MQTT()
            else
                print("Failed to parse response: " .. tostring(resp))
                C4:UpdateProperty("Status", "Generate MQTT credentials failed: Invalid response")
            end
        else
            print("Generate MQTT credentials failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Generate MQTT credentials failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

-- Connect to MQTT Broker (Third-Party)
function CONNECT_MQTT()
    print("================================================================")
    print("                  CONNECT_MQTT CALLED                           ")
    print("================================================================")
    
    if not _mqtt_config.host or not _mqtt_config.username or not _mqtt_config.password then
        print("ERROR: MQTT credentials not available.")
        C4:UpdateProperty("Status", "MQTT connect failed: No credentials")
        return
    end
    
    print("Connecting to third-party MQTT broker...")
    print("  Host: " .. _mqtt_config.host)
    print("  Port: " .. _mqtt_config.port)
    print("  Client ID: " .. _mqtt_config.client_id)
    print("  Username: " .. _mqtt_config.username)
    
    -- Parse host (remove mqtts:// or mqtt:// prefix)
    local mqtt_host = _mqtt_config.host:gsub("^mqtts://", ""):gsub("^mqtt://", "")
    print("  Cleaned Host: " .. mqtt_host)
    
    -- Check if using SSL/TLS (mqtts)
    local use_ssl = _mqtt_config.host:match("^mqtts://") ~= nil
    print("  Using SSL: " .. tostring(use_ssl))
    
    -- Update status
    C4:UpdateProperty("Status", "Connecting to MQTT broker...")
    
    -- Important: For Control4's MQTT client API with third-party brokers:
    -- 1. The broker must be accessible from the Control4 controller's network
    -- 2. SSL/TLS connections require proper certificate validation
    -- 3. MQTT protocol version should be 3.1.1 or 5.0
    
    print("")
    print("IMPORTANT: Control4 MQTT Client API Limitations:")
    print("  - Designed for third-party MQTT brokers only")
    print("  - Requires MQTT broker accessible from Control4 controller")
    print("  - SSL/TLS (mqtts://) may require certificate validation")
    print("  - Alternative: Use HTTP long-polling or WebSocket for cloud services")
    print("")
    
    -- Alternative approach: Use HTTP-based event polling
    print("RECOMMENDED: Consider using HTTP polling instead of MQTT")
    print("  Reason: Control4 MQTT client has limited third-party broker support")
    print("  Alternative: Implement HTTP long-polling or WebSocket connection")
    print("")
    
    -- Attempt MQTT connection with TCP (binding 6001 for MQTT)
    if C4 and C4.CreateNetworkConnection then
        -- Using TCP connection for MQTT (not SSL for testing)
        local connection_type = "TCP"
        print("Attempting to create network connection...")
        print("  Binding ID: 6001")
        print("  Connection Type: " .. connection_type)
        
        local success = C4:CreateNetworkConnection(6001, connection_type)
        
        if success then
            print("Network connection created successfully")
            
            -- Try to connect to MQTT broker
            if C4.NetConnect then
                print("Initiating connection to: " .. mqtt_host .. ":" .. _mqtt_config.port)
                C4:NetConnect(6001, _mqtt_config.port, mqtt_host)
                
                print("MQTT connection initiated")
                print("Waiting for OnConnectionStatusChanged callback...")
                C4:UpdateProperty("Status", "MQTT connecting...")
            else
                print("ERROR: C4:NetConnect not available")
                C4:UpdateProperty("Status", "MQTT connect failed: API not available")
            end
        else
            print("ERROR: Failed to create network connection")
            print("")
            print("TROUBLESHOOTING:")
            print("  1. Check if MQTT broker is accessible from Control4 controller")
            print("  2. Verify port " .. _mqtt_config.port .. " is not blocked by firewall")
            print("  3. Test connection using MQTT client tool (MQTT Explorer, mosquitto_sub)")
            print("  4. Consider using HTTP API polling instead of MQTT")
            print("")
            C4:UpdateProperty("Status", "MQTT connect failed: Cannot create connection")
            
            -- Offer HTTP polling alternative
            print("ALTERNATIVE: Switching to HTTP polling mode...")
            START_HTTP_POLLING()
        end
    else
        print("ERROR: C4:CreateNetworkConnection not available")
        print("Control4 MQTT client API may not be supported in this OS version")
        C4:UpdateProperty("Status", "MQTT not supported: Use HTTP polling")
        
        -- Fall back to HTTP polling
        START_HTTP_POLLING()
    end
    
    print("================================================================")
end

-- Handle MQTT Connection Status
function OnConnectionStatusChanged(idBinding, nPort, strStatus)
    print("OnConnectionStatusChanged: binding=" .. tostring(idBinding) .. " port=" .. tostring(nPort) .. " status=" .. strStatus)
    
    if idBinding == 6001 then  -- MQTT binding
        if strStatus == "ONLINE" then
            print("MQTT connection established")
            _mqtt_connected = true
            
            -- Send MQTT CONNECT packet
            SEND_MQTT_CONNECT()
            
            C4:UpdateProperty("Status", "MQTT connected")
            
        elseif strStatus == "OFFLINE" then
            print("MQTT connection lost")
            _mqtt_connected = false
            C4:UpdateProperty("Status", "MQTT disconnected")
            
            -- Schedule reconnection
            SCHEDULE_MQTT_RECONNECT()
        end
    end
end

-- Send MQTT CONNECT Packet
function SEND_MQTT_CONNECT()
    print("Sending MQTT CONNECT packet...")
    
    -- Build MQTT CONNECT packet (simplified)
    -- In a real implementation, you'd use a proper MQTT library
    -- This is a placeholder showing the concept
    
    local mqtt_connect = {
        client_id = _mqtt_config.client_id,
        username = _mqtt_config.username,
        password = _mqtt_config.password,
        clean_session = false,  -- Persistent session
        keep_alive = 60
    }
    
    print("MQTT CONNECT:")
    print("  Client ID: " .. mqtt_connect.client_id)
    print("  Username: " .. mqtt_connect.username)
    print("  Clean Session: false")
    print("  Keep Alive: 60s")
    
    -- Note: In actual implementation, you would:
    -- 1. Build proper MQTT CONNECT packet bytes
    -- 2. Send via C4:SendToNetwork(6001, packet_bytes)
    -- 3. Wait for CONNACK
    -- 4. Then subscribe to topics
    
    -- For now, simulate successful connection and subscribe
    C4:SetTimer(1000, function(timer)
        SUBSCRIBE_MQTT_TOPICS()
    end)
end

-- Subscribe to MQTT Topics
function SUBSCRIBE_MQTT_TOPICS()
    print("================================================================")
    print("            SUBSCRIBE_MQTT_TOPICS CALLED                        ")
    print("================================================================")
    
    if not _mqtt_connected then
        print("ERROR: MQTT not connected")
        return
    end
    
    local vid = _mqtt_config.vid
    local topic = "$push/down/device/" .. vid
    
    print("Subscribing to topic: " .. topic)
    print("QoS: 1 (at least once delivery)")
    
    -- Build MQTT SUBSCRIBE packet
    -- In actual implementation, you would:
    -- 1. Build proper MQTT SUBSCRIBE packet with topic and QoS 1
    -- 2. Send via C4:SendToNetwork(6001, packet_bytes)
    -- 3. Wait for SUBACK
    
    print("Subscribed to device events topic")
    C4:UpdateProperty("Status", "MQTT subscribed to " .. topic)
    
    -- Update UI with current camera status
    SendUpdateCameraProp({status = "MQTT connected"})
    
    print("================================================================")
end

-- Handle Received MQTT Messages
function ReceivedFromNetwork(idBinding, nPort, strData)
    if idBinding == 6001 then  -- MQTT binding
        print("Received MQTT message")
        
        -- Parse MQTT packet
        -- In actual implementation, you would parse the MQTT packet type
        -- and extract the message payload
        
        -- For now, assume strData is the JSON payload
        local ok, message = pcall(json.decode, strData)
        
        if ok and message then
            HANDLE_MQTT_MESSAGE(message)
        else
            print("Failed to parse MQTT message: " .. tostring(strData))
        end
    end
end

-- Handle MQTT Message
function HANDLE_MQTT_MESSAGE(message)
    print("================================================================")
    print("            MQTT MESSAGE RECEIVED                               ")
    print("================================================================")
    
    local method = message.method
    
    if method == "updateDeviceStatus" then
        print("Device Status Update:")
        
        local vid = message.device_info and message.device_info.vid
        print("  VID: " .. tostring(vid))
        
        if message.status then
            for _, status_item in ipairs(message.status) do
                local status_type = status_item.status_type
                local status_key = status_item.status_key
                local status_val = status_item.status_val
                
                print("  Status: " .. status_key .. " = " .. tostring(status_val))
                
                -- Handle specific status updates
                if status_key == "is_online" then
                    if status_val == 1 then
                        C4:UpdateProperty("Status", "Camera Online")
                    else
                        C4:UpdateProperty("Status", "Camera Offline")
                    end
                    
                elseif status_key == "e" then  -- Battery level
                    print("  Battery: " .. status_val .. "%")
                    
                elseif status_key == "ptz_location" then
                    if type(status_val) == "table" then
                        print("  PTZ Location: X=" .. tostring(status_val.x_location) .. " Y=" .. tostring(status_val.y_location))
                    end
                end
            end
        end
        
    elseif method == "deviceEvent" then
        print("Device Event:")
        
        local vid = message.device_info and message.device_info.vid
        print("  VID: " .. tostring(vid))
        
        if message.event then
            local event = message.event
            print("  Event ID: " .. tostring(event.identifier))
            print("  Event Type: " .. tostring(event.type))
            print("  Timestamp: " .. tostring(event.timestamp))
            
            if event.params then
                print("  Event Params:")
                for k, v in pairs(event.params) do
                    print("    " .. k .. " = " .. tostring(v))
                end
            end
            
            -- Trigger Control4 events based on event type
            if event.type == "alert" or event.type == "fault" then
                -- Trigger motion detection or other alerts
                C4:FireEvent("Motion Detection")
            end
        end
    else
        print("Unknown MQTT method: " .. tostring(method))
    end
    
    print("================================================================")
end

-- Schedule MQTT Reconnection
function SCHEDULE_MQTT_RECONNECT()
    print("Scheduling MQTT reconnection in 30 seconds...")
    
    if _mqtt_reconnect_timer then
        _mqtt_reconnect_timer:Cancel()
    end
    
    _mqtt_reconnect_timer = C4:SetTimer(30000, function(timer)
        print("Attempting MQTT reconnection...")
        
        -- Check if credentials are expired
        local current_time = os.time()
        if _mqtt_config.expire_time and current_time >= _mqtt_config.expire_time then
            print("MQTT credentials expired, generating new ones...")
            GENERATE_MQTT_CREDENTIALS()
        else
            CONNECT_MQTT()
        end
    end)
end

-- Disconnect MQTT
function DISCONNECT_MQTT()
    print("Disconnecting from MQTT...")
    
    if _mqtt_connected then
        if C4 and C4.NetDisconnect then
            C4:NetDisconnect(6001, _mqtt_config.port)
        end
        _mqtt_connected = false
    end
    
    if _mqtt_reconnect_timer then
        _mqtt_reconnect_timer:Cancel()
        _mqtt_reconnect_timer = nil
    end
    
    -- Stop HTTP polling if active
    STOP_HTTP_POLLING()
    
    C4:UpdateProperty("Status", "MQTT disconnected")
end

-- HTTP Polling Alternative (For cloud-based event subscriptions)
local _http_polling_timer = nil
local _http_polling_active = false

function START_HTTP_POLLING()
    print("================================================================")
    print("           STARTING HTTP POLLING MODE                           ")
    print("================================================================")
    
    print("HTTP polling is an alternative to MQTT for receiving events")
    print("This uses periodic API calls to check for device status/events")
    print("")
    
    local auth_token = _props["Auth Token"] or Properties["Auth Token"]
    local vid = _props["VID"] or Properties["VID"]
    
    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available for HTTP polling")
        return
    end
    
    if not vid or vid == "" then
        print("ERROR: No VID available for HTTP polling")
        return
    end
    
    _http_polling_active = true
    C4:UpdateProperty("Status", "HTTP polling active")
    
    print("Starting HTTP polling every 30 seconds...")
    print("Polling for device status and events")
    print("")
    
    -- Poll device status periodically
    local function poll_device_status()
        if not _http_polling_active then
            print("HTTP polling stopped")
            return
        end
        
        print("[HTTP Poll] Checking device status...")
        
        local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
        local url = base_url .. "/api/v3/openapi/device/property-latest"
        
        local body = {
            vid = vid,
            data_ids = {"is_online", "e", "ptz_location", "d_s"},
            data_source = 0
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
        
        transport.execute(req, function(code, resp, resp_headers, err)
            if code == 200 or code == 20000 then
                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed and parsed.data then
                    print("[HTTP Poll] Device status received")
                    
                    -- Process status updates
                    for _, status_item in ipairs(parsed.data) do
                        local data_id = status_item.data_id
                        local value = status_item.value
                        
                        print("  " .. data_id .. " = " .. tostring(value))
                        
                        if data_id == "is_online" then
                            if value == 1 then
                                C4:UpdateProperty("Status", "Camera Online (HTTP)")
                            else
                                C4:UpdateProperty("Status", "Camera Offline (HTTP)")
                            end
                        end
                    end
                end
            else
                print("[HTTP Poll] Failed to get status: " .. tostring(code))
            end
        end)
        
        -- Schedule next poll
        if _http_polling_active then
            _http_polling_timer = C4:SetTimer(30000, poll_device_status)
        end
    end
    
    -- Start first poll
    poll_device_status()
    
    print("HTTP polling started successfully")
    print("================================================================")
end

function STOP_HTTP_POLLING()
    print("Stopping HTTP polling...")
    _http_polling_active = false
    
    if _http_polling_timer then
        _http_polling_timer:Cancel()
        _http_polling_timer = nil
    end
    
    print("HTTP polling stopped")
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
        http_port = cameraData.http_port or Properties["HTTP Port"] or "80",
        rtsp_port = cameraData.rtsp_port or Properties["RTSP Port"] or "554",
        authentication_required = cameraData.authentication_required or (Properties["Authentication Type"] ~= "NONE"),
        authentication_type = cameraData.authentication_type or Properties["Authentication Type"] or "NONE",
        username = cameraData.username or Properties["Username"] or "",
        password = "***HIDDEN***",  -- Never send actual password to UI
        publicly_accessible = cameraData.publicly_accessible or false,
        vid = cameraData.vid or Properties["VID"] or "",
        product_id = cameraData.product_id or Properties["Product ID"] or "K26-SL",
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
    local port = Properties["HTTP Port"] or "80"
    local username = Properties["Username"] or ""
    local password = Properties["Password"] or ""
    local path = Properties["Snapshot Path"] or "/snap.jpg"
    local newpath = "/wps-cgi/image.cgi?resolution=3850x2160"
    
    if not ip or ip == "" then
        print("IP Address not set")
        C4:UpdateProperty("Status", "Error: IP Address required")
        return
    end
    
    -- Build URL
    local url
    if username ~= "" and password ~= "" then
        url = string.format("http://%s:%s@%s:%s%s", username, password, ip, port, path)
    else
        url = string.format("http://%s:%s%s", ip, port, path)
    end

    local newsnapshot_url
    if username ~= "" and password ~= "" then
        newsnapshot_url = string.format("http://%s:%s@%s:%s%s", username, password, ip, 3333, newpath)
    else
        newsnapshot_url = string.format("http://%s:%s%s", ip, 3333, newpath)
    end
    
    print("Generated snapshot URL: " .. url)
    print("Generated new snapshot URL: " .. newsnapshot_url)
    C4:UpdateProperty("Status", "Snapshot URL generated")
    
    -- Send to proxy
    if C4 and C4.SendToProxy then
        C4:SendToProxy(5001, "SNAPSHOT_URL", {URL = url})
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
        return "<snapshot_query_string>" .. C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(5001, tParams)) .. "</snapshot_query_string>" 
    elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
        return "<rtsp_h264_query_string>" .. C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(5001, tParams)) .. "</rtsp_h264_query_string>"
    elseif strCommand == "GET_MJPEG_QUERY_STRING" then
        return "<mjpeg_query_string>" .. C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(5001, tParams)) .. "</mjpeg_query_string>"
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
        return "<snapshot_query_string>" .. C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)) .. "</snapshot_query_string>" 
    elseif strCommand == "GET_STREAM_URLS" then
        GET_STREAM_URLS(idBinding, tParams)
        
    elseif strCommand == "GET_RTSP_H264_QUERY_STRING" then
        return "<rtsp_h264_query_string>" .. C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(idBinding, tParams)) .. "</rtsp_h264_query_string>"
        
    elseif strCommand == "GET_MJPEG_QUERY_STRING" then
        return "<mjpeg_query_string>" .. C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(idBinding, tParams)) .. "</mjpeg_query_string>"
        
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
    
    -- Build RTSP URLs for K26-SL camera
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
    
    -- Build MJPEG stream URL for K26-SL camera
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
