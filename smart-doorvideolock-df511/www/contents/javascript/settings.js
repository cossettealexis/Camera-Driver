// DF511 Settings UI - Firmware Info Only

document.addEventListener('DOMContentLoaded', function () {
    initializeControl4();
    requestDeviceInfo();
});

function initializeControl4() {
    try {
        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable('LAST_ROOM_SELECTED');
        C4.subscribeToVariable('LAST_MENU_SELECTED');
    } catch (e) {
        console.log('Control4 init error', e);
    }
}

function requestDeviceInfo() {
    try {
        C4.sendCommand('GET_DEVICE_INFO', '', false, true);
    } catch (e) {
        console.error("Failed to request device info", e);
    }
}

function onDataToUi(value) {
    try {
        const jsonObject = JSON.parse(value);

        // Handle icon_description wrapper
        let obj;
        if (jsonObject.hasOwnProperty('icon_description')) {
            obj = JSON.parse(jsonObject.icon_description);
        } else {
            obj = jsonObject;
        }

        // Device Info
        if (obj.type === "device_info" && obj.success) {
            const devEl = document.getElementById('deviceVersion');
            const fwEl = document.getElementById('firmwareVersion');
            const relEl = document.getElementById('releaseDate');

            if (devEl) {
                devEl.innerText = "Device: " + (obj.device_name || "Unknown");
            }

            if (fwEl) {
                fwEl.innerText = "Firmware: " + (obj.version || "N/A");
            }

            if (relEl) {
                relEl.innerText = "Release: " + (obj.release_date || "N/A");
            }
        }

    } catch (e) {
        console.error('onDataToUi ERROR:', e);
    }
}
