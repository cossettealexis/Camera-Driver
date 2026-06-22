
var isPowerOn = false;

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
    C4.sendCommand("HandleSelect", "", false, false);
    C4.subscribeToDataToUi(false);
    C4.subscribeToVariable("LAST_ROOM_SELECTED");
    C4.subscribeToVariable("LAST_MENU_SELECTED");
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

        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + jsonObject)

        const powerButton = document.getElementById("powerButton");
        const statusText = document.getElementById("statusText");

        if (jsonObject.hasOwnProperty("icon")) {
            console.log('onDataToUi ' + jsonObject.icon)
            if (jsonObject.icon === "on") {
                powerButton.classList.add("power-on");
                powerButton.classList.remove("power-off");
                statusText.textContent = "Power ON";
                isPowerOn = true;
                $('body').css({
                    background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(255,255,255) 100%) center center no-repeat`
                });
            } else {
                powerButton.classList.add("power-off");
                powerButton.classList.remove("power-on");
                statusText.textContent = "Power OFF";
                isPowerOn = false;
                $('body').css({
                    background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(0,0,0) 100%) center center no-repeat`
                });
            }
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


function onSwitchSelected(button) {
    console.log('onSwitchSelected');
    let command = button;

    let params = JSON.stringify({
        command: command
    });

    console.log("onSwitchSelected End" + params)
    C4.sendCommand("SetSwitchOnOff", params, false, true);
}


function togglePower() {
    isPowerOn = !isPowerOn;
    const powerButton = document.getElementById("powerButton");
    const statusText = document.getElementById("statusText");

    if (isPowerOn) {
        powerButton.classList.add("power-on");
        powerButton.classList.remove("power-off");
        statusText.textContent = "Power ON";
        $('body').css({
            background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(255,255,255) 100%) center center no-repeat`
        });
        onSwitchSelected('on');
    } else {
        powerButton.classList.add("power-off");
        powerButton.classList.remove("power-on");
        statusText.textContent = "Power OFF";
        $('body').css({
            background: `#000 radial-gradient(ellipse at center, #8c8f95 0%, rgb(0,0,0) 100%) center center no-repeat`
        });
        onSwitchSelected('off');
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

