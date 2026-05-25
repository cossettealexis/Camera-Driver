Json = require("dkjson")
local sha256 = require("sha256")

GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl = "https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.com'
GlobalObject.TCP_SERVER_PORT = 8081

UI_REQUEST = {}
local deviceId = ""  
local extractedData = {}
apiUpdate = {};
local commands = {}
CMDS = {}
PROXY_CMDS = {}
ACTIONS = {}
ON_INIT = {}
ON_LATE_INIT = {}
ON_PROPERTY_CHANGED = {}
gDebugLevel = "std";
gDebugPrint = false;
gDebugLog = false;
gDebugTimer = 0;
gConnectionStatus = false;
gPortNumber = 8085
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
    print("SendUpdate JSON to UI: " .. jsonString)

    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateUI</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)

    if extractedData and (extractedData.manual_feed or extractedData.switch) then
        C4:SendToProxy(5001, "ICON_CHANGED", {
            icon = extractedData.manual_feed ~= nil and extractedData.manual_feed or '',
            icon_description = jsonString
        })
        C4:SendToProxy(5001, "UPDATE_UI", {})
    end
    C4:SendDataToUI(xmlData)
end

function UIRequest(strCommand, tParams)
    print("call UIRequest", strCommand, C4:JsonEncode(tParams))

    if Properties["Contract"] == "Enable" then
        if strCommand == "SetManualFeed" then
            print("call SetManualFeed", tParams)
            print("DeviceId ", deviceId)
            deviceId = Properties["DeviceId"];
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                setDeviceCommand(accessToken, deviceId, tParams, strCommand, function(success)
                    if success then
                        print("Feeding is done " .. tParams.manual_feed)
                    else
                        print("Failed to set manual feed, skipping get request.")
                    end
                end)
            end)
        end

        if strCommand == "SetSwitch" then
            print("call SetSwitch", tParams)
            print("DeviceId ", deviceId)
            deviceId = Properties["DeviceId"];
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                setDeviceCommand(accessToken, deviceId, tParams, strCommand, function(success)
                    if success then
                        print("Feeding is done " .. tParams.switch)
                    else
                        print("Failed to set manual feed, skipping get request.")
                    end
                end)
            end)
        end

        if strCommand == "HandleSelect" then
            print("HandleSelect ", Properties["ManualFeed"])
            HandleSelect()
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
        extractedData = {}
        deviceId = Properties["DeviceId"]
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
            -- Mapping of codes to extractedData keys
            local codeMapping = {
                switch = "switch"
            }

            -- Process the result
            for _, item in ipairs(data.properties) do
                if item.code and item.value ~= nil then -- Ensure item.code and item.value are valid
                    local key = codeMapping[item.code]
                    if key then
                        extractedData[key] = item.value
                    end
                end
            end
            if extractedData.switch ~= nil then
                extractedData.switch = extractedData.switch == true and "true" or "false"
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetApiDeviceStatus JSON to UI: " .. jsonString)
                SendUpdate(extractedData)
            end
        end
    end
end

function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("RecievedFromProxy()", idBinding, strCommand)

    if Properties["Contract"] == "Enable" then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            GetApiDeviceStatus(accessToken, deviceId)
        end)
    end

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

    local manualFeedValue = Properties["ManualFeed"]

    local extractData = {}
    extractData.manual_feed = manualFeedValue

    SendUpdate(extractData)
end

function ON_LATE_INIT.sendIcon()
    HandleSelect()
end

function GetApiDeviceStatus(accessToken, deviceId)
    print('IsTcpConnected', IsTcpConnected)
    if IsTcpConnected == 'OFFLINE' then
        TcpConnection()
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
                extractedData = {}

                -- Mapping of codes to extractedData keys
                local codeMapping = {
                    manual_feed = "manual_feed",
                    battery_percentage = "battery_percentage",
                    switch = "switch"
                }

                -- Process the result
                for _, item in ipairs(data.result) do
                    if item.code and item.value then -- Ensure item.code and item.value are valid
                        local key = codeMapping[item.code]
                        if key then
                            extractedData[key] = item.value
                        end
                    end
                end

                print("ManualFeed " .. tostring(extractedData.manual_feed))
                C4:UpdateProperty("ManualFeed", extractedData.manual_feed)
                extractedData.manual_feed = extractedData.manual_feed
                extractedData.battery_percentage = extractedData.battery_percentage
                extractedData.switch = extractedData.switch == true and "true" or "false"
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetApiDeviceStatus JSON to UI: " .. jsonString)
                SendUpdate(extractedData)
            else
                print("Error: Invalid JSON response structure")
            end
        else
            print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
        end
    end)
end

-- tuya smartpetfeeder.lua

function ExecuteCommand(command, tParams)
    if command == "LUA_ACTION" then
        -- Extract action from tParams
        local action = tParams["ACTION"] or ""

        -- local deviceId = tParams["DeviceID"]
        -- local command = tParams["Command"]

        -- -- Fetch the access token before executing the action
        -- GenerateToken(function(accessToken)
        --     if not accessToken then
        --         print("Failed to retrieve access token.")
        --         return
        --     end

        --     GenearteTempKey(accessToken, deviceId, "", function(tempKey)

        --         if not tempKey then
        --             print("Failed to generate temporary key.")
        --             return
        --         end

        --         -- Now send the command
        --         SendCommand(accessToken, deviceId, command)
        --     end)
        -- end)
    else
        print("Unknown command: " .. command) -- Helps debug issues
    end
end

function setDeviceCommand(accessToken, deviceId, tempTable, strCommand, callback)
    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
    local method = "POST"
    local body = "";
    if (strCommand == "SetManualFeed") then
        body = '{"commands": [{"code": "manual_feed","value": ' .. tonumber(tempTable.manual_feed) .. '}]}'
    elseif (strCommand == "SetSwitch") then
        if tempTable.switch == '1' then
            body = '{"commands": [{"code": "switch","value": true}]}'
        else
            body = '{"commands": [{"code": "switch","value": false}]}'
        end
    end
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
    print("Body" .. body);
    local apiUpdate = {}
    C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
        print("Command Api Reponse : " .. response)
        local response = C4:JsonEncode(response)
        if statusCode == 200 then
            apiUpdate.apiresponse = "Succeeded";
            if (strCommand == "SetManualFeed") then
                C4:UpdateProperty("ManualFeed", tonumber(tempTable.manual_feed))
                apiUpdate.manual_feed = tonumber(tempTable.manual_feed);
                SendUpdate(apiUpdate)
            end
            if callback then
                callback(true)
            end
        else
            if response.success == false then
                print("Error: " .. tostring(response.code) .. " - " .. tostring(response.msg))
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
            end
            if callback then
                callback(false)
            end
        end
    end)
end

--base.lua

function OnPropertyChanged(strName)
    print("OnPropertyChange():", strName, Properties[strName])
    if (strName == "DeviceId") then
        C4:UpdateProperty("DeviceId", Properties[strName])
    end
    if (strName == "ManualFeed") then
        C4:UpdateProperty("ManualFeed", Properties[strName])
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

local function runFunctions(funcMap)
    for k, v in pairs(funcMap) do
        if type(v) == "function" then
            pcall(v)
        end
    end
end

function OnDriverInit()
    runFunctions(ON_INIT)
end

function OnDriverLateInit()
    runFunctions(ON_LATE_INIT)
end

-------- INIT -------

gInitTimer = C4:AddTimer(5, "SECONDS")

------- END INIT --------

function OnDriverDestroyed()
    print("OnDriverDestroyed()")
    --Clean timers
    gInitTimer = nil
end

function OnTimerExpired(idTimer)
    print("ontimerexpired")
    if (idTimer == gInitTimer) then
        print("Init Timer expired...")
    elseif (idTimer == g_DebugTimer) then
        print('Turning Debug Mode back to Off (timer expired)')
        C4:UpdateProperty('Debug Mode', 'Off')
        gDebugPrint = false
        gDebugLog = false
        gDebugTimer = C4:KillTimer(gDebugTimer)
    else
        print('Killed Stray Timer: ' .. idTimer)
        C4:KillTimer(idTimer)
    end
end

function startDebugTimer()
    if (gDebugTimer) then
        gDebugTimer = C4:KillTimer(gDebugTimer);
    end
    gDebugTimer = C4:AddTimer(10, 'MINUTES');
end

-- Authentication-related functions
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
