--[[=============================================================================
    Camera Proxy Class

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.camera_proxy_class = "2016.01.08"
end

CameraProxy = inheritsFrom(nil)

function CameraProxy:construct(bindingID, httpPort, rtspPort)
	-- member variables
	self._BindingID = bindingID
	self._HttpPort = httpPort
	self._RtspPort = rtspPort
	self._MaxLevel = maxLevel

	self:Initialize()

	if PersistData == nil then
		PersistData = {}
	end

	-- setup any data that needs to be persisted
	if PersistData.cameraData == nil then
		PersistData.cameraData = {}
	end

	self._CameraData = PersistData.cameraData	

end

function CameraProxy:Initialize()
	-- create and initialize member variables
	self._Address = "localhost"
	self._HttpPort = 80
	self._RtspPort = 554
	self._AuthRequired = false
	self._AuthType = "BASIC" -- "BASIC" or "DIGEST"
	self._Username = "username"
	self._Password = "password"
	self._PubliclyAccessible = false

end

--[[=============================================================================
    Camera Proxy Commands(PRX_CMD)
===============================================================================]]
function CameraProxy:prx_SET_ADDRESS(tParams)
	tParams = tParams or {}
	self._Address = tParams["ADDRESS"] or self._Address
end

function CameraProxy:prx_SET_ADDRESS(tParams)
	tParams = tParams or {}
	self._Address = tParams["ADDRESS"] or self._Address
end

function CameraProxy:prx_SET_HTTP_PORT(tParams)
	tParams = tParams or {}
	self._HttpPort = tParams["PORT"] or self._HttpPort
end

function CameraProxy:prx_SET_RTSP_PORT(tParams)
	tParams = tParams or {}
	self._RtspPort = tParams["PORT"] or self._RtspPort
end

function CameraProxy:prx_SET_AUTHENTICATION_REQUIRED(tParams)
	tParams = tParams or {}
	self._AuthRequired = toboolean(tParams["REQUIRED"])
end

function CameraProxy:prx_SET_AUTHENTICATION_TYPE(tParams)
	tParams = tParams or {}
	self._AuthType = tParams["TYPE"] or self._AuthType
end

function CameraProxy:prx_SET_USERNAME(tParams)
	tParams = tParams or {}
	self._Username = tParams["USERNAME"] or self._Username
end

function CameraProxy:prx_SET_PASSWORD(tParams)
	tParams = tParams or {}
	self._Password = tParams["PASSWORD"] or self._Password
end

function CameraProxy:prx_SET_PUBLICLY_ACCESSIBLE(tParams)
	tParams = tParams or {}
	self._PubliclyAccessible = toboolean(tParams["PUBLICLY_ACCESSIBLE"])
end

function CameraProxy:prx_PAN_LEFT()
	PAN_LEFT()
end

function CameraProxy:prx_PAN_RIGHT()
	PAN_RIGHT()
end

function CameraProxy:prx_PAN_SCAN()
	PAN_SCAN()
end

function CameraProxy:prx_TILT_UP()
	TILT_UP()
end

function CameraProxy:prx_TILT_DOWN()
	TILT_DOWN()
end

function CameraProxy:prx_TILT_SCAN()
	TILT_SCAN()
end

function CameraProxy:prx_ZOOM_IN()
	ZOOM_IN()
end

function CameraProxy:prx_ZOOM_OUT()
	ZOOM_OUT()
end

function CameraProxy:prx_HOME()
	HOME()
end

function CameraProxy:prx_MOVE_TO(tParams)
	tParams = tParams or {}
    local width = tonumber(tParams["WIDTH"]) or 0
    local height = tonumber(tParams["HEIGHT"]) or 0
	local x_index = tonumber(tParams["X_INDEX"]) or 0
	local y_index = tonumber(tParams["Y_INDEX"]) or 0
	MOVE_TO(width, height, x_index, y_index)
end

function CameraProxy:prx_PRESET(tParams)
	tParams = tParams or {}
	local index = tonumber(tParams["INDEX"]) or 1

	PRESET(index)
end


--[[=============================================================================
    Camera Proxy UIRequests
===============================================================================]]
--[[
	Return the query string required for an HTTP image push URL request.
--]]
function CameraProxy:req_GET_SNAPSHOT_QUERY_STRING(tParams)
	tParams = tParams or {}
    local size_x = tonumber(tParams["SIZE_X"]) or 640
    local size_y = tonumber(tParams["SIZE_Y"]) or 480

	return "<snapshot_query_string>" .. C4:XmlEscapeString(GET_SNAPSHOT_QUERY_STRING(size_x, size_y)) .. "</snapshot_query_string>"
end


function CameraProxy:req_GET_MJPEG_QUERY_STRING(tParams)
	tParams = tParams or {}
    local size_x = tonumber(tParams["SIZE_X"]) or 640
    local size_y = tonumber(tParams["SIZE_Y"]) or 480
	local delay = tonumber(tParams["DELAY"]) or 200

	return "<mjpeg_query_string>" .. C4:XmlEscapeString(GET_MJPEG_QUERY_STRING(size_x, size_y, delay)) .. "</mjpeg_query_string>"
end


function CameraProxy:req_GET_RTSP_H264_QUERY_STRING(tParams)
	tParams = tParams or {}
    local size_x = tonumber(tParams["SIZE_X"]) or 640
    local size_y = tonumber(tParams["SIZE_Y"]) or 480
	local delay = tonumber(tParams["DELAY"]) or 50
	
	return "<rtsp_h264_query_string>" .. C4:XmlEscapeString(GET_RTSP_H264_QUERY_STRING(size_x, size_y, delay)) .. "</rtsp_h264_query_string>"
end


--[[=============================================================================
    Camera Proxy Notifies
===============================================================================]]
function CameraProxy:dev_PropertyDefaults()
	local property_defaults = {}
	property_defaults.HTTP_PORT = self._HttpPort
	property_defaults.RTSP_PORT = self._RtspPort
	property_defaults.AUTHENTICATION_REQUIRED = self._AuthRequired
	property_defaults.AUTHENTICATION_TYPE = self._AuthType
	property_defaults.USERNAME = self._Username
	property_defaults.PASSWORD = self._Password

	NOTIFY.PROPERTY_DEFAULTS(self._BindingID, property_defaults)
end


--[[=============================================================================
    Camera Proxy Functions
===============================================================================]]
-- Create class functions required by the class
function CameraProxy:BuildHTTPURL(queryString)
	local httpUrl = ""
	
	if ((queryString ~= nil) and (string.len(queryString) > 0)) then
		httpUrl = "http://" .. self._Address .. ":" .. self._HttpPort .. "/" .. queryString
	end
	
	return httpUrl
end

function CameraProxy:BuildGetRequest(url)
	local l_url = url

	if ((url ~= nil) and (string.len(url) > 0)) then
		if self._AuthRequired and self._AuthType == "DIGEST" then
			l_url = string.sub(url, 1, 7) .. gUsername .. ":" .. gPassword .. "@" .. string.sub(url, 8)
		end
	end

	return l_url
end

function CameraProxy:AuthHeader()
	local http_headers = {}

	if self._AuthRequired then
		if self._AuthType == "BASIC" then
			local http_header_field = self._Username .. ":" .. self._Password
			http_header_field = "Basic " .. C4:Base64Encode(http_header_field)
			--LogTrace("HTTP Authentication: " .. http_header_field)
			
			http_headers["Authorization"] = http_header_field
		end
	end

	return http_headers
end

