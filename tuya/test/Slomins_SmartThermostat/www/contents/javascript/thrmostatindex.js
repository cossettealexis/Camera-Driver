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
var temp_unit_convert = 0;
var fan_mode = 0;
var switch_emer_enabled = 0;
var switch_program_enabled = 0;
var modeAct = "off_mode";
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

    //             "temp_unit_convert": "f",

    //             "fan_mode": "auto"
    //         })
    //     }
    // });

    // //Call the function with the JSON string
    // onDataToUi(message);
    // C4.sendCommand("GetTemperature", "", false, false);
    C4.sendCommand("HandleSelect", "", false, false);
    C4.subscribeToDataToUi(true);
    C4.subscribeToVariable("LAST_ROOM_SELECTED");
    C4.subscribeToVariable("LAST_MENU_SELECTED");
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
        
        let jsonObject = JSON.parse(value);

        let dataObject = JSON.parse(jsonObject.C4Message.Data);

        mode = dataObject.mode;
        heat_temp_set = dataObject.heat_temp_set;
        cool_temp_set = dataObject.cool_temp_set;
        temp_current = dataObject.temp_current;
        humidity_current = dataObject.humidity_current;
        temp_set = dataObject.temp_set;
        heat_temp_set_f = dataObject.heat_temp_set_f;
        cool_temp_set_f = dataObject.cool_temp_set_f;
        temp_current_f = dataObject.temp_current_f;
        temp_set_f = dataObject.temp_set_f;
        temp_unit_convert = dataObject.temp_unit_convert;
        fan_mode = dataObject.fan_mode;
        //switch_emer_enabled = dataObject.switch_emer_enabled;
        //switch_program_enabled = dataObject.switch_program_enabled;

        console.log("lblMode1 : " + mode);
        console.log("lblHeatTemperature : " + heat_temp_set);
        console.log("lblCoolTemperature : " + cool_temp_set);
        console.log("lblCurrentTemperature : " + temp_current);
        console.log("lblCurrentHumidity: " + humidity_current);
        console.log("lblTemperatureSet: " + temp_set);
        console.log("lblHeatTemperatureF: " + heat_temp_set_f);
        console.log("lblCoolTemperatureF: " + cool_temp_set_f);
        console.log("lblCurrentTemperatureF: " + temp_current_f);
        console.log("lblTemperatureSetF: " + temp_set_f);
        console.log("lblTemperatureUnitConvert: " + temp_unit_convert);
        console.log("lblFanMode: " + fan_mode);

        setTemperatureMode(mode);

        //Temperature Modes Start
        var tempModeId = temp_unit_convert == "f" ? "fahrenheit_mode" : "celsius_mode";
        document.querySelectorAll('.tempmodes ul li').forEach(li => {
            li.classList.remove('active_mode');
        });

        document.querySelector(`.tempmodes ul li button[data-mode="${tempModeId}"]`)
            ?.closest('li')
            ?.classList.add('active_mode');

        document.querySelector('.temp_unit').textContent = temp_unit_convert == "f" ? "Fahrenheit" : "Celsius";
        //Temperature Modes End

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

        document.querySelector('#current_temp').innerText = temp_current;
        document.querySelector('.humidity span').innerText = humidity_current + '%';
        if (temp_unit_convert == "f") {
            document.querySelector('#current_temp').innerText = temp_current_f;
        }

    } catch (error) {
        console.error("Error parsing JSON:", error);
    }
}


$(document).ready(function () {

    $('.temperature>span:not(.dotted_line)').on('click', function(){
        $(".temperature span").removeClass("selected_mode"); 
        $(this).addClass('selected_mode');        
    });

    $("#increase-temp").click(function () {
        var heat_temperature = parseFloat($(".temperature .heat_temp").text());
        var cool_temperature = parseFloat($(".temperature .cool_temp").text());
        var step = (temp_unit_convert === "c") ? 0.5 : 1; // Set step based on unit
        var tempgap =  (temp_unit_convert === "c") ? 1.5 : 3;
        console.log('increase ' + modeAct)

        if (modeAct === "heat_mode" || modeAct === "emergency_heat_mode") {
            heat_temperature += step;
            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(heat_temperature), maxTempC-2) : Math.min(heat_temperature, maxTempF-4));
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

            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(heat_temperature), maxTempC-2) : Math.min(heat_temperature, maxTempF-4));
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.min(formatTemperature(cool_temperature), maxTempC) : Math.min(cool_temperature, maxTempF));
        }

        setTemperatureVar(heat_temperature, cool_temperature);
    });

    $("#decrease-temp").click(function () {
        var heat_temperature = parseFloat($(".temperature .heat_temp").text());
        var cool_temperature = parseFloat($(".temperature .cool_temp").text());
        var step = (temp_unit_convert === "c") ? 0.5 : 1; // Set step based on unit
        var tempgap =  (temp_unit_convert === "c") ? 1.5 : 3;
       
        if (modeAct === "heat_mode" || modeAct === "emergency_heat_mode") {
            heat_temperature -= step;
            $(".temperature .heat_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(heat_temperature), minTempC) : Math.max(heat_temperature, minTempF));
        } else if (modeAct === "cool_mode" || modeAct === "cold_mode") {
            cool_temperature -= step;
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(cool_temperature), minTempC+2) : Math.max(cool_temperature, minTempF+4));
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
            $(".temperature .cool_temp").text(temp_unit_convert === "c" ? Math.max(formatTemperature(cool_temperature), minTempC+2) : Math.max(cool_temperature, minTempF+4));
        }

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
        } else {
            $('.temp_unit').text('Celsius');
            temp_unit_convert = 'c';
        }
    }

        if (btnId == 1) {
            mode = oModeMap[activeMode]
            console.log('mode ' + mode)
            if(mode == "auto")
            {
               cool_temp_set_f = temp_current_f + 3;
               heat_temp_set_f = temp_current_f - 5;
               console.log('cool_temp_set_f ' + cool_temp_set_f)
               console.log('heat_temp_set_f ' + heat_temp_set_f)
               
               cool_temp_set = temp_current + 2.5;
               heat_temp_set = temp_current - 2;
               console.log('cool_temp_set ' + cool_temp_set)
               console.log('heat_temp_set ' + heat_temp_set)              
            }
            updateTemperatureInTuyaApi();
        }
        else if (btnId == 2) {
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
            C4.sendCommand("SetFanMode", params, false, true);
        }
        else if (btnId == 0) {

            let params = JSON.stringify({
                tempUnitConvert: temp_unit_convert,
                command: "tempUnitConvert"
            });

            C4.sendCommand("SetTempConvert", params, false, true);
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
});

function setTemperatureMode(mode) {
    if (mode === "heat" || mode === "emergency_heat") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set_f;
        } else {
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set;
        }
    }
    else if (mode === "cold" || mode === "cool") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set_f;
        } else {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set;
        }
    }
    else if (mode === "auto") {
        if (temp_unit_convert === 'f') {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set_f;
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set_f;
        } else {
            document.querySelector(".temperature .cool_temp").innerText = cool_temp_set;
            document.querySelector(".temperature .heat_temp").innerText = heat_temp_set;
        }
    }
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
    C4.sendCommand("SetTemperature", params, false, true);
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
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(function () {
        updateTemperatureInTuyaApi();
    }, 1000); // Calls API 500ms after last click
}

function formatTemperature(value) {
    return (value % 1 === 0) ? value.toFixed(0) : value.toFixed(1);
}

