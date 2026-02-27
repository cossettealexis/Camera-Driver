-- Transport adapter for Control4 (uses C4:urlGet / urlPost / urlPut)
local transport = {}

local function safe_headers(t)
    -- C4 expects an array-like table or map for headers; pass through
    return t or {}
end

-- execute(req, callback)
-- req: { url, method, headers, body }
-- callback(status, body, headers, err)
function transport.execute(req, callback)
    if not callback then
        return nil, "Control4 transport is async only; provide a callback"
    end
    local method = (req.method or "GET"):upper()
    local url = req.url
    local headers = safe_headers(req.headers)
    local body = req.body
    local _C4 = rawget(_G, "C4")

    if method == "GET" then
        if _C4 and _C4.urlGet then
            _C4:urlGet(url, headers, false, function(ticketId, strData, responseCode, tHeaders, strError)
                callback(responseCode, strData, tHeaders, strError)
            end)
            return true
        end
    elseif method == "POST" then
        if _C4 and _C4.urlPost then
            _C4:urlPost(url, body or "", headers, false, function(ticketId, strData, responseCode, tHeaders, strError)
                callback(responseCode, strData, tHeaders, strError)
            end)
            return true
        end
    elseif method == "PUT" or method == "PATCH" then
        if _C4 and _C4.urlPut then
            _C4:urlPut(url, body or "", headers, false, function(ticketId, strData, responseCode, tHeaders, strError)
                callback(responseCode, strData, tHeaders, strError)
            end)
            return true
        end
    end

    callback(nil, nil, nil, "C4 HTTP method not available or unsupported method: " .. tostring(method))
    return true
end

return transport
