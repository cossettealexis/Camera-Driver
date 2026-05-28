CMDS = {}
PROXY_CMDS = {}
ACTIONS = {}
ON_INIT = {}
ON_LATE_INIT = {}
ON_PROPERTY_CHANGED = {} 
 


local function runFunctions(funcMap) 
    for k,v in pairs(funcMap) do
        if type(v) == "function" then
            pcall(v)
        end
    end
end

function OnDriverInit()
     runFunctions(ON_INIT)
end

function OnDriverLateInit()
    runFunctions(ON_LATE_INIT)
end

function BuildSimpleXml(tag, tData, escapeValue)
    if not tData then
        return ""
    end

    local xml = ""

    if (tag ~= nil) then
        xml = "<" .. tag .. ">"
    end

    if (type(tData) ~= "table") then
        xml = xml .. tData
    else
        if (escapeValue) then
            for i,v in pairs(tData) do
                xml = xml .. "<" .. i .. ">" .. C4:XmlEscapeString(tostring(v)) .. "</" .. i .. ">"
            end
        else
            for i,v in pairs(tData) do
                xml = xml .. "<" .. i .. ">" .. v .. "</" .. i .. ">"
            end
        end
    end

    if (tag ~= nil) then
        xml = xml .. "</" .. tag .. ">"
    end

    return xml
end

-------- INIT -------

gInitTimer = C4:AddTimer(5, "SECONDS")


gDebugLevel = "std";
gDebugPrint = false;
gDebugLog = false;
gDebugTimer = 0;
gConnectionStatus = false;
gPortNumber = 8085



------- END INIT --------


function OnDriverDestroyed()
print("OnDriverDestroyed()")
	--Clean timers
	gInitTimer = nil
end


function OnTimerExpired( idTimer )
print("ontimerexpired")
	if (idTimer == gInitTimer) then
		print("Init Timer expired...")
	
	elseif (idTimer == g_DebugTimer) then
    	print('Turning Debug Mode back to Off (timer expired)')
    	C4:UpdateProperty('Debug Mode', 'Off')
    	gDebugPrint = false
    	gDebugLog = false
    	gDebugTimer = C4:KillTimer(gDebugTimer)
    else
    	print('Killed Stray Timer: ' .. idTimer)
    	C4:KillTimer(idTimer)
  	end
	
end



function startDebugTimer()
  
  if (gDebugTimer) then
    gDebugTimer = C4:KillTimer(gDebugTimer);
  end
  gDebugTimer = C4:AddTimer(10, 'MINUTES');

end
