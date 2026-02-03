--[[=============================================================================
    Command Functions Received From Proxy to the Camera Driver

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.camera_proxy_commands = "2016.01.08"
end

function PRX_CMD.SET_ADDRESS(idBinding, tParams)
	gCameraProxy:prx_SET_ADDRESS(tParams)
end

function PRX_CMD.SET_HTTP_PORT(idBinding, tParams)
	gCameraProxy:prx_SET_HTTP_PORT(tParams)
end

function PRX_CMD.SET_RTSP_PORT(idBinding, tParams)
	gCameraProxy:prx_SET_RTSP_PORT(tParams)
end

function PRX_CMD.SET_AUTHENTICATION_REQUIRED(idBinding, tParams)
	gCameraProxy:prx_SET_AUTHENTICATION_REQUIRED(tParams)
end

function PRX_CMD.SET_AUTHENTICATION_TYPE(idBinding, tParams)
	gCameraProxy:prx_SET_AUTHENTICATION_TYPE(tParams)
end

function PRX_CMD.SET_USERNAME(idBinding, tParams)
	gCameraProxy:prx_SET_USERNAME(tParams)
end

function PRX_CMD.SET_PASSWORD(idBinding, tParams)
	gCameraProxy:prx_SET_PASSWORD(tParams)
end

function PRX_CMD.SET_PUBLICLY_ACCESSIBLE(idBinding, tParams)
	gCameraProxy:prx_SET_PUBLICLY_ACCESSIBLE(tParams)
end

function PRX_CMD.PAN_LEFT(idBinding, tParams)
	gCameraProxy:prx_PAN_LEFT()
end

function PRX_CMD.PAN_RIGHT(idBinding, tParams)
	gCameraProxy:prx_PAN_RIGHT()
end

function PRX_CMD.PAN_SCAN(idBinding, tParams)
	gCameraProxy:prx_PAN_SCAN()
end

function PRX_CMD.TILT_UP(idBinding, tParams)
	gCameraProxy:prx_TILT_UP()
end

function PRX_CMD.TILT_DOWN(idBinding, tParams)
	gCameraProxy:prx_TILT_DOWN()
end

function PRX_CMD.TILT_SCAN(idBinding, tParams)
	gCameraProxy:prx_TILT_SCAN()
end

function PRX_CMD.ZOOM_IN(idBinding, tParams)
	gCameraProxy:prx_ZOOM_IN()
end

function PRX_CMD.ZOOM_OUT(idBinding, tParams)
	gCameraProxy:prx_ZOOM_OUT()
end

function PRX_CMD.HOME(idBinding, tParams)
	gCameraProxy:prx_HOME()
end

function PRX_CMD.MOVE_TO(idBinding, tParams)
	gCameraProxy:prx_MOVE_TO(tParams)
end

function PRX_CMD.PRESET(idBinding, tParams)
	gCameraProxy:prx_PRESET(tParams)
end


-- UI Requests
function UI_REQ.GET_SNAPSHOT_QUERY_STRING(tParams)
	return gCameraProxy:req_GET_SNAPSHOT_QUERY_STRING(tParams)
end

function UI_REQ.GET_MJPEG_QUERY_STRING(tParams)
	return gCameraProxy:req_GET_MJPEG_QUERY_STRING(tParams)
end

function UI_REQ.GET_RTSP_H264_QUERY_STRING(tParams)
	return gCameraProxy:req_GET_RTSP_H264_QUERY_STRING(tParams)
end

