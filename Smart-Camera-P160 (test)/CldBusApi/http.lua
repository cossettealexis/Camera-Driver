-- Minimal CldBus API HTTP request builder
-- This module constructs request tables and leaves transport (actual HTTP/MQTT)
-- to the caller so the SDK is portable across environments (Composer/standalone).

local http = {}

-- cfg: { base_url = "https://api.example.com", token = "...", extra_headers = {k=v} }
function http.build_request(cfg, path, method, body)
    method = method or "POST"
    local url = (cfg and cfg.base_url or "") .. path
    local headers = {}
    headers["Content-Type"] = "application/json"
    headers["App-Name"] = "cldbus"
    if cfg and cfg.token then headers["Authorization"] = "Bearer " .. cfg.token end
    if cfg and cfg.extra_headers then
        for k, v in pairs(cfg.extra_headers) do headers[k] = v end
    end

    -- Return a plain table describing the request. The driver should provide a
    -- transport.execute(request) function that understands this shape.
    return {
        url = url,
        method = method,
        headers = headers,
        body = body,
    }
end

return http
