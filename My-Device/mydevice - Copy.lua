--cldbus helper for LNDU cameras

local json      = require("CldBusApi.dkjson")
local http      = require("CldBusApi.http")
local auth      = require("CldBusApi.auth")
local transport = require("CldBusApi.transport_c4")
local util      = require("CldBusApi.util")
sha256 = require("sha256")
 
GlobalObject = {}
GlobalObject.ClientID = ""
GlobalObject.ClientSecret = ""
GlobalObject.AES_KEY = "DMb9vJT7ZuhQsI967YUuV621SqGwg1jG" -- 32 bytes = AES-256
GlobalObject.AES_IV = "33rj6KNVN4kFvd0s"                  --16 bytes
GlobalObject.BaseUrl  ="https://openapi.tuyaus.com"
GlobalObject.TCP_SERVER_IP = 'tuya.slomins.com'
GlobalObject.TCP_SERVER_PORT = 8081

local socket = require("socket")
local udp = socket.udp()
udp:settimeout(3)
udp:setoption("broadcast", true)

function OnDriverInit()
    print("SetupProperties:")
    GlobalObject.ClientID = Properties["ClientId"]
    GlobalObject.ClientSecret = Properties["ClientSecret"]
    print("deviceId ", deviceId);
    TcpConnection()
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
    end
end

function ExecuteCommand(command, tParams)
    print("ExecuteCommand command: " .. command) -- Debugging

    if Properties["Contract"] == "Enable" then
        if command == "LUA_ACTION" then
            -- Extract action from tParams
            local action = tParams["ACTION"] or ""        
            --local uid = tParams["UID"]
            local uid = Properties["UserId"]
        
        
            local body = ""

            local props = Properties        
            for name, value in pairs(props) do
                if name ~= "UserId" and name ~= "ClientId" and name ~= "ClientSecret" and  name ~= "Contract"   then 
                    C4:UpdateProperty(name, "")
                end
            end

            --print("LUA_ACTION triggered with action: " .. action) -- Debugging

            -- Fetch the access token before executing the action
        
            GenerateToken(GlobalObject, function(accessToken)
                if not accessToken then
                    print("Failed to retrieve access token.")
                    return
                end
                SendCommand(accessToken, uid, body)
                
            end)
                    
        else
            print("Unknown command: " .. command) -- Helps debug issues
        end
    end
end

function SendCommand(accessToken, uid, body)
    --print("Reacthing at SendCommand") -- Debugging
    -- reset all properties
    
    local apiUrl = GlobalObject.BaseUrl .. "/v1.0/users/" .. uid .. "/devices"

    local nonce = "" -- Can be left empty unless required
    local method = "GET"
    
    -- Generate string to sign
    local signString, url = StringToSign(method, body,"/v1.0/users/" .. uid .. "/devices")

    -- Calculate signature
    local timestamp = GetTimestamp()
    local sign = CalculateSignatureWithAccessToken(GlobalObject.ClientID, accessToken, timestamp, nonce, signString, GlobalObject.ClientSecret)

    local headers = {
        ["client_id"] = GlobalObject.ClientID,
        ["access_token"] = accessToken,
        ["sign"] = sign,
        ["t"] = timestamp,
        ["sign_method"] = "HMAC-SHA256",
        ["Content-Type"] = "application/json"
    }
    --local payloadBody = Json.encode(body)
    C4:urlGet(apiUrl, headers, false, function(ticketId, response, statusCode, errorMsg)
        
        
        if statusCode == 200 then           
            local response_json = C4:JsonDecode(response)
            --print("| Device ID       | Product Name                  | Name         |")
            --print("-----------------------------------")
            local deviceList = ""
            local index = 1
            for _, device in ipairs(response_json.result) do
                --print("| " .. device.id .. " | " .. device.product_name .. " |".. device.name .. " |")
                deviceList = deviceList .. device.id .. " - " .. device.name .. "\n"                
                C4:UpdateProperty(tostring(index), device.name .. " - " .. device.product_name .. " - " .. device.id .. "")
                index = index+1
            end
            --print("-----------------------------------")           
            

        else
            print("No devices found.")

            C4:UpdateProperty("1", "No devices found.")
        end
    end)    
end

-- Function to get current timestamp in milliseconds
function GetTimestamp()
    return tostring(os.time() * 1000)
end

-- Function to calculate HMAC-SHA256 signature
function CalculateSignature(clientId, timestamp, nonce, signStr, secret)
    local signSource = clientId .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret,signSource)
    
    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase
    return signature
end

function CalculateSignatureWithAccessToken(clientId,accessToken, timestamp, nonce, signStr, secret)
    local signSource = clientId .. accessToken .. timestamp .. nonce .. signStr
    -- Use C4's built-in HMAC-SHA256 (if available)
    local signature = sha256.hmac_sha256(secret,signSource)
    
    if not signature then
        print("Error: SHA256 hashing not available in Control4.")
        return ""
    end

    signature = string.upper(signature) -- Convert to uppercase
    
    return signature
end

-- Function to generate a string-to-sign
function StringToSign(method, body,url)
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
