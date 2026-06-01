function onTemperatureSelected(button) {
    console.log('onTemperatureSelected');
    let coldTemp = parseFloat(document.getElementById("cool_temp_display").innerText.replace("°C", "").trim());
    let heatTemp = parseFloat(document.getElementById("heat_temp_display").innerText.replace("°C", "").trim());
    let currTemp = parseFloat(document.getElementById("temp_display").innerText.replace("°C", "").trim());
    let mode = 'auto';

    let params = JSON.stringify({
        currnetTemp: currTemp * 100,
        coolTemp: coldTemp * 100,
        heatTemp: heatTemp * 100,
        mode: mode
    });

    console.log("onTemperatureSelected End" + params)
    C4.sendCommand("SetCoolTemperature1", params, false, true);
}

function onCoolTempSelected(button) {
    console.log('onCoolTempSelected Start');

    let coldTemp = parseFloat(document.getElementById("cool_temp_display").innerText.replace("°C", "").trim());
    let heatTemp = parseFloat(document.getElementById("heat_temp_display").innerText.replace("°C", "").trim());
    let currTemp = parseFloat(document.getElementById("temp_display").innerText.replace("°C", "").trim());
    let mode = 'cold';

    let params = JSON.stringify({
        currnetTemp: currTemp * 100,
        coolTemp: coldTemp * 100,
        heatTemp: heatTemp * 100,
        mode: mode
    });

    console.log("onCoolTempSelected End" + params)
    C4.sendCommand("SetCoolTemperature1", params, false, true);
}

function onHeatTempSelected(button) {
    console.log('onHeatTempSelected Start');

    let coldTemp = parseFloat(document.getElementById("cool_temp_display").innerText.replace("°C", "").trim());
    let heatTemp = parseFloat(document.getElementById("heat_temp_display").innerText.replace("°C", "").trim());
    let currTemp = parseFloat(document.getElementById("temp_display").innerText.replace("°C", "").trim());
    let mode = 'heat';

    let params = JSON.stringify({
        currnetTemp: currTemp * 100,
        coolTemp: coldTemp * 100,
        heatTemp: heatTemp * 100,
        mode: mode
    });

    console.log("onHeatTempSelected End" + params)
    C4.sendCommand("SetCoolTemperature1", params, false, true);
}

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    C4.sendCommand("GetTemperature", "", false, false);
    C4.subscribeToDataToUi(true);
    C4.subscribeToVariable("LAST_ROOM_SELECTED");
    C4.subscribeToVariable("LAST_MENU_SELECTED");
});

function setTemperature(temp) {
    console.log('setTemperature ' + temp);
    var tempDisplay = document.getElementById("temp_display");
    if (tempDisplay) tempDisplay.innerText = temp + "°C";

    var tempButton = document.getElementById(temp);
    if (tempButton) tempButton.checked = true;
}

function setCoolTemp(temp) {
    console.log('setCoolTemp ' + temp);
    var coolTempDisplay = document.getElementById("cool_temp_display");
    if (coolTempDisplay) coolTempDisplay.innerText = temp + "°C";
}

function setHeatTemp(temp) {
    console.log('setHeatTemp ' + temp);
    var heatTempDisplay = document.getElementById("heat_temp_display");
    if (heatTempDisplay) heatTempDisplay.innerText = temp + "°C";
}

function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value)

        let jsonObject = JSON.parse(value);

        let dataObject = JSON.parse(jsonObject.C4Message.Data);

        console.log("Cool Temperature:", dataObject.coolTemperature);
        console.log("Current Temperature:", dataObject.currentTemperature);
        console.log("Heat Temperature:", dataObject.heatTemperature);
        console.log("Mode:", dataObject.mode);

        if (dataObject.mode) {
            let mode = dataObject.mode.toLowerCase();

            if (mode === "auto") {
                document.getElementById("auto").checked = true;
            } else if (mode === "heat") {
                document.getElementById("heat").checked = true;
            } else if (mode === "cold" || mode === "cool") {
                document.getElementById("cool").checked = true;
            } else if (mode === "off") {
                document.getElementById("off").checked = true;
            }
        }

        document.getElementById("temp_display").innerText = dataObject.currentTemperature + "°C";
        document.getElementById("heat_temp_display").innerText = dataObject.heatTemperature + "°C";
        document.getElementById("cool_temp_display").innerText = dataObject.coolTemperature + "°C";

    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


function onVariable(value) {
    console.log("Received variable: " + value);
}

function onSendCommandError(message) {
    console.log("Error sending command: " + message);
}

function onSubscribeToDataToUi(message) {
    console.log("Error subscribing to data to ui: " + message);
}

function onSubscribeToVariableError(variable, message) {
    console.log("Error subscribing to variable: " + variable + "," + message);
}

function getSelectedMode() {
    let modes = document.getElementsByName("mode");
    for (let mode of modes) {
        if (mode.checked) {
            return mode.value.toLowerCase(); // Return the selected mode
        }
    }
    return null;
}


function increaseTemperature() {
    console.log("increaseTemperature " + getSelectedMode())
    let coldTemp = parseFloat(document.getElementById("cool_temp_display").innerText.replace("°C", "").trim());
    let heatTemp = parseFloat(document.getElementById("heat_temp_display").innerText.replace("°C", "").trim());
    let currTemp = parseFloat(document.getElementById("temp_display").innerText.replace("°C", "").trim());
    let mode = getSelectedMode();

    if (mode == "cold" || mode == "auto") {
        if (!isNaN(coldTemp)) {
            coldTemp = coldTemp + 1;
            document.getElementById("cool_temp_display").innerText = coldTemp + " °C";
        } else {
            console.error("Invalid temperature value");
        }
    }

    if (mode == "heat" || mode == "auto") {
        if (!isNaN(heatTemp)) {
            heatTemp = heatTemp + 1;
            document.getElementById("heat_temp_display").innerText = heatTemp + " °C";
        } else {
            console.error("Invalid temperature value");
        }
    }

    console.log("JSON.stringify ")
    let params = JSON.stringify({
        currnetTemp: currTemp * 100,
        coolTemp: coldTemp * 100,
        heatTemp: heatTemp * 100,
        mode: mode
    });

    console.log("SetCoolTemperature1 " + params)
    C4.sendCommand("SetCoolTemperature1", params, false, true);
}



function decreaseTemperature() {
    console.log("increaseTemperature " + getSelectedMode())
    let coldTemp = parseFloat(document.getElementById("cool_temp_display").innerText.replace("°C", "").trim());
    let heatTemp = parseFloat(document.getElementById("heat_temp_display").innerText.replace("°C", "").trim());
    let currTemp = parseFloat(document.getElementById("temp_display").innerText.replace("°C", "").trim());
    let mode = getSelectedMode();

    if (mode == "cold" || mode == "auto") {
        if (!isNaN(coldTemp)) {
            coldTemp = coldTemp - 1;
            document.getElementById("cool_temp_display").innerText = coldTemp + " °C";
        } else {
            console.error("Invalid temperature value");
        }
    }

    if (mode == "heat" || mode == "auto") {
        if (!isNaN(heatTemp)) {
            heatTemp = heatTemp - 1;
            document.getElementById("heat_temp_display").innerText = heatTemp + " °C";
        } else {
            console.error("Invalid temperature value");
        }
    }

    console.log("JSON.stringify ")
    let params = JSON.stringify({
        currnetTemp: currTemp * 100,
        coolTemp: coldTemp * 100,
        heatTemp: heatTemp * 100,
        mode: mode
    });

    console.log("SetCoolTemperature1 " + params)
    C4.sendCommand("SetCoolTemperature1", params, false, true);
}
