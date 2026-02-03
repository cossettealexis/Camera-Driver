--[[=============================================================================
    Initialization Functions

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]
require "camera.camera_proxy_class"
require "camera.camera_proxy_commands"
require "camera.camera_proxy_notifies"

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.proxy_init = "2016.01.08"
end

function ON_DRIVER_EARLY_INIT.proxy_init()
	-- declare and initialize global variables
end

function ON_DRIVER_INIT.proxy_init()
	-- Use default ports in the XML file.
	local httpPort = C4:GetCapability("default_http_port")
	local rtspPort = C4:GetCapability("default_rtsp_port")

	-- connect the url connection
	ConnectURL()

	-- instantiate the camera proxy class and set member variables
	gCameraProxy = CameraProxy:new(DEFAULT_PROXY_BINDINGID, httpPort, rtspPort)
	gCameraProxy._AuthRequired = C4:GetCapability("default_authentication_required")
	gCameraProxy._AuthType = C4:GetCapability("default_authentication_type")
	gCameraProxy._Username = C4:GetCapability("default_username")
	gCameraProxy._Password = C4:GetCapability("default_password")
	
end

function ON_DRIVER_LATEINIT.proxy_init()
	gCameraProxy:dev_PropertyDefaults()
end
