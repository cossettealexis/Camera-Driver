require "tuya_auth"
Json = require("dkjson")

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
local state = ""
apiUpdate = {};
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
    GlobalObject.ClientSecret =  Properties["ClientSecret"]
    TcpConnection()

    if Properties["Contract"] == "Enable" then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            GetApiDeviceStatus(accessToken, deviceId)
        end)
       state = Properties["State"];
    end
    print("deviceId ", deviceId);
end

function SendUpdate(extractedData)
    local jsonString = C4:JsonEncode(extractedData)
    print("SendTemperatureUpdate JSON to UI: " .. jsonString)

    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateUI</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)

    if extractedData and extractedData.state then
        C4:SendToProxy(5001, "ICON_CHANGED", { icon = extractedData.state, icon_description = jsonString })
        C4:SendToProxy(5001, "UPDATE_UI", {})
    end
    C4:SendDataToUI(xmlData)
end

function UIRequest(strCommand, tParams)
    if Properties["Contract"] == "Enable" then
        if strCommand == "SetLockUnlock" then
            deviceId = Properties["DeviceId"];

            print("call SetLockUnlock", tParams.command)
            print("deiveid ", deviceId)
            ExecuteCommandOnOff(tParams.command, deviceId)

            if tParams.command == "lock" then
                print('Alexa LOCK_STATUS_CHANGED locked')
                C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" })
            else
                print('Alexa LOCK_STATUS_CHANGED locked')
                C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" })
            end
        end

        if type(UI_REQUEST[strCommand]) == "function" then
            local success, retVal = pcall(UI_REQUEST[strCommand], tParams)
            if success then
                return retVal
            end
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

-- Called when data is received from the network
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
                lock_motor_state = "lock_motor_state"
            }
            -- Process the result
            for _, item in ipairs(data.properties) do
                if item.code and item.value ~= nil then -- Don't check item.value here; false is valid
                    local key = codeMapping[item.code]
                    if key then
                        extractedData[key] = item.value
                        print(key .. ": " .. tostring(item.value))
                    end
                end
            end

            if extractedData.lock_motor_state ~= nil then
                -- Debug the incoming value
                print("lock_motor_state:", tostring(extractedData.lock_motor_state))

                -- Handle lock state
                if extractedData and (not extractedData.lock_motor_state) then
                    C4:UpdateProperty("State", "lock")
                    extractedData.state = "lock"
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" }) -- Locked when true
                else
                    C4:UpdateProperty("State", "unlock")
                    extractedData.state = "unlock"
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" }) -- Unlocked when false/nil
                end
                -- Encode the data to JSON and send to UI
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

function PROXY_CMDS.LOCK()
    print('call PROXY_CMDS.Lock')
    deviceId = Properties["DeviceId"]

    local tParams = {};
    tParams.command = "lock"

    if Properties["Contract"] == "Enable" then
      ExecuteCommandOnOff(tParams.command, deviceId)
    end
end

function PROXY_CMDS.UNLOCK()
    print('call PROXY_CMDS.Unlock')
    deviceId = Properties["DeviceId"]

    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" })
    local tParams = {};
    tParams.command = "unlock"
    if Properties["Contract"] == "Enable" then
       ExecuteCommandOnOff(tParams.command, deviceId)
    end
end

function ExecuteCommand(command, tParams)
    deviceId = Properties["DeviceId"]

    if Properties["Contract"] == "Enable" then
        print('ExecuteCommand ' .. command)
        if command == "LUA_ACTION" then
            -- Extract action from tParams
            local action = tParams["ACTION"] or ""

            print('Action ' .. action)
            print('DeviceId ' .. deviceId)

            if (action == "Lock") then
                print('ExecuteAction ' .. action)
                C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" })
                ExecuteCommandOnOff("lock", deviceId)
            end


            if (action == "Unlock") then
                print('ExecuteAction ' .. action)
                C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" })
                ExecuteCommandOnOff("unlock", deviceId)
            end
        end

        if (command == "Lock") then
            print('ExecuteCommand ' .. command)
            C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" })
            ExecuteCommandOnOff("lock", deviceId)
        end

        if (command == "Unlock") then
            print('ExecuteCommand ' .. command)
            C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" })
            ExecuteCommandOnOff("unlock", deviceId)
        end
    end
end

---tuya_smartlock_us.lua


function SendCommand(accessToken, tempKey, deviceId, command)
    local body = ""
    if command == "lock" then
        body = [[
                    {
                        "open": false,
                        "ticket_id": "]] .. tempKey .. [["
                    }
               ]]
    end
    if command == "unlock" then
        body = [[
                    {
                        "open": true,
                        "ticket_id": "]] .. tempKey .. [["
                    }
               ]]
    end

    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/smart-lock/devices/" .. deviceId .. "/password-free/door-operate"

    local nonce = "" -- Can be left empty unless required
    local method = "POST"

    -- Generate string to sign
    local signString, url = StringToSign(method, body,
        "/v1.0/smart-lock/devices/" .. deviceId .. "/password-free/door-operate")

    -- Calculate signature
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

    --local payloadBody = Json.encode(body)
    C4:urlPost(apiUrl, body, headers, false,
        function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                C4:UpdateProperty("State", command)
                apiUpdate.apiresponse = "Succeeded";
                apiUpdate.state = command;
                SendUpdate(apiUpdate)
                print("Successfully " .. command .. " device")

                if (command == "lock") then
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" })
                    print('Fire Event Lock')
                    C4:FireEvent("Lock")
                end


                if (command == "unlock") then
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" })
                    print('Fire Event Unlock')
                    C4:FireEvent("Unlock")
                end
            else
                apiUpdate.apiresponse = "Something went wrong. we can not" .. command .. "device";
                SendUpdate(apiUpdate)
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
            end
        end
    )
end

function GenearteTempKey(accessToken, deviceId, body, callback)
    print("Reacthing at GenearteTempKey") -- Debugging

    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/door-lock/password-ticket"

    local nonce = "" -- Can be left empty unless required
    local method = "POST"

    -- Generate string to sign
    local signString, url = StringToSign(method, body, "/v1.0/devices/" .. deviceId .. "/door-lock/password-ticket")

    -- Calculate signature
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
    --local payloadBody = Json.encode(body)
    C4:urlPost(apiUrl, body, headers, false,
        function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                print("Successfully generate temporary")

                -- Parse JSON response
                local data = C4:JsonDecode(response)

                -- Extract ticket_id if available
                if data and data["result"] and data["result"]["ticket_id"] then
                    local tempKey = data["result"]["ticket_id"]

                    -- Call the callback with tempKey
                    if callback then
                        callback(tempKey)
                    end
                else
                    apiUpdate.apiresponse = "Something went wrong. we can not generate ticket id.";
                    SendUpdate(apiUpdate)
                    print("ticket_id not found in response.")
                    if callback then callback(nil) end
                end
            else
                apiUpdate.apiresponse = "Something went wrong. we can not generate ticket id.";
                SendUpdate(apiUpdate)
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(nil) end
            end
        end
    )
end

function ExecuteCommandOnOff(command, deviceId)
    if Properties["Contract"] == "Enable" then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end

            GenearteTempKey(accessToken, deviceId, "", function(tempKey)
                if not tempKey then
                    print("Failed to generate temporary key.")
                    return
                end

                -- Now send the command
                SendCommand(accessToken, tempKey, deviceId, command)
            end)
        end)
    end
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
                local extractedData = {}

                -- Mapping of codes to extractedData keys
                local codeMapping = {
                    lock_motor_state = "lock_motor_state"
                }

                -- Process the result
                for _, item in ipairs(data.result) do
                    if item.code and item.value ~= nil then -- Don't check item.value here; false is valid
                        local key = codeMapping[item.code]
                        if key then
                            extractedData[key] = item.value
                            print(key .. ": " .. tostring(item.value))
                        end
                    end
                end

                -- Debug the incoming value
                print("lock_motor_state:", tostring(extractedData.lock_motor_state))

                -- Handle lock state
                if extractedData and (not extractedData.lock_motor_state) then
                    C4:UpdateProperty("State", "lock")
                    extractedData.state = "lock"
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "locked" }) -- Locked when true
                else
                    C4:UpdateProperty("State", "unlock")
                    extractedData.state = "unlock"
                    C4:SendToProxy(5002, "LOCK_STATUS_CHANGED", { LOCK_STATUS = "unlocked" }) -- Unlocked when false/nil
                end
                -- Encode the data to JSON and send to UI
                SendUpdate(extractedData)
            else
                print("Error: Invalid JSON response structure")
            end
        else
            print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
        end
    end)
end

-- base.lua



function OnPropertyChanged(strName)
    print("OnPropertyChange():", strName, Properties[strName])
    if (strName == "DeviceId") then
        C4:UpdateProperty("DeviceId", Properties[strName])

        if Properties["Contract"] == "Enable" then
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                GetApiDeviceStatus(accessToken, Properties[strName])
            end)
       end
    end
    if (strName == "State") then
        local tParams = {};
        tParams.command = Properties[strName]
        if Properties["Contract"] == "Enable" then
            ExecuteCommandOnOff(tParams.command, deviceId)

            C4:UpdateProperty("State", Properties[strName])
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
