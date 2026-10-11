
local auth = {}

-- Auth config and state
auth.cfg = {
    base_url = "",
    token = nil,
}

-- Initialize with base URL and optional transport
function auth.init(cfg)
    for k, v in pairs(cfg) do auth.cfg[k] = v end
    auth.transport = cfg.transport -- transport must implement execute(req) -> (status, resp_body)
end


return auth
