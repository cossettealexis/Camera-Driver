var mode = "off";
var heat_temp_set = 0;
var cool_temp_set = 0;
var temp_current = 0;
var humidity_current = 0;
var temp_set = 0;
var heat_temp_set_f = 0;
var cool_temp_set_f = 0;
var temp_current_f = 0;
var temp_set_f = 0;
var temp_unit_convert = 'f';
var fan_mode = 0;
var switch_emer_enabled = 0;
var switch_program_enabled = 0;
var modeAct = "off_mode";
var relay_status = 0;
var delay_time = 0;
const modeMap = {
    "auto": "auto_mode",
    "heat": "heat_mode",
    "cold": "cool_mode",
    "off": "off_mode",
    "emergency_heat": "emergency_heat_mode"
};
const oModeMap = {
    "auto_mode": "auto",
    "heat_mode": "heat",
    "cool_mode": "cold",
    "off_mode": "off",
    "emergency_heat": "emergency_heat_mode"
};

var minTempC = 5;
var maxTempC = 32.0;

var minTempF = 41;
var maxTempF = 90;
var browserDebug = false;
var timerStart = false;
var countdownInterval = null;
//onDataToUi(JSON.stringify({"cool_temp_set":24,"cool_temp_set_f":75,"fan_mode":"auto","heat_temp_set":13.5,"heat_temp_set_f":56,"humidity_current":32,"mode":"auto","switch_program_enabled":true,"temp_current":22.5,"temp_current_f":73,"temp_set":14.5,"temp_set_f":58,"temp_unit_convert":"f"}));
//hideloader();

document.addEventListener("DOMContentLoaded", function () {
    console.log('DOMContentLoaded');
    // const message = JSON.stringify({
    //     "C4Message": {
    //         "Command": "UpdateTemperature",
    //         "Data": JSON.stringify({
    //             "cool_temp_set": 24,
    //             "cool_temp_set_f": 75,

    //             "heat_temp_set": 18.5,
    //             "heat_temp_set_f": 65,

    //             "humidity_current": 21,
    //             "mode": "auto",

    //             "switch_program_enabled": true,
    //             "temp_current": 22.5,
    //             "temp_current_f": 73,

    //             "temp_set": 20.5,
    //             "temp_set_f": 69,

    //             "temp_unit_convert": "c",

    //             "fan_mode": "auto"
    //         })
    //     }
    // });

    // //Call the function with the JSON string
    //onDataToUi(message);
    // C4.sendCommand("GetTemperature", "", false, false);
    try {
        C4.sendCommand("HandleSelect", "", false, false);
        C4.subscribeToDataToUi(false);
        C4.subscribeToVariable("LAST_ROOM_SELECTED");
        C4.subscribeToVariable("LAST_MENU_SELECTED");
    } catch (error) {
        console.error("Error sending command:", error);
    }

});

function onDataToUi(value) {
    try {
        console.log('onDataToUi ' + value)

        var elements = document.getElementsByClassName('thermostatUI');
        if (elements.length > 0) { // Ensure elements exist
            if (elements[0].style.display === 'none') {
                elements[0].style.display = 'block';
            }
        }
        //document.getElementById("loading").style.display = "none";
        let dataObject = {};
        let jsonObject = JSON.parse(value);
    
        console.log('value icon_description 1234: ' + jsonObject.hasOwnProperty("icon_description"));
        if (jsonObject.hasOwnProperty("icon_description")) {
            console.log("hi 1");
            console.log("icon_description", JSON.stringify(jsonObject.icon_description));
            dataObject = JSON.parse(jsonObject.icon_description);
            if(dataObject && dataObject.command == "UpdateTemperature"){
                dataObject = JSON.parse(dataObject.data);
            } 
            
        } 

        if (jsonObject.hasOwnProperty("state") && jsonObject.state.icon_description) {
            dataObject = JSON.parse(jsonObject.state.icon_description);
            if(dataObject.C4Message && dataObject.C4Message.command == "UpdateTemperature"){
                dataObject = JSON.parse(dataObject.C4Message.Data);
            } 
            console.log("iconDataObject", JSON.parse(jsonObject.state.icon_description));
        }
        if (browserDebug && dataObject) {
            dataObject = JSON.parse(value); //for browser testing
            if(dataObject.C4Message && dataObject.C4Message.command == "UpdateTemperature"){
                dataObject = JSON.parse(dataObject.C4Message.Data);
            } else if(dataObject.C4Message && dataObject.C4Message.command == "UpdateTemperatureCorrection"){   
                dataObject = JSON.parse(dataObject.C4Message.Data);
            }      
        } else {
            if(dataObject.C4Message && dataObject.C4Message.command == "UpdateTemperature"){
                dataObject = JSON.parse(dataObject.C4Message.Data);
            } else if(dataObject.C4Message && dataObject.C4Message.command == "UpdateTemperatureCorrection"){
                dataObject = JSON.parse(dataObject.C4Message.Data);
            }
        }
        if (dataObject.mode) {
            mode = dataObject.mode;
            console.log("lblMode1 : " + mode);
        }
        
        if (dataObject.temp_unit_convert) {
            temp_unit_convert = dataObject.temp_unit_convert;
            console.log("lblTemperatureUnitConvert: " + temp_unit_convert);
        } 
        if (dataObject.heat_temp_set) {
            heat_temp_set = dataObject.heat_temp_set;
            console.log("lblHeatTemperature : " + heat_temp_set);
        }
        if (dataObject.cool_temp_set) {
            cool_temp_set = dataObject.cool_temp_set;
            console.log("lblCoolTemperature : " + cool_temp_set);
        }
        if (dataObject.temp_current) {
            temp_current = dataObject.temp_current;
            console.log("lblCurrentTemperature : " + temp_current);
        }

        if (dataObject.temp_set) {
            temp_set = dataObject.temp_set;
            console.log("lblTemperatureSet: " + temp_set);
        }
        if (dataObject.heat_temp_set_f) {
            heat_temp_set_f = dataObject.heat_temp_set_f;
            console.log("lblHeatTemperatureF: " + heat_temp_set_f);
        }
        if (dataObject.cool_temp_set_f) {
            cool_temp_set_f = dataObject.cool_temp_set_f;
            console.log("lblCoolTemperatureF: " + cool_temp_set_f);
        }

        if (dataObject.temp_current_f) {
            temp_current_f = dataObject.temp_current_f;
            console.log("lblCurrentTemperatureF: " + temp_current_f);
        }

        if (dataObject.temp_set_f) {
            temp_set_f = dataObject.temp_set_f;
            console.log("lblTemperatureSetF: " + temp_set_f);
        }
            
        if (dataObject.humidity_current) {
            humidity_current = dataObject.humidity_current;
            console.log("lblCurrentHumidity: " + humidity_current);
        }
      
        if (dataObject.fan_mode) {
            fan_mode = dataObject.fan_mode;
            console.log("lblFanMode: " + fan_mode);
        }
        if (dataObject.relay_status !== undefined) {
            relay_status = dataObject.relay_status;
            console.log("lblRelayStatus: " + relay_status);
        }
         if (dataObject.delay_time) {
            delay_time = dataObject.delay_time;
            console.log("lblDelayTime: " + delay_time);
        }
        if(dataObject.temp_correction){  
            temp_correction = dataObject.temp_correction;
            console.log("lblTempCorrection: " + temp_correction);
            document.getElementById("selectedValue").innerText = temp_correction;
        }
        //switch_emer_enabled = dataObject.switch_emer_enabled;
        //switch_program_enabled = dataObject.switch_program_enabled;   
        setTemperatureMode(mode);
        
        if (dataObject.temp_unit_convert) {
            //Temperature Modes Start
            var tempModeId = temp_unit_convert == "f" ? "fahrenheit_mode" : "celsius_mode";
            document.querySelectorAll('.tempmodes ul li').forEach(li => {
                li.classList.remove('active_mode');
            });

            document.querySelector(`.tempmodes ul li button[data-mode="${tempModeId}"]`)
                ?.closest('li')
                ?.classList.add('active_mode');

            document.querySelector('.temp_unit').textContent = temp_unit_convert == "f" ? "Fahrenheit" : "Celsius";

            if (tempModeId == 'fahrenheit_mode') {
                setSliderMinMax('f');

            } else {
                setSliderMinMax('c');
            }
            //Temperature Modes End
        }
        
        if (dataObject.mode) {
            //Hvac Mode Start
            modeAct = mode + "_mode";
            console.log(modeAct);

            var modeid = mode === "cold" ? "cool_mode" : mode + "_mode";
            document.querySelectorAll('.hvacmodes ul li').forEach(li => {
                li.classList.remove('active_mode');
            });


            document.querySelector(`.hvacmodes ul li button[data-mode="${modeid}"]`)
                ?.closest('li')
                ?.classList.add('active_mode');

            document.querySelector('.mode_popup_btn[data-id="1"]').setAttribute('data-activemode', modeid);

            document.querySelector('.mode_popup_btn[data-id="1"] .mode_label').textContent = mode;

            document.querySelector('.thermostat_wrap').setAttribute('data-tempmode', modeid);
            //Hvac Mode End
        }
        
        if (dataObject.fan_mode) {
            //FanMode Mode Start
            var fanmodeid = fan_mode === "auto" ? "fan_auto_mode" : "fan_on_mode";
            document.querySelectorAll('.fanmodes ul li').forEach(li => {
                li.classList.remove('active_mode');
            });

            document.querySelector(`.fanmodes ul li button[data-mode="${fanmodeid}"]`)
                ?.closest('li')
                ?.classList.add('active_mode');

            document.querySelector('.mode_popup_btn[data-id="2"]').setAttribute('data-activemode', fanmodeid);

            document.querySelector('.mode_popup_btn[data-id="2"] .mode_label').textContent = fan_mode;

            //FanMode Mode End
        }
        
        if (dataObject.temp_current) {
            document.querySelector('#current_temp').innerText = temp_current;
        }
        
        if (dataObject.humidity_current) {
            document.querySelector('.humidity span').innerText = humidity_current + '%';
        }
        
        if (dataObject.temp_unit_convert && dataObject.temp_unit_convert == "f" && dataObject.temp_current_f) {
            document.querySelector('#current_temp').innerText = dataObject.temp_current_f;
        }
        
        if (relay_status == 1025) {
            console.log("Starting timer with relay_status: " + relay_status);
            document.querySelector('#lblDelayTime').style.display = 'block';
            if (dataObject.delay_time >= 1 && !timerStart) {
                console.log("Starting timer with delay_time: " + dataObject.delay_time);
                timerStart = true;
                // delay_time = dataObject.delay_time;

                // // Convert seconds to MM:SS
                // let minutes = Math.floor(delay_time / 60);
                // let seconds = delay_time % 60;

                // // Add leading zero
                // seconds = seconds.toString().padStart(2, '0');

                // let formattedTime = minutes + ":" + seconds;

                // document.querySelector('#lblDelayTime').style.display = 'block';
                // document.querySelector('#lblDelayTime').innerText = "Start In : " + formattedTime;

                let delay_time = dataObject.delay_time - 3;
                document.querySelector('#lblDelayTime').style.display = 'block';

                // clear old timer
                clearInterval(countdownInterval);

                countdownInterval = setInterval(() => {

                    // Convert seconds to MM:SS
                    let minutes = Math.floor(delay_time / 60);
                    let seconds = delay_time % 60;

                    // leading zero
                    seconds = seconds.toString().padStart(2, '0');

                    let formattedTime =
                        minutes + ":" + seconds;

                    document.querySelector('#lblDelayTime')
                        .innerText =
                        "Start In : " + formattedTime;

                    delay_time--;

                    // timer completed
                    if (delay_time < 0) {

                        clearInterval(countdownInterval);

                        timerStart = false;

                        document.querySelector('#lblDelayTime')
                            .style.display = 'none';
                    }

                }, 1000);
           }
        }  
        else {
            timerStart = false;
            document.querySelector('#lblDelayTime').style.display = 'none';
        }
        
        if (relay_status == 0 || relay_status == 1025) {
            document.querySelector('#lblRelayStatus').style.display = 'none';
            document.querySelector('#current_temp').style.color = '#fff';
        }  else {
            document.querySelector('#lblRelayStatus').style.display = 'block';
            if (mode === "heat" || mode === "emergency_heat") {
                if(heat_temp_set > temp_current){
                    document.querySelector('#lblRelayStatus').innerText = "Heating";
                    document.querySelector('#lblRelayStatus').style.color = '#E38683';
                    document.querySelector('#current_temp').style.color = '#E38683';
                }
            }
             
            if (mode === "cold") {
                if(cool_temp_set < temp_current){ 
                    document.querySelector('#lblRelayStatus').innerText = "Cooling";
                    document.querySelector('#lblRelayStatus').style.color = '#8cbcfb';  
                    document.querySelector('#current_temp').style.color = '#8cbcfb';
                }
            }
            
            if (mode === "auto") {
                if(heat_temp_set > temp_current){
                    document.querySelector('#lblRelayStatus').innerText = "Heating";
                    document.querySelector('#lblRelayStatus').style.color = '#E38683';
                    document.querySelector('#current_temp').style.color = '#E38683';       
                }

                if(cool_temp_set < temp_current){ 
                    document.querySelector('#lblRelayStatus').innerText = "Cooling";
                    document.querySelector('#lblRelayStatus').style.color = '#8cbcfb';  
                    document.querySelector('#current_temp').style.color = '#8cbcfb';
                }
            }
        }
    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


$(document).ready(function () {
    $('.temperature>span:not(.dotted_line)').on('click', function () {
        $(".temperature span").removeClass("selected_mode");
        $(this).addClass('selected_mode');
    });

    $("#increase-temp").click(function () {
        var heat_temperature = parseFloat($(".temperature .heat_temp").text());
        var cool_temperature = parseFloat($(".temperature .cool_temp").text());
        var step = (temp_unit_convert === "c") ? 0.5 : 1; // Set step based on unit
        var tempgap = (temp_unit_convert === "c") ? 1.5 : 3;
        console.log('increase ' + modeAct)

        if (modeAct === "heat_mode" || modeAct === "emergency_heat_mode") {
            heat_temperature += step;
            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(heat_temperature), maxTempC - 2) : Math.min(heat_temperature, maxTempF - 4));
        } else if (modeAct === "cool_mode" || modeAct === "cold_mode") {
            cool_temperature += step;
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(cool_temperature), maxTempC) : Math.min(cool_temperature, maxTempF));
        } else if (modeAct === "auto_mode") {
            var selectClass = $('.temperature .selected_mode').attr('class').split(' ')[0];
            if (selectClass === "heat_temp") {
                heat_temperature += step;
                if ((cool_temperature - heat_temperature) <= tempgap) {
                    cool_temperature += step; // Maintain 3-degree difference
                }
            }
            if (selectClass === "cool_temp") {
                cool_temperature += step;
                if ((cool_temperature - heat_temperature) <= tempgap) {
                    heat_temperature += step; // Maintain 3-degree difference
                }
            }

            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(heat_temperature), maxTempC - 2) : Math.min(heat_temperature, maxTempF - 4));
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(cool_temperature), maxTempC) : Math.min(cool_temperature, maxTempF));

        }
        setTempOnSlider({ heat_temp: heat_temperature, cool_temp: cool_temperature });
        setTemperatureVar(heat_temperature, cool_temperature);
    });

    $("#decrease-temp").click(function () {
        var heat_temperature = parseFloat($(".temperature .heat_temp").text());
        var cool_temperature = parseFloat($(".temperature .cool_temp").text());
        var step = (temp_unit_convert === "c") ? 0.5 : 1; // Set step based on unit
        var tempgap = (temp_unit_convert === "c") ? 1.5 : 3;

        if (modeAct === "heat_mode" || modeAct === "emergency_heat_mode") {
            heat_temperature -= step;
            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(heat_temperature), minTempC) : Math.max(heat_temperature, minTempF));
        } else if (modeAct === "cool_mode" || modeAct === "cold_mode") {
            cool_temperature -= step;
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(cool_temperature), minTempC + 2) : Math.max(cool_temperature, minTempF + 4));
        } else if (modeAct === "auto_mode") {
            var selectClass = $('.temperature .selected_mode').attr('class').split(' ')[0];
            if (selectClass === "heat_temp") {
                heat_temperature -= step;
                if ((cool_temperature - heat_temperature) <= tempgap) {
                    cool_temperature -= step; // Maintain 3-degree difference
                }
            }
            if (selectClass === "cool_temp") {
                cool_temperature -= step;
                if ((cool_temperature - heat_temperature) <= tempgap) {
                    heat_temperature -= step; // Maintain 3-degree difference
                }
            }
            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(heat_temperature), minTempC) : Math.max(heat_temperature, minTempF));
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(cool_temperature), minTempC + 2) : Math.max(cool_temperature, minTempF + 4));
        }
        setTempOnSlider({ heat_temp: heat_temperature, cool_temp: cool_temperature });
        setTemperatureVar(heat_temperature, cool_temperature);
    });


    let btnId;
    $('.mode_popup_btn').on('click', function (e) {
        e.stopPropagation();
        e.preventDefault();
        btnId = $(this).data('id');
        //All modes dropdown
        if (btnId == 1) {
            $('.all_mode_items').removeClass('close_popup').addClass('open_popup');
            $('.overlay').css('display', 'block');
        }
        //Fan dropdown
        if (btnId == 2) {
            $('.fan_mode_items').removeClass('close_popup').addClass('open_popup');
            $('.overlay').css('display', 'block');
        }
        //Off
        if (btnId == 3) {
            $('.thermostat_wrap').attr('data-tempmode', 'off_mode');
        }
    });

    //Mode selection functionality
    $('.mode_items ul li button').on('click', function (e) {
        let activeMode = $(this).data('mode');
        //let btnId = $(this).closest('.mode_wrap').find('.mode_popup_btn').data('id'); 
        if (btnId == 1) {
            $('.mode_popup_btn[data-id="1"]').attr('data-activemode', activeMode);
            $('.mode_popup_btn[data-id="1"] .mode_label').text($(this).find('.btn_lbl').text());
            $('.thermostat_wrap').attr('data-tempmode', activeMode);
            modeAct = activeMode;
            if (!$('.hvacmodes').closest('li').hasClass('active_mode')) {
                $('.hvacmodes ul li').removeClass('active_mode');
                $(this).closest('li').addClass('active_mode');
            }
        }
        if (btnId == 2) {
            $('.mode_popup_btn[data-id="2"]').attr('data-activemode', activeMode);
            $('.mode_popup_btn[data-id="2"] .mode_label').text($(this).find('.btn_lbl').text());
            fanmodeAct = activeMode;
            if (!$('.fanmodes').closest('li').hasClass('active_mode')) {
                $('.fanmodes ul li').removeClass('active_mode');
                $(this).closest('li').addClass('active_mode');
            }
        }
        if (btnId == 0) {
            if (!$('.tempmodes').closest('li').hasClass('active_mode')) {
                $('.tempmodes ul li').removeClass('active_mode');
                $(this).closest('li').addClass('active_mode');
            }
        }

        $('.mode_popup_wrap').addClass('close_popup').removeClass('open_popup');
        $('.overlay').css('display', 'none');

        if (btnId == 0) {
            if (activeMode == 'fahrenheit_mode') {
                $('.temp_unit').text('Fahrenheit');
                temp_unit_convert = 'f';
                setSliderMinMax('f');

            } else {
                $('.temp_unit').text('Celsius');
                temp_unit_convert = 'c';
                setSliderMinMax('c');
            }
        }

        if (btnId == 1) {
            mode = oModeMap[activeMode]
            console.log('mode ' + mode)
            if (mode == "auto") {
                cool_temp_set_f = temp_current_f + 3;
                heat_temp_set_f = temp_current_f - 5;
                console.log('cool_temp_set_f ' + cool_temp_set_f)
                console.log('heat_temp_set_f ' + heat_temp_set_f)

                cool_temp_set = temp_current + 2.5;
                heat_temp_set = temp_current - 2;
                console.log('cool_temp_set ' + cool_temp_set)
                console.log('heat_temp_set ' + heat_temp_set)
            }
            console.log('cool_temp_set_f', cool_temp_set_f);
            console.log('heat_temp_set_f', heat_temp_set_f);
            console.log('cool_temp_set', cool_temp_set);
            console.log('heat_temp_set', heat_temp_set);
            setTemperatureMode(mode);
            //document.getElementById("loading").style.display = "block";
            updateTemperatureInTuyaApi();
        } else if (btnId == 2) {
            if (fanmodeAct == "fan_auto_mode") {
                fan_mode = "auto";
            } else {
                fan_mode = "on";
            }

            let params = JSON.stringify({
                fanMode: fan_mode,
                command: "fanmode"
            });

            console.log("SetFanMode " + params)
            try {
                C4.sendCommand("SetFanMode", params, false, true);
            } catch (error) {
                console.log(error);
            }
        } else if (btnId == 0) {

            let params = JSON.stringify({
                tempUnitConvert: temp_unit_convert,
                command: "tempUnitConvert"
            });
            try {
                if (browserDebug) {
                    onDataToUi(JSON.stringify({ "cool_temp_set": cool_temp_set, "cool_temp_set_f": cool_temp_set_f, "fan_mode": "auto", "heat_temp_set": heat_temp_set, "heat_temp_set_f": heat_temp_set_f, "humidity_current": 32, "mode": mode, "switch_program_enabled": true, "temp_current": 22.5, "temp_current_f": 73, "temp_set": temp_set, "temp_set_f": temp_set_f, "temp_unit_convert": temp_unit_convert }));
                } else {
                    C4.sendCommand("SetTempConvert", params, false, true);
                }
            } catch (error) {
                console.log(error);
            }
        }
    });

    //Close popup functionality
    $('.cancel_btn_wrap button').on('click', function () {
        $(this).parent().parent().addClass('close_popup').removeClass('open_popup');
        $('.overlay').css('display', 'none');
    });

    $('.temp_scale_btn_blk .temp_scale_btn').on('click', function () {
        //alert('1111');
        $(this).closest('.temp_scale_blk').find('.temp_scale_items').removeClass('close_popup').addClass('open_popup');
        $('.overlay').css('display', 'block');
        btnId = 0;
    });

    $('.mode_popup_setting_btn').click(function () {
      $('#mainPage').css('display', 'none');
      $('.TempCorrectionScreen').css('display', 'block');
    })
});

function setTemperatureMode(mode) {
    if (mode === "heat" || mode === "emergency_heat") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set_f;
            heatSlider.value = heat_temp_set_f;
        } else {
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set;
            heatSlider.value = heat_temp_set;
        }
    }
    else if (mode === "cold" || mode === "cool") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set_f;
            coolSlider.value = cool_temp_set_f;
        } else {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set;
            coolSlider.value = cool_temp_set;
        }
    }
    else if (mode === "auto") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set_f;
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set_f;
            autoSlider.low = heat_temp_set_f;
            autoSlider.high = cool_temp_set_f;
        } else {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set;
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set;
            autoSlider.low = heat_temp_set;
            autoSlider.high = cool_temp_set;
        }
    }

    let modeCopy = 'off_mode';
    if (mode === "heat" || mode === "emergency_heat") {
        modeCopy = 'heat_mode';
    } else if (mode === "cold" || mode === "cool") {
        modeCopy = 'cool_mode';
    } else if (mode === "auto") {
        modeCopy = 'auto_mode';
    }
    enableSliderByMode(modeCopy);
}

function setTemperatureVar(heatTemp, coolTemp) {
    console.log('setTemperatureVar ' + " heatTemp " + heatTemp + " coolTemp " + coolTemp);
    if (mode == "heat" || mode == "emergency_heat") {
        if (temp_unit_convert == 'f') {
            heat_temp_set_f = heatTemp;
        } else {
            heat_temp_set = heatTemp;
        }
    }
    else if (mode == "cold" || mode == "cool") {
        if (temp_unit_convert == 'f') {
            cool_temp_set_f = coolTemp;
        } else {
            cool_temp_set = coolTemp;
        }
    }
    else if (mode === "off") {
        if (temp_unit_convert == 'f') {
            temp_set_f = temp;
        } else {
            temp_set = temp;
        }
    }
    else if (mode === "auto") {
        if (temp_unit_convert == 'f') {
            cool_temp_set_f = coolTemp;
            heat_temp_set_f = heatTemp;
        } else {
            cool_temp_set = coolTemp;
            heat_temp_set = heatTemp;
        }
    }
    debounceUpdateTemperature()
}

function updateTemperatureInTuyaApi() {
    let params = JSON.stringify({
        currnetTemp: temp_set * 100,
        coolTemp: cool_temp_set * 100,
        heatTemp: heat_temp_set * 100,
        currnetTempF: temp_set_f * 100,
        coolTempF: cool_temp_set_f * 100,
        heatTempF: heat_temp_set_f * 100,
        mode: mode,
        tempUnitConvert: temp_unit_convert
    });
    console.log('SetTemperature ' + params);
    try {
        if (browserDebug) {
            onDataToUi(JSON.stringify({ "cool_temp_set": cool_temp_set, "cool_temp_set_f": cool_temp_set_f, "fan_mode": "auto", "heat_temp_set": heat_temp_set, "heat_temp_set_f": heat_temp_set_f, "humidity_current": 32, "mode": mode, "switch_program_enabled": true, "temp_current": 22.5, "temp_current_f": 73, "temp_set": temp_set, "temp_set_f": temp_set_f, "temp_unit_convert": temp_unit_convert }));
        } else {
            C4.sendCommand("SetTemperature", params, false, true);
        }
    } catch (error) {
        console.log(error);
    }
    //hideloader();
}

// function hideloader() {
//     document.getElementById("loading").style.display = "block";
//     // Hide the loader after 3 seconds
//     setTimeout(function () {
//         document.getElementById("loading").style.display = "none";
//     }, 3000);
// }

let updateTimeout;
function debounceUpdateTemperature() {
    console.log('debounceUpdateTemperature');
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(function () {
        updateTemperatureInTuyaApi();
    }, 1000); // Calls API 500ms after last click
}

function formatTemperature(value) {
    return (value % 1 === 0) ? value.toFixed(0) : value.toFixed(1);
}

function setTemperatureCorrection(value) {
    let params = JSON.stringify({
       temp_correction : value
    });
    console.log('setTemperatureCorrection ' + params);
    try {
        C4.sendCommand("setTemperatureCorrection", params, false, true);
    } catch (error) {
        console.log(error);
    }
}