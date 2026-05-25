
var isPowerOn = false;
var dimmerPercentage = 0;
var jqxKnobOptionOff = {
    marks: {
        colorRemaining: { color: '#cbc9c9', border: '#cbc9c9' },
        colorProgress: { color: '#cbc9c9', border: '#cbc9c9' },
        type: 'line',
        offset: '71%',
        thickness: 3,
        size: '6%',
        majorSize: '9%',
        majorInterval: 10,
        minorInterval: 2
    },
    progressBar: {
        style: { fill: '#cbc9c9', stroke: 'grey' },
        size: '1%',
        offset: '60%',
        background: { fill: '#cbc9c9', stroke: '#cbc9c9' }
    },
    pointer: { type: 'arrow', style: { fill: '#cbc9c9', stroke: 'grey' }, size: '59%', offset: '49%', thickness: 20 }
}
var jqxKnobOptionOn = {
    marks: {
        colorRemaining: { color: '#cbc9c9', border: '#cbc9c9' },
        colorProgress: { color: '#bada55', border: '#bada55' },
        type: 'line',
        offset: '71%',
        thickness: 3,
        size: '6%',
        majorSize: '9%',
        majorInterval: 10,
        minorInterval: 2
    },
    progressBar: {
        style: { fill: '#bada55', stroke: 'grey' },
        size: '1%',
        offset: '60%',
        background: { fill: '#cbc9c9', stroke: '#cbc9c9' }
    },
    pointer: { type: 'arrow', style: { fill: '#bada55', stroke: 'grey' }, size: '59%', offset: '49%', thickness: 20 }
}

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    //      var message = JSON.stringify({
    //         "C4Message": {
    //             "Command": "command",
    //             "Data": JSON.stringify({
    //                 "state": "unlock"
    //             })
    //         }
    //     });

    // onDataToUi(message);
    try {
        C4.sendCommand("HandleSelect", "", false, false);
        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable("LAST_ROOM_SELECTED");
        C4.subscribeToVariable("LAST_MENU_SELECTED");
    } catch (error) {
        console.error(error);
    }
});


function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value)

        var elements = document.getElementsByClassName('smartswitchui');
        if (elements.length > 0) { // Ensure elements exist
            if (elements[0].style.display === 'none') {
                elements[0].style.display = 'block';
            }
        }
        $('#container_knob').show();
        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + JSON.stringify(jsonObject));

        if (jsonObject.hasOwnProperty("icon_description")) {
            let icon_description = JSON.parse(jsonObject.icon_description);
            const powerButton = document.getElementById("powerButton");
            const statusText = document.getElementById("statusText");
            let graybg = 0;
            if (icon_description.state === "on") {
                $('#container_knob').jqxKnob('setOptions', jqxKnobOptionOn);
                if (dimmerPercentage == 0) {
                    dimmerPercentage = 100;
                }
                if (icon_description.brightness != "") {
                    dimmerPercentage = parseInt(icon_description.brightness) / 10;
                }
                powerButton.classList.add("power-on");
                powerButton.classList.remove("power-off");
                statusText.textContent = "Power ON";
                $('#container_knob').val(dimmerPercentage);
                graybg = 255;
                isPowerOn = true;
            } else {
                $('#container_knob').jqxKnob('setOptions', jqxKnobOptionOff);
                if (icon_description.brightness != "") {
                    dimmerPercentage = parseInt(icon_description.brightness) / 10;
                }
                powerButton.classList.add("power-off");
                powerButton.classList.remove("power-on");
                statusText.textContent = "Power OFF";
                $('#container_knob').val(dimmerPercentage);
                graybg = 0;
                isPowerOn = false;
            }
            $('body').css({
                background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(${graybg},${graybg},${graybg}) 100%) center center no-repeat`
            });
        }


        // if (jsonObject.hasOwnProperty("icon_description")) {
        //     var iconDataObject = JSON.parse(jsonObject.icon_description);
        //     console.log("iconDescription apiresponse" + iconDataObject.apiresponse);
        //     if (iconDataObject.hasOwnProperty("apiresponse")) {
        //         $(".sucess_popup").text(iconDataObject.apiresponse)
        //         setTimeout(function () {
        //             $(".sucess_popup").fadeIn(500).delay(500).fadeOut(2000);
        //         }, 500);
        //     }
        // }


    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


function onSwitchSelected(button, changeType) {
    let command = button;
    let params = JSON.stringify({
        command: command,
        brightness: parseInt(dimmerPercentage) * 10,
        changeType: changeType
    });

    console.log("onSwitchSelected End" + params);
    try {
        C4.sendCommand("SetSwitchOnOff", params, false, true);
    } catch (error) {
        console.error("Error sending command:", error);
    }
}


function togglePower() {
    isPowerOn = !isPowerOn;
    if (isPowerOn) {
        $('#container_knob').jqxKnob('setOptions', jqxKnobOptionOn);
    } else {
        $('#container_knob').jqxKnob('setOptions', jqxKnobOptionOff);
    }
    switchOnOff(isPowerOn, 'state');
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

function switchOnOff(isPowerOnFlag, changeType) {
    const powerButton = document.getElementById("powerButton");
    const statusText = document.getElementById("statusText");
    let graybg = 0;
    if (isPowerOnFlag) {
        powerButton.classList.add("power-on");
        powerButton.classList.remove("power-off");
        statusText.textContent = "Power ON";
        $('#container_knob').val(dimmerPercentage);
        graybg = dimmerPercentage * 2.55;
        onSwitchSelected('on', changeType);
    } else {
        powerButton.classList.add("power-off");
        powerButton.classList.remove("power-on");
        statusText.textContent = "Power OFF";
        $('#container_knob').val(dimmerPercentage);
        graybg = 0;
        onSwitchSelected('off', changeType);
    }
    $('body').css({
        background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(${graybg},${graybg},${graybg}) 100%) center center no-repeat`
    });

}



$(function () {
    $('#container_knob').jqxKnob({
        value: 0,
        width: 350,
        height: 350,
        min: 1,
        max: 100,
        startAngle: 120,
        endAngle: 420,
        snapToStep: true,
        rotation: 'clockwise',
        labels: {
            offset: '88%',
            step: 10,
            visible: true
        }
    });
    $('#container_knob').jqxKnob('setOptions', jqxKnobOptionOn);
    var timeoutId = 0;
    $('#container_knob').on('change', function (event) {
        if (event.args.changeSource == 'propertyChange' || event.args.changeSource == 'val' || event.args.type != "mouse") { return; }
        let brightness = Math.ceil(event.args.value);
        clearTimeout(timeoutId);
        timeoutId = setTimeout(function () {
            dimmerPercentage = brightness;
            switchOnOff(isPowerOn, 'brightness');
        }, 500);
        if (isPowerOn) {
            let gray = brightness * 2.55;
            $('body').css({
                background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(${gray},${gray},${gray}) 100%) center center no-repeat`
            });
        }
    })
});
