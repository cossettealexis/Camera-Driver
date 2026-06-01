require "common.c4_driver_declarations"

if (TEMPLATE_VERSION ~= nil) then
    TEMPLATE_VERSION.c4_command = "2016.01.08"
end

function ExecuteCommand(sCommand, tParams)
    if Properties["Contract"] == "Enable" then 
    print('globalobject in execute command ')
    print(GlobalObject.ClientID)
    local deviceId = Properties["DeviceId"];
    print("deviceId ", deviceId);
    print('ExecuteCommand ' .. sCommand)

    if sCommand == "LUA_ACTION" then
        -- Extract action from tParams
        local action = tParams["ACTION"] or ""
        deviceId = Properties["DeviceId"]

        print('Action ' .. action)
        print('DeviceId ' .. deviceId)
    end

    if sCommand == "SetCurrentTemperature" then
        print('SetCurrentTemperature Units ' .. tostring(tParams.temperature))
        deviceId = Properties["DeviceId"]

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetCurrentTemp(accessToken, deviceId, tParams.temperature, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end

    if sCommand == "SetMode" then
        print('SetMode Mode ' .. tostring(tParams.mode))
        deviceId = Properties["DeviceId"]

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetMode(accessToken, deviceId, tParams.mode, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end

    if sCommand == "SetCoolTemperature" then
        print('SetCoolTemperature Unit ' .. tostring(tParams.cool_temp))
        deviceId = Properties["DeviceId"]

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetCoolTemp(accessToken, deviceId, tParams.cool_temp, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end

    if sCommand == "SetHeatTemperature" then
        print('SetHeatTemperature Unit ' .. tostring(tParams.heat_temp))
        deviceId = Properties["DeviceId"]

        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetHeatTemp(accessToken, deviceId, tParams.heat_temp, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    C4:SetTimer(1000, function()
                        GetApiTemperature(accessToken, deviceId)
                    end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end
    end
    LogTrace("ExecuteCommand(" .. sCommand .. ")")
    LogInfo(tParams)

    -- Remove any spaces (trim the command)
    local trimmedCommand = string.gsub(sCommand, " ", "")
    local status, ret

    -- if function exists then execute (non-stripped)
    if (EX_CMD[sCommand] ~= nil and type(EX_CMD[sCommand]) == "function") then
        status, ret = pcall(EX_CMD[sCommand], tParams)
        -- elseif trimmed function exists then execute
    elseif (EX_CMD[trimmedCommand] ~= nil and type(EX_CMD[trimmedCommand]) == "function") then
        status, ret = pcall(EX_CMD[trimmedCommand], tParams)
    elseif (EX_CMD[sCommand] ~= nil) then
        QueueCommand(EX_CMD[sCommand])
        status = true
    else
        LogInfo("ExecuteCommand: Unhandled command = " .. sCommand)
        status = true
    end

    if (not status) then
        LogError("LUA_ERROR: " .. ret)
    end

    return ret -- Return whatever the function returns because it might be xml, a return code, and so on
end

function EX_CMD.LUA_ACTION(tParams)
    if (tParams ~= nil) then
        for cmd, cmdv in pairs(tParams) do
            if (cmd == "ACTION" and cmdv ~= nil) then
                local status, err = pcall(LUA_ACTION[cmdv], tParams)
                if (not status) then
                    LogError("LUA_ERROR: " .. err)
                end
                break
            end
        end
    end
end 

function ReceivedFromProxy(idBinding, sCommand, tParams)
    print("Binding ID:", idBinding, " -- ", sCommand)
    if Properties["Contract"] == "Enable" then 
    if (sCommand ~= nil) then
        -- initial table variable if nil
        if (tParams == nil) then
            tParams = {}
        end

        LogTrace("ReceivedFromProxy(): " ..
            sCommand .. " on binding " .. idBinding .. "; Call Function PRX_CMD." .. sCommand .. "()")
        LogInfo(tParams)

        if ((PRX_CMD[sCommand]) ~= nil) then
            local status, err = pcall(PRX_CMD[sCommand], idBinding, tParams)
            if (not status) then
                LogError("LUA_ERROR: " .. err)
            end
        else
            LogInfo("ReceivedFromProxy: Unhandled command = " .. sCommand)
        end
    end
end
end

function UIRequest(sRequest, tParams)
    print("UIRequest " .. sRequest)

    local ret = ""
    local deviceId = Properties["DeviceId"];
    if Properties["Contract"] == "Enable" then 
    if sRequest == "HandleSelect" then
        print("HandleSelect ")
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            GetApiTemperature(accessToken, deviceId)
        end)
    end

    if sRequest == "SetTemperature" then
        print("call SetTemperature", tParams)
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetApiTemperature(accessToken, deviceId, tParams, function(success)
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

    if sRequest == "SetFanMode" then
        print("call SetFanMode", tParams)
        GenerateToken(GlobalObject, function(accessToken)
            if not accessToken then
                print("Failed to retrieve access token.")
                return
            end
            -- Call SetApiTemperature and wait for it to complete before calling GetApiTemperature
            SetFanMode(accessToken, deviceId, tParams, function(success)
                if success then
                    -- Now call GetApiTemperature after setting is complete
                    -- C4:SetTimer(500, function()
                    --     GetApiTemperature(accessToken, deviceId)
                    -- end, false)
                else
                    print("Failed to set temperature, skipping get request.")
                end
            end)
        end)
    end

    if sRequest == "SetTempConvert" then
        print("call SetTempConvert", tParams)
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
    end
    end
    if (sRequest ~= nil) then
        tParams = tParams or {} -- initial table variable if nil
        LogTrace("UIRequest(): " .. sRequest .. "; Call Function UI_REQ." .. sRequest .. "()")
        LogInfo(tParams)

        if (UI_REQ[sRequest]) ~= nil then
            ret = UI_REQ[sRequest](tParams)
        else
            LogWarn("UIRequest: Unhandled request = " .. sRequest)
        end
    end

    return ret
end
