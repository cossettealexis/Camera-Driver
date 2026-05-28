require "base"
local sha256 = require("sha256")
Json = require("dkjson")

UI_REQUEST = {}
GlobalObject = {}
apiUpdate = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl = "https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.com'
GlobalObject.TCP_SERVER_PORT = 8081


local deviceId = ""
IsTcpConnected = false

function ON_INIT.setupState()
    print("SetupProperties:")
    deviceId = Properties["DeviceId"];
    GlobalObject.ClientID = Properties["ClientId"]
    GlobalObject.ClientSecret = Properties["ClientSecret"]
    print("deviceId ", deviceId);
    TcpConnection()
end

function SendUpdate(extractedData)
    local jsonString = C4:JsonEncode(extractedData)
    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateUI</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)
    C4:SendDataToUI(xmlData)
end

function SendUpdateCameraProp(extractedData)
    local jsonString = C4:JsonEncode(extractedData)
    local xmlData = string.format([[
        <CameraProperties>
            <Command>UpdateUI</Command>
            <Data>%s</Data>
        </CameraProperties>
    ]], jsonString)
    C4:SendDataToUI(xmlData)
end

function UIRequest(strCommand, tParams)
    print("call UIRequest", strCommand, C4:JsonEncode(tParams))

    if Properties["Contract"] == "Enable" then
        if strCommand == "HandleSelect" then
            HandleSelect()
        end

        if strCommand == "SetVideoQuality" then
            print("call SetVideoQuality", tParams)
            if (tParams["Value"] ~= nil) then
                C4:UpdateProperty("VideoQuality", tParams["Value"])
            end
            GetLiveStreamingUrl(deviceId)
        end

        if strCommand == "SetControlPtz" then
            print("call SetControlPtz", tParams)
            local tParamsVal = tParams.value;
            if tParamsVal == 'True' then
                tParamsVal = true
            elseif tParamsVal == 'False' then
                tParamsVal = false
            end

            local params = {
                code = tParams.code,
                value = tParamsVal
            }
            SetCameraPTZ(deviceId, params, function(success)
                if success then
                    print("SetCameraPTZ succeed.")
                else
                    print("Failed to SetCameraPTZ.")
                end
            end)
        end

        if strCommand == "SetVideoMute" then
            print("call SetVideoMute", tParams)
            if (tParams["Value"] ~= nil) then
                C4:UpdateProperty("Mute", tParams["Value"])
            end
        end

        if strCommand == "SetVideoLight" then
            print("call SetVideoLight", tParams)
            local params = {
                code = "floodlight_switch",
                value = tParams.Value == "On"
            }
            SetCameraProperty(deviceId, params, function(success)
                if success then
                    print("device light success updated.")
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end

        if strCommand == "SetVideoSiren" then
            print("call SetVideoSiren", tParams)
            local params = {
                code = "siren_switch",
                value = tParams.Value == "On"
            }
            SetCameraProperty(deviceId, params, function(success)
                if success then
                    print("device suren success updated.")
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end
    end
   
    if type(UI_REQUEST[strCommand]) == "function" then
        local success, retVal = pcall(UI_REQUEST[strCommand], tParams)
        if success then
            return retVal
        end
    end

    return nil
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
    C4:CreateNetworkConnection(6001, GlobalObject.TCP_SERVER_IP, "TCP")
    C4:NetPortOptions(6001, GlobalObject.TCP_SERVER_PORT, "TCP", tPortParams)
    C4:NetConnect(6001, GlobalObject.TCP_SERVER_PORT)
end

function OnConnectionStatusChanged(idBinding, nPort, strStatus)
    if (nPort == GlobalObject.TCP_SERVER_PORT) then
        IsTcpConnected = strStatus
        print("TCP connection status changed:", strStatus)
    end
end

function ReceivedFromNetwork(idBinding, nPort, strData)
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
        local extractedCamData = {}
        local deviceId = Properties["DeviceId"];
        
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

        if data and data.devId and data.devId == deviceId then
            print("ReceivedFromNetwork()", idBinding, nPort, strData)
            -- Mapping of codes to extractedCamData keys
            local codeMapping = {
                motion_switch = "motion_switch",
                floodlight_switch = "floodlight_switch",
                siren_switch = "siren_switch"
            }

            -- Process the result
            for _, item in ipairs(data.properties) do
                if item.code and item.value ~= nil then -- Ensure item.code and item.value are valid
                    local key = codeMapping[item.code]
                    if key then
                        extractedCamData[key] = item.value
                    end
                end
            end
            if (extractedCamData.motion_switch ~= nil or extractedCamData.floodlight_switch ~= nil or extractedCamData.siren_switch ~= nil) then
                if (extractedCamData.motion_switch ~= nil) then
                    extractedCamData.motion_switch = extractedCamData.motion_switch
                end
                if (extractedCamData.floodlight_switch ~= nil) then
                    extractedCamData.floodlight_switch = extractedCamData.floodlight_switch
                end
                if (extractedCamData.siren_switch ~= nil) then
                    extractedCamData.siren_switch = extractedCamData.siren_switch
                end
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedCamData)
                print("GetCameraProperties JSON to UI: " .. jsonString)
                SendUpdateCameraProp(extractedCamData)
            end
        end
    end
end

function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("RecievedFromProxy()", idBinding, strCommand)
    if type(PROXY_CMDS[strCommand]) == "function" then
        local success, retVal = pcall(PROXY_CMDS[strCommand], tParams)
        if success then
            return retVal
        end
    end

    return nil
end

function HandleSelect()
    print("User clicked the App")
    GetLiveStreamingUrl(deviceId)
    GetCameraProperties(deviceId)
end

function ON_LATE_INIT.sendIcon()
    HandleSelect()
end

function OnPropertyChanged(strName)
    print("OnPropertyChange():", strName, Properties[strName])
    if (strName == "DeviceId") then
        C4:UpdateProperty("DeviceId", Properties[strName])
        deviceId = Properties[strName]
        if Properties["Contract"] == "Enable" then
            GetLiveStreamingUrl(Properties[strName])
        end
    end
    if (strName == "ClientId") then
        C4:UpdateProperty("ClientId", Properties[strName])
        GlobalObject.ClientID = Properties[strName]
    end
    if (strName == "ClientSecret") then
        C4:UpdateProperty("ClientSecret", Properties[strName])
        GlobalObject.ClientSecret = Properties[strName]        
    end
end

-- Function to get current timestamp in milliseconds
function GetTimestamp()
    return tostring(os.time() * 1000)
end

-- Function to calculate HMAC-SHA256 signature
function CalculateSignature(clientId, timestamp, nonce, signStr, secret)
    local signSource = clientId .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret, signSource)

    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase
    return signature
end

function CalculateSignatureWithAccessToken(clientId, accessToken, timestamp, nonce, signStr, secret)
    local signSource = clientId .. accessToken .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret, signSource)

    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase

    return signature
end

-- Function to generate a string-to-sign
function StringToSign(method, body, url)
    local sha256Body = sha256.sha256(body) -- Empty body hash
    local signUrl = method:upper() .. "\n" .. sha256Body .. "\n\n" .. url
    return signUrl, url
end

-- Function to generate and request a token
function GenerateToken(callback)
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
                    print("Extracted Access Token: " .. accessToken)

                    if callback then
                        callback(accessToken)
                    end
                else
                    apiUpdate.apiresponse = "Something went wrong. we can not generate the token.";
                    SendUpdate(apiUpdate)
                    print("Error: Access token not found in response!")
                    if callback then
                        callback(nil)
                    end
                end
            else
                apiUpdate.apiresponse = "Something went wrong. we can not generate the token.";
                SendUpdate(apiUpdate)
                print("Request failed: " .. statusCode .. " - " .. errorMsg)
                if callback then
                    callback(nil)
                end
            end
        end)
end

local commands = {}
function AddCommand(code, value)
    commands = {}
    table.insert(commands, {
        code = code,
        value = value
    })
end

local extractedData = {}
function GetLiveStreamingUrl(deviceId)
    GenerateToken(function(accessToken)
        if not accessToken then
            print("Failed to retrieve access token.")
            return
        end
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/stream/actions/allocate"
        local method = "POST"
        local body = '{"type": "rtsp"}'
        local nonce = ""

        -- Generate signature
        local signString = StringToSign(method, body, "/v1.0/devices/" .. deviceId .. "/stream/actions/allocate")
        local timestamp = GetTimestamp()
        local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString,
            GlobalObject.ClientSecret)

        local headers = {
            ["client_id"] = GlobalObject.ClientID,
            ["access_token"] = accessToken,
            ["sign"] = sign,
            ["t"] = timestamp,
            ["sign_method"] = "HMAC-SHA256",
            ["Content-Type"] = "application/json"
        }
        C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                print("DeviceId: ", deviceId)
                local data = C4:JsonDecode(response)
                if data and data.result then
                    extractedData = {}
                    extractedData.stream_url = data.result.url
                    extractedData.video_quality = Properties["VideoQuality"]
                    extractedData.mute = Properties["Mute"]
                    -- Encode the data to JSON and send to UI
                    local jsonString = C4:JsonEncode(extractedData)

                    print("GetLiveStreamingUrl JSON to UI: " .. jsonString)
                    SendUpdate(extractedData)
                else
                    print("Error: Invalid JSON response structure")
                end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
            end
        end)
    end)
end

function SetCameraProperty(deviceId, tParams, callback)
    GenerateToken(function(accessToken)
        if not accessToken then
            print("Failed to retrieve access token.")
            return
        end
        if IsTcpConnected == 'OFFLINE' then
            TcpConnection()
        end
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local code = tParams.code
        local value = tParams.value

        local body = string.format([[
            {
                "commands": [
                        {
                            "code": "%s",
                            "value": %s
                        }
                ]
            }
        ]]
        , code, tostring(value))

        local nonce = ""
        -- Generate signature
        local signString, url = StringToSign(method, body, "/v1.0/devices/" .. deviceId .. "/commands")
        local timestamp = GetTimestamp()
        local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString,
            GlobalObject.ClientSecret)

        local headers = {
            ["client_id"] = GlobalObject.ClientID,
            ["access_token"] = accessToken,
            ["sign"] = sign,
            ["t"] = timestamp,
            ["sign_method"] = "HMAC-SHA256",
            ["Content-Type"] = "application/json"
        }

        C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                print("Device " .. code .. "updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end)
end

function SetCameraPTZ(deviceId, tParams, callback)
    GenerateToken(function(accessToken)
        if not accessToken then
            print("Failed to retrieve access token.")
            return
        end
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local code = tParams.code
        local value = type(tParams.value) == "string" and string.format([["%s"]], tParams.value) or tostring(tParams.value)

        local body = string.format([[
            {
                "commands": [
                        {
                            "code": "%s",
                            "value": %s
                        }
                ]
            }
        ]]
        , code, tostring(value))
        print('run command', body);
        local nonce = ""
        -- Generate signature
        local signString, url = StringToSign(method, body, "/v1.0/devices/" .. deviceId .. "/commands")
        local timestamp = GetTimestamp()
        local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString,
            GlobalObject.ClientSecret)

        local headers = {
            ["client_id"] = GlobalObject.ClientID,
            ["access_token"] = accessToken,
            ["sign"] = sign,
            ["t"] = timestamp,
            ["sign_method"] = "HMAC-SHA256",
            ["Content-Type"] = "application/json"
        }

        C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
            local jsonString = C4:JsonEncode(response)
            print(jsonString)
            if statusCode == 200 then
                print("Device " .. code .. "updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end)
end

local extractedCamData = {}
function GetCameraProperties(deviceId)
    GenerateToken(function(accessToken)
        if not accessToken then
            print("Failed to retrieve access token.")
            return
        end
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/status"
        local method = "GET"
        local body = ""
        local nonce = ""

        -- Generate signature
        local signString, url = StringToSign(method, body, "/v1.0/devices/" .. deviceId .. "/status")
        local timestamp = GetTimestamp()
        local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString,
            GlobalObject.ClientSecret)

        local headers = {
            ["client_id"] = GlobalObject.ClientID,
            ["access_token"] = accessToken,
            ["sign"] = sign,
            ["t"] = timestamp,
            ["sign_method"] = "HMAC-SHA256",
            ["Content-Type"] = "application/json"
        }

        C4:urlGet(apiUrl, headers, false, function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                print("Api Reponse : " .. response)
                local data = C4:JsonDecode(response)

                if data and data.result then
                    extractedCamData = {}

                    -- Mapping of codes to extractedCamData keys
                    local codeMapping = {
                        motion_switch = "motion_switch",
                        floodlight_switch = "floodlight_switch",
                        siren_switch = "siren_switch",
                        ptz_control = "ptz_control"
                    }

                    -- Process the result
                    for _, item in ipairs(data.result) do
                        if item.code then -- Ensure item.code and item.value are valid
                            local key = codeMapping[item.code]
                            if key then
                                extractedCamData[key] = item.value
                            end
                        end
                    end
                    extractedCamData.motion_switch = extractedCamData.motion_switch
                    extractedCamData.floodlight_switch = extractedCamData.floodlight_switch
                    extractedCamData.siren_switch = extractedCamData.siren_switch
                    extractedCamData.ptz_control = extractedCamData.ptz_control and 1 or 0
                    -- Encode the data to JSON and send to UI
                    local jsonString = C4:JsonEncode(extractedCamData)
                    print("GetCameraProperties JSON to UI: " .. jsonString)
                    SendUpdateCameraProp(extractedCamData)
                else
                    print("Error: Invalid JSON response structure")
                end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
            end
        end)
    end)
end
