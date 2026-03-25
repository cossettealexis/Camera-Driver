--cldbus helper for LNDU cameras

local json      = require("CldBusApi.dkjson")
local http      = require("CldBusApi.http")
local auth      = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util      = require("CldBusApi.util")

sha256 = require("sha256")

-- ==========================
-- Local state
-- ==========================
local _props = {}
local _pendingAuthToken       = nil
local _tcpConnected           = false
local _deviceId               = ""
local TCP_BINDING_ID          = 7001





GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl  ="https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP   = "tuyadev.slomins.net"
GlobalObject.TCP_SERVER_PORT = 8081
GlobalObject.AppName = "TokenManager"
GlobalObject.AccountName = ""
GlobalObject.AccessToken = ""
GlobalObject.AppSecret = "hg4IwDpf6nwP5x2XGCIlNv8"


function OnDriverInit()
    print("===  Driver Initialized ===")

    C4:UpdateProperty("Status", "Connecting...")

    for k,v in pairs(Properties) do
        _props[k] = v
    end

    -- Generate ClientID if missing
    if not Properties["ClientID"] or Properties["ClientID"] == "" then
        local client_id = util.uuid_v4()
        GlobalObject.ClientID = client_id
        Properties["ClientID"] = client_id
        C4:UpdateProperty("ClientID", client_id)
        print("[MY_DEVICES] Generated ClientID:", client_id)
    else
        GlobalObject.ClientID = Properties["ClientID"]
    end

    TcpConnection()

    -- 🔥 TEMP TEST: run after 5 seconds
    C4:SetTimer(5000, function()

        print("TEST: running GET_DEVICES")

        if _props["Auth Token"] and _props["Auth Token"] ~= "" then
            GET_DEVICES()
        else
            print("No auth token yet — waiting for TCP push")
        end

    end)
end

function ValidateLocal(email, mac, callback)
   
    -- Build URL
    local url = Properties["Validation API URL"] or "https://qa2.slomins.com/QA/OnTechSvcs/1.2/Lndu/GetCustomerInfoByControl4Mac"

    -- Format MAC for API
    local apiMac = (mac or ""):gsub("[:%-]", ""):upper()

    -- Safety check
    if #apiMac ~= 12 then
        print("[ValidateLocal] ERROR: Invalid MAC format:", apiMac)
        callback(false)
        return
    end

   
    -- Debug Logs
    print("[ValidateLocal] Email:", email)
    print("[ValidateLocal] Raw MAC:", mac)
    print("[ValidateLocal] API MAC:", apiMac)
    print("[ValidateLocal] URL:", url)

   
    -- Payload
    
    local payload = {
        AppNamespace = "",
        AppSid       = "2A326E58-39F6-4CE9-9C12-6C0A56AE1D28",
        AppVersion   = "-1",
        CheckVersion = "false",
        IpAddress    = "",
        Latitude     = nil,
        Longitude    = nil,
        --Control4Mac  = "000000000000"  -- test MAC
        Control4Mac  = apiMac        
    }

    print("[ValidateLocal] Payload:", json.encode(payload))

    
    -- API Call
    
    transport.execute({
        url     = url,
        method  = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body    = json.encode(payload)
    }, function(code, resp, headers, err)

        print("[ValidateLocal] Response Code:", code)
        print("[ValidateLocal] Response Body:", resp)

        if code == 200 then
            local ok, data = pcall(json.decode, resp)
            if ok and data then
                local isValid = (data.Acknowledge == 1) and (data.CustomerEmail == email)

                if isValid then
                    print("[ValidateLocal] ✅ VALIDATION PASSED")
                else
                    print("[ValidateLocal] ❌ VALIDATION FAILED")
                end

                callback(isValid)
            else
                print("[ValidateLocal] ERROR: Failed to decode response")
                callback(false)
            end
        else
            print("[ValidateLocal] ERROR: API request failed with code", code)
            callback(false)
        end
    end)
end

function OnPropertyChanged(strProperty)
    print("Property changed: " .. strProperty)
    
    if strProperty == "Password" then
        print("Password property updated (value hidden)")
        _props[strProperty] = Properties[strProperty]
        return
    end
    

    --[[if strProperty == "Auth Token" then
        local value = Properties["Auth Token"]
        UpdateAuthToken(value)
    end--]]
    if strProperty == "Auth Token" then
        local value = Properties["Auth Token"]

        print("[Auth Token] Property updated")

        if value and value ~= "" then
             GlobalObject.AccessToken = value
            _props["Auth Token"] = value

            print("[Auth Token] Stored successfully")

            -- Optional: auto refresh devices
            GET_DEVICES({ token = value }, false)
        end
    end

    if strProperty == "Composer Pro Email" then
        local email = Properties["Composer Pro Email"]
        local mac = C4:GetUniqueMAC()

        if email == "" then
            C4:UpdateProperty("Status", "Enter email")
            return
        end

    
         ValidateLocal(email, mac, function(isValid)
            if isValid then
                print("✅ Validation PASSED → continuing flow")
                C4:UpdateProperty("Status", "Validation Passed")
                InitializeCamera()
            else
                print("❌ Validation FAILED")
                C4:UpdateProperty("Status", "Validation Failed")
            end
        end)
    end
end



function OnDriverDestroyed()
    print(" Driver Destroyed")
end

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

function ReceivedFromNetwork(idBinding, nPort, strData)
    if string.sub(strData, -2) == "\r\n" then
        strData = string.sub(strData, 1, -3)
    end

    local cipher = 'AES-256-CBC'
    local options = { return_encoding='NONE', key_encoding='NONE', iv_encoding='NONE', data_encoding='BASE64', padding=true }
    local decrypted_data, err = C4:Decrypt(cipher, GlobalObject.AES_KEY, GlobalObject.AES_IV, strData, options)

    if not decrypted_data then
        print("[TCP] Decryption failed:", err)
        return
    end

    local data = C4:JsonDecode(decrypted_data)
    if not data then
        print("[TCP] Failed to decode JSON")
        return
    end

    -- Handle events
    if data.EventName == "ChangeGlobalKeys" then
        GlobalObject.ClientID = data.ClientId
        GlobalObject.ClientSecret = data.ClientSecret
        C4:UpdateProperty("ClientId", data.ClientId or "")
        C4:UpdateProperty("ClientSecret", data.ClientSecret or "")
        print("[TCP] Global keys updated")
    elseif data.EventName == "ChangeContract" then
        if data.UserId == Properties["UserId"] then
            C4:UpdateProperty("Contract", data.Contract or "")
            print("[TCP] Contract updated")
        end
    elseif data.EventName == "LnduUpdate" then
        if data.Token and data.Token ~= "" then
            GlobalObject.AccessToken = data.Token
            _props["Auth Token"] = data.Token
            C4:UpdateProperty("Auth Token", data.Token)
            print("[TCP] Auth Token updated via TCP")
            GET_DEVICES({}, false)
        end
    end
end


function OnConnectionStatusChanged(id, port, status)

    if id ~= TCP_BINDING_ID then return end

    local s = tostring(status):upper()
    _tcpConnected = (s == "ONLINE" or s == "CONNECTED")

    print("TCP Connected:", _tcpConnected)

    if _pendingAuthToken and _tcpConnected then
        UpdateAuthToken(_pendingAuthToken)
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
    
    if Properties["Contract"] == "Enable" then
        if strCommand == "MY_DEVICES" then
            -- Extract action from tParams
            local action = tParams["ACTION"] or ""        
            --local uid = tParams["UID"]
            local uid = Properties["UserId"] or "pyabu"
        
        
            local body = ""

            local props = Properties        
            for name, value in pairs(props) do
                if name ~= "UserId" and name ~= "ClientId" and name ~= "ClientSecret" and  name ~= "Contract"   then 
                    C4:UpdateProperty(name, "")
                end
            end
        
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                SendCommand(accessToken, uid, body)
                
            end)
                    
        else
            print("Unknown command: " .. strCommand) -- Helps debug issues
        end
    end

    -- ===== HANDLE SUB-ACTIONS =====
    if strCommand == "LUA_ACTION" and tParams and tParams.ACTION then
        ExecuteCommand(tParams.ACTION, tParams)
    end

    -- ===== UNKNOWN COMMAND =====
    print("Unknown command: " .. strCommand)
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

function LoginOrRegister(country_code)
    print("================================================================")
    print("              LOGIN OR REGISTER (REWRITTEN)                     ")
    print("================================================================")

    -- ✅ STEP 1: Get Account from Properties
    local account = Properties["Account"] or ""

    if account == "" then
        print("❌ ERROR: Account property is empty")
        C4:UpdateProperty("Status", "Login failed: No account")
        return
    end

    GlobalObject.AccountName = account
    print("[Login] Account:", account)

    -- ✅ STEP 2: Get Public Key
    local public_key = _props["Public Key"] or Properties["Public Key"]

    if not public_key or public_key == "" then
        print("❌ ERROR: No public key. Run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No public key")
        return
    end

    print("[Login] Public Key OK")

    -- ✅ STEP 3: Get Client ID
    local client_id = GlobalObject.ClientID or Properties["ClientID"]

    if not client_id or client_id == "" then
        print("❌ ERROR: No ClientID. Run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No ClientID")
        return
    end

    print("[Login] ClientID:", client_id)

    -- ✅ STEP 4: Prepare Request Data
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"

    local post_data_obj = {
        country_code = country_code or "N",
        account = account
    }

    local post_data_json = json.encode(post_data_obj)

    print("[Login] Encrypting credentials...")
    C4:UpdateProperty("Status", "Encrypting credentials...")

    -- ✅ STEP 5: Encrypt
    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)

        if not success or not encrypted_data then
            print("❌ ERROR: Encryption failed:", error_msg)
            C4:UpdateProperty("Status", "Login failed: Encryption error")
            return
        end

        print("[Login] Encryption successful")

        -- ✅ STEP 6: Sign Request
        local message = string.format(
            "client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, encrypted_data, request_id, time
        )

        local signature = util.hmac_sha256_hex(message, app_secret)

        -- ✅ STEP 7: Build Request Body
        local body_tbl = {
            sign       = signature,
            post_data  = encrypted_data,
            client_id  = client_id,
            request_id = request_id,
            time       = time
        }

        local body_json = json.encode(body_tbl)

        -- ✅ STEP 8: Send Login Request
        local url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
            .. "/api/v3/openapi/auth/login-or-register"

        print("[Login] Sending request to:", url)
        C4:UpdateProperty("Status", "Logging in...")

        transport.execute({
            url = url,
            method = "POST",
            headers = {
                ["Content-Type"] = "application/json",
                ["Accept-Language"] = "en",
                ["App-Name"] = "cldbus"
            },
            body = body_json
        }, function(code, resp, _, err)

            print("----------------------------------------------------------------")
            print("[Login] Response code:", tostring(code))
            print("[Login] Response body:", tostring(resp))
            if err then print("[Login] Error:", tostring(err)) end
            print("----------------------------------------------------------------")

            if code ~= 200 then
                print("❌ Login failed:", code)
                C4:UpdateProperty("Status", "Login failed")
                return
            end

            -- ✅ STEP 9: Parse Response
            local ok, parsed = pcall(json.decode, resp)

            if not ok or not parsed or not parsed.data then
                print("❌ ERROR: Invalid login response")
                C4:UpdateProperty("Status", "Login failed: Invalid response")
                return
            end

            local client_secret = parsed.data.app_client_secret or parsed.data.client_secret
            if client_secret and client_secret ~= "" then
                GlobalObject.ClientSecret = client_secret
                C4:UpdateProperty("ClientSecret", client_secret)
                print("[Login] ClientSecret received and stored")
            else
                print("[Login] WARNING: ClientSecret missing in login response")
            end

            local token =
                parsed.data.token or
                parsed.data.access_token or
                parsed.data.jwt

            if not token or token == "" then
                print("❌ ERROR: No token received")
                C4:UpdateProperty("Status", "Login failed: No token")
                return
            end

            if token and token ~= "" then
                _props["Auth Token"] = token
                GlobalObject.AccessToken = token
                C4:UpdateProperty("Auth Token", token)

                -- 1. Send to your External API
                SendTokenToNodeAPI(token)

                -- 2. Trigger the Unified Fetch
                print("[FLOW] Success! Fetching combined device list...")
                GET_DEVICES({}, false) 
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


function ClearDeviceList()
    for i = 1, 10 do
        C4:UpdateProperty(tostring(i), "")
    end
end


function UpdateDeviceProperties(devices, do_awake)
    ClearDeviceList() -- Security: Start with a clean slate
    
    for i, device in ipairs(devices) do
        if i <= 10 then 
            local device_info = string.format("IP: %s | Name: %s | VID: %s",
                tostring(device.local_ip or "N/A"),
                tostring(device.device_name or "N/A"),
                tostring(device.vid or "N/A"))
            
            C4:UpdateProperty(tostring(i), device_info)
            print("[UI Update] Slot " .. i .. ": " .. device.device_name)
            
            if do_awake == true then
                MakeSSDPDiscoverable(device.vid)
            end
        end
    end
end

function GET_DEVICES(tParams, do_awake)
    local compEmail = Properties["Composer Pro Email"] or ""
    local controllerMac = C4:GetUniqueMAC()
    local apiMac = controllerMac:gsub("[:%-]", ""):upper()

    ValidateLocal(compEmail, apiMac, function(isValid)
        if not isValid then
            C4:UpdateProperty("Status", "Unauthorized Access")
            return
        end

        local auth_token = _props["Auth Token"] or GlobalObject.AccessToken
        if not auth_token then
            C4:UpdateProperty("Status", "Missing Auth Token")
            return
        end

        -- 1️⃣ Fetch LNDU Cameras
        local camUrl = (Properties["Base API URL"] or "https://api.arpha-tech.com") .. "/api/v3/openapi/devices-v2"
        transport.execute({ url=camUrl, method="GET", headers={ ["Authorization"]="Bearer "..auth_token } },
        function(code, resp)
            local cameraDevices = {}
            if code==200 then
                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed.data then
                    cameraDevices = parsed.data.devices or {}
                end
            end

            -- 2️⃣ Fetch Tuya Devices
            GetTuyaDevices(function(tuyaDevices)
                local combined = {}

                for _, d in ipairs(cameraDevices) do
                    table.insert(combined, { device_name="[CAM] "..(d.device_name or "Unknown"), local_ip=d.local_ip or "N/A", vid=d.vid })
                end

                for _, d in ipairs(tuyaDevices) do
                    table.insert(combined, { device_name="[TUYA] "..(d.name or "Unknown"), local_ip="Cloud", vid=d.id })
                end

                UpdateDeviceProperties(combined, do_awake)
                C4:UpdateProperty("Status", "Updated: "..#combined.." devices found")
            end)
        end)
    end)
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

function NormalizeMAC(mac)
    if not mac then return "" end

    -- remove separators
    mac = mac:gsub(":", ""):gsub("-", ""):upper()

    -- add colons every 2 chars
    return mac:gsub("(%x%x)", "%1:"):sub(1, 17)
end


-- ==========================
-- Debugging Helper
-- ==========================
function DebugLog(msg, data)
    local output = "[TUYA DEBUG] " .. msg
    if data then
        output = output .. " -> " .. (type(data) == "table" and json.encode(data) or tostring(data))
    end
    print(output)
end

function SendCommand(accessToken, uid, body)
    --print("Reacthing at SendCommand") -- Debugging
    -- reset all properties
    
    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/users/" .. uid .. "/devices"

    local nonce = "" -- Can be left empty unless required
    local method = "GET"
    
    -- Generate string to sign
    local signString, url = StringToSign(method, body,"/v1.0/users/" .. uid .. "/devices")

    -- Calculate signature
    local timestamp = GetTimestamp()
    local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString, GlobalObject.ClientSecret)

    local headers = {
        ["client_id"] = GlobalObject.ClientID,
        ["access_token"] = accessToken,
        ["sign"] = sign,
        ["t"] = timestamp,
        ["sign_method"] = "HMAC-SHA256",
        ["Content-Type"] = "application/json"
    }
    --local payloadBody = Json.encode(body)
    C4:urlGet(apiUrl, headers, false, function(ticketId, response, statusCode, errorMsg)
        
        
        if statusCode == 200 then           
            local response_json = C4:JsonDecode(response)
            --print("| Device ID       | Product Name                  | Name         |")
            --print("-----------------------------------")
            local deviceList = ""
            local index = 1
            for _, device in ipairs(response_json.result) do
                --print("| " .. device.id .. " | " .. device.product_name .. " |".. device.name .. " |")
                deviceList = deviceList .. device.id .. " - " .. device.name .. "\n"                
                C4:UpdateProperty(tostring(index), device.name .. " - " .. device.product_name .. " - " .. device.id .. "")
                index = index+1
            end
            --print("-----------------------------------")           
            

        else
            print("No devices found.")

            C4:UpdateProperty("1", "No devices found.")
        end
    end)    
end



-- Function to generate a string-to-sign
--[[function StringToSign(method, body,url)
    local sha256Body = sha256.sha256(body) -- Empty body hash
    local signUrl = method:upper() .. "\n" .. sha256Body .. "\n\n" .. url
    return signUrl, url
end--]]

-- Function to generate and request a token
--[[function GenerateToken(GlobalObject, callback)
    local accessToken = ""
    local timestamp = GetTimestamp()
    local nonce = "" -- Can be left empty unless required
    local method = "GET"
    local body = ""  -- GET request has an empty body

    -- Generate string to sign
    local signString, url = StringToSign(method, body, "/v1.0/token?grant_type=1")

    -- Calculate signature
    local sign = CalculateSignature(GlobalObject.ClientID, timestamp, nonce, signString, GlobalObject.ClientSecret)

    -- Set headers
    local headers = {
        ["client_id"] = GlobalObject.ClientID,
        ["sign"] = sign,
        ["t"] = timestamp,
        ["sign_method"] = "HMAC-SHA256"
    }

    -- Perform HTTP GET request
    C4:urlGet(GlobalObject.BaseUrl .. url, headers, false,
    function(ticketId, response, statusCode, errorMsg)
        if statusCode == 200 then
            local data = C4:JsonDecode(response)

            -- Extract access token and pass it to the callback function
            if data and data["result"] and data["result"]["access_token"] then
                local accessToken = data["result"]["access_token"]
                --print("Extracted Access Token: " .. accessToken)
                
                if callback then
                    callback(accessToken)
                end
            else
                print("Error: Access token not found in response!")
                if callback then
                    callback(nil)
                end
            end
        else
            print("Request failed: " .. statusCode .. " - " .. errorMsg)
            if callback then
                callback(nil)
            end
        end
    end)

end--]]

function GetTuyaDevices(callback)
    local uid = Properties["UserId"]
    local function Fetch()
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then callback({}); return end
            local url = GlobalObject.BaseUrl .. "/v1.0/users/" .. uid .. "/devices"
            local signStr, _ = StringToSign("GET", "", "/v1.0/users/"..uid.."/devices")
            local timestamp = GetTimestamp()
            local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, "", signStr, GlobalObject.ClientSecret)
            local headers = { ["client_id"]=GlobalObject.ClientID, ["access_token"]=accessToken, ["sign"]=sign, ["t"]=timestamp, ["sign_method"]="HMAC-SHA256" }

            C4:urlGet(url, headers, false, function(_, resp, status)
                print("[Tuya] GET DEVICES status:", status)
                print("[Tuya] Response:", resp)
                local devices = {}
                if status==200 then
                local ok,data = pcall(C4.JsonDecode, resp)
                if ok and data.result then
                    for _,d in ipairs(data.result) do
                        table.insert(devices,{id=d.id,name=d.name})
                        print("[Tuya] Device found:", d.id, d.name)
                    end
                else
                    print("[Tuya] ERROR: Failed to parse JSON or result missing")
                end
                else
                    print("[Tuya] ERROR: HTTP status", status)
                end
                    callback(devices)
            end)
        end)
    end

    if GlobalObject.ClientID=="" or GlobalObject.ClientSecret=="" then
        C4:SetTimer(1000, Fetch)
    else
        Fetch()
    end
end

function GenerateToken(GlobalObject, callback)
    local path = "/v1.0/token?grant_type=1"
    local timestamp = GetTimestamp()
    
    -- Tuya Signature requires Method + Content-SHA256 + Headers + URL
    local signStr, _ = StringToSign("GET", "", path)
    local sign = CalculateSignature(GlobalObject.ClientID, timestamp, "", signStr, GlobalObject.ClientSecret)
    
    local headers = { 
        ["client_id"] = GlobalObject.ClientID, 
        ["sign"] = sign, 
        ["t"] = timestamp, 
        ["sign_method"] = "HMAC-SHA256" 
    }

    DebugLog("Requesting Token", {url = GlobalObject.BaseUrl .. path, headers = headers})

    C4:urlGet(GlobalObject.BaseUrl .. path, headers, false, function(_, resp, status)
        DebugLog("Token Response Status", status)
        DebugLog("Token Response Body", resp)
        
        if status == 200 then
            local ok, data = pcall(json.decode, resp)
            if ok and data.success and data.result and data.result.access_token then 
                DebugLog("Token Success", data.result.access_token)
                callback(data.result.access_token) 
                return 
            else
                DebugLog("Token Data Error", data.msg or "Unknown Error")
            end
        end
        callback(nil)
    end)
end

function StringToSign(method, body, url)
    local contentSha = sha256.sha256(body or "")
    return method:upper() .. "\n" .. contentSha .. "\n\n" .. url, url
end

function GetTimestamp() return tostring(os.time()*1000) end
function CalculateSignature(clientId, timestamp, nonce, signStr, secret)
    return string.upper(sha256.hmac_sha256(secret, clientId..timestamp..nonce..signStr))
end
function CalculateSignatureWithAccessToken(clientId,accessToken,timestamp,nonce,signStr,secret)
    return string.upper(sha256.hmac_sha256(secret, clientId..accessToken..timestamp..nonce..signStr))
end