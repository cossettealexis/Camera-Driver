--[[=============================================================================
    Main script file for driver

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]
require "common.c4_driver_declarations"
require "common.c4_common"
require "common.c4_init"
require "common.c4_property"
require "common.c4_command"
require "common.c4_notify"
require "common.c4_utils"
require "lib.c4_timer"
require "actions"
require "device_specific_commands"
require "device_messages"
require "proxy_init"
require "properties"
require "connections"
Json = require("dkjson")
local sha256 = require("sha256")

GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl = "https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.net'
GlobalObject.TCP_SERVER_PORT = ""
GlobalObject.BaseApi = "https://svcs.slomins.com/PROD/OntechSvcs/1.1/ontech"

extractedData = {
    mode = "Off",
    currentTemperature = 0,
    heatTemperature = 0,
    coolTemperature = 0
}
IsTcpConnected = false

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
    TEMPLATE_VERSION.driver = "2016.01.08"
end

--[[=============================================================================
    Initialization Code
===============================================================================]]
function ON_DRIVER_EARLY_INIT.main()

end

function ON_DRIVER_INIT.main()
    -- TODO: Change the logger name
    SetLogName("Template_c4z")

    -- TODO: If cloud based driver then uncomment the following line
    ConnectURL()
    GlobalObject.ClientID = Properties["ClientId"]
    GlobalObject.ClientSecret = Properties["ClientSecret"]
    C4:UpdateProperty("Tcp Port", "8081")
    GlobalObject.TCP_SERVER_PORT = Properties["Tcp Port"]
    TcpConnection()
end

function ON_DRIVER_LATEINIT.main()
    --C4:urlSetTimeout (20)
    SetThermostatUI()
    -- C4:UpdateProperty("MacAddress", C4:GetUniqueMAC())
    ValidateMacAddress(Properties["MacAddress"])
    StartScheduleTimer()
end

function SetThermostatUI()
    local deviceId = Properties["DeviceId"];
    if gTStatProxy then
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            GetApiTemperature(accessToken, deviceId)
        end)
    else
        print("gTStatProxy is nil!")
    end
end

if (TEMPLATE_VERSION ~= nil) then
    TEMPLATE_VERSION.proxy_commands = "2015.03.02"
end

function SET_SETPOINT_HEAT(celsius, fahrenheit)
    if Properties["Contract"] == "Enable" then

       local deviceId = Properties["DeviceId"]
        local tParamss = {}

        local mode = string.lower(Properties["Mode"] or "")
        if mode == "cool" then
            tParamss.mode = "cold"
        else
            tParamss.mode = mode
        end

        local scale = string.upper(Properties["Scale"] or "CELSIUS")

        local tempValue

        if scale == "FAHRENHEIT" then
            tempValue = tonumber(fahrenheit)
            tParamss.tempUnitConvert = "f"
        else
            tempValue = tonumber(celsius)
            tParamss.tempUnitConvert = "c"
        end

        tParamss.heatTemp = tempValue * 100

        local coolTemp = tonumber(Properties["CoolTemp"])
        if coolTemp then
            tParamss.coolTemp = coolTemp * 100
        end
    
        print("SET_SETPOINT_HEAT celsius = " .. tostring(celsius) .. ", fahrenheit = " .. tostring(fahrenheit))
    
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            SetApiTemperature(accessToken, deviceId, tParamss, function(success)
                if success then
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
        -- TODO: Create the packet/command to send to the device
    end
end

function SET_SETPOINT_COOL(celsius, fahrenheit)
    if Properties["Contract"] == "Enable" then
        print("SET_SETPOINT_COOL(celsius = %s, fahrenheit = %s)", celsius, fahrenheit)

    local deviceId = Properties["DeviceId"]
    local tParamss = {}

    local mode = string.lower(Properties["Mode"] or "")
    if mode == "cool" then
        tParamss.mode = "cold"
    else
        tParamss.mode = mode
    end

    local scale = string.upper(Properties["Scale"] or "CELSIUS")

    local heatTemp = tonumber(Properties["HeatTemp"])
    local coolTemp

    if scale == "FAHRENHEIT" then
        coolTemp = tonumber(fahrenheit)   -- use fahrenheit input
        tParamss.tempUnitConvert = "f"
    else
        coolTemp = tonumber(celsius)      -- use celsius input
        tParamss.tempUnitConvert = "c"
    end

    if heatTemp then
        tParamss.heatTemp = heatTemp * 100
    end

    if coolTemp then
        tParamss.coolTemp = coolTemp * 100
    end

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            SetApiTemperature(accessToken, deviceId, tParamss, function(success)
                if success then
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
        -- TODO: Create the packet/command to send to the device
    end
end

function SET_SETPOINT_SINGLE(celsius, fahrenheit)
    LogTrace("SET_SETPOINT_SINGLE(celsius = %s, fahrenheit = %s)", celsius, fahrenheit)

    -- TODO: Create the packet/command to send to the device
end

function INC_SETPOINT_HEAT()
    LogTrace("INC_SETPOINT_HEAT()")
end

function DEC_SETPOINT_HEAT()
    LogTrace("DEC_SETPOINT_HEAT()")
end

function INC_SETPOINT_COOL()
    LogTrace("INC_SETPOINT_COOL()")
end

function DEC_SETPOINT_COOL()
    LogTrace("DEC_SETPOINT_COOL()")
end

function SET_BUTTONS_LOCK(mode)
    LogTrace("SET_BUTTONS_LOCK(mode = %s)", mode)
end

function SET_SCALE(scale)
    local deviceId = Properties["DeviceId"]
    C4:UpdateProperty("Scale", scale)
    
    local tParams = {}
    if scale == "FAHRENHEIT" then
        tParams.tempUnitConvert = "f"
    else
        tParams.tempUnitConvert = "c"
    end
    
    GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetTempConvert(accessToken, deviceId, tParams, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    C4:SetTimer(500, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
    end)
    
    gTStatProxy:dev_Scale(scale)
end

function SET_MODE_HVAC(mode)
    if Properties["Contract"] == "Enable" then
        LogTrace("SET_MODE_HVAC(mode = %s)", mode)
        gTStatProxy:dev_HVACMode(mode)
        local deviceId = Properties["DeviceId"]
        local tParamss = {}

        -- Mode handling
        local mode = string.lower(mode or Properties["Mode"] or "")
        if mode == "cool" then
            tParamss.mode = "cold"
        else
            tParamss.mode = mode
        end

        -- ✅ Get Scale
        local scale = string.upper(Properties["Scale"] or "CELSIUS")

        -- Get temps
        local heatTemp = tonumber(Properties["HeatTemp"])
        local coolTemp = tonumber(Properties["CoolTemp"])

        -- ✅ Set unit
        if scale == "FAHRENHEIT" then
            tParamss.tempUnitConvert = "f"
        else
            tParamss.tempUnitConvert = "c"
        end

        -- ✅ Assign temps (already in correct scale from UI)
        if heatTemp then
            tParamss.heatTemp = heatTemp * 100
        end

        if coolTemp then
            tParamss.coolTemp = coolTemp * 100
        end

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            SetApiTemperature(accessToken, deviceId, tParamss, function(success)
                if success then
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
        -- TODO: Create the packet/command to send to the device
    end
end

function SET_MODE_HUMIDITY(mode)
    LogTrace("SET_MODE_HUMIDITY(mode = %s)", mode)
end

function SET_SETPOINT_HUMIDIFY(setpoint)
    LogTrace("SET_MODE_HUMIDITY(setpoint = %s)", setpoint)
end

function SET_SETPOINT_DEHUMIDIFY(setpoint)
    LogTrace("SET_SETPOINT_DEHUMIDIFY(setpoint = %s)", setpoint)
end

function SET_MODE_FAN(mode)
    LogTrace("SET_MODE_FAN(mode = %s)", mode)
end

function SET_MODE_HOLD(mode)
    LogTrace("SET_MODE_HOLD(mode = %s)", mode)
end

function SET_MODE_HOLD_UNTIL(year, month, day, hour, minute, second)
    LogTrace("SET_MODE_HOLD_UNTIL(year = %s, month = %s, day = %s, hour = %s, minute = %s, second = %s)", year, month,
        day, hour, minute, second)
end

function SET_OUTDOOR_TEMPERATURE(celsius, fahrenheit)
    LogTrace("SET_OUTDOOR_TEMPERATURE(celsius = %s, fahrenheit = %s)", celsius, fahrenheit)
end

function SET_VACATION_MODE()
    LogTrace("SET_VACATION_MODE(mode = %s)", mode)
end

function SET_LEGACY_SCHEDULE_ENTRY(dayIndex, entryIndex, enabled, entryTime, heatSetpoint, coolSetpoint, scale)
    print("SET_LEGACY_SCHEDULE_ENTRY()")
    gTStatProxy:dev_ScheduleEntry(dayIndex, entryIndex, enabled, entryTime, heatSetpoint, coolSetpoint, scale)
end

function GetTimestamp()
    return tostring(os.time() * 1000)
end

function CalculateSignature(clientId, timestamp, nonce, signStr, secret)
    local signSource = clientId .. timestamp .. nonce .. signStr
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
    local signature = sha256.hmac_sha256(secret, signSource)

    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase

    return signature
end

function StringToSign(method, body, url)
    local sha256Body = sha256.sha256(body) -- Empty body hash
    local signUrl = method:upper() .. "\n" .. sha256Body .. "\n\n" .. url
    return signUrl, url
end

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

function GetApiTemperature(accessToken, deviceId)
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
                    mode = "mode",
                    temp_current = "temp_current",
                    humidity_current = "humidity_current",
                    temp_set = "temp_set",
                    heat_temp_set = "heat_temp_set",
                    cool_temp_set = "cool_temp_set",
                    temp_current_f = "temp_current_f",
                    temp_set_f = "temp_set_f",
                    cool_temp_set_f = "cool_temp_set_f",
                    heat_temp_set_f = "heat_temp_set_f",
                    temp_unit_convert = "temp_unit_convert",
                    fan_mode = "fan_mode",
                    switch_emer_enabled = "switch_emer_enabled",
                    switch_program_enabled = "switch_program_enabled",
                    relay_status = "relay_status",
                    delay_time = "delay_time",
                    setting = "setting"
                }

                -- List of keys that need to be divided by 100
                local scale100Fields = {
                    temp_current = true,
                    temp_set = true,
                    heat_temp_set = true,
                    cool_temp_set = true,
                    temp_current_f = true,
                    temp_set_f = true,
                    cool_temp_set_f = true,
                    heat_temp_set_f = true
                }

                -- Extract data
                for _, item in ipairs(data.result) do
                    if item.code and item.value then
                        local key = codeMapping[item.code]
                        if key then
                            if scale100Fields[item.code] then
                                extractedData[key] = item.value / 100
                            else
                                extractedData[key] = item.value
                            end
                        end
                    end
                end

                if extractedData.mode then
                    print("Extracted Mode: " .. extractedData.mode)

                    -- Notify UI
                    C4:SendToProxy(5002, "ICON_CHANGED", { icon = extractedData.mode })
                    C4:SendToProxy(5002, "UPDATE_UI", {})

                    -- Normalize and update mode
                    local mode = string.lower(extractedData.mode)
                    if mode == "cold" then
                        gTStatProxy:dev_HVACMode("cool")
                        C4:UpdateProperty("Mode", "cool")
                    else
                        gTStatProxy:dev_HVACMode(extractedData.mode)
                        C4:UpdateProperty("Mode", extractedData.mode)
                    end
                end

                -- if extractedData.heat_temp_set then
                --     gTStatProxy:dev_HeatSetpoint(extractedData.heat_temp_set, "C")
                --     C4:UpdateProperty("HeatTemp", extractedData.heat_temp_set)
                -- end

                -- if extractedData.cool_temp_set then
                --     gTStatProxy:dev_CoolSetpoint(extractedData.cool_temp_set, "C")
                --     C4:UpdateProperty("CoolTemp", extractedData.cool_temp_set)
                -- end

                -- if extractedData.temp_current then
                --     local currnettemp = tonumber(extractedData.temp_current)
                --     print('Currnettemp ' .. tostring(currnettemp))
                --     NOTIFY.TEMPERATURE_CHANGED(5001, currnettemp, 'c')
                --     C4:UpdateProperty("CurrentTemp", currnettemp)
                -- end
             
                -- if extractedData.temp_unit_convert then
                --     print('temp_unit_convert: ' .. tostring(extractedData.temp_unit_convert))

                --     if extractedData.temp_unit_convert == "c" then
                --         gTStatProxy:dev_Scale("CELSIUS")
                --     else
                --         gTStatProxy:dev_Scale("FAHRENHEIT")
                --     end
                -- end
                
                -- Determine unit
                local unit = "c"
                if extractedData.temp_unit_convert == "f" then
                    print('temp_unit_convert: ' .. tostring(extractedData.temp_unit_convert))
                    unit = "f"
                end

                print("Temperature Unit: " .. unit)

                -- Set Scale
                if unit == "c" then
                    gTStatProxy:dev_Scale("CELSIUS")
                    C4:UpdateProperty("Scale", "CELSIUS")
                else
                    gTStatProxy:dev_Scale("FAHRENHEIT")
                    C4:UpdateProperty("Scale", "FAHRENHEIT")
                end

                local currentTemp = unit == "f" and extractedData.temp_current_f or extractedData.temp_current
                local heatSet     = unit == "f" and extractedData.heat_temp_set_f or extractedData.heat_temp_set
                local coolSet     = unit == "f" and extractedData.cool_temp_set_f or extractedData.cool_temp_set

                if currentTemp then
                    currentTemp = tonumber(currentTemp)
                    print('CurrentTemp: ' .. tostring(currentTemp))
                    NOTIFY.TEMPERATURE_CHANGED(5001, currentTemp, unit)
                    C4:UpdateProperty("CurrentTemp", currentTemp)
                end

                if heatSet then
                    gTStatProxy:dev_HeatSetpoint(heatSet, string.upper(unit))
                    C4:UpdateProperty("HeatTemp", heatSet)
                end

                if coolSet then
                    gTStatProxy:dev_CoolSetpoint(coolSet, string.upper(unit))
                    C4:UpdateProperty("CoolTemp", coolSet)
                end
                
                if(extractedData.setting) then
                    local index, payload = decode_packet(extractedData.setting)
                    extractedData.temp_correction = index
                    print("Decoded temp_correction index: " .. extractedData.temp_correction)  
                end
                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetApiTemperature JSON to UI: " .. jsonString)
                SendTemperatureUpdate(extractedData)

            else
                print("Error: Invalid JSON response structure")
            end
        else
            print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
        end
    end)
end

function SendTemperatureUpdate(extractedData)
    local jsonString = C4:JsonEncode(extractedData)
    --print("SendTemperatureUpdate JSON to UI: " .. jsonString)

    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateTemperature</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)

    local jsonData = {};
    jsonData.command = "UpdateTemperature"
    jsonData.data = jsonString
    local updateMode = string.lower(Properties["Mode"] or "")

    updateMode = (updateMode == "cool") and "cold" or updateMode
    if extractedData then
        C4:SendToProxy(5002, "ICON_CHANGED", { icon = updateMode, icon_description = C4:JsonEncode(jsonData) })
        C4:SendToProxy(5002, "UPDATE_UI", {})
    end
    --C4:SendDataToUI(xmlData)
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

    if tonumber(nPort) == tonumber(GlobalObject.TCP_SERVER_PORT) then
        IsTcpConnected = strStatus
        C4:UpdateProperty("TCP Connection", strStatus)
        if strStatus == "ONLINE" then
            print("Connection Status: ONLINE ")
        elseif strStatus == "OFFLINE" then
            print("Connection Status: OFFLINE")
        end
    end
    print("========================================")

end

-- Called when data is received from the network
function ReceivedFromNetwork(idBinding, nPort, strData)
    -- Remove trailing \r\n if present
    if tonumber(nPort) == tonumber(GlobalObject.TCP_SERVER_PORT) then
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

            if data and data.EventName == "UpdateBaseApi" then
                GlobalObject.BaseApi = data.BaseApi
            end
            
            if data and data.EventName == "UpdateClientSecretId" and data.MacAddress == Properties["MacAddress"] then
                GlobalObject.ClientID = data.ClientId
                GlobalObject.ClientSecret = data.SecretId
                C4:UpdateProperty("ClientId", data.ClientId or "")
                C4:UpdateProperty("ClientSecret", data.SecretId or "")
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
            if data and data.devId and data.devId == deviceId then
                --print("ReceivedFromNetwork()", idBinding, nPort, strData)
                print("ReceivedFromNetwork()", idBinding, nPort, 'decrypted_data: ' .. decrypted_data)
                -- Mapping of codes to extractedData keys
                local codeMapping = {
                    mode = "mode",
                    temp_current = "temp_current",
                    humidity_current = "humidity_current",
                    temp_set = "temp_set",
                    heat_temp_set = "heat_temp_set",
                    cool_temp_set = "cool_temp_set",
                    temp_current_f = "temp_current_f",
                    temp_set_f = "temp_set_f",
                    cool_temp_set_f = "cool_temp_set_f",
                    heat_temp_set_f = "heat_temp_set_f",
                    temp_unit_convert = "temp_unit_convert",
                    fan_mode = "fan_mode",
                    switch_emer_enabled = "switch_emer_enabled",
                    switch_program_enabled = "switch_program_enabled",
                    relay_status = "relay_status",
                    delay_time = "delay_time",
                    setting = "setting"
                }

                -- List of keys that need to be divided by 100
                local scale100Fields = {
                    temp_current = true,
                    temp_set = true,
                    heat_temp_set = true,
                    cool_temp_set = true,
                    temp_current_f = true,
                    temp_set_f = true,
                    cool_temp_set_f = true,
                    heat_temp_set_f = true
                }

                local isEmptyExtractData = true
                -- Extract data
                for _, item in ipairs(data.properties) do
                    if item.code and item.value ~= nil then
                        local key = codeMapping[item.code]
                        if key then
                            isEmptyExtractData = false
                            if scale100Fields[item.code] then
                                extractedData[key] = item.value / 100
                            else
                                extractedData[key] = item.value
                            end
                        end
                    end
                end

                if not isEmptyExtractData then
                    
                    -- Determine scale FIRST
                    local unit = (string.upper(Properties["Scale"] or "CELSIUS") == "FAHRENHEIT") and "f" or "c"
                    local scale = (unit == "f") and "FAHRENHEIT" or "CELSIUS"

                    if extractedData.temp_unit_convert then
                        local tu = string.lower(tostring(extractedData.temp_unit_convert))

                        if tu == "f" then
                            scale = "FAHRENHEIT"
                            unit = "f"
                        else
                            scale = "CELSIUS"
                            unit = "c"
                        end

                        -- ✅ Update proxy scale
                        gTStatProxy:dev_Scale(scale)
                        C4:UpdateProperty("Scale", scale)
                    end

                    -- Mode handling (same as yours)
                    if extractedData.mode then
                        --print("Extracted Mode: " .. extractedData.mode)

                        C4:SendToProxy(5002, "ICON_CHANGED", { icon = extractedData.mode })
                        C4:SendToProxy(5002, "UPDATE_UI", {})

                        local mode = string.lower(extractedData.mode)
                        if mode == "cold" then
                            gTStatProxy:dev_HVACMode("cool")
                            C4:UpdateProperty("Mode", "cool")
                        else
                            gTStatProxy:dev_HVACMode(mode)
                            C4:UpdateProperty("Mode", mode)
                        end
                    end

                    local heatTemp = (unit == "f") and extractedData.heat_temp_set_f or extractedData.heat_temp_set
                    local coolTemp = (unit == "f") and extractedData.cool_temp_set_f or extractedData.cool_temp_set
                    local currentTemp = (unit == "f") and extractedData.temp_current_f or extractedData.temp_current

                    -- ✅ Heat
                    if heatTemp then
                        gTStatProxy:dev_HeatSetpoint(heatTemp, unit)
                        C4:UpdateProperty("HeatTemp", heatTemp)
                    end

                    -- ✅ Cool
                    if coolTemp then
                        gTStatProxy:dev_CoolSetpoint(coolTemp, unit)
                        C4:UpdateProperty("CoolTemp", coolTemp)
                    end

                    -- ✅ Current Temp
                    --print('ReceivedFromNetwork unit: ' .. unit)
                    if currentTemp then
                        --local currnettemp = tonumber(currentTemp)
                        --print('Currenttemp ' .. tostring(currnettemp))

                        NOTIFY.TEMPERATURE_CHANGED(5002, currentTemp, string.lower(unit))
                        C4:UpdateProperty("CurrentTemp", currentTemp)
                    end
                    
                    if(extractedData.setting) then
                        local index, payload = decode_packet(extractedData.setting)
                        extractedData.temp_correction = index
                        print("ReceivedFromNetwork Decoded temp_correction index: " .. extractedData.temp_correction)  
                    end

                    if extractedData.temp_unit_convert == nil then
                        extractedData.temp_unit_convert = unit
                    end
                    -- Send UI update
                    local jsonString = C4:JsonEncode(extractedData)
                    print("ReceivedFromNetwork extractedData : " .. jsonString)
                    SendTemperatureUpdate(extractedData)
                end             
            end
        end
    end
end

function SetApiTemperature(accessToken, deviceId, tempTable, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local scale = string.upper(Properties["Scale"] or "CELSIUS")
        local unit = (scale == "FAHRENHEIT") and "f" or "c"
        print("SetApiTemperature() - tempTable.coolTempF: " .. tostring(tempTable.coolTempF))
        print("SetApiTemperature() - tempTable.heatTempF: " .. tostring(tempTable.heatTempF))
        print("SetApiTemperature() - tempTable.coolTemp: " .. tostring(tempTable.coolTemp))
        print("SetApiTemperature() - tempTable.heatTemp: " .. tostring(tempTable.heatTemp))

        -- Codes
        local heat_code = (unit == "f") and "heat_temp_set_f" or "heat_temp_set"
        local cool_code = (unit == "f") and "cool_temp_set_f" or "cool_temp_set"
        local temp_code = (unit == "f") and "temp_set_f" or "temp_set"

        -- Temps (already in UI scale)
        local heatTemp = (unit == "f") and tonumber(tempTable.heatTempF) or tonumber(tempTable.heatTemp)
        local coolTemp = (unit == "f") and tonumber(tempTable.coolTempF) or tonumber(tempTable.coolTemp)

        -- Safety
        if not heatTemp or not coolTemp then
            print("Invalid temperature values")
            if callback then callback(false) end
            return
        end

        -- Start JSON string
        local body = '{ "commands": ['

        -- Always include mode
        body = body .. '{ "code": "mode", "value": "' .. tempTable.mode .. '" }'

        -- Add temperature settings based on mode
        if tempTable.mode ~= "auto" then
            if tempTable.mode == "cold" then
                body = body .. ', { "code": "' .. temp_code .. '", "value": ' .. math.floor(coolTemp) .. ' }'
            else
                body = body .. ', { "code": "' .. temp_code .. '", "value": ' .. math.floor(heatTemp) .. ' }'
            end
        end

        body = body .. ', { "code": "' .. cool_code .. '", "value": ' .. math.floor(coolTemp) .. ' }'
        body = body .. ', { "code": "' .. heat_code .. '", "value": ' .. math.floor(heatTemp) .. ' }'

        -- Close JSON string
        body = body .. '] }'

        print('SetApiTemperature body ', body);
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
                print("Temperature updated successfully!")


                -- if tempTable.mode then
                --     print("Extracted Mode: " .. tempTable.mode)

                --     -- Notify UI
                --     C4:SendToProxy(5001, "ICON_CHANGED", { icon = tempTable.mode })
                --     C4:SendToProxy(5001, "UPDATE_UI", {})

                --     -- Normalize and update mode
                --     local mode = string.lower(tempTable.mode)
                --     if mode == "cold" then
                --         gTStatProxy:dev_HVACMode("cool")
                --         C4:UpdateProperty("Mode", "cool")
                --     else
                --         gTStatProxy:dev_HVACMode(tempTable.mode)
                --         C4:UpdateProperty("Mode", tempTable.mode)
                --     end
                -- end

                -- C4:UpdateProperty("HeatTemp", tempTable.heatTemp / 100)
                -- C4:UpdateProperty("CoolTemp", tempTable.coolTemp / 100)

                -- gTStatProxy:dev_HeatSetpoint(tempTable.heatTemp / 100, "C")
                -- gTStatProxy:dev_CoolSetpoint(tempTable.coolTemp / 100, "C")

                -- local currnettemp = tonumber(Properties["CurrentTemp"])
                -- print('Currnettemp ' .. tostring(currnettemp))
                -- gTStatProxy:dev_Temperature(currnettemp, "C")


                if tempTable.mode then
                    local mode = string.lower(tempTable.mode)

                    C4:SendToProxy(5002, "ICON_CHANGED", { icon = tempTable.mode })
                    C4:SendToProxy(5002, "UPDATE_UI", {})

                    if mode == "cold" then
                        gTStatProxy:dev_HVACMode("cool")
                        C4:UpdateProperty("Mode", "cool")
                    else
                        gTStatProxy:dev_HVACMode(mode)
                        C4:UpdateProperty("Mode", mode)
                    end
                end

                local heatUI = heatTemp / 100
                local coolUI = coolTemp / 100

                C4:UpdateProperty("HeatTemp", heatUI)
                C4:UpdateProperty("CoolTemp", coolUI)

                gTStatProxy:dev_HeatSetpoint(heatUI, unit)
                gTStatProxy:dev_CoolSetpoint(coolUI, unit)

                local currnettemp = tonumber(Properties["CurrentTemp"])
                if currnettemp then
                    gTStatProxy:dev_Temperature(currnettemp, unit)
                end

                if unit == "f" then
                    gTStatProxy:dev_Scale("FAHRENHEIT")
                else
                    gTStatProxy:dev_Scale("CELSIUS")
                end

                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetFanMode(accessToken, deviceId, tempTable, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local body = [[{
            "commands": [
                {
                    "code": "fan_mode",
                    "value": "]] .. tempTable.fanMode .. [["
                }
            ]
        }]]

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
                print("Temperature updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetTempConvert(accessToken, deviceId, tempTable, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local body = [[{
                    "commands": [
                        {
                            "code": "temp_unit_convert",
                            "value": "]] .. tempTable.tempUnitConvert .. [["
                        }
                    ]
                }]]

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
                print("Temperature updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetMode(accessToken, deviceId, mode, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local body = [[{
            "commands": [
                {
                    "code": "mode",
                    "value": "]] .. mode .. [["
                }
            ]
        }]]

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
        print('SetMode body ', body);

        C4:urlPost(apiUrl, body, headers, false, function(ticketId, response, statusCode, errorMsg)
            if statusCode == 200 then
                print("Mode updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetCurrentTemp(accessToken, deviceId, currentTemp, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local mCurrentTemp = currentTemp * 100


        -- Start JSON string
        local body = '{ "commands": ['

        -- Always include mode
        body = body .. '{ "code": "temp_current_f", "value": ' .. math.floor(mCurrentTemp) .. ' },'

        -- Close JSON string
        body = body .. '] }'

        print('SetCurrentTemp body ', body);
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
                print("Current Temperature updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetHeatTemp(accessToken, deviceId, currentTemp, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local mCurrentTemp = currentTemp * 100


        -- Start JSON string
        local body = '{ "commands": ['

        -- Always include mode
        body = body .. '{ "code": "heat_temp_set_f", "value": ' .. math.floor(mCurrentTemp) .. ' },'

        -- Close JSON string
        body = body .. '] }'

        print('SetCurrentTemp body ', body);
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
                print("Current Temperature updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
end

function SetCoolTemp(accessToken, deviceId, currentTemp, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local mCurrentTemp = currentTemp * 100


        -- Start JSON string
        local body = '{ "commands": ['

        -- Always include mode
        body = body .. '{ "code": "cool_temp_set_f", "value": ' .. math.floor(mCurrentTemp) .. ' },'

        -- Close JSON string
        body = body .. '] }'

        print('SetCurrentTemp body ', body);
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
                print("Current Temperature updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
    end
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
            C4:UpdateProperty("Device Response","Error calling API: " .. strError)
            return
        end

        if responseCode ~= 200 then
            print("HTTP Error: " .. tostring(responseCode))
            C4:UpdateProperty("Device Response","HTTP Error: " .. tostring(responseCode))
            return
        end

        local response = C4:JsonDecode(strData)
        if response then
            if response.IsValidMacAddress == true then
                print("MAC Address is valid")
                C4:UpdateProperty("Device Response","MAC Address is valid")
                
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
                  deviceId = Properties["DeviceId"]
                
                  if data and data.message and data.message.EventName == "UpdateClientSecretId" and 
                     data.message.MacAddress == Properties["MacAddress"] then
                        print("ValidateMacAddress() " , data.message.EventName)
                        GlobalObject.ClientID = data.message.ClientId
                        GlobalObject.ClientSecret = data.message.SecretId
                        C4:UpdateProperty("ClientId", data.message.ClientId or "")
                        C4:UpdateProperty("ClientSecret", data.message.SecretId or "")
                   end
                end
            else
                print("MAC Address is invalid")
                C4:UpdateProperty("Device Response","MAC Address is invalid")
                GlobalObject.ClientID = ""
                GlobalObject.ClientSecret = ""
                C4:UpdateProperty("ClientId",  "")
                C4:UpdateProperty("ClientSecret", "")
            end
        else
            print("Failed to parse JSON response")
            C4:UpdateProperty("Device Response","Failed to parse JSON response")
        end
    end)
end

function UI_REQ.setTemperatureCorrection(tParams)
     print("UI_REQ.setTemperatureCorrection called with: " .. C4:JsonEncode(tParams))
    GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetTemperatureCorrectionByApi(accessToken, deviceId, tParams, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    -- C4:SetTimer(1000, function()
                    --     GetApiTemperature(accessToken, deviceId)
                    -- end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
end    

function SetTemperatureCorrectionByApi(accessToken, deviceId, tParams, callback)
       local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
       local method = "POST"
      
       local body = [[{
            "commands": [
                {
                    "code": "setting",
                    "value": "]] .. generate_packet(tParams.temp_correction) .. [["
                }
            ]
       }]]

        print('SetTemperatureCorrectionByApi body ', body);
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
                print("Temperature correction updated successfully!")
                if callback then callback(true) end
            else
                print("Error: " .. tostring(statusCode) .. " - " .. tostring(errorMsg))
                if callback then callback(false) end
            end
        end)
end    

-- Simple Base64 encoder helper
local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function base64_encode(data)
    return ((data:gsub('.', function(x) 
        local r,b='',x:byte()
        for i=8,1,-1 do r=r..(b%2^i-b%2^(i-1)>0 and '1' or '0') end
        return r;
    end)..'0000'):gsub('%d%d%d?%d?%d?%d?', function(x)
        if (#x < 6) then return '' end
        local c=0
        for i=1,6 do c=c+(x:sub(i,i)=='1' and 2^(6-i) or 0) end
        return b:sub(c+1,c+1)
    end)..({ '', '==', '=' })[#data%3+1])
end

-- The static part of your data (decoded from your original strings)
local static_payload = "\16\3\1\0\0\0\3\24\8\1\3\5\0\0\0\0\1\1\1\0\0\150\0\180\0\0\0\243\128\3\232\0\0\0\0\11\184\1\244\12\128\2\188\1"

-- Logic to generate the sequence
function generate_packet(index)
    -- Use modulo 256 to handle wrap-around for negative numbers
    local header_val = (index * 5) % 256
    local header_byte = string.char(header_val)
    local full_packet = header_byte .. static_payload
    return base64_encode(full_packet)
end

-- Base64 decoder helper
function base64_decode(data)
    data = string.gsub(data, '[^'..b..'=]', '')
    return (data:gsub('.', function(x)
        if (x == '=') then return '' end
        local r, f = '', (b:find(x) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2^i - f % 2^(i - 1) > 0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if (#x ~= 8) then return '' end
        local c = 0
        for i = 1, 8 do c = c + (x:sub(i, i) == '1' and 2^(8 - i) or 0) end
        return string.char(c)
    end))
end

-- Function to decode the packet back to its components
function decode_packet(encoded_str)
    local decoded_raw = base64_decode(encoded_str)
    
    -- Extract the first byte (the dynamic header)
    local header_byte = decoded_raw:sub(1, 1)
    local header_val = string.byte(header_byte)
    
    -- Extract the static payload (everything from byte 2 onwards)
    local static_part = decoded_raw:sub(2)
    
    -- Logic to find the original index
    -- Since header = (index * 5) % 256, we solve for index.
    -- Note: This is an "inverse modulo". Because 5 and 256 are coprime, 
    -- the modular inverse of 5 modulo 256 is 205.
    local original_index = (header_val * 205) % 256
    
    return original_index, static_part
end

--- Example Usage ---
function SetTempCorrectionOnUi(extractedData)
    
    local index, payload = decode_packet(extractedData.setting)
    local tempcorrection = {}
    tempcorrection.temp_correction = index
    print("Decoded temp_correction index: " .. tempcorrection.temp_correction)  
    
    local jsonString = C4:JsonEncode(tempcorrection)
    print("SendTemperatureCorrection JSON to UI: " .. jsonString)

    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateTemperatureCorrection</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)

    --C4:SendDataToUI(xmlData)

end 

-- Example: Generate 5 to 10
-- for i = -10, 10 do
--     print(i .. ": " .. generate_packet(i))
-- end