local M = {}

-- Load sha256 module for HMAC
-- Try both paths to handle different Control4 loader behaviors
local sha256 = require("CldBusApi.sha256")
if not sha256 then
    sha256 = require("sha256")
end


-- Seed random number generator
math.randomseed(os.time())

-- Generate UUID v4
function M.uuid_v4()
    local template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
    return string.gsub(template, '[xy]', function(c)
        local v = (c == 'x') and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format('%x', v)
    end)
end

-- HMAC-SHA256 implementation
function M.hmac_sha256_hex(message, key)
    -- Use the sha256 module's hmac_sha256 function
    return sha256.hmac_sha256(key, message)
end

return M


