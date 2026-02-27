var player;
var video_quality = 'SD';
var video_mute = 'Off';
var video_light = 'Off';
var video_siren = 'Off';
let totalBytes = 0;
let lastReportTime = Date.now();
const zoomContainer = document.getElementById('zoom-container')
const panzoom = Panzoom(zoomContainer, {
    contain: 'outside'
});

// enable mouse wheel
const parent = zoomContainer.parentElement
parent.addEventListener('wheel', panzoom.zoomWithWheel);

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    try {
        C4.sendCommand("HandleSelect", "", false, false);
        C4.subscribeToDataToUi(true);
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
});


function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value);

        var elements = document.getElementsByClassName('cameraui');
        if (elements.length > 0) { // Ensure elements exist
            if (elements[0].style.display === 'none') {
                elements[0].style.display = 'block';
            }
        }
        let jsonObject = JSON.parse(value);
        console.log('jsonObject ' + jsonObject);
        if (jsonObject.hasOwnProperty("C4Message")) {
            $('.stream-loading-main').show();
            $('#videoCanvas').hide();
            $('#stream-speed').text('');
            let dataObject = JSON.parse(jsonObject.C4Message.Data);

            if (dataObject.stream_url) {
                let stream_url = dataObject.stream_url;
                playLiveStream(stream_url);
            }
            //update video quality
            if (dataObject.video_quality) {
                video_quality = dataObject.video_quality;
                $('#dropdownMenuLink').text(dataObject.video_quality);
                $('.sd_dropdown .dropdown-item').removeClass('active');
                $('.sd_dropdown .dropdown-item.' + dataObject.video_quality + '_RES').addClass('active');
            }

            //update video mute/unmute ui
            if (dataObject.mute) {
                if (dataObject.mute == 'On') {
                    $('.audio_on').removeClass('d-none');
                    $('.audio_off').addClass('d-none');
                    video_mute = 'On';
                } else {
                    $('.audio_on').addClass('d-none');
                    $('.audio_off').removeClass('d-none');
                    video_mute = 'Off';
                }
            }
        }

        if (jsonObject.hasOwnProperty("CameraProperties")) {
            let dataObject = JSON.parse(jsonObject.CameraProperties.Data);
            console.log('CameraProperties ' + dataObject);
            if (typeof dataObject.floodlight_switch !== 'undefined') {
                if (dataObject.floodlight_switch == true) {
                    console.log('floodlight_switch on');
                    $('.light_onoff').addClass('On').removeClass('Off');
                    video_light = 'On';
                } else {
                    console.log('floodlight_switch off');
                    $('.light_onoff').addClass('Off').removeClass('On');
                    video_light = 'Off';
                }
            }
            if (typeof dataObject.siren_switch !== 'undefined' && dataObject.siren_switch != "") {
                if (dataObject.siren_switch == true) {
                    $('.siren_onoff').addClass('On').removeClass('Off');
                    video_siren = 'On';
                } else {
                    $('.siren_onoff').addClass('Off').removeClass('On');
                    video_siren = 'Off';
                }
            }
            if (typeof dataObject.ptz_control !== 'undefined' && dataObject.ptz_control != "") {
                if (dataObject.ptz_control == true) {
                    $('.ptz-control-main').show();
                } else {
                    $('.ptz-control-main').hide();
                }
            }
        }
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}

function playLiveStream(stream_url) {
    if (stream_url == '') {
        console.log('stream url is empty');
        return;
    }
    const encodedUrl = btoa(stream_url);
    const wsUrl = 'wss://tuya.slomins.com/api/ffmpeg?url=' + encodedUrl + '&quality=' + video_quality.toLowerCase();
    console.log('wsUrl ' + wsUrl);
    const canvas = document.getElementById('videoCanvas');
    player = new JSMpeg.Player(wsUrl, {
        canvas: canvas,
        autoplay: true,
        audio: true,
        loop: false,
        onVideoDecode: () => {
            const now = Date.now();
            const elapsed = now - lastReportTime;
            document.getElementById('loadingOverlay')?.remove();
            if (elapsed >= 1000) { // every second
                const kbps = (totalBytes * 8) / 1000; // kilobits per second
                const kBps = totalBytes / 1024;       // kilobytes per second
                //console.log(`Speed: ${kbps.toFixed(2)} kbps | ${kBps.toFixed(2)} kB/s`);
                // Optionally update UI
                document.getElementById('stream-speed').textContent = `${kBps.toFixed(2)} kB/s`;
                totalBytes = 0;
                lastReportTime = now;
            }
        },
        onSourceEstablished: (source) => {
            source.socket.binaryType = 'arraybuffer';
            source.socket.addEventListener('message', (event) => {
                totalBytes += event.data.byteLength;
            });
        }
    });
    if (video_mute == 'On') {
        player.volume = 1;
    } else {
        player.volume = 0;
    }
    $('#videoCanvas').show();
    setTimeout(function () {
        $('.stream-loading-main').hide();
    }, 10000);
}

function onSubscribeToDataToUiError(message) {
    console.log("Error subscribing to data to ui: " + message);
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
    $('.footer_wrap .menu_icon').on('click', function () {
        if ($(this).hasClass('full_screen')) {
            $('#videoCanvas').toggleClass('landscap-stream');
            if ($('#videoCanvas').hasClass('landscap-stream')) {
                videoCanvas.style.width = $('#zoom-container').innerHeight() + 'px';
            } else {
                videoCanvas.style.width = '100vw';
            }
        } else if ($(this).hasClass('audio_onoff')) {
            if ($(this).find('.audio_on').hasClass('d-none')) {
                $(this).find('.audio_on').removeClass('d-none');
                $(this).find('.audio_off').addClass('d-none');
                player.volume = 1;
                video_mute = 'On';
                try {
                    let params = JSON.stringify({ Value: 'On' });
                    C4.sendCommand("SetVideoMute", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            } else {
                $(this).find('.audio_on').addClass('d-none');
                $(this).find('.audio_off').removeClass('d-none');
                player.volume = 0;
                video_mute = 'Off';
                try {
                    let params = JSON.stringify({ Value: 'Off' });
                    C4.sendCommand("SetVideoMute", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            }
        } else if ($(this).hasClass('light_onoff')) {
            if ($(this).hasClass('On')) {
                $(this).removeClass('On');
                $(this).addClass('Off');
                video_light = 'Off';
                try {
                    let params = JSON.stringify({ Value: 'Off' });
                    C4.sendCommand("SetVideoLight", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            } else {
                $(this).removeClass('Off');
                $(this).addClass('On');
                video_light = 'On';
                try {
                    let params = JSON.stringify({ Value: 'On' });
                    C4.sendCommand("SetVideoLight", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            }
        } else if ($(this).hasClass('siren_onoff')) {
            if ($(this).hasClass('On')) {
                $(this).removeClass('On');
                $(this).addClass('Off');
                video_siren = 'Off';
                try {
                    let params = JSON.stringify({ Value: 'Off' });
                    C4.sendCommand("SetVideoSiren", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            } else {
                $(this).removeClass('Off');
                $(this).addClass('On');
                video_siren = 'On';
                try {
                    let params = JSON.stringify({ Value: 'On' });
                    C4.sendCommand("SetVideoSiren", params, false, true);
                } catch (error) {
                    console.error("Error C4.sendCommand:", error);
                }
            }
        }
    });

    $('.sd_dropdown .dropdown-item').on('click', function (e) {
        e.preventDefault();
        $('.sd_dropdown .dropdown-item').removeClass('active');
        if (!$(this).hasClass('active')) {
            $(this).addClass('active');
            $('#dropdownMenuLink').text($(this).text());
            if ($(this).text() == 'HD') {
                video_quality = 'HD';
            } else {
                video_quality = 'SD';
            }
            try {
                let params = JSON.stringify({ Value: video_quality });
                C4.sendCommand("SetVideoQuality", params, false, true);
            } catch (error) {
                console.error("Error C4.sendCommand:", error);
            }
        }
        $('.dropdown-toggle').dropdown('hide');
    });
});

function sendTuyaCommand(code, value) {
    let params = JSON.stringify({ code: code, value: value });
    C4.sendCommand("SetControlPtz", params, false, true);
    console.log('sendTuyaCommand code= ' + code + ' value=' + value);
}

function startPTZ(code) {
    sendTuyaCommand('ptz_control', code);
}

function stopPTZ() {
    sendTuyaCommand('ptz_stop', true);
}

function bindPTZEvents(buttonId, directionCode) {
    console.log(directionCode + ' ' + buttonId);
    const btn = document.getElementById(buttonId);
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        btn.classList.add('pressed');
        startPTZ(directionCode);
    });
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        stopPTZ();
    });
    btn.addEventListener('touchcancel', (e) => {
        e.preventDefault();
        btn.classList.remove('pressed');
        stopPTZ();
    });
}

// Direction codes: up=1, down=2, left=3, right=4
bindPTZEvents('ptz-up', '0');
bindPTZEvents('ptz-down', '4');
bindPTZEvents('ptz-left', '6');
bindPTZEvents('ptz-right', '2');