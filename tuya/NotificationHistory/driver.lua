--------------------------------------------------
-- OP07 Notification History Driver
--------------------------------------------------

local _props = {}

local json = require("CldBusApi.dkjson")
local http = require("CldBusApi.http")
local auth = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util = require("CldBusApi.util")

--------------------------------------------------
-- TCP CONFIG (REUSED FROM YOUR DRIVER)
--------------------------------------------------

local TCP_BINDING_ID = 7001
local _tcpConnected = false
local _pendingAuthToken = nil

GlobalObject = {}
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG"
GlobalObject.AES_IV  = "33rj6KNVN4kFvd0s"
GlobalObject.TCP_SERVER_IP   = "tuyadev.slomins.net"
GlobalObject.TCP_SERVER_PORT = 8081

--local ALL_DEVICES = {}
ALL_DEVICES = ALL_DEVICES or {
}

local ALL_VIDS = {}
local UI_PROXY_ID = 5001
-- Add near your globals
local LAST_HISTORY = {}
local LAST_DEVICES = {}

local POLL_TIMER = nil
local POLL_INTERVAL = 10000 -- 30 seconds
local extractedData = {}
--------------------------------------------------
-- INIT
--------------------------------------------------


function SendUpdate(data)
    local msg = json.encode(data)
    -- 5001 is your UI_PROXY_ID defined in driver.xml
    C4:SendToProxy(5001, "WEBVIEW_MESSAGE", { message = "test connect" })
end

function OnDriverInit()
    print("=== Notification History Driver Initialized ===")

    C4:UpdateProperty("Status", "Connecting...")

    for k,v in pairs(Properties) do
        _props[k] = v
    end

    TcpConnection()

    -- 🔥 TEMP TEST: run after 5 seconds
    C4:SetTimer(5000, function()

        print("TEST: running GET_DEVICES")

        if _props["Auth Token"] and _props["Auth Token"] ~= "" then
            GET_DEVICES()
        else
            print("No auth token yet — waiting for TCP push")
        end

    end)
end
--------------------------------------------------
-- TCP CONNECTION (REUSED)
--------------------------------------------------

function TcpConnection()

    local tPortParams = {
        SUPPRESS_CONNECTION_EVENTS = true,
        AUTO_CONNECT = true,
        MONITOR_CONNECTION = true,
        KEEP_CONNECTION = true,
        KEEP_ALIVE = true,
        DELIMITER = "0d0a"
    }

    C4:CreateNetworkConnection(TCP_BINDING_ID, GlobalObject.TCP_SERVER_IP, "TCP")
    C4:NetPortOptions(TCP_BINDING_ID, GlobalObject.TCP_SERVER_PORT, "TCP", tPortParams)
    C4:NetConnect(TCP_BINDING_ID, GlobalObject.TCP_SERVER_PORT)
end

--------------------------------------------------
-- TCP STATUS
--------------------------------------------------

function OnConnectionStatusChanged(id, port, status)

    if id ~= TCP_BINDING_ID then return end

    local s = tostring(status):upper()
    _tcpConnected = (s == "ONLINE" or s == "CONNECTED")

    print("TCP Connected:", _tcpConnected)

    if _pendingAuthToken and _tcpConnected then
        UpdateAuthToken(_pendingAuthToken)
    end
end

--------------------------------------------------
-- TCP RECEIVE (GET TOKEN + APPID)
--------------------------------------------------

function ReceivedFromNetwork(id, port, data)

    if id ~= TCP_BINDING_ID or not data then return end

    if string.sub(data, -2) == "\r\n" then
        data = string.sub(data, 1, -3)
    end

    local decrypted = C4:Decrypt(
        "AES-256-CBC",
        GlobalObject.AES_KEY,
        GlobalObject.AES_IV,
        data,
        {
            return_encoding="NONE",
            key_encoding="NONE",
            iv_encoding="NONE",
            data_encoding="BASE64",
            padding=true
        }
    )

    if not decrypted then return end

    local ok, decoded = pcall(json.decode, decrypted)
    if not ok or not decoded then return end

    local payload = decoded.message or decoded

    if payload.EventName ~= "LnduUpdate" then return end

    if payload.Token then
        -- Build the extractedData table like Smart Camera driver
        local extractedData = {
            type = "auth_token",
            token = payload.Token,
            appId = payload.AppId,
            appSecret = payload.AppSecret
        }

        -- Update driver properties
        _props["Auth Token"] = payload.Token
        C4:UpdateProperty("Auth Token", payload.Token)

        if payload.AppId then
            _props["AppId"] = payload.AppId
            C4:UpdateProperty("AppId", payload.AppId)
        end
        if payload.AppSecret then
            _props["AppSecret"] = payload.AppSecret
            C4:UpdateProperty("AppSecret", payload.AppSecret)
        end

         local jsonString = C4:JsonEncode(extractedData)

        print("JSON to UI: " .. jsonString)
        SendUpdate(extractedData)
       UpdateAuthToken(payload.Token)
    end

    if payload.AppId then
        _props["AppId"] = payload.AppId
        C4:UpdateProperty("AppId", payload.AppId)
    end

    if payload.AppSecret then
        _props["AppSecret"] = payload.AppSecret
        C4:UpdateProperty("AppSecret", payload.AppSecret)
    end
end

--------------------------------------------------
-- UPDATE TOKEN
--------------------------------------------------

function UpdateAuthToken(token)
    if not token then return end

    -- If TCP is not connected yet, store pending token
    if not _tcpConnected then
        _pendingAuthToken = token
        return
    end

    -- Save token and update property
    _props["Auth Token"] = token
    C4:UpdateProperty("Auth Token", token)
    print("Auth Token Updated:", token)

    -- Send token to WebView
    
    
    GET_DEVICES()
end
--------------------------------------------------
-- POLLING
--------------------------------------------------
local POLL_TIMER = nil
local POLL_INTERVAL = 10000 -- 10 seconds
local _pollingInFlight = false
local _currentFilterVids = nil -- nil = ALL_VIDS

local function PollTick()
    -- Defensive: Don't overlap network calls
    if _pollingInFlight then
        print("Poll skipped (in-flight)")
    else
        _pollingInFlight = true
        print("Polling notifications...")

        local vids = _currentFilterVids
        if (not vids or #vids == 0) then
            vids = ALL_VIDS
        end

        if vids and #vids > 0 then
            FETCH_NOTIFICATION_HISTORY(vids, function()
                -- callback to clear in-flight
                _pollingInFlight = false
            end)
        else
            print("Poll: No VIDs to fetch")
            _pollingInFlight = false
        end
    end

    -- Reschedule cleanly
    POLL_TIMER = C4:SetTimer(POLL_INTERVAL, PollTick)
end



function GET_DEVICES()
    local auth_token = _props["Auth Token"]
    if not auth_token or auth_token == "" then
        print("No auth token — cannot fetch devices yet")
        return
    end

    local req = {
        url = (Properties["Base API URL"] or "https://api.arpha-tech.com") .. "/api/v3/openapi/devices-v2",
        method = "GET",
        headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer " .. auth_token,
            ["App-Name"] = "cldbus"
        }
    }

    transport.execute(req, function(code, resp)
        print("DEVICES CODE:", code)
        print("DEVICES RAW:", resp)

        if code ~= 200 then
            print("Device API failed — unauthorized?", code)
            return
        end

        local ok, parsed = pcall(json.decode, resp or "")
        if not ok or not parsed or not parsed.data then
            print("Parse failed")
            return
        end

        ALL_DEVICES = {}
        ALL_VIDS = {}
        for _, d in ipairs(parsed.data.devices or {}) do
            table.insert(ALL_DEVICES, { vid = d.vid, name = d.device_name or d.vid })
            table.insert(ALL_VIDS, d.vid)
        end

        print("Total devices fetched:", #ALL_DEVICES)

        -- Send devices to UI now that we have them
        SendDevicesToUI()

        -- Fetch history for these devices
        _currentFilterVids = nil
        FETCH_NOTIFICATION_HISTORY(ALL_VIDS, function()
            StartPolling()
        end)
    end)
end
--------------------------------------------------
-- OP07 HISTORY API CALL
--------------------------------------------------

function FETCH_NOTIFICATION_HISTORY(vids, done)
    print("FETCH_NOTIFICATION_HISTORY called")
    print("VID COUNT:", vids and #vids or 0)

    local auth_token = _props["Auth Token"]
    if not auth_token then 
        if done then done() end
        return 
    end

    if not vids or #vids == 0 then
        print("No vids provided")
        if done then done() end
        return
    end

    local body = {
        page = 1,
        page_size = 20,
        vids = vids
    }

    local req = {
        url = (Properties["Base API URL"] or "https://api.arpha-tech.com")
            .. "/api/v3/openapi/notifications/query",
        method = "POST",
        headers = {
            ["Content-Type"] = "application/json",
            ["Authorization"] = "Bearer " .. auth_token,
            ["App-Name"] = "cldbus"
        },
        body = json.encode(body)
    }

    transport.execute(req, function(code, resp)
        print("NOTIF CODE:", code)
        -- Always clear in-flight before any early return
        local clear = function() if done then done() end end

        if code ~= 200 and code ~= 20000 then
            print("Notif API failed")
            return clear()
        end

        local ok, parsed = pcall(json.decode, resp or "")
        if not ok or not parsed or not parsed.data then
            print("Notif parse failed")
            return clear()
        end

        local raw = parsed.data.notifications or {}
        local cleaned = {}

        for _, n in ipairs(raw) do
            table.insert(cleaned, {
                device_name  = n.device_name or "",
                vid          = n.vid or "",
                time         = n.notify_time or 0,
                image_url    = n.image_url or "",
                message_type = n.message_type or ""
            })
        end

        --SendHistoryToUI(cleaned)
        return clear()
    end)
end
-- Add near your globals


-- Send list of devices to the WebView UI
function SendDevicesToUI(devices)
    LAST_DEVICES = devices or LAST_DEVICES or {}
    print("SendDevicesToUI CALLED")
    
    local payload = {
        type = "device_list",
        devices = LAST_DEVICES
    }

    -- THIS IS THE CRITICAL CHANGE:
    -- We must wrap the JSON in a table with the key "MESSAGE"
    local tParams = {
        MESSAGE = json.encode(payload)
    }

    print("========================================")
    print("Sending to Proxy 5001 -> WEBVIEW_MESSAGE")
    C4:SendToProxy(5001, "WEBVIEW_MESSAGE", tParams) 
    print("========================================")
end


--------------------------------------------------
-- Send notification history list to UI
--------------------------------------------------
function SendHistoryToUI(list)
    LAST_HISTORY = list or LAST_HISTORY or {}
    local payload = {
        type = "history",
        history = LAST_HISTORY
    }

    -- Wrap the JSON string in a table with the key "MESSAGE"
    local tParams = {
        MESSAGE = json.encode(payload)
    }

    C4:SendToProxy(5001, "WEBVIEW_MESSAGE", tParams)
end



function ReceivedFromProxy(idBinding, strCommand, tParams)
    print("================================================")
    print("ReceivedFromProxy binding:", tostring(idBinding))
    print("Command:", strCommand)
    print("================================================")

    -- If Lua sees nil, handle SELECT as a fallback for debug
    if strCommand == "SELECT" then
        --[[print("Notification tile selected")

        local extractedData = {
            type = "auth_token",
            token = _props["Auth Token"],
            appId = _props["AppId"],
            appSecret = _props["AppSecret"]
        }

        print("Sending stored token to UI")

        SendUpdate(extractedData)
        --]]
        InitializeCamera()
        return
    end

    if strCommand == "HandleSelect" then
    print("WebView opened (HandleSelect)")

    -- Build the same raw Control4 devicecommand format
    --[[local extractedData = {
        devicecommand = {
            params = {
                param = {
                    {
                        name = "Name",
                        value = { static = "Auth Token" }
                    },
                    {
                        name = "Value",
                        value = { static = _props["Auth Token"] }
                    }
                }
            }
        }
    }

    local jsonString = C4:JsonEncode(extractedData)
    print("JSON to UI: " .. jsonString)

    SendUpdate(extractedData) --]]
    InitializeCamera() 
    return
end


    if idBinding ~= UI_PROXY_ID then return end
    if strCommand ~= "WEBVIEW_MESSAGE" then return end

    local raw = tParams and (tParams.message or tParams.MESSAGE) or ""
    local ok, msg = pcall(json.decode, raw)
    if not ok or not msg then
        print("JSON decode failed:", raw)
        return
    end

    -- Called when WebView sends ui_ready
    if msg.action == "ui_ready" then
        print("UI handshake received")

    -- Build the auth token payload
        local extractedData = {
        type = "auth_token",
        token = _props["Auth Token"],
        appId = _props["AppId"],
        appSecret = _props["AppSecret"]
        }

        -- Send it via SendUpdate
        SendUpdate(extractedData)


    end

end

_pollingTimer = nil
function StartPolling()
    if _pollingTimer then return end

    _pollingTimer = C4:SetTimer(5000, function()
        print("Polling notifications...")
        -- Example: generate fake history
        local t = os.time()
        LAST_HISTORY = {
            { device_name="Front Door", message_type="Motion Detected", time=t, image_url="https://via.placeholder.com/400x300" },
            { device_name="Garage", message_type="Door Opened", time=t-60, image_url="https://via.placeholder.com/400x300" }
        }
        SendHistoryToUI(LAST_HISTORY)
    end, true)
end

-- Manual refresh command
function REFRESH_HISTORY()
    print("Manual refresh triggered")
    SendHistoryToUI(LAST_HISTORY)
end


function InitializeCamera()
    print("================================================================")
    print("                 INITIALIZE CAMERA CALLED                        ")
    print("================================================================")
    
    -- Generate a single ClientID for this session
    local client_id = util.uuid_v4()
    GlobalObject.ClientID = client_id
    Properties["ClientID"] = client_id
    C4:UpdateProperty("ClientID", client_id)
    print("[Camera Init] Generated ClientID:", client_id)
    
    -- Generate other values for init
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local version = "0.0.1"
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    
    -- Prepare message and signature
    local message = string.format("client_id=%s&request_id=%s&time=%s&version=%s",
        client_id, request_id, time, version)
    local signature = util.hmac_sha256_hex(message, app_secret)
    
    -- Build request body
    local body_tbl = {
        sign       = signature,
        client_id  = client_id,
        request_id = request_id,
        time       = time,
        version    = version
    }
    local body_json = json.encode(body_tbl)
    
    C4:UpdateProperty("Status", "Initializing camera...")
    
    -- Send request to camera init API
    local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
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
    
    print("[Camera Init] Sending request to:", url)
    
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Response code: " .. tostring(code))
        print("Response body: " .. tostring(resp))
        if err then print("Error: " .. tostring(err)) end
        print("----------------------------------------------------------------")
        
        if code == 200 then
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.data and parsed.data.public_key then
                local public_key = parsed.data.public_key
                _props["Public Key"] = public_key
                C4:UpdateProperty("Public Key", public_key)
                C4:UpdateProperty("Status", "Camera initialized successfully")
                print("[Camera Init] Public key received:", public_key)
                
                local country_code = "N"
                local account = Properties["Account"] or "pyabu@slomins.com"
                
                if account == "" then
                    print("ERROR: Account is required for login")
                    C4:UpdateProperty("Status", "Login failed: No account specified")
                    return
                end
                
                LoginOrRegister(country_code, account)
                
            else
                print("ERROR: No public key in response")
                C4:UpdateProperty("Status", "Init failed: No public key")
            end
        else
            print("Camera init failed with code: " .. tostring(code))
            C4:UpdateProperty("Status", "Init failed: " .. tostring(err or code))
        end
    end)
    
    print("================================================================")
end


function RsaOaepEncrypt(data, publicKey, callback)
    print("RsaOaepEncrypt called (using external encryption API)")
    print("Data to encrypt: " .. data)
    print("Public key length: " .. #publicKey)
    
    -- Parse the data to get country_code and account
    local data_obj = json.decode(data)
    
    -- Build request body for encryption API
    local body_tbl = {
        publicKey = publicKey,
        payload = {
            country_code = data_obj.country_code,
            account = data_obj.account
        }
    }
    
    local body_json = json.encode(body_tbl)
    print("Encryption API request body: " .. body_json)
    
    -- Call external encryption API
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
    
    print("Calling encryption API: " .. url)
    
    transport.execute(req, function(code, resp, resp_headers, err)
        print("----------------------------------------------------------------")
        print("Encryption API Response code: " .. tostring(code))
        print("Encryption API Response body: " .. tostring(resp))
        if err then
            print("Encryption API Error: " .. tostring(err))
        end
        print("----------------------------------------------------------------")
        
        if code == 200 then
            -- Parse response
            local ok, parsed = pcall(json.decode, resp)
            if ok and parsed and parsed.encrypted then
                print("Encryption successful!")
                print("Encrypted data received from API")
                
                -- Return encrypted data via callback
                callback(true, parsed.encrypted, nil)
            else
                print("ERROR: Invalid response from encryption API")
                callback(false, nil, "Invalid response from encryption API")
            end
        else
            print("Encryption API failed with code: " .. tostring(code))
            callback(false, nil, "Encryption API failed: " .. tostring(err or code))
        end
    end)
end

function LoginOrRegister(country_code, account)
    print("================================================================")
    print("              LOGIN OR REGISTER CALLED                          ")
    print("================================================================")
    
    local public_key = _props["Public Key"] or Properties["Public Key"]
    if not public_key or public_key == "" then
        print("ERROR: No public key available. Run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No public key")
        return
    end
    print("[Login] Using public key:", public_key)
    
    -- Use stored ClientID
    local client_id = GlobalObject.ClientID or Properties["ClientID"]
    if not client_id or client_id == "" then
        print("ERROR: No ClientID available. Must run InitializeCamera first.")
        C4:UpdateProperty("Status", "Login failed: No ClientID")
        return
    end
    print("[Login] Using ClientID:", client_id)
    
    local request_id = util.uuid_v4()
    local time = tostring(os.time())
    local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    
    local post_data_obj = { country_code = country_code, account = account }
    local post_data_json = json.encode(post_data_obj)
    
    C4:UpdateProperty("Status", "Encrypting credentials...")
    
    RsaOaepEncrypt(post_data_json, public_key, function(success, encrypted_data, error_msg)
        if not success or not encrypted_data then
            print("ERROR: Encryption failed:", error_msg)
            C4:UpdateProperty("Status", "Login failed: Encryption error")
            return
        end
        
        local post_data_hex = encrypted_data
        local message = string.format("client_id=%s&post_data=%s&request_id=%s&time=%s",
            client_id, post_data_hex, request_id, time)
        local signature = util.hmac_sha256_hex(message, app_secret)
        
        local body_tbl = {
            sign       = signature,
            post_data  = post_data_hex,
            client_id  = client_id,
            request_id = request_id,
            time       = time
        }
        local body_json = json.encode(body_tbl)
        
        C4:UpdateProperty("Status", "Logging in...")
        
        local base_url = Properties["Base API URL"] or "https://api.arpha-tech.com"
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
        
        transport.execute(req, function(code, resp, _, err)
            print("----------------------------------------------------------------")
            print("Response code: " .. tostring(code))
            print("Response body: " .. tostring(resp))
            if err then print("Error: " .. tostring(err)) end
            print("----------------------------------------------------------------")
            
            if code == 200 then
                local ok, parsed = pcall(json.decode, resp)
                if ok and parsed and parsed.data then
                    local token =
                        parsed.data.token or
                        parsed.data.access_token or
                        parsed.data.jwt
                       
                    if token and token ~= "" then
                        _props["Auth Token"] = token
                        GlobalObject.AccessToken = token
                        C4:UpdateProperty("Auth Token", token)
                        print("[Login] Auth token stored:", token)
                        
                        -- Send token + ClientID to NODE API
                        SendTokenToNodeAPI(token)
                    else
                        print("ERROR: Login succeeded but no token found")
                    end
                    
                    C4:UpdateProperty("Status", "Login successful")
                else
                    print("ERROR: Failed to parse login response")
                    C4:UpdateProperty("Status", "Login failed: Invalid response")
                end
            else
                print("Login failed with code:", code)
                C4:UpdateProperty("Status", "Login failed: " .. tostring(err or code))
            end
        end)
    end)
end




-- Sends the token to Node API with retries and async handling
function SendTokenToNodeAPI(token)
    local attempt = 1
    local max_attempts = 5

     local app_secret = "hg4IwDpf2tvbVdBGc6nwP5x2XGCIlNv8"
    local function SendTokenRetry()
        local url = "http://54.90.205.243:3000/send-to-control4"
        
        local body = {
            message = {
                EventName = "LnduUpdate",
                Token = token,
                ClientID = GlobalObject.ClientID, 
                AppId       = "cldbus",       
                AppSecret   = app_secret,   
                AccountName = GlobalObject.AccountName
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