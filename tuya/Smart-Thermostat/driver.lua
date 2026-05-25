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
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.com'
GlobalObject.TCP_SERVER_PORT = 8081

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
    TcpConnection()
end

function ON_DRIVER_LATEINIT.main()
    --C4:urlSetTimeout (20)
    SetThermostatUI()
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
        LogTrace("SET_SETPOINT_HEAT(celsius = %s, fahrenheit = %s)", celsius, fahrenheit)

        local deviceId = Properties["DeviceId"];
        local tParamss = {}
        local mode = string.lower(Properties["Mode"])

        if mode == "cool" then
            tParamss.mode = "cold"
        else
            tParamss.mode = mode
        end
        tParamss.heatTemp = celsius * 100;
        tParamss.coolTemp = Properties["CoolTemp"] * 100;
        tParamss.tempUnitConvert = "C"

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
        LogTrace("SET_SETPOINT_COOL(celsius = %s, fahrenheit = %s)", celsius, fahrenheit)

        local deviceId = Properties["DeviceId"];
        local tParamss = {}
        local mode = string.lower(Properties["Mode"])

        if mode == "cool" then
            tParamss.mode = "cold"
        else
            tParamss.mode = mode
        end
        tParamss.heatTemp = Properties["HeatTemp"] * 100;
        tParamss.coolTemp = celsius * 100;
        tParamss.tempUnitConvert = "C"

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
    LogTrace("SET_SCALE(scale = %s)", scale)
    gTStatProxy:dev_Scale(scale)
end

function SET_MODE_HVAC(mode)
    if Properties["Contract"] == "Enable" then
        LogTrace("SET_MODE_HVAC(mode = %s)", mode)
        gTStatProxy:dev_HVACMode(mode)

        local deviceId = Properties["DeviceId"];
        local tParamss = {}
        mode = string.lower(mode)

        if mode == "cool" then
            tParamss.mode = "cold"
        else
            tParamss.mode = mode
        end
        tParamss.heatTemp = Properties["HeatTemp"] * 100;
        tParamss.coolTemp = Properties["CoolTemp"] * 100;
        tParamss.tempUnitConvert = "C"

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
    LogTrace("SET_LEGACY_SCHEDULE_ENTRY()")
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
                    switch_program_enabled = "switch_program_enabled"
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
                    C4:SendToProxy(5001, "ICON_CHANGED", { icon = extractedData.mode })
                    C4:SendToProxy(5001, "UPDATE_UI", {})

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

                if extractedData.heat_temp_set then
                    gTStatProxy:dev_HeatSetpoint(extractedData.heat_temp_set, "C")
                    C4:UpdateProperty("HeatTemp", extractedData.heat_temp_set)
                end

                if extractedData.cool_temp_set then
                    gTStatProxy:dev_CoolSetpoint(extractedData.cool_temp_set, "C")
                    C4:UpdateProperty("CoolTemp", extractedData.cool_temp_set)
                end

                if extractedData.temp_current then
                    local currnettemp = tonumber(extractedData.temp_current)
                    print('Currnettemp ' .. tostring(currnettemp))
                    NOTIFY.TEMPERATURE_CHANGED(5001, currnettemp, 'c')
                    C4:UpdateProperty("CurrentTemp", currnettemp)
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
    print("SendTemperatureUpdate JSON to UI: " .. jsonString)

    local xmlData = string.format([[
        <C4Message>
            <Command>UpdateTemperature</Command>
            <Data>%s</Data>
        </C4Message>
    ]], jsonString)

    C4:SendDataToUI(xmlData)
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
                switch_program_enabled = "switch_program_enabled"
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
                if extractedData.mode then
                    print("Extracted Mode: " .. extractedData.mode)

                    -- Notify UI
                    C4:SendToProxy(5001, "ICON_CHANGED", { icon = extractedData.mode })
                    C4:SendToProxy(5001, "UPDATE_UI", {})

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

                if extractedData.heat_temp_set then
                    gTStatProxy:dev_HeatSetpoint(extractedData.heat_temp_set, "C")
                    C4:UpdateProperty("HeatTemp", extractedData.heat_temp_set)
                end

                if extractedData.cool_temp_set then
                    gTStatProxy:dev_CoolSetpoint(extractedData.cool_temp_set, "C")
                    C4:UpdateProperty("CoolTemp", extractedData.cool_temp_set)
                end

                if extractedData.temp_current then
                    local currnettemp = tonumber(extractedData.temp_current)
                    print('Currnettemp ' .. tostring(currnettemp))
                    NOTIFY.TEMPERATURE_CHANGED(5001, currnettemp, 'c')
                    C4:UpdateProperty("CurrentTemp", currnettemp)
                end

                -- Encode the data to JSON and send to UI
                local jsonString = C4:JsonEncode(extractedData)
                print("GetApiTemperature JSON to UI: " .. jsonString)
                SendTemperatureUpdate(extractedData)
            end
        end
    end
end

function SetApiTemperature(accessToken, deviceId, tempTable, callback)
    if Properties["Contract"] == "Enable" then
        local apiUrl = GlobalObject.BaseUrl .. "/v1.0/devices/" .. deviceId .. "/commands"
        local method = "POST"

        local heat_code = "heat_temp_set"
        local cool_code = "cool_temp_set"
        local temp_code = "temp_set"
        local heatTemp = tempTable.heatTemp
        local coolTemp = tempTable.coolTemp

        if tempTable.tempUnitConvert == "f" then
            cool_code = "cool_temp_set_f"
            heat_code = "heat_temp_set_f"
            temp_code = "temp_set_f"
            heatTemp = tempTable.heatTempF
            coolTemp = tempTable.coolTempF

            tempTable.heatTemp = math.floor((((tempTable.heatTempF / 100) - 32) * 5 / 9) + 0.5) * 100
            tempTable.coolTemp = math.floor((((tempTable.coolTempF / 100) - 32) * 5 / 9) + 0.5) * 100
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


                if tempTable.mode then
                    print("Extracted Mode: " .. tempTable.mode)

                    -- Notify UI
                    C4:SendToProxy(5001, "ICON_CHANGED", { icon = tempTable.mode })
                    C4:SendToProxy(5001, "UPDATE_UI", {})

                    -- Normalize and update mode
                    local mode = string.lower(tempTable.mode)
                    if mode == "cold" then
                        gTStatProxy:dev_HVACMode("cool")
                        C4:UpdateProperty("Mode", "cool")
                    else
                        gTStatProxy:dev_HVACMode(tempTable.mode)
                        C4:UpdateProperty("Mode", tempTable.mode)
                    end
                end

                C4:UpdateProperty("HeatTemp", tempTable.heatTemp / 100)
                C4:UpdateProperty("CoolTemp", tempTable.coolTemp / 100)

                gTStatProxy:dev_HeatSetpoint(tempTable.heatTemp / 100, "C")
                gTStatProxy:dev_CoolSetpoint(tempTable.coolTemp / 100, "C")

                local currnettemp = tonumber(Properties["CurrentTemp"])
                print('Currnettemp ' .. tostring(currnettemp))
                gTStatProxy:dev_Temperature(currnettemp, "C")

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
