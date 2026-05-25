var isPowerOn = false;

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    try {
        C4.sendCommand("GetState", "", false, false);
        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable("LAST_ROOM_SELECTED");
        C4.subscribeToVariable("LAST_MENU_SELECTED");
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
});


function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value);

        var elements = document.getElementsByClassName('petfeederui');
        if (elements.length > 0) { // Ensure elements exist
            if (elements[0].style.display === 'none') {
                elements[0].style.display = 'block';
            }
        }
        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + jsonObject);

        if (jsonObject.hasOwnProperty("icon_description")) {
            let icon_description = JSON.parse(jsonObject.icon_description);
            if (typeof icon_description.manual_feed !== 'undefined' && icon_description.manual_feed != "") { 
                let manual_feed = icon_description.manual_feed; 
                $('#manual_feed').val(manual_feed);
            }

            if (typeof icon_description.battery_percentage !== 'undefined' && icon_description.battery_percentage > 0) { 
                changeBatteryPercentage(icon_description.battery_percentage);
            }

            if (typeof icon_description.switch !== 'undefined' && icon_description.switch == 'true') {
                $('#switchCheckChecked').prop('checked', true);
            } else if (typeof icon_description.switch !== 'undefined' && icon_description.switch == 'false') {
                $('#switchCheckChecked').prop('checked', false);
            }
        }
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}

function onSubscribeToDataToUiError(message) {
    console.log("Error subscribing to data to ui: " + message);
}

function changeBatteryPercentage(battery_percentage) {
    if (battery_percentage >= 0 && battery_percentage <= 10) {
        $('.battery-icon').attr('data-percent', 10);
    } else if (battery_percentage > 10 && battery_percentage <= 25) {
        $('.battery-icon').attr('data-percent', 25);
    } else if (battery_percentage > 25 && battery_percentage <= 50) {
        $('.battery-icon').attr('data-percent', 50);
    } else if (battery_percentage > 50 && battery_percentage <= 75) {
        $('.battery-icon').attr('data-percent', 75);
    } else if (battery_percentage > 75 && battery_percentage <= 100) {
        $('.battery-icon').attr('data-percent', 100);
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

$(document).ready(function () {
    $('#manual_feed_btn').on('click tap', function () {
        console.log('manual_feed_btn');
        let manual_feed = $('#manual_feed').val();
        if (manual_feed > 0 && manual_feed <= 10) {
            try {
                let params = JSON.stringify({
                    manual_feed: parseInt(manual_feed)
                });
                console.log('call SetManualFeed command', params);
                C4.sendCommand("SetManualFeed", params, false, true);
            } catch (error) {
                console.log(error);
            }
            $(".feed_status_msg").text('Feed Success');
            setTimeout(function () {
                $(".feed_status_msg").fadeIn(500).delay(500).fadeOut(2000);
            }, 500);
        }
    });

    $('.pet_number_btn').on('click tap', function () {
        if ($(this).hasClass('number_minus')) {
            let manual_feed = $('#manual_feed').val();
            if (manual_feed > 1) {
                $('#manual_feed').val(parseInt(manual_feed) - 1);
            }
        } else {
            let manual_feed = $('#manual_feed').val();
            if (manual_feed < 10) {
                $('#manual_feed').val(parseInt(manual_feed) + 1);
            }
        }
    });

    $('#switchCheckChecked').on('change', function () {
        if ($(this).is(':checked')) {
            console.log('switchCheckChecked');
            try {
                let params = JSON.stringify({
                    switch: 1
                });
                console.log('call SetSwitch command', params);
                C4.sendCommand("SetSwitch", params, false, true);
            } catch (error) {
                console.log(error);
            }
        } else {
            try {
                let params = JSON.stringify({
                    switch: 0
                });
                console.log('call SetSwitch command', params);
                C4.sendCommand("SetSwitch", params, false, true);
            } catch (error) {
                console.log(error);
            }
        }
    });
});
