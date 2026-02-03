--[[=============================================================================
    Commands received from the camera proxy (ReceivedFromProxy)

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.proxy_commands = "2016.01.08"
end

--[[
	Implement the following commands as required by capabilities. 
--]]

function PAN_LEFT()
	-- TODO: Set the value of the PAN_LEFT command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("PAN_LEFT(): Ticket = " .. ticket .. " URL = " .. url)
end

function PAN_RIGHT()
	-- TODO: Set the value of the PAN_RIGHT command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("PAN_RIGHT(): Ticket = " .. ticket .. " URL = " .. url)
end

function PAN_SCAN()
	-- TODO: Set the value of the PAN_SCAN command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("PAN_SCAN(): Ticket = " .. ticket .. " URL = " .. url)
end

function TILT_UP()
	-- TODO: Set the value of the TILT_UP command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("TILT_UP(): Ticket = " .. ticket .. " URL = " .. url)
end

function TILT_DOWN()
	-- TODO: Set the value of the TILT_DOWN command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("TILT_DOWN(): Ticket = " .. ticket .. " URL = " .. url)
end

function TILT_SCAN()
	-- TODO: Set the value of the TILT_SCAN command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("TILT_SCAN(): Ticket = " .. ticket .. " URL = " .. url)
end

function ZOOM_IN()
	-- TODO: Set the value of the ZOOM_IN command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("ZOOM_IN(): Ticket = " .. ticket .. " URL = " .. url)
end

function ZOOM_OUT()
	-- TODO: Set the value of the ZOOM_OUT command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("ZOOM_OUT(): Ticket = " .. ticket .. " URL = " .. url)
end

function HOME()
	-- TODO: Set the value of the HOME command
	local command = "" 

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("HOME(): Ticket = " .. ticket .. " URL = " .. url)
end

function MOVE_TO(width, height, x_index, y_index)
	-- TODO: Set the value of the MOVE_TO command
	local command = ""
	
	-- Even if your camera does not support a true Move To command you must complete this function in order for the Left, Right, Up and Down functions to work.

	-- TRUE MOVE_TO
	-- If your camera supports true move to commands then you will need to do some math based on the position co-ordinates that come from the UI.
	-- Use the variables width, height, x_index and y_index
	-- local url = gCameraProxy.BuildHTTPURL(command)
	-- local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	-- LogTrace("PRX_CMD.MOVE_TO: Ticket = " .. ticket .. " URL = " .. url)

	-- DIAGONAL MOVE
	-- If your camera supports diagonal move commands then use the following code
	--x_index = (x_index - (width / 2)) / (width / 2)
	--y_index = ((height / 2) - y_index) / (height/ 2)

	--if ((x_index < 0) and (y_index < 0)) then
	--	command = 'Down Left query'
	--elseif ((x_index > 0) and (y_index < 0)) then
	--	command = 'Down Right query'
	--elseif ((x_index > 0) and (y_index > 0)) then
	--	command = 'Up Right query'
	--elseif ((x_index < 0) and (y_index > 0)) then
	--	command = 'Up Left query'
	--end
	-- local url = gCameraProxy.BuildHTTPURL(command)
	-- local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	-- LogTrace("PRX_CMD.MOVE_TO: Ticket = " .. ticket .. " URL = " .. url)


	-- LEFT, RIGHT, UP and DOWN only
	-- This code will combine these commands to move the camera diagonally
	--x_index = (x_index - (width / 2)) / (width / 2)
	--y_index = ((height / 2) - y_index) / (height/ 2)

	--if (x_index < -0.5) then -- Left
	--	PAN_LEFT()
	--end
	--if (y_index < -0.5) then -- Down
	--	TILT_DOWN()
	--end
	--if (x_index > 0.5) then -- Right
	--	PAN_RIGHT()
	--end
	--if ((y_index > 0.5)) then -- Up
	--	TILT_UP()
	--end
end

function PRESET(index)
	-- TODO: Set the value of the PRESET command
	local command = ""

	local url = gCameraProxy:BuildHTTPURL(command)
	local ticket = gCon:UrlGet(gCameraProxy:BuildGetRequest(url), gCameraProxy:AuthHeader())
	
	LogTrace("PRESET(" .. tostring(index) .. "): Ticket = " .. ticket .. " URL = " .. url)
end

-- UI Requests
--[[
	Return the query string required for an HTTP snapshot URL request.
--]]
function GET_SNAPSHOT_QUERY_STRING(size_x, size_y)
	-- To make a permanent driver for a model comment out the line below with --
	local snapshotQueryString = Properties['Still JPEG URL']
	-- then uncomment the line below and add in the URL between the quotes.
	-- TODO: Add in the URL between the quotes.  Remember there should be no leading /
	-- If the camera has the ability to send a snapshot of a particular size then use the size_x and size_y variables in the query.
	--local snapshotQueryString = "sample/queryString?parameter=value&parameter2=value2"

	return snapshotQueryString
end

--[[
	Return the query string required for an HTTP image push URL request.
--]]
function GET_MJPEG_QUERY_STRING(size_x, size_y, delay)
	-- To make a permanent driver for a model comment out the line below with --
	local mjpegQueryString = Properties['MJPEG URL']
	-- then uncomment the line below and add in the URL between the quotes.
	-- TODO: Add in the URL between the quotes.  Remember there should be no leading /
	-- If the camera has the ability to provide an MJPEG stream of a particular size then use the size_x and size_y variables in the query.
    --local mjpegQueryString = "sample/queryString?parameter=value&parameter2=value2"

	return mjpegQueryString
end

--[[
	Return the query string required to establish Rtsp connection. May be empty string.
--]]
function GET_RTSP_H264_QUERY_STRING(size_x, size_y, delay)
	-- To make a permanent driver for a model comment out the line below with --
	local rtspH264QueryString = Properties['H264 URL']
	-- then uncomment the line below and add in the URL between the quotes.  Remember there should be no leading /
	-- TODO: Add in the URL between the quotes.  Remember there should be no leading /
	-- If the camera has the ability to provide an H264 stream of a particular size then use the size_x and size_y variables in the query.
	--local rtspH264QueryString = "sample/queryString?parameter=value&parameter2=value2"
	
	return rtspH264QueryString
end

