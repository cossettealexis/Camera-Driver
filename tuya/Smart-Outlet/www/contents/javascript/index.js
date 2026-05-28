
var isPowerOn = false;

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    C4.sendCommand("HandleSelect", "", false, false);
    C4.subscribeToDataToUi(false);
});


function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value)
        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + jsonObject)

        if (jsonObject.hasOwnProperty("icon_description")) {
            let icon_description = JSON.parse(jsonObject.icon_description);
            console.log('icon_description ' + icon_description);
            if (typeof icon_description.state1 !== 'undefined' && icon_description.state1 != "") {
                setSwitchState(1, icon_description.state1 == 'on' ? 'on' : 'off');
            }
            if (typeof icon_description.state2 !== 'undefined' && icon_description.state2 != "") {
                setSwitchState(2, icon_description.state2 == 'on' ? 'on' : 'off');
            }
        }
        setTimeout(() => {
            var elements = document.getElementsByClassName('smartoutletui');
            if (elements.length > 0) { // Ensure elements exist
                for (var i = 0; i < elements.length; i++) {
                    if (elements[i].style.display === 'none') {
                        elements[i].style.display = 'block';
                    }
                }
            }
        }, 1000);
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


function sendCommandToControl4(switchId, state) {

    let params = JSON.stringify({
        state: state,
        switch_id: switchId
    });
    console.log("sendCommandToControl4 End" + params);
    try {
        C4.sendCommand("SetSwitchOnOff", params, false, true);
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


function toggleSwitch(switchId) {
    const switchElement = document.getElementById('switch' + switchId);

    const isOn = switchElement.classList.contains('on');

    if (isOn) {
        switchElement.classList.remove('on');
        switchElement.classList.add('off');
        switchElement.innerText = "Power OFF"
        // Send OFF command to Control4
        sendCommandToControl4(switchId, 'off');
    } else {
        switchElement.classList.remove('off');
        switchElement.classList.add('on');
        switchElement.innerText = "Power ON"
        // Send ON command to Control4
        sendCommandToControl4(switchId, 'on');
    }
    onoffLightIndicator();
}

function onoffLightIndicator() {
    const switchElement1 = document.getElementById('switch1');
    const switchElement2 = document.getElementById('switch2');
    const lightIndicator1 = document.getElementById('light-indicator1');
    const lightIndicator2 = document.getElementById('light-indicator2');

    lightIndicator1.classList.remove('on');
    lightIndicator2.classList.remove('on');

    if (switchElement1.classList.contains('on')) {
        lightIndicator1.classList.add('on');
    }
    if (switchElement2.classList.contains('on')) {
        lightIndicator2.classList.add('on');
    }
}

// Optional state sync
function setSwitchState(switchId, state) {
    console.log('setSwitchState', switchId, state);
    const switchElement = document.getElementById('switch' + switchId);

    if (state === 'on') {
        switchElement.classList.add('on');
        switchElement.classList.remove('off');
        switchElement.innerText = "Power ON"
    } else {
        switchElement.classList.remove('on');
        switchElement.classList.add('off');
         switchElement.innerText = "Power OFF"
    }
    onoffLightIndicator();
}
