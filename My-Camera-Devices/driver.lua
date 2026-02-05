local json      = require("CldBusApi.dkjson")
local http      = require("CldBusApi.http")
local auth      = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util      = require("CldBusApi.util")

-- ==========================
-- Local state
-- ==========================
local _props = {}
local _pendingAuthToken = nil
local _deviceId = ""
local TCP_BINDING_ID = 6001

GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl = "" 
GlobalObject.TCP_SERVER_IP = '54.90.205.243'
GlobalObject.TCP_SERVER_PORT = 3000
GlobalObject.AppName = "TokenManager"
GlobalObject.AccountName = ""
GlobalObject.AccessToken = ""
GlobalObject.AppSecret = "hg4IwDpf6nwP5x2XGCIlNv8"


-- ==========================
-- Driver lifecycle
-- ==========================
function OnDriverInit()
    print("Driver Initialized")
    for k, v in pairs(Properties) do
        if k ~= "Password" then
            print("Property [" .. k .. "] = " .. tostring(v))
        end
        _props[k] = v
    end

    GlobalObject.ClientID     = Properties["ClientId"] or ""
    GlobalObject.ClientSecret = Properties["ClientSecret"] or ""
    GlobalObject.AccountName  = Properties["AccountName"] or ""
    _deviceId = Properties["DeviceId"] or ""

    C4:UpdateProperty("Status", "Driver initialized")

    C4:SetTimer(1000, function()
        if _tcpConnected and _pendingAuthToken then
            print("[AUTH] Processing queued token after TCP online")
            UpdateAuthToken(_pendingAuthToken)
        end
    end)

end

function OnDriverDestroyed()
    print(" Driver Destroyed")
end

-- OndriverLateInitialized
function OnPropertyChanged(strProperty)
    print("Property changed: " .. strProperty)
    
    if strProperty == "Password" then
        print("Password property updated (value hidden)")
        _props[strProperty] = Properties[strProperty]
        return
    end
    

    if strProperty == "Auth Token" then
        UpdateAuthToken(value)
        C4:UpdateProperty("Status", "Authenticated")
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
    if strCommand == "GET_DEVICES" then
        GET_DEVICES(tParams, false)
        return
    end
    if strCommand == "DISCOVER_DEVICES" then
        GET_DEVICES(tParams, true)
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
    
    -- Generate a single ClientID for this session
    local client_id = util.uuid_v4()
    GlobalObject.ClientID = client_id
    Properties["ClientID"] = client_id
    C4:UpdateProperty("ClientID", client_id)
    print("[Camera Init] Generated ClientID:", client_id)
    
    -- Generate other values for init
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    
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
    
    C4:UpdateProperty("Status", "Initializing camera...")
    
    -- Send request to camera init API
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
    
    print("[Camera Init] Sending request to:", url)
    
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))
        if err then print("Error: " .. tostring(err)) end
        print("----------------------------------------------------------------")
        
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.public_key then
                local public_key = parsed.data.public_key
                _props["Public Key"] = public_key
                C4:UpdateProperty("Public Key", public_key)
                C4:UpdateProperty("Status", "Camera initialized successfully")
                print("[Camera Init] Public key received:", public_key)
                
                local country_code = "N"
                local account = Properties["Account"] or "pyabu@slomins.com"
                
                if account == "" then
                    print("ERROR: Account is required for login")
                    C4:UpdateProperty("Status", "Login failed: No account specified")
                    return
                end
                
                LoginOrRegister(country_code, account)
                
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

function LoginOrRegister(country_code, account)
    print("================================================================")
    print("              LOGIN OR REGISTER CALLED                          ")
    print("================================================================")
    
    local public_key = _props["Public Key"] or Properties["Public Key"]
    if not public_key or public_key == "" then
        print("ERROR: No public key available. Run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No public key")
        return
    end
    print("[Login] Using public key:", public_key)
    
    -- Use stored ClientID
    local client_id = GlobalObject.ClientID or Properties["ClientID"]
    if not client_id or client_id == "" then
        print("ERROR: No ClientID available. Must run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No ClientID")
        return
    end
    print("[Login] Using ClientID:", client_id)
    
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    
    local post_data_obj = { country_code = country_code, account = account }
    local post_data_json = json.encode(post_data_obj)
    
    C4:UpdateProperty("Status", "Encrypting credentials...")
    
    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)
        if not success or not encrypted_data then
            print("ERROR: Encryption failed:", error_msg)
            C4:UpdateProperty("Status", "Login failed: Encryption error")
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
        
        C4:UpdateProperty("Status", "Logging in...")
        
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




-- Sends the token to Node API with retries and async handling
function SendTokenToNodeAPI(token)
    local attempt = 1
    local max_attempts = 5

     local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    local function SendTokenRetry()
        local url = "http://54.90.205.243:3000/send-to-control4"
        
        local body = {
            message = {
                EventName = "LnduUpdate",
                Token = token,
                ClientID = GlobalObject.ClientID, 
                AppId       = "cldbus",       
                AppSecret   = app_secret,   
                AccountName = GlobalObject.AccountName
            }
        }

        local req = {
            url = url,
            method = "POST",
            headers = {
                ["Content-Type"]    = "application/json",
                ["Accept-Language"] = "en",
                ["App-Name"]        = GlobalObject.AppId  -- <<< cldbus
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

function GET_DEVICES(tParams, do_awake)
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
    
    local props = Properties        
        for name, value in pairs(props) do
            if name ~= "Account" and name ~= "ClientID" and name ~= "Public Key" and  name ~= "Base API URL" and  name ~= "Auth Token"   then 
                C4:UpdateProperty(name, "")
            end
        end

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
                
                if parsed.data and parsed.data.devices then
                    for i, device in ipairs(parsed.data.devices) do
                        local prop_name = tostring(i)
                        local device_info = string.format("IP: %s, Name: %s, Model: %s, VID %s",
                            tostring(device.local_ip or "N/A"),
                            tostring(device.device_name or "N/A"),
                            tostring(device.model or "N/A"),                        
                            tostring(device.vid or "N/A"))
                        C4:UpdateProperty(prop_name, device_info)       
                        if do_awake == true then
                            MakeSSDPDiscoverable(device.vid)
                        end
                        
                    end
                else
                    print("No devices found in response")
                end
            else
                print("ERROR: Failed to parse get devices response")
            end
        else
            print("Get devices failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Get devices failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end

function MakeSSDPDiscoverable(deviceVid)
    print("[OP04] WAKE_LOCAL called")

    local auth_token = _props["Auth Token"] or Properties["Auth Token"]    
    if not auth_token or auth_token == "" then
        print("ERROR: No auth token available. Please run LoginOrRegister first.")
        C4:UpdateProperty("Status", "Wake local failed: No auth token")
        return
    end
    local body = {
        vid = deviceVid,
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
