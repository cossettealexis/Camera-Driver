--[[
    Slomins K26-SL Outdoor Camera Driver - Streaming Only Version
    Minimal driver focused on camera streaming functionality
    Copyright © 2026 Slomins. All Rights Reserved.
]]--

print("================================================================")
print("   K26 STREAMING DRIVER FILE LOADED - TOP OF FILE")
print("================================================================")

-- Required libraries
local json = require("CldBusApi.dkjson")
local http = require("CldBusApi.http")
local auth = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util = require("CldBusApi.util")

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
    
    -- Get bearer token from Bearer Token property (same as VD05 uses Auth Token)
    local auth_token = Properties["Bearer Token"]
    if not auth_token or auth_token == "" then
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
        ["Authorization"] = "Bearer " .. auth_token
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

    local rtsp_path = "stream0"
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
    
    -- Initialize properties cache
    for k, v in pairs(Properties) do
        if k ~= "Password" then
            print("Property [" .. k .. "] = " .. tostring(v))
        end
    end
    
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

function OnDriverLateInit()
    print("=== K26 Streaming Driver Late Init ===")
    C4:UpdateProperty("Status", "Ready")

    -- Send camera configuration to Camera Proxy
    local ip = Properties["IP Address"]
    local http_port = Properties["HTTP Port"] or "8080"
    local rtsp_port = Properties["RTSP Port"] or "8554"
    local username = Properties["Username"] or "SystemConnect"
    local password = Properties["Password"] or "123456"

    if ip and ip ~= "" then
        print("Sending camera configuration to Camera Proxy:")
        print("  IP Address: " .. ip)
        print("  HTTP Port: " .. http_port)
        print("  RTSP Port: " .. rtsp_port)
        print("  Username: " .. username)

        -- Send camera address and ports to Camera Proxy
        if C4 and C4.SendToProxy then
            -- Send camera address
            C4:SendToProxy(5001, "ADDRESS_CHANGED", { ADDRESS = ip })
            print("  Sent ADDRESS_CHANGED to Camera Proxy")

            -- Send HTTP port
            C4:SendToProxy(5001, "HTTP_PORT_CHANGED", { PORT = http_port })
            print("  Sent HTTP_PORT_CHANGED to Camera Proxy")

            -- Send RTSP port
            C4:SendToProxy(5001, "RTSP_PORT_CHANGED", { PORT = rtsp_port })
            print("  Sent RTSP_PORT_CHANGED to Camera Proxy")

            -- No authentication required for streaming
            C4:SendToProxy(5001, "AUTHENTICATION_REQUIRED", { REQUIRED = "False" })
            print("  Sent AUTHENTICATION_REQUIRED: False to Camera Proxy")

            print("Camera Proxy configuration complete!")
        end

        -- Generate and push initial RTSP URLs to Control4 app (streaming only - no authentication in URL)
        local rtsp_url = string.format("rtsp://%s:%s/stream0", ip, rtsp_port)

        -- Store in properties
        C4:UpdateProperty("Main Stream URL", rtsp_url)
        C4:UpdateProperty("Sub Stream URL", string.gsub(rtsp_url, "stream0", "stream1"))

        print("Camera URLs initialized:")
        print("  RTSP Main: " .. rtsp_url)
        print("  RTSP Sub: " .. string.gsub(rtsp_url, "stream0", "stream1"))
    end
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
    print("UIRequest called: " .. tostring(controlMethod))
    
    if tParams then
        print("UIRequest Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    print("================================================================")
    
    -- Route camera commands and RETURN their results with XML wrapper
    if controlMethod == "GET_RTSP_H264_QUERY_STRING" then
        local result = "<rtsp_h264_query_string>" ..
        C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(5001, tParams)) .. "</rtsp_h264_query_string>"
        return result
    elseif controlMethod == "GET_SNAPSHOT_QUERY_STRING" then
        -- Streaming only - no snapshot support
        print("Snapshot not supported (streaming only)")
        return "<snapshot_query_string></snapshot_query_string>"
    elseif controlMethod == "GET_MJPEG_QUERY_STRING" then
        -- Streaming only - no MJPEG support
        print("MJPEG not supported (streaming only)")
        return "<mjpeg_query_string></mjpeg_query_string>"
    elseif controlMethod == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(idBinding, tParams)
    end
end

--[[=============================================================================
    ReceivedFromProxy Handler
===============================================================================]]

function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("================================================================")
    print("ReceivedFromProxy: binding=" .. tostring(idBinding) .. " command=" .. tostring(strCommand))
    
    if tParams then
        print("Parameters:")
        for k, v in pairs(tParams) do
            print("  " .. tostring(k) .. " = " .. tostring(v))
        end
    end
    print("================================================================")
    
    -- Handle camera proxy commands
    if strCommand == "GET_RTSP_H264_QUERY_STRING" then
        local result = GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
        local xml_result = "<rtsp_h264_query_string>" .. C4:XmlEscapeString(result) .. "</rtsp_h264_query_string>"
        print("Returning XML result: " .. xml_result)
        return xml_result
    elseif strCommand == "SET_DEVICE_PROPERTY" then
        SET_DEVICE_PROPERTY(idBinding, tParams)
    end
end

--[[=============================================================================
    Authentication Functions
===============================================================================]]

function InitializeCamera()
    print("================================================================")
    print("                 INITIALIZE CAMERA CALLED                        ")
    print("================================================================")

    local client_id = util.uuid_v4()
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = Properties["API Secret"] or ""

    print("Client ID: " .. client_id)
    print("Request ID: " .. request_id)
    print("Time: " .. time)

    local message = string.format("client_id=%s&request_id=%s&time=%s&version=%s",
        client_id, request_id, time, version)
    
    local signature = util.hmac_sha256_hex(message, app_secret)
    
    local body_tbl = {
        sign = signature,
        client_id = client_id,
        request_id = request_id,
        time = time,
        version = version
    }

    local body_json = json.encode(body_tbl)
    
    C4:UpdateProperty("Status", "Initializing camera...")

    local base_url = "https://api.arpha-tech.com"
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

    print("Sending request to: " .. url)

    transport.execute(req, function(code, resp, resp_headers, err)
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))

        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data then
                local public_key = parsed.data.public_key
                if public_key then
                    print("Received public key")
                    C4:UpdateProperty("Status", "Initialized - Ready to login")
                    Properties["Public Key"] = public_key
                    Properties["ClientID"] = client_id
                end
            end
        else
            C4:UpdateProperty("Status", "Initialization failed: " .. tostring(code))
        end
    end)

    print("================================================================")
end

function RsaOaepEncrypt(data, publicKey, callback)
    print("RsaOaepEncrypt called")
    
    local data_obj = json.decode(data)
    
    local body_tbl = {
        publicKey = publicKey,
        payload = {
            country_code = data_obj.country_code,
            account = data_obj.account
        }
    }

    local body_json = json.encode(body_tbl)
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

    transport.execute(req, function(code, resp, resp_headers, err)
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.encrypted then
                callback(true, parsed.encrypted, nil)
            else
                callback(false, nil, "Invalid response from encryption API")
            end
        else
            callback(false, nil, "Encryption API failed: " .. tostring(code))
        end
    end)
end

function LoginOrRegister(country_code, account)
    print("================================================================")
    print("              LOGIN OR REGISTER CALLED                          ")
    print("================================================================")

    local public_key = Properties["Public Key"]

    if not public_key or public_key == "" then
        print("ERROR: No public key available. Please run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No public key")
        return
    end

    print("Country Code: " .. country_code)
    print("Account: " .. account)

    local client_id = Properties["ClientID"] or util.uuid_v4()
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = Properties["API Secret"] or ""

    local post_data_obj = {
        country_code = country_code,
        account = account
    }

    local post_data_json = json.encode(post_data_obj)
    
    C4:UpdateProperty("Status", "Encrypting credentials...")

    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)
        if not success or not encrypted_data then
            print("ERROR: Failed to encrypt post_data")
            C4:UpdateProperty("Status", "Login failed: Encryption error")
            return
        end

        local post_data_hex = encrypted_data

        local message = string.format("client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, post_data_hex, request_id, time)

        local signature = util.hmac_sha256_hex(message, app_secret)

        local body_tbl = {
            sign = signature,
            post_data = post_data_hex,
            client_id = client_id,
            request_id = request_id,
            time = time
        }

        local body_json = json.encode(body_tbl)
        
        C4:UpdateProperty("Status", "Logging in...")

        local base_url = "https://api.arpha-tech.com"
        local url = base_url .. "/api/v3/openapi/auth/login-or-register"

        local headers = {
            ["Content-Type"] = "application/json",
            ["Accept-Language"] = "en",
            ["App-Name"] = "cldbus"
        }

        local req = {
            url = url,
            method = "POST",
            headers = headers,
            body = body_json
        }

        print("Sending request to: " .. url)

        transport.execute(req, function(code, resp, resp_headers, err)
            print("Response code: " .. tostring(code))

            if code == 200 then
                print("Login/Register succeeded")

                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed then
                    if parsed.data and parsed.data.token then
                        bearer_token = parsed.data.token
                        C4:UpdateProperty("Bearer Token", bearer_token)
                        print("Bearer token stored")
                    end

                    C4:UpdateProperty("Status", "Login successful")
                end
            else
                print("Login/Register failed with code: " .. tostring(code))
                C4:UpdateProperty("Status", "Login failed: " .. tostring(code))
            end
        end)
    end)

    print("================================================================")
end

--[[=============================================================================
    ExecuteCommand Handler
===============================================================================]]

function ExecuteCommand(strCommand, tParams)
    -- Handle LUA_ACTION wrapper first - unwrap it
    if strCommand == "LUA_ACTION" and tParams and tParams.ACTION then
        print("LUA_ACTION wrapper detected - unwrapping to: " .. tParams.ACTION)
        strCommand = tParams.ACTION
    end
    
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
    elseif strCommand == "InitializeCamera" or strCommand == "INITIALIZE_CAMERA" then
        InitializeCamera()
    elseif strCommand == "LoginOrRegister" or strCommand == "LOGIN_OR_REGISTER" then
        local country_code = (tParams and tParams.country_code) or "N"
        local account = Properties["Account"] or ""
        
        if account == "" then
            print("ERROR: Account is required for login")
            C4:UpdateProperty("Status", "Login failed: No account specified")
            return
        end
        
        LoginOrRegister(country_code, account)
    end
end
