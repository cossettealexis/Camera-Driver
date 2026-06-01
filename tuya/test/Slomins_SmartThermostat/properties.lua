--[[=============================================================================
    Properties Code

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.properties = "2016.01.08"
end

function ON_PROPERTY_CHANGED.SampleProperty(propertyValue)
	
end
