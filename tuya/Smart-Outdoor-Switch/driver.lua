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
PRX_CMD = {}
local deviceId = ""
local extractedData = {}
local socket = require("socket")
local udp = socket.udp()
udp:settimeout(3)
udp:setoption("broadcast", true)
apiUpdate = {};
local commands = {}
CMDS = {}
PROXY_CMDS = {}
ACTIONS = {}
ON_INIT = {}
ON_LATE_INIT = {}
ON_PROPERTY_CHANGED = {}
gInitTimer = C4:AddTimer(5, "SECONDS")
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
    print("deviceId ", deviceId);
    TcpConnection()
    GlobalObject.ClientID = Properties["ClientId"]
    GlobalObject.ClientSecret =  Properties["ClientSecret"]
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

    if extractedData and (extractedData.state1 or extractedData.state2) then
        C4:SendToProxy(5001, "ICON_CHANGED", { icon = extractedData.state1, icon_description = jsonString })
        C4:SendToProxy(5001, "UPDATE_UI", {})
        if extractedData.state1 == 'on' or extractedData.state2 == 'on' then
            EC.SetBrightnessTargetAlexa({ LIGHT_BRIGHTNESS_TARGET = 100, RATE = 750 })
        else
            EC.SetBrightnessTargetAlexa({ LIGHT_BRIGHTNESS_TARGET = 0, RATE = 750 })
        end
    end
    C4:SendDataToUI(xmlData)
end

function UIRequest(strCommand, tParams)
    if Properties["Contract"] == "Enable" then
        if strCommand == "SetSwitchOnOff" then
            print("call SetSwitchOnOff", tParams)
            print("deiveid ", deviceId)
            deviceId = Properties["DeviceId"];
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
                SetSwitchOnOff(accessToken, deviceId, tParams, function(success)
                    if success then
                        -- Now call GetApiDeviceStatus after setting is complete
                        print("Switch is " .. tParams.state)
                    else
                        print("Failed to set temperature, skipping get request.")
                    end
                end)
            end)
        end

        if strCommand == "HandleSelect" then
            print("HandleSelect ", Properties["State"])
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
                switch_1 = "switch_1",
                switch_2 = "switch_2"
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
            if extractedData.switch_1 ~= nil or extractedData.switch_2 ~= nil then
                if extractedData.switch_1 == true then
                    C4:UpdateProperty("StateSwitch1", "on")
                    extractedData.state1 = "on"
                end
                if extractedData.switch_1 == false then
                    C4:UpdateProperty("StateSwitch1", "off")
                    extractedData.state1 = "off"
                end
                if extractedData.switch_2 == true then
                    C4:UpdateProperty("StateSwitch2", "on")
                    extractedData.state2 = "on"
                end
                if extractedData.switch_2 == false then
                    C4:UpdateProperty("StateSwitch2", "off")
                    extractedData.state2 = "off"
                end
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetSwitchApi JSON to UI: " .. jsonString)
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

        print('strCommand' .. strCommand)

        if strCommand == "ON" then
            EC.On(true)
        elseif strCommand == "OFF" then
            EC.Off(true)
        end
    end

    strCommand = strCommand or ''
    tParams = tParams or {}
    local args = {}
    if (tParams.ARGS) then
        local parsedArgs = C4:ParseXml(tParams.ARGS)
        for _, v in pairs(parsedArgs.ChildNodes) do
            args[v.Attributes.name] = v.Value
        end
        tParams.ARGS = nil
    end

    local init = {
        'ReceivedFromProxy: ' .. idBinding,
        strCommand,
    }
    HandlerDebug(init, tParams, args)

    local success, ret

    if (RFP and RFP[strCommand] and type(RFP[strCommand]) == 'function') then
        success, ret = pcall(RFP[strCommand], idBinding, strCommand, tParams, args)
    elseif (RFP and RFP[idBinding] and type(RFP[idBinding]) == 'function') then
        success, ret = pcall(RFP[idBinding], idBinding, strCommand, tParams, args)
    end

    if (success == true) then
        return (ret)
    elseif (success == false) then
        print('ReceivedFromProxy error: ', ret, idBinding, strCommand)
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
    print("User clicked the Auto Lock App")

    local extractData = {}
    extractData.state1 = Properties["StateSwitch1"]
    extractData.state2 = Properties["StateSwitch2"]
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
                    switch_1 = "switch_1",
                    switch_2 = "switch_2"
                }

                -- Process the result
                for _, item in ipairs(data.result) do
                    if item.code and item.value ~= nil then -- Ensure item.code and item.value are valid
                        local key = codeMapping[item.code]
                        if key then
                            extractedData[key] = item.value
                        end
                    end
                end

                if extractedData.switch_1 == true then
                    C4:UpdateProperty("StateSwitch1", "on")
                    extractedData.state1 = "on"
                end
                if extractedData.switch_1 == false then
                    C4:UpdateProperty("StateSwitch1", "off")
                    extractedData.state1 = "off"
                end
                if extractedData.switch_2 == true then
                    C4:UpdateProperty("StateSwitch2", "on")
                    extractedData.state2 = "on"
                end
                if extractedData.switch_2 == false then
                    C4:UpdateProperty("StateSwitch2", "off")
                    extractedData.state2 = "off"
                end
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetSwitchApi JSON to UI: " .. jsonString)
                SendUpdate(extractedData)
            else
                print("Error: Invalid JSON response structure")
            end
        else
            print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
        end
    end)
end

function ExecuteCommand(strCommand, tParams)
    print("ExecuteCommand : " .. strCommand)
    if Properties["Contract"] == "Enable" then
        local tempVar = {}

        if (strCommand == "On") then
            deviceId = Properties["DeviceId"];
            tempVar.state = "onall"
            tempVar.switch_id = "0"
            Switchonoff(deviceId, tempVar)
            print("Switchonoff with command  : " .. strCommand)
        end
        if (strCommand == "Off") then
            deviceId = Properties["DeviceId"];
            tempVar.state = "offall"
            tempVar.switch_id = "0"
            Switchonoff(deviceId, tempVar)
            print("Switchonoff with command  : " .. strCommand)
        end

        if strCommand == "LUA_ACTION" then
            -- Extract action from tParams
            local action = tParams["ACTION"] or ""
            print("action : " .. action)
        else
            print("Unknown command: " .. strCommand) -- Helps debug issues
        end
    end

    tParams = tParams or {}
    local init = {
        'ExecuteCommand: ' .. strCommand,
    }
    HandlerDebug(init, tParams)

    if (strCommand == 'LUA_ACTION') then
        if (tParams.ACTION) then
            strCommand = tParams.ACTION
            tParams.ACTION = nil
        end
    end

    strCommand = string.gsub(strCommand, '%s+', '_')

    local success, ret

    if (EC and EC[strCommand] and type(EC[strCommand]) == 'function') then
        success, ret = pcall(EC[strCommand], tParams)
    end

    if (success == true) then
        return (ret)
    elseif (success == false) then
        print('ExecuteCommand error: ', ret, strCommand)
    end
end

function Switchonoff(deviceId, tempVar)
    if Properties["Contract"] == "Enable" then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetSwitchOnOff(accessToken, deviceId, tempVar, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    print("Switch is " .. tempVar.command)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end
end

do --Globals
    EC = EC or {}
    OPC = OPC or {}
    RFP = RFP or {}
end

function HandlerDebug(init, tParams, args)
    if (not DEBUGPRINT) then
        return
    end

    if (type(init) ~= 'table') then
        return
    end

    local output = init

    if (type(tParams) == 'table' and next(tParams) ~= nil) then
        table.insert(output, '----PARAMS----')
        for k, v in pairs(tParams) do
            local line = tostring(k) .. ' = ' .. tostring(v)
            table.insert(output, line)
        end
    end

    if (type(args) == 'table' and next(args) ~= nil) then
        table.insert(output, '----ARGS----')
        for k, v in pairs(args) do
            local line = tostring(k) .. ' = ' .. tostring(v)
            table.insert(output, line)
        end
    end

    local t, ms
    if (C4.GetTime) then
        t = C4:GetTime()
        ms = '.' .. tostring(t % 1000)
        t = math.floor(t / 1000)
    else
        t = os.time()
        ms = ''
    end
    local s = os.date('%x %X') .. ms

    table.insert(output, 1, '-->  ' .. s)
    table.insert(output, '<--')
    output = table.concat(output, '\r\n')
    print('Debug ', output)
    C4:DebugLog(output)
end

function OnDriverLateInit(driverInitType)
    for property, _ in pairs(Properties) do
        OnPropertyChanged(property)
    end

    LIGHT_LEVEL = 0 -- set light to be off on startup
end

function OPC.Driver_Version(value)
    -- C4:GetDriverConfigInfo gets the specifed tag from the config section of the driver.xml
    -- https://snap-one.github.io/docs-driverworks-api/#getdriverconfiginfo
    local version = C4:GetDriverConfigInfo('version')
    -- C4:UpdateProperty will update the specified property live in Composer with the value provided
    C4:UpdateProperty('Driver Version', version)
end

function OPC.Debug_Mode(value)
    if (DebugPrintTimer and DebugPrintTimer.Cancel) then
        DebugPrintTimer = DebugPrintTimer:Cancel()
    end
    DEBUGPRINT = (value == 'On')

    if (DEBUGPRINT) then
        local _timer = function(timer)
            C4:UpdateProperty('Debug Mode', 'Off')
            OnPropertyChanged('Debug Mode')
        end
        DebugPrintTimer = C4:SetTimer(60 * 60 * 1000, _timer)
    end
end

function EC.SetOnline(tParams)
    local state
    if (tParams.Type == 'Online') then
        state = true
    elseif (tParams.Type == 'Offline') then
        state = false
    end
    -- C4:SendToProxy is used to send a proxy-specific command to a named proxy
    -- in this case, we're sending ONLINE_CHANGED, as defined in the docs:
    -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#online-changed
    -- the 5001 is the proxy ID from the driver.xml file.
    C4:SendToProxy(5002, 'ONLINE_CHANGED', { STATE = state })
end

function RFP.SYNCHRONIZE(idBinding, strCommand, tParams, args)
    -- when asked by the proxy to synchronize, provide the current stored value
    -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#light-brightness-changed
    C4:SendToProxy(5002, 'LIGHT_BRIGHTNESS_CHANGED', { LIGHT_BRIGHTNESS_CURRENT = LIGHT_LEVEL })
end

function RFP.SET_BRIGHTNESS_TARGET(idBinding, strCommand, tParams, args)
    -- the proxy has received a command to change the light level, and is passing it to this driver to
    -- send on to the device (which we're going to emulate doing)
    -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#set-brightness-target

    print('CALL SET_BRIGHTNESS_TARGET FUNCTION')

    
    if Properties["Contract"] == "Enable" then
        local target = tParams.LIGHT_BRIGHTNESS_TARGET
        local rate = tParams.RATE
        print('target ' .. tostring(target))
        print('rate ' .. tostring(rate))

        if tonumber(target) > 0 then
            if EC.On then
                EC.On(false) -- Call On function
            end
        else
            if EC.Off then
                EC.Off(false) -- Call Off function
            end
        end
        

        local args = {
            LIGHT_BRIGHTNESS_CURRENT = LIGHT_LEVEL,
            LIGHT_BRIGHTNESS_TARGET = target,
            RATE = rate,
        }

        -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#light-brightness-changing
        C4:SendToProxy(5002, 'LIGHT_BRIGHTNESS_CHANGING', args)


        -- start a timer for the length of time provided, and then send the notify in an async timer callback
        local _timer = function(timer)
            LIGHT_LEVEL = target
            -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#light-brightness-changed
            C4:SendToProxy(5002, 'LIGHT_BRIGHTNESS_CHANGED', { LIGHT_BRIGHTNESS_CURRENT = LIGHT_LEVEL })
        end
        
        C4:SetTimer(rate, _timer)
    
    end
end

EC.On = function(isCallAlexa)
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL On FUNCTION')

    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "onall"
        tempVar.switch_id = "0"
        Switchonoff(device_id, tempVar)
        if isCallAlexa then
            local params = { LIGHT_BRIGHTNESS_TARGET = 100, RATE = 750 }
            EC.SetBrightnessTargetAlexa(params)
        end
    end
end

EC.Off = function(isCallAlexa)
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL Off FUNCTION')

    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "offall"
        tempVar.switch_id = "0"
        Switchonoff(device_id, tempVar)
        if isCallAlexa then
            local params = { LIGHT_BRIGHTNESS_TARGET = 0, RATE = 750 }
            EC.SetBrightnessTargetAlexa(params)
        end
    end
end

EC.On1 = function()
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL On1 FUNCTION')

    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "on"
        tempVar.switch_id = "1"
        Switchonoff(device_id, tempVar)
    end
end
EC.On2 = function()
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL On2 FUNCTION')
    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "on"
        tempVar.switch_id = "2"
        Switchonoff(device_id, tempVar)
    end
end

EC.Off1 = function()
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL Off1 FUNCTION')

    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "off"
        tempVar.switch_id = "1"
        Switchonoff(device_id, tempVar)
    end
end
EC.Off2 = function()
    local device_id = Properties["DeviceId"]
    print('device_id ' .. device_id)
    print('CALL Off2 FUNCTION')

    if Properties["Contract"] == "Enable" then
        local tempVar = {}
        tempVar.state = "off"
        tempVar.switch_id = "2"
        Switchonoff(device_id, tempVar)
    end
end

EC.SetBrightnessTargetAlexa = function(tParams)
    print('CALL SetBrightnessTargetAlexa FUNCTION')

    if Properties["Contract"] == "Enable" then
        local target = tParams.LIGHT_BRIGHTNESS_TARGET
        local rate = tParams.RATE
        print('targetAlexa ' .. tostring(target))
        print('rateAlexa ' .. tostring(rate))

        local args = {
            LIGHT_BRIGHTNESS_CURRENT = LIGHT_LEVEL,
            LIGHT_BRIGHTNESS_TARGET = target,
            RATE = rate,
        }

        -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#light-brightness-changing
        C4:SendToProxy(5002, 'LIGHT_BRIGHTNESS_CHANGING', args)


        -- start a timer for the length of time provided, and then send the notify in an async timer callback
        local _timer = function(timer)
            LIGHT_LEVEL = target
            -- https://snap-one.github.io/docs-driverworks-proxyprotocol/#light-brightness-changed
            C4:SendToProxy(5002, 'LIGHT_BRIGHTNESS_CHANGED', { LIGHT_BRIGHTNESS_CURRENT = LIGHT_LEVEL })
        end

        C4:SetTimer(rate, _timer)
    end
end

--tuyasmartswitch_us.lua

function AddCommand(code, value)
    commands = {}
    table.insert(commands, { code = code, value = value })
end

function SetSwitchOnOff(accessToken, deviceId, tempTable, callback)
    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
    local method = "POST"
    local body = "";
    local switch_code = "switch_" .. tostring(tempTable.switch_id)
    if tempTable.state == "on" then
        body = [[{
                "commands": [
                    {
                        "code": "]] .. switch_code .. [[",
                        "value": true
                    }
                ]
            }]]
    end
    if tempTable.state == "onall" then
        body = [[{
                "commands": [
                    {
                        "code": "switch_1",
                        "value": true
                    },
                    {
                        "code": "switch_2",
                        "value": true
                    }
                ]
            }]]
    end
    if tempTable.state == "off" then
        body = [[{
                "commands": [
                    {
                        "code": "]] .. switch_code .. [[",
                        "value": false
                    }
                ]
            }]]
    end
    if tempTable.state == "offall" then
        body = [[{
                "commands": [
                    {
                        "code": "switch_1",
                        "value": false
                    },
                     {
                        "code": "switch_2",
                        "value": false
                    }
                ]
            }]]
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

    local apiUpdate = {}
    C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
        if statusCode == 200 then
            print('switch_code', switch_code);

            if switch_code == 'switch_0' then
                local switch_state = tempTable.state;
                if tempTable.state == 'onall' then
                    switch_state = 'on'
                elseif tempTable.state == 'offall' then
                    switch_state = 'off'
                end
                C4:UpdateProperty("StateSwitch1", switch_state)
                apiUpdate.state1 = switch_state
                C4:UpdateProperty("StateSwitch2", switch_state)
                apiUpdate.state2 = switch_state
            elseif switch_code == 'switch_1' then
                C4:UpdateProperty("StateSwitch1", tempTable.state)
                apiUpdate.state1 = tempTable.state
            elseif switch_code == 'switch_2' then
                C4:UpdateProperty("StateSwitch2", tempTable.state)
                apiUpdate.state2 = tempTable.state
            end
            apiUpdate.apiresponse = "Succeeded";
            apiUpdate.switchid = tempTable.switch_id;
            SendUpdate(apiUpdate)
            if switch_code == 'switch_0' then
                print("All Switch is sucessfully " .. tempTable.state)
            else
                print("Switch" .. tempTable.switch_id .. " is sucessfully " .. tempTable.state)
            end
            if callback then callback(true) end
        else
            print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
            if callback then callback(false) end
        end
    end)
end

function OnPropertyChanged(strName)
    print("OnPropertyChange():", strName, Properties[strName])
    if (strName == "DeviceId") then
        C4:UpdateProperty("DeviceId", Properties[strName])
        DeviceStatusCheck(Properties[strName]);
    end
    if (strName == "StateSwitch1") then
        C4:UpdateProperty("StateSwitch1", Properties[strName])
    end
    if (strName == "StateSwitch2") then
        C4:UpdateProperty("StateSwitch2", Properties[strName])
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

function DeviceStatusCheck(deviceId)
    if Properties["Contract"] == "Enable" then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            GetApiDeviceStatus(accessToken, deviceId)
        end)
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
