
const smartLockBtn = document.querySelector('.smart_lock_btn');
const lockStatus = smartLockBtn.querySelector('.lock_status');
let unlocking = false;

document.addEventListener("DOMContentLoaded", function () {
    // console.log('DOMContentLoaded');
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
        console.error("Error parsing JSON:", error);
    }
});


function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value)

        var elements = document.getElementsByClassName('smartlockui');
        if (elements.length > 0) { // Ensure elements exist
            if (elements[0].style.display === 'none') {
                elements[0].style.display = 'block';
            }
        }

        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + jsonObject)

        // if (jsonObject.hasOwnProperty("icon")) {
        //     console.log('onDataToUi ' + jsonObject.icon)
        //     //$('.circle-loader').show();
        //     if (jsonObject.icon === "lock") {
        //         smartLockBtn.classList.add('lock');
        //         lockStatus.textContent = 'Hold to unlock';
        //     } else {
        //         smartLockBtn.classList.remove('lock');
        //         lockStatus.textContent = 'Hold to lock';
        //     }
        //     //$('.circle-loader').hide();
        // }


        if (jsonObject.hasOwnProperty("icon_description")) {
            var iconDataObject = JSON.parse(jsonObject.icon_description);
            console.log("iconDescription apiresponse" + iconDataObject.apiresponse);
            if (iconDataObject.hasOwnProperty("apiresponse")) {
                $(".sucess_popup").text(iconDataObject.apiresponse)
                setTimeout(function () {
                    $(".sucess_popup").fadeIn(500).delay(500).fadeOut(2000);
                }, 500);
            }
             if (iconDataObject.hasOwnProperty("state")) {
                console.log("iconDescription state" + iconDataObject.state);
                if (iconDataObject.state === "lock") {
                    smartLockBtn.classList.add('lock');
                    lockStatus.textContent = 'Hold to unlock';
                } else {
                    smartLockBtn.classList.remove('lock');
                    lockStatus.textContent = 'Hold to lock';
                }
                //$('.circle-loader').hide();
            }
        }


    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}

/*lock button events */
smartLockBtn.addEventListener('mousedown', (event) => {
    console.log('mousedown');
    beginUnlocking();
});
smartLockBtn.addEventListener('touchstart', (event) => {
    console.log('touchstart');
    beginUnlocking();
});

window.addEventListener('mouseup', (event) => {
    console.log('mouseup');
    if (unlocking) {
        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }
    unlocking = false;
});

window.addEventListener('touchend', (event) => {
    console.log('touchend');
    if (unlocking) {
        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }
    unlocking = false;
});

var timeoutId = 0;
function beginUnlocking() {
    let elements = $('.smart_lock_btn');
    if (elements.hasClass('lock')) {
        $('.circle-shade circle').addClass('unlock').removeClass('lock');
    } else {
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }
    $('.circle-shade').show();
    let transitionTime = 2000;
    let waitTime = transitionTime;
    unlocking = true;
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
        if (unlocking) {
            if (!elements.hasClass('lock')) {
                smartLockBtn.classList.add('lock');
                lockStatus.textContent = 'Hold to unlock';
                onLockUnlockSelected('lock');
            } else {
                smartLockBtn.classList.remove('lock');
                lockStatus.textContent = 'Hold to lock';
                onLockUnlockSelected('unlock');
            }
        }
        $('.circle-shade').hide();
        $('.circle-shade circle').addClass('lock').removeClass('unlock');
    }, waitTime)
}
/*lock button events end */
 

function onLockUnlockSelected(button) {
    console.log('onLockUnlockSelected');
    let command = button;

    let params = JSON.stringify({
        command: command
    });

    console.log("onLockUnlockSelected End" + params);
    try {
        C4.sendCommand("SetLockUnlock", params, false, true);
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

$(document).ready(function(){
    $('body').disableSelection();
     
 });
$.fn.extend({
    disableSelection: function() {
        this.each(function() {
            this.onselectstart = function() {
                return false;
            };
            this.unselectable = "on";
            $(this).css('-moz-user-select', 'none');
            $(this).css('-webkit-user-select', 'none');
        });
    }
});