--[[=============================================================================
    Lua Action Code

    Copyright 2016 Control4 Corporation. All Rights Reserved.
===============================================================================]]

-- This macro is utilized to identify the version string of the driver template version used.
if (TEMPLATE_VERSION ~= nil) then
	TEMPLATE_VERSION.actions = "2016.01.08"
end

-- TODO: Create a function for each action defined in the driver

function LUA_ACTION.TemplateVersion()
	TemplateVersion()
end

function LUA_ACTION.ACTION_printMap()
    LogTrace("Received ACTION Print Map")
    printOutputToInputMapping()
end

function LUA_ACTION.ACTION_printAudioMap()
    LogTrace("Received ACTION Print Audio Map")
    printAudioMapping()
end

function LUA_ACTION.ACTION_printLastReportedAVPaths()
    LogTrace("Received ACTION Print Last Reported AVPaths")
    printLastReportedAVPaths()
end

function printLastReportedAVPaths()
  local i = 0
  local s
  local t = {}
  for j,k in pairs(gLastReportedAVPaths) do
    i = i + 1
    s = ""
    s = s .. "Room: (" .. k.RoomID .. "), "		
    s = s .. "Path Type: (" .. gAVPathType[k.PathType] .. "), "
    s = s .. "Path Status: (" .. k.PathStatus .. ") :: "
    s = s .. tInputConnMapByID[tonumber(k.InputConnectionID)].Name .. " | " .. k.InputConnectionClass .. ") <<to>> "
    s = s .. tOutputConnMap[tonumber(k.OutputConnectionID)] .. " | " .. k.OutputConnectionClass .. ") "

    table.insert(t,s .. "\r")
  end
  table.sort(t)
  local msg = table.concat(t)
  print("Current AV Paths: " .. i .. " records\r" .. msg)

end

function printOutputToInputMapping()
  local numOuts = (gNumberOutputs-1)
  local input, sInput
  for i=0,numOuts do
     if (gOutputToInputMap[i] == -1) then
	   sInput = "NOT SELECTED"
	else
	   if (gOutputToInputMap[i] < 21) then
		  input = 1000 + gOutputToInputMap[i]
	   else
		  input = 3000 + gOutputToInputMap[i]
	   end
	   sInput = tInputConnMapByID[input].Name
	end
     print(tOutputConnMap[i + 2000] .. " <--> " .. sInput)
  end
end

function printAudioMapping()
  local numOuts = (gNumberAnalogAudioOutputs-1)
  local input, sInput
  for i=0,numOuts do
     if (gOutputToInputAudioMap[i] == -1) then
	   sInput = "NOT SELECTED"
	else
	   if (gOutputToInputAudioMap[i] < 21) then
		  input = 1000 + gOutputToInputAudioMap[i]
	   else
		  input = 3000 + gOutputToInputAudioMap[i]
	   end
	   sInput = tInputConnMapByID[input].Name
	end
     print(tOutputConnMap[i + 4000] .. " <--> " .. sInput)
  end
end
