local json      = require("CldBusApi.dkjson")
local http      = require("CldBusApi.http")
local auth      = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util      = require("CldBusApi.util")
sha256          = require("sha256")
 
GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl  ="https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.com'
GlobalObject.TCP_SERVER_PORT = ""
GlobalObject.BaseApi = "https://svcs.slomins.com/PROD/OntechSvcs/1.0/ontech"
IsTcpConnected = "";
GlobalObject.AccountName = ""
GlobalObject.AccessToken = ""
GlobalObject.AppSecret = "hg4IwDpf6nwP5x2XGCIlNv8"

local socket = require("socket")
local udp = socket.udp()
udp:settimeout(3)
udp:setoption("broadcast", true)

IsTcpConnected = ""

local _props = {}
local _pendingAuthToken = nil
local _tcpConnected = false
local TCP_BINDING_ID = 6001

-- ==========================
-- LNDU (ISOLATED)
-- ==========================
GlobalObject.LNDU = {
    ClientID = "",
    ClientSecret = "",
    AccessToken = "",
    PublicKey = ""
}

function OnDriverInit()
    print("SetupProperties:")
    GlobalObject.ClientID = Properties["Tuya ClientId"]
    GlobalObject.ClientSecret = Properties["Tuya ClientSecret"]
    C4:UpdateProperty("Tcp Port", "8081")
    GlobalObject.TCP_SERVER_PORT = Properties["Tcp Port"]

   

    TcpConnection()

     for k,v in pairs(Properties) do
        _props[k] = v
    end

    -- LNDU ClientID generation (if missing)
    if not Properties["LNDU_ClientID"] or Properties["LNDU_ClientID"] == "" then
        local lnduclient_id = util.uuid_v4()
        GlobalObject.LNDU.ClientID = lnduclient_id
        C4:UpdateProperty("LNDU_ClientID", lnduclient_id)
        print("[LNDU] Generated ClientID:", lnduclient_id)
    else
         GlobalObject.LNDU.ClientID = Properties["LNDU_ClientID"]
    end
end

function OnDriverLateInit()
    C4:UpdateProperty("MacAddress", C4:GetUniqueMAC())
    
     ValidateMacAddress(Properties["MacAddress"], function(isValid)
        if not isValid then
            ClearDeviceList()
        end
    end)    
end

function OnPropertyChanged(strName)
    print("OnPropertyChange():", strName, Properties[strName])
    if (strName == "MacAddress") then
        C4:UpdateProperty("MacAddress", Properties[strName])

        ClearDeviceList()
        ValidateMacAddress(Properties["MacAddress"], function(isValid)
             if isValid then
                InitializeCamera()
            end
        end)
    end

    if (strName == "UserId") then
        ClearDeviceList()
        ValidateMacAddress(Properties["MacAddress"], function(isValid)
             if isValid then
                InitializeCamera()
            end
        end)
    end

    if (strName == "Tcp Port") then
        DisconnectTcp()
        print("========================================")
        print("Tcp Port CHANGED: " .. Properties[strName])
        print("========================================")
        C4:UpdateProperty("Tcp Port", Properties[strName])
        GlobalObject.TCP_SERVER_PORT = Properties[strName]
        TcpConnection()
        
         ValidateMacAddress(Properties["MacAddress"], function(isValid)
            if not isValid then
                ClearDeviceList()
            end
        end)    
    end

    if strName == "Shieldlink Account Email" then
        local email = Properties["Shieldlink Account Email"]

        ClearDeviceList()
        if email == "" then
            C4:UpdateProperty("Status", "Enter email")
            return
        end
        
        ValidateMacAddress(Properties["MacAddress"], function(isValid)
            if isValid then
                InitializeCamera()
            end
        end)
    end
end

function DisconnectTcp()
    print("Disconnecting old TCP connection...")
    C4:NetDisconnect(6001, GlobalObject.TCP_SERVER_PORT)
end

function TcpConnection()
    if GlobalObject.TCP_SERVER_PORT == "" or GlobalObject.TCP_SERVER_PORT == nil then
        print("ERROR: Tcp Port is empty!")
        return
    end
    
    print("========================================")
    print("TcpConnection: Attempting to connect")
    print("Server IP: " .. GlobalObject.TCP_SERVER_IP)
    print("Server Port: " .. tostring(GlobalObject.TCP_SERVER_PORT))
    print("========================================")
    
    local tPortParams = {
        SUPPRESS_CONNECTION_EVENTS = false,
        AUTO_CONNECT = true,
        MONITOR_CONNECTION = true,
        KEEP_CONNECTION = true,
        KEEP_ALIVE = true,
        DELIMITER = "0d0a"
    }
    
    C4:CreateNetworkConnection(6001, GlobalObject.TCP_SERVER_IP, "TCP")
    C4:NetPortOptions(6001, GlobalObject.TCP_SERVER_PORT, "TCP", tPortParams)
    C4:NetConnect(6001, GlobalObject.TCP_SERVER_PORT)
    print("NetConnect() call issued for port: " .. tostring(GlobalObject.TCP_SERVER_PORT))
end

function OnNetworkConnected(idBinding, nPort)
    print("=======TCP CONNECTION SUCCESSFUL========")
    print("Port: " .. tostring(nPort))
    print("========================================")
end

function OnNetworkDisconnected(idBinding, nPort)
    print("=========TCP DISCONNECTED ==============")
    print("Port: " .. tostring(nPort))
    print("========================================")
end

function OnConnectionStatusChanged(idBinding, nPort, strStatus)
    print("========OnConnectionStatusChanged======")
    print("idBinding: " .. tostring(idBinding))
    print("Port: " .. tostring(nPort))
    print("Status: " .. tostring(strStatus))

    if(nPort == GlobalObject.TCP_SERVER_PORT) then
        IsTcpConnected = strStatus
        if strStatus == "ONLINE" then
            print("Connection Status: ONLINE ")
        elseif strStatus == "OFFLINE" then
            print("Connection Status: OFFLINE")
        end
    end
    print("========================================")

end


function ReceivedFromNetwork(idBinding, nPort, strData)
    
    if tonumber(nPort) == tonumber(GlobalObject.TCP_SERVER_PORT) then
        -- Remove trailing \r\n if present
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
            if data and data.EventName == "UpdateBaseApi" then
                GlobalObject.BaseApi = data.BaseApi
            end
            if data and data.EventName == "UpdateClientSecretId" and data.MacAddress == Properties["MacAddress"] then
                print("ReceivedFromNetwork() UpdateClientSecretId", idBinding, nPort, strData)
                GlobalObject.ClientID = data.ClientId
                GlobalObject.ClientSecret = data.SecretId
                C4:UpdateProperty("Tuya ClientId", data.ClientId or "")
                C4:UpdateProperty("Tuya ClientSecret", data.SecretId or "")
            end
            if data and data.EventName == "ChangeGlobalKeys" then
                GlobalObject.ClientID = data.ClientId
                GlobalObject.ClientSecret = data.ClientSecret
                C4:UpdateProperty("ClientId", data.ClientId or "")
                C4:UpdateProperty("ClientSecret", data.ClientSecret or "")
            end

            if data and data.EventName == "ChangeContract" then
                if data.UserId == Properties["UserId"] then
                    C4:UpdateProperty("Contract", data.Contract or "")
                end
            end
        end
    end
end

function ExecuteCommand(command, tParams)
    print("ExecuteCommand command: " .. command .. " tParams: " .. tostring(tParams)) -- Debugging

    if command == "DISCOVER_DEVICES" or tParams["ACTION"] == "DISCOVER_DEVICES" then
        print("[DISCOVER_DEVICES] Button pressed - Validating credentials first...")
        C4:UpdateProperty("Status", "Validating credentials...")
        
        local mac = Properties["MacAddress"] or C4:GetUniqueMAC()
        ValidateMacAddress(mac, function(isValid)
            if isValid then
                print("[DISCOVER_DEVICES] Credentials refreshed - Waking and fetching devices...")
                GET_DEVICES({}, true)
            else
                ClearDeviceList()
                print("[DISCOVER_DEVICES] Validation failed - credentials not updated")
                C4:UpdateProperty("Status", "Discovery failed: Invalid credentials")
            end
        end)
        return
    end

    if Properties["Contract"] == "Enable" then
        if command == "LUA_ACTION" then
            -- Extract action from tParams
            local action = tParams["ACTION"] or ""        
            --local uid = tParams["UID"]
            local uid = Properties["UserId"]
        
        
            local body = ""

            local props = Properties        
            for name, value in pairs(props) do
                if name ~= "UserId" and name ~= "Tuya ClientId" and name ~= "Tuya ClientSecret" and  name ~= "Contract" and name ~= "MacAddress" 
                  and name ~= "Tcp Port"   
                  and name ~= "Device Response" then 
                    C4:UpdateProperty(name, "")
                end
            end

            --print("LUA_ACTION triggered with action: " .. action) -- Debugging

            -- Fetch the access token before executing the action
        
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                SendCommand(accessToken, uid, body)
                
            end)
                    
        else
            print("Unknown command: " .. command) -- Helps debug issues
        end
    end
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

-- Function to get current timestamp in milliseconds
function GetTimestamp()
    return tostring(os.time() * 1000)
end

-- Function to calculate HMAC-SHA256 signature
function CalculateSignature(clientId, timestamp, nonce, signStr, secret)
    local signSource = clientId .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret,signSource)
    
    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase
    return signature
end

function CalculateSignatureWithAccessToken(clientId,accessToken, timestamp, nonce, signStr, secret)
    local signSource = clientId .. accessToken .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret,signSource)
    
    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase
    
    return signature
end

-- Function to generate a string-to-sign
function StringToSign(method, body,url)
    local sha256Body = sha256.sha256(body) -- Empty body hash
    local signUrl = method:upper() .. "\n" .. sha256Body .. "\n\n" .. url
    return signUrl, url
end

-- Function to generate and request a token
function GenerateToken(GlobalObject, callback)
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

end

function ValidateMacAddress(mac, callback)
    local apiUrl = Properties["Validation API URL"] or "https://qa2.slomins.com/QA/OntechSvcs/1.2/ontech/IsValidControl4MacAddress"
    local requestBody = '{"MacAddress":"' .. mac .. '"}'
    local headers = {
        ["Content-Type"] = "application/json"
    }

    C4:UpdateProperty("Status", "Validating MAC address...")

     C4:urlPost(apiUrl, requestBody, headers,true,
        function(ticketId, strData, responseCode, tHeaders, strError)

        if strError ~= nil and strError ~= "" then
            print("[ValidateMacAddress] Error calling API: " .. strError)
            C4:UpdateProperty("Device Response","Error calling API: " .. strError)
            C4:UpdateProperty("Status", "")
            if callback then callback(false) end
            return
        end

        if responseCode ~= 200 then
            print("[ValidateMacAddress] HTTP Error: " .. tostring(responseCode))
            C4:UpdateProperty("Device Response","HTTP Error: " .. tostring(responseCode))
            if callback then callback(false) end
            return
        end

        local response = C4:JsonDecode(strData)
        if response then
            print("[ValidateMacAddress] IsValidMacAddress: " .. tostring(response.IsValidMacAddress))
            
            if response.IsValidMacAddress == true then
                -- Get encrypted message from response
                local encryptedMsg = response.EncryptMsg
                if not encryptedMsg or encryptedMsg == "" then
                    print("[ValidateMacAddress] No EncryptMsg in response")
                    C4:UpdateProperty("Device Response", "No encrypted message")
                    if callback then callback(false) end
                    return
                end
                
                -- Remove trailing \r\n if present
                if string.sub(encryptedMsg, -2) == "\r\n" then
                    encryptedMsg = string.sub(encryptedMsg, 1, -3)
                end
                
                -- Decrypt the message
                local cipher = 'AES-256-CBC'
                local options = {
                    return_encoding = 'NONE',
                    key_encoding = 'NONE',
                    iv_encoding = 'NONE',
                    data_encoding = 'BASE64',
                    padding = true,
                }
                
                local decrypted_data, err = C4:Decrypt(cipher, GlobalObject.AES_KEY, GlobalObject.AES_IV, encryptedMsg, options)
                
                if not decrypted_data then
                    print("[ValidateMacAddress] Decryption failed: " .. tostring(err))
                    C4:UpdateProperty("Device Response", "Decryption failed")
                    if callback then callback(false) end
                    return
                end
                
                print("[ValidateMacAddress] Decrypted data: " .. decrypted_data)
                
                -- Parse decrypted JSON
                local data = C4:JsonDecode(decrypted_data)
                if not data or not data.message then
                    print("[ValidateMacAddress] Failed to parse decrypted data")
                    C4:UpdateProperty("Device Response", "Invalid decrypted data")
                    if callback then callback(false) end
                    return
                end
                
                -- Normalize MAC addresses for comparison (remove colons/dashes, uppercase)
                local normalizedMac = (mac or ""):gsub("[:%-]", ""):upper()
                local responseMac = (data.message.MacAddress or ""):gsub("[:%-]", ""):upper()
                
                print("[ValidateMacAddress] MAC from Properties (normalized): " .. normalizedMac)
                print("[ValidateMacAddress] MAC from API response (normalized): " .. responseMac)
                
                -- Check if it's the right event and MAC matches
                if data.message.EventName == "UpdateClientSecretId" and responseMac == normalizedMac then
                    local customerEmail = data.message.CustomerEmail or ""
                    print("[ValidateMacAddress] CustomerEmail from decrypted message: " .. customerEmail)
                    
                    -- Check if email from Properties matches
                    local email = Properties["Shieldlink Account Email"] or ""
                    print("[ValidateMacAddress] Email from Properties: " .. email)
                    
                    if email == "" then
                        print("[ValidateMacAddress] No email set in properties")
                        C4:UpdateProperty("Device Response", "No email set")
                        C4:UpdateProperty("Status", "")
                        if callback then callback(false) end
                        return
                    end
                    
                    if customerEmail == email then
                        print("[ValidateMacAddress] ✓ MAC Address and Email match")
                        C4:UpdateProperty("Device Response", "MAC and Email valid")
                        
                        -- Store the Tuya credentials (for Tuya API)
                        GlobalObject.ClientID = data.message.ClientId or ""
                        GlobalObject.ClientSecret = data.message.SecretId or ""
                        C4:UpdateProperty("Tuya ClientId", GlobalObject.ClientID)
                        C4:UpdateProperty("Tuya ClientSecret", "***")
                        
                        -- Store LNDU credentials separately
                        GlobalObject.LNDU.app_id = data.message.CldBusAppId or ""
                        GlobalObject.LNDU.app_secret = data.message.CldBusSecret or ""
                        C4:UpdateProperty("LNDU_ClientSecret", "***")
                        
                        if callback then callback(true) end
                    else
                        print("[ValidateMacAddress] Email mismatch")
                        print("[ValidateMacAddress] Expected: " .. email)
                        print("[ValidateMacAddress] Got: " .. customerEmail)
                        C4:UpdateProperty("Device Response", "Email not mapped to MAC")
                        C4:UpdateProperty("Status", "Email not mapped to MAC")
                        if callback then callback(false) end
                    end
                else
                    print("[ValidateMacAddress] Invalid event or MAC mismatch")
                    C4:UpdateProperty("Device Response", "Invalid response data")
                    if callback then callback(false) end
                end
            else
                print("[ValidateMacAddress] MAC Address is invalid")
                C4:UpdateProperty("Device Response","MAC Address is invalid")
                C4:UpdateProperty("Status","MAC Address is invalid")
                GlobalObject.ClientID = ""
                GlobalObject.ClientSecret = ""
                C4:UpdateProperty("Tuya ClientId",  "")
                C4:UpdateProperty("Tuya ClientSecret", "")
                if callback then callback(false) end
            end
        else
            print("[ValidateMacAddress] Failed to parse JSON response")
            C4:UpdateProperty("Device Response","Failed to parse JSON response")
            if callback then callback(false) end
        end
    end)
end


-- ==========================
-- LNDU Flow (exactly as requested)
-- ==========================
function ValidateLocal(email, mac, callback)
    local url = Properties["Validation API URL"]
    local apiMac = (mac or ""):gsub("[:%-]", ""):upper()

    local payload = {
        AppNamespace = "",
        AppSid       = "2A326E58-39F6-4CE9-9C12-6C0A56AE1D28",
        AppVersion   = "-1",
        CheckVersion = "false",
        IpAddress    = "",
        Latitude     = nil,
        Longitude    = nil,
        Control4Mac  = apiMac
    }

    transport.execute({
        url     = url,
        method  = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body    = json.encode(payload)
    }, function(code, resp)
        if code == 200 then
            local ok, data = pcall(json.decode, resp)
            local isValid = ok and data and (data.Acknowledge == 1) and (data.CustomerEmail == email)
            callback(isValid)
        else
            callback(false)
        end
    end)
end

function InitializeCamera()
    local client_id = util.uuid_v4()

    GlobalObject.LNDU.ClientID = client_id
    C4:UpdateProperty("LNDU_ClientID", client_id)

    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = GlobalObject.LNDU.app_secret or "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"

    local message = string.format("client_id=%s&request_id=%s&time=%s&version=%s", client_id, request_id, time, version)
    local signature = util.hmac_sha256_hex(message, app_secret)

    local body_tbl = { 
        sign = signature, 
        client_id = client_id, 
        request_id = request_id, 
        time = time, 
        version = version 
    }

    local url = (Properties["Base API URL"] or "https://api.arpha-tech.com") .. "/api/v3/openapi/init"

    transport.execute({
        url = url,
        method = "POST",
        headers = { ["Content-Type"] = "application/json", ["App-Name"] = "cldbus" },
        body = json.encode(body_tbl)
    }, function(code, resp)
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.public_key then
                local public_key = parsed.data.public_key

                GlobalObject.LNDU.PublicKey = public_key

                C4:UpdateProperty("Public Key", public_key)
                C4:UpdateProperty("Status", "Camera initialized successfully")

                LoginOrRegister("N")
            else
                C4:UpdateProperty("Status", "Init failed: No public key")
            end
        else
            C4:UpdateProperty("Status", "Init failed")
        end
    end)
end

function RsaOaepEncrypt(data, publicKey, callback)
    local body_tbl = {
        publicKey = publicKey,
        payload = json.decode(data)
    }
    transport.execute({
        url = "http://54.90.205.243:5000/lndu-encrypt",
        method = "POST",
        headers = { ["Content-Type"] = "application/json" },
        body = json.encode(body_tbl)
    }, function(code, resp)
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.encrypted then
                callback(true, parsed.encrypted, nil)
            else
                callback(false, nil, "Invalid encryption response")
            end
        else
            callback(false, nil, "Encryption API failed")
        end
    end)
end

function LoginOrRegister(country_code)
    local account = Properties["Shieldlink Account Email"] or ""

    local public_key = GlobalObject.LNDU.PublicKey or ""


    local client_id = GlobalObject.LNDU.ClientID

    if account == "" or public_key == "" or client_id == "" then
        C4:UpdateProperty("Status", "Login failed: missing data")
        return
    end

    local post_data_obj = { country_code = country_code or "N", account = account }
    local post_data_json = json.encode(post_data_obj)

    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data)
        if not success then
            C4:UpdateProperty("Status", "Login failed: encryption error")
            return
        end

        local request_id = util.uuid_v4()
        local time = tostring(os.time())
        local app_secret = GlobalObject.LNDU.app_secret or "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"

        local message = string.format(
            "client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, encrypted_data, request_id, time
        )

        local signature = util.hmac_sha256_hex(message, app_secret)

        local body_tbl = {
            sign = signature,
            post_data = encrypted_data,
            client_id = client_id,
            request_id = request_id,
            time = time
        }

        local url = (Properties["Base API URL"] or "https://api.arpha-tech.com") 
                    .. "/api/v3/openapi/auth/login-or-register"

        transport.execute({
            url = url,
            method = "POST",
            headers = { 
                ["Content-Type"] = "application/json",
                ["Accept-Language"] = "en",
                ["App-Name"] = "cldbus"
            },
            body = json.encode(body_tbl)
        }, function(code, resp)
            if code == 200 then
                local ok, parsed = pcall(json.decode, resp)

                if ok and parsed and parsed.data then
                    local token = parsed.data.token or parsed.data.access_token or parsed.data.jwt

                    if token then
                       
                        GlobalObject.LNDU.AccessToken = token

                        C4:UpdateProperty("Auth Token", token)
                        --temporary halt sending
                        SendTokenToNodeAPI(token)

                        GET_DEVICES({}, false)

                        C4:UpdateProperty("Status", "Login successful – devices loaded")
                    end
                end
            else
                C4:UpdateProperty("Status", "Login failed")
            end
        end)
    end)
end



function SendTokenToNodeAPI(token)
    local attempt = 1
    local max_attempts = 5

     local app_secret = GlobalObject.LNDU.app_secret or "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    local function SendTokenRetry()
        local url = "http://54.90.205.243:3000/send-to-control4"
        
        local body = {
            message = {
                EventName = "LnduUpdate",
                Token = token,
                ClientID = GlobalObject.LNDU.ClientID, 
                AppId       = "cldbus",       
                AppSecret   = app_secret,   
                AccountName = GlobalObject.AccountName,
                C4UniqueMac = Properties["MacAddress"] or ""
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

-- ==========================
-- Combined Device Fetch
-- ==========================
function ClearDeviceList()
    for i = 1, 20 do C4:UpdateProperty(tostring(i), "") end
end

function UpdateDeviceProperties(devices)
    --ClearDeviceList()
    for i, device in ipairs(devices) do
        if i <= 20 then
            local info = string.format("%s | Name: %s | IP: %s | VID: %s",
                device.prefix or "",
                device.device_name or device.name or "Unknown",
                device.local_ip or "N/A",
                device.vid or device.id or "N/A")
            C4:UpdateProperty(tostring(i), info)
        end
    end
end



function MakeSSDPDiscoverable(deviceVid)
    print("[SSDP] Waking LNDU device via do-property for VID:", deviceVid)

    local auth_token = GlobalObject.LNDU.AccessToken
    if not auth_token or auth_token == "" then
        print("[SSDP] ERROR: No LNDU auth token available")
        return
    end
    
    local body = {
        vid = deviceVid,
        data = json.encode({ sddp_swt = 1 })
    }

    transport.execute({
        url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
            .. "/api/v3/openapi/device/do-property",
        method = "POST",
        headers = {
            ["Content-Type"] = "application/json",
            ["Accept-Language"] = "en",
            ["Authorization"] = "Bearer " .. auth_token
        },
        body = json.encode(body)
    }, function(code, resp)
        if code == 200 or code == 20000 then
            print("[SSDP] Successfully enabled SSDP for VID:", deviceVid)
        else
            print("[SSDP] Failed to enable SSDP for VID:", deviceVid, "Code:", tostring(code))
        end
    end)
end

function GetTuyaDevices(callback)
    print("[TUYA] Starting device fetch...")

    local uid = Properties["UserId"] or ""
    if uid == "" then
        print("[TUYA] Missing UserId property")
        if callback then callback({}) end
        return
    end

    -- Reuse your existing GenerateToken (it uses GlobalObject.ClientID / ClientSecret)
    GenerateToken(GlobalObject, function(accessToken)
        if not accessToken or accessToken == "" then
            print("[TUYA] Failed to obtain access token")
            if callback then callback({}) end
            return
        end

        print("[TUYA] Token obtained, fetching devices for UID:", uid)

        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/users/" .. uid .. "/devices"

        local nonce = ""   -- you can improve this later with GenerateNonce if needed
        local method = "GET"
        local body = ""

        local signString, urlPath = StringToSign(method, body, "/v1.0/users/" .. uid .. "/devices")

        local timestamp = GetTimestamp()
        local sign = CalculateSignatureWithAccessToken(
            GlobalObject.ClientID,
            accessToken,
            timestamp,
            nonce,
            signString,
            GlobalObject.ClientSecret
        )

        local headers = {
            ["client_id"]     = GlobalObject.ClientID,
            ["access_token"]  = accessToken,
            ["sign"]          = sign,
            ["t"]             = timestamp,
            ["sign_method"]   = "HMAC-SHA256",
            ["Content-Type"]  = "application/json"
        }

        C4:urlGet(apiUrl, headers, false, function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                local data = C4:JsonDecode(response)
                if data and data.result then
                    print("[TUYA] Successfully fetched", #data.result, "device(s)")
                    if callback then callback(data.result) end
                else
                    print("[TUYA] No result in response")
                    if callback then callback({}) end
                end
            else
                print("[TUYA] Request failed - Code:", statusCode, "Error:", errorMsg or "unknown")
                if response then print("Response body:", response) end
                if callback then callback({}) end
            end
        end)
    end)
end


function GET_DEVICES(tParams, do_awake)
    print("=== GET_DEVICES called - Fetching LNDU + TUYA ===")

    local compEmail = Properties["Shieldlink Account Email"] or ""
    local controllerMac = Properties["MacAddress"] or ""
    local apiMac = controllerMac:gsub("[:%-]", ""):upper()

    local auth_token = GlobalObject.LNDU.AccessToken
    if not auth_token or auth_token == "" then
        print("Missing LNDU AccessToken")
        C4:UpdateProperty("Status", "Missing LNDU Token")
        return
    end

    ClearDeviceList()
    C4:UpdateProperty("Status", "Device list loading...")

    print("LNDU token OK - Fetching LNDU cameras...")

    local baseUrl = Properties["Base API URL"] or "https://api.arpha-tech.com"
    local camUrl = baseUrl .. "/api/v3/openapi/devices-v2"

    transport.execute({
        url = camUrl,
        method = "GET",
        headers = { 
            ["Authorization"] = "Bearer " .. auth_token 
        }
    },
    function(code, resp)
        local combined = {}

            -- ====================== LNDU DEVICES ======================
            if code == 200 then
                local ok, parsed = pcall(C4.JsonDecode, C4, resp)
                if ok and parsed and parsed.data and parsed.data.devices then
                    local cameraDevices = parsed.data.devices
                    print("[LNDU] Cameras fetched:", #cameraDevices)

                    for _, d in ipairs(cameraDevices) do
                        table.insert(combined, {
                            prefix      = "[LNDU]",
                            device_name = d.device_name or "Unknown Camera",
                            local_ip    = d.local_ip or "",
                            vid         = d.vid or ""
                            
                        })
                        
                        -- Wake LNDU device if requested
                        if do_awake == true and d.vid and d.vid ~= "" then
                            MakeSSDPDiscoverable(d.vid)
                        end
                    end
                else
                    print("[LNDU] Invalid response format")
                end
            else
                print("[LNDU] Request failed with code:", code)
                if resp then print("Response:", resp) end
            end

            -- ====================== TUYA DEVICES (Now Active) ======================
            GetTuyaDevices(function(tuyaDevices)
                print("[TUYA] Received", #(tuyaDevices or {}), "Tuya device(s)")

                for _, d in ipairs(tuyaDevices or {}) do
                    table.insert(combined, {
                        prefix = "[TUYA]",
                        name   = d.name or "Unknown Tuya Device",
                        id     = d.id or ""
                    })
                end

                -- Final update
                UpdateDeviceProperties(combined)

                C4:UpdateProperty("Status", "Updated: " .. tostring(#combined) .. " total devices (LNDU + TUYA)")
                print("[COMBINED] Total devices processed:", #combined)
            end)
        end)
end