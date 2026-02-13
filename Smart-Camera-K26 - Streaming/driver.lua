--[[
    Slomins K26-SL Outdoor Camera Driver - Streaming Only Version
    Minimal driver focused on camera streaming functionality
    Copyright © 2026 Slomins. All Rights Reserved.
]]--

-- Global Variables
local CAMERA_BINDING = 5001

-- Properties cache
Properties = Properties or {}

-- Track first RTSP call to skip wake on initial attempt
local rtsp_first_call = true

-- Bearer token for API authentication
local bearer_token = ""

-- Debug flag
local DEBUG_MODE = true

--[[=============================================================================
    Helper Functions
===============================================================================]]

function print_debug(message)
    if DEBUG_MODE then
        print("[DEBUG] " .. message)
    end
end

--[[=============================================================================
    Wake Camera Function
===============================================================================]]

function WakeCamera(retry)
    retry = retry or 1
    print("================================================================")
    print("                   WAKE CAMERA CALLED                           ")
    print("================================================================")
    print("Wake retry count: " .. retry)
    
    -- Get VID from properties
    local vid = Properties["VID"]
    if not vid or vid == "" then
        print("ERROR: VID not configured")
        return
    end
    
    -- Get bearer token
    if not bearer_token or bearer_token == "" then
        print("ERROR: No bearer token available")
        return
    end
    
    -- Calculate wake timestamp
    local wake_timestamp = os.time()
    
    -- Build wake request
    local wake_url = "https://api.arpha-tech.com/api/v3/openapi/device/do-action"
    local wake_body = {
        vid = vid,
        input_params = string.format('{"type":0,"t":%d}', wake_timestamp),
        action_id = "ac_wakelocal",
        check_t = 0,
        is_async = 0
    }
    
    local json = require("dkjson")
    local wake_body_json = json.encode(wake_body)
    
    local headers = {
        ["Content-Type"] = "application/json",
        ["Accept-Language"] = "en",
        ["Authorization"] = "Bearer " .. bearer_token
    }
    
    print_debug("Wake Request URL: " .. wake_url)
    print_debug("Wake Request Body: " .. wake_body_json)
    
    -- Send wake request
    C4:urlPost(wake_url, wake_body_json, headers, false, function(strError, responseCode, tHeaders, data)
        if strError and strError ~= "" then
            print("ERROR: Wake request failed: " .. strError)
        elseif responseCode == 200 then
            print("SUCCESS: Camera wake command sent")
            if data then
                print_debug("Wake Response: " .. data)
            end
        else
            print("WARNING: Wake request returned code: " .. tostring(responseCode))
        end
    end)
    
    print("Wake retry " .. retry .. " times done")
    print("================================================================")
end

--[[=============================================================================
    SET_DEVICE_PROPERTY - Wake the camera
===============================================================================]]

function SET_DEVICE_PROPERTY(idBinding, tParams)
    print("================================================================")
    print("              SET_DEVICE_PROPERTY CALLED                        ")
    print("================================================================")
    
    WakeCamera(1)
end

--[[=============================================================================
    GET_RTSP_H264_QUERY_STRING - Return RTSP stream path
===============================================================================]]

function GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
    print("================================================================")
    print("         GET_RTSP_H264_QUERY_STRING CALLED                      ")
    print("================================================================")
    
    local width = tonumber((tParams and (tParams.SIZE_X or tParams.WIDTH)) or 1280)
    local height = tonumber((tParams and (tParams.SIZE_Y or tParams.HEIGHT)) or 720)
    local rate = tonumber((tParams and tParams.RATE) or 15)
    
    print("Requested H264 stream:")
    print("  Resolution: " .. width .. "x" .. height)
    print("  Frame rate: " .. rate .. " fps")
    
    -- Get camera properties
    local ip = Properties["IP Address"]
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"
    
    if not ip or ip == "" then
        print("ERROR: IP Address not configured")
        return ""
    end
    
    -- Skip wake on first call, only wake on subsequent calls
    if rtsp_first_call then
        print("[RTSP] First call - skipping wake")
        rtsp_first_call = false
    else
        print("[RTSP] Subsequent call - waking camera for streaming session...")
        WakeCamera(1)
    end
    
    -- Determine stream type based on resolution
    -- Higher resolution -> main stream (stream0)
    -- Lower resolution -> sub stream (stream1)
    local streamtype = 0
    if width >= 1280 or height >= 720 then
        streamtype = 0
        print("Using main stream (high quality)")
    else
        streamtype = 1
        print("Using sub stream (low quality)")
    end
    
    local rtsp_path = "stream" .. streamtype
    
    print("RTSP Path: " .. rtsp_path)
    print("Camera Proxy will build full URL with IP: " .. ip .. " and port: " .. rtsp_port)
    
    -- Build full RTSP URL for display/testing
    local auth_required = Properties["Authentication Type"] ~= "NONE"
    local rtsp_url
    
    if auth_required and username ~= "" and password ~= "" then
        rtsp_url = string.format("rtsp://%s:%s@%s:%s/%s", username, password, ip, rtsp_port, rtsp_path)
    else
        rtsp_url = string.format("rtsp://%s:%s/%s", ip, rtsp_port, rtsp_path)
    end
    
    -- Update URL properties for camera test
    if C4 and C4.UpdateProperty then
        if streamtype == 0 then
            C4:UpdateProperty("Main Stream URL", rtsp_url)
        else
            C4:UpdateProperty("Sub Stream URL", rtsp_url)
        end
    end
    
    print("Full RTSP URL: " .. rtsp_url)
    
    print("================================================================")
    return rtsp_path
end

--[[=============================================================================
    Property Change Handler
===============================================================================]]

function OnPropertyChanged(strProperty)
    print("================================================================")
    print("Property Changed: " .. strProperty)
    
    local value = Properties[strProperty]
    if value then
        print("  New Value: " .. tostring(value))
    end
    
    print("================================================================")
end

--[[=============================================================================
    Driver Initialization
===============================================================================]]

function OnDriverInit()
    print("================================================================")
    print("       Slomins K26-SL Camera Driver - Streaming Only           ")
    print("                    Driver Initialized                          ")
    print("================================================================")
    
    -- Set initial bearer token from properties
    bearer_token = Properties["Bearer Token"] or ""
    
    C4:UpdateProperty("Driver Status", "Online")
    C4:UpdateProperty("Status", "Ready")
    
    print("Camera Configuration:")
    print("  IP Address: " .. (Properties["IP Address"] or "Not Set"))
    print("  HTTP Port: " .. (Properties["HTTP Port"] or "8080"))
    print("  RTSP Port: " .. (Properties["RTSP Port"] or "8554"))
    print("  VID: " .. (Properties["VID"] or "Not Set"))
    print("  Username: " .. (Properties["Username"] or "SystemConnect"))
    print("================================================================")
end

--[[=============================================================================
    Driver Destruction
===============================================================================]]

function OnDriverDestroyed()
    print("================================================================")
    print("              Driver Destroyed - Cleaning Up                    ")
    print("================================================================")
end

--[[=============================================================================
    UI Request Handler
===============================================================================]]

function UIRequest(idBinding, controlMethod, tParams)
    print("================================================================")
    print("UIRequest called: " .. controlMethod)
    
    if tParams then
        print("UIRequest Parameters:")
        for k, v in pairs(tParams) do
            print(k .. " = " .. tostring(v))
        end
    end
    print("================================================================")
    
    -- Route to appropriate function
    if controlMethod == "GET_RTSP_H264_QUERY_STRING" then
        return GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
    elseif controlMethod == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(idBinding, tParams)
    end
end

--[[=============================================================================
    ReceivedFromProxy Handler
===============================================================================]]

function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("================================================================")
    print("ReceivedFromProxy: binding=" .. idBinding .. " command=" .. strCommand)
    
    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print(k .. " = " .. tostring(v))
        end
    end
    print("================================================================")
    
    -- Route to appropriate function
    if strCommand == "GET_RTSP_H264_QUERY_STRING" then
        return GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
    elseif strCommand == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(idBinding, tParams)
    end
end

--[[=============================================================================
    ExecuteCommand Handler
===============================================================================]]

function ExecuteCommand(strCommand, tParams)
    print("================================================================")
    print("ExecuteCommand: " .. strCommand)
    
    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print(k .. " = " .. tostring(v))
        end
    end
    print("================================================================")
    
    if strCommand == "WAKE_CAMERA" then
        WakeCamera(1)
    elseif strCommand == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(5001, tParams)
    end
end
