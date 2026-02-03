-- desired Snapshot URL: http://192.168.60.194:3333/wps-cgi/image.cgi?resolution=640x480
-- desired H264 RTSP URL: rtsp://192.168.60.194:554/streamtype=0"

DEFAULT_PROXY_BINDINGID = 5001
local bindingAddress = "192.168.60.194"
C4:SendToProxy(DEFAULT_PROXY_BINDINGID, "ADDRESS_CHANGED", {ADDRESS = bindingAddress})
local bindingPort = "3333"
C4:SendToProxy(DEFAULT_PROXY_BINDINGID, "HTTP_PORT_CHANGED", {PORT = bindingPort})

function GET_SNAPSHOT_QUERY_STRING(idBinding, tParams)
	print('GET_SNAPSHOT_QUERY_STRING()')
	local snapshotQueryString = "wps-cgi/image.cgi?resolution=640x480"
	return snapshotQueryString
end

function GET_RTSP_H264_QUERY_STRING(idBinding, tParams)
	print('GET_RTSP_H264_QUERY_STRING()')
	local mjpegQueryString = "streamtype=0"
	return mjpegQueryString
end