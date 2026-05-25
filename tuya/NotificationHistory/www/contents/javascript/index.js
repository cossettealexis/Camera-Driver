
window.C4 = window.C4 || {};
window.AccessToken = null;
window.devicesLoaded = false;

const BASE_URL = "https://api.arpha-tech.com/api/v3/openapi";
const PAGE_SIZE = 20;

let allDevices = [];
let allVids = [];

// DOM
let deviceSelect;
let historyContainer;
let mediaModal;
let mediaContainer;
let closeModalBtn;
 let totalCount;

function onTileActive() {
    try {
        window.devicesLoaded = false; // allow re-fetch
        C4.sendCommand("HandleSelect", "", false, false);
        console.log("Requested auth token on tile reopen");
        C4.subscribeToDataToUi(true);
    } catch (e) {
        console.warn("Control4 not available (browser test mode)");
    }
}
/* =========================
   PAGE READY
========================= */

document.addEventListener("DOMContentLoaded", () => {
   
    console.log("UI Loaded");

    deviceSelect = document.getElementById("cameraFilter");
    historyContainer = document.getElementById("historyList");
    mediaModal = document.getElementById("mediaModal");
    mediaContainer = document.getElementById("mediaContainer");
    closeModalBtn = document.getElementById("closeModal");
    totalCount = document.getElementById("totalCount");
    try {
       
        C4.subscribeToDataToUi(true);
         C4.sendCommand("HandleSelect", "", false, false);
    } catch (e) {
        console.warn("Control4 not available (browser test mode)");
    }

    setupUI();
});

function updateNotificationCount(count) {

    if (!totalCount) return;

    totalCount.textContent = count;

}

/* =========================
   CONTROL4 TOKEN RECEIVER
========================= */

function onDataToUi(value) {

    try {
       
        console.log("Data from driver:", value);
        const json = JSON.parse(value);
        if (!json.devicecommand) return;
        const params = json.devicecommand?.params?.param || [];
        const nameParam = params.find(p => p.name === "Name");
        const valueParam = params.find(p => p.name === "Value");
        if (nameParam?.value?.static === "Auth Token") {

            const token = valueParam?.value?.static;

            if (!token) return;

            window.AccessToken = token;

            console.log("Auth Token received");

            startSystem();

        }

    } catch (err) {

        console.error("Token parse failed:", err);

    }

}



/* =========================
   START SYSTEM AFTER TOKEN
========================= */

async function startSystem() {
    if (window.devicesLoaded) return;

    window.devicesLoaded = true;
    await getDevices(); // uses window.AccessToken
}

/* =========================
   FETCH HELPER
========================= */

async function fetchJSON(url, options = {}) {

    if (!window.AccessToken) {
        console.warn("Token not ready");
        return;
    }

    options.headers = Object.assign({
        Authorization: `Bearer ${window.AccessToken}`,
        "Content-Type": "application/json"
    }, options.headers || {});

    const res = await fetch(url, options);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    return res.json();
}



/* =========================
   GET DEVICES
========================= */

async function getDevices() {

    console.log("Fetching devices...");

    try {

        const data = await fetchJSON(`${BASE_URL}/devices-v2`);

        const devices = data?.data?.devices || [];

        allDevices = devices.map(d => ({
            vid: d.vid,
            name: d.device_name || d.vid
        }));

        allVids = devices.map(d => d.vid);

        populateDevices(allDevices);

        await fetchNotificationHistory(allVids);

    } catch (err) {

        console.error("Device fetch failed:", err);

    }

}



/* =========================
   FETCH NOTIFICATIONS
========================= */

async function fetchNotificationHistory(vids) {

    if (!vids?.length) return;

    console.log("Fetching notifications:", vids);

    try {

        const body = {
            page: 1,
            page_size: PAGE_SIZE,
            vids
        };

        const data = await fetchJSON(`${BASE_URL}/notifications/query`, {
            method: "POST",
            body: JSON.stringify(body)
        });

        const notifications = data?.data?.notifications || [];
        updateNotificationCount(notifications.length);
        const cleaned = notifications.map(n => ({
            device_name: n.device_name || "",
            vid: n.vid || "",
            time: n.notify_time || 0,
            image_url: n.image_url || "",
            message_type: n.message_type || "",
            video_url: n.video_url || "",
            video_sec: n.video_sec || 0
        }));

        renderHistory(cleaned);

    } catch (err) {

        console.error("Notification fetch failed:", err);

    }

}



/* =========================
   POPULATE CAMERA FILTER
========================= */

function populateDevices(devices) {

    if (!deviceSelect) return;

    deviceSelect.innerHTML = `<option value="all">All Cameras</option>`;

    devices.forEach(d => {

        const option = document.createElement("option");

        option.value = d.vid;
        option.textContent = d.name;

        deviceSelect.appendChild(option);

    });

}



/* =========================
   RENDER NOTIFICATIONS
========================= */

/*function renderHistory(list) {

    if (!historyContainer) return;

    if (!list.length) {

        historyContainer.innerHTML =
            `<div class="empty-state">No notifications</div>`;

        return;

    }

    historyContainer.innerHTML = "";

    list.forEach(item => {

        const time = item.time
            ? new Date(item.time * 1000).toLocaleString()
            : "";

        const img = item.image_url || "../icons/motion.png";

        const hasVideo = item.video_url?.trim() && item.video_sec > 0;

        const duration = item.video_sec ? `${item.video_sec}s` : "";

        const card = document.createElement("div");

        card.className = "history-card";

        card.innerHTML = `
        <div style="display:flex;align-items:center;margin-bottom:10px;cursor:pointer">

            <div style="position:relative;margin-right:12px">
            
                <img src="${img}" style="width:60px;height:60px;object-fit:cover;border-radius:4px">
                
                ${
                    hasVideo
                        ? `<div style="position:absolute;bottom:4px;right:4px;background:black;color:white;font-size:11px;padding:2px 4px;border-radius:3px">▶ ${duration}</div>`
                        : ""
                }

            </div>

            <div>

                <div style="font-weight:600">
                    ${item.device_name} - ${item.message_type}
                </div>

                <div style="color:#888;font-size:0.85em">
                    ${time}
                </div>

            </div>

        </div>
        `;

        card.onclick = () => openMedia(item);

        historyContainer.appendChild(card);

    });

}



window.openMedia = function (item) {

    if (!mediaModal || !mediaContainer) return;

    const hasVideo = item.video_url?.trim();
    const hasImage = item.image_url?.trim();

    if (hasVideo) {

        mediaContainer.innerHTML = `
        <video controls autoplay style="max-width:100%">
            <source src="${item.video_url}" type="video/mp4">
        </video>`;

    } else if (hasImage) {

        mediaContainer.innerHTML =
            `<img src="${item.image_url}" style="max-width:100%">`;

    } else {

        mediaContainer.innerHTML =
            `<div style="padding:20px">No media available</div>`;

    }

    mediaModal.style.display = "block";

}; */

function renderHistory(list) {

    if (!historyContainer) return;

    if (!list.length) {
        historyContainer.innerHTML =
            `<div class="empty-state">No notifications</div>`;
        return;
    }

    historyContainer.innerHTML = "";

    list.forEach(item => {

        const time = item.time
            ? new Date(item.time * 1000).toLocaleString()
            : "";

        const hasImage = item.image_url?.trim();
        const hasVideo = item.video_url?.trim() && item.video_sec > 0;

        let img;

        if (hasImage) {
            img = item.image_url;
        } 
        else if (hasVideo) {
            img = "../icons/motion.png";
        } 
        else {
            img = "../icons/motion.png"; // question mark icon
        }

        const duration = hasVideo ? `${item.video_sec}s` : "";

        const card = document.createElement("div");
        card.className = "history-card";

        card.innerHTML = `
        <div style="display:flex;align-items:center;margin-bottom:10px;cursor:pointer">

            <div style="position:relative;margin-right:12px">
            
                <img src="${img}" 
                     onerror="this.src='../icons/nomedia.png'"
                     style="width:60px;height:60px;object-fit:cover;border-radius:4px">
                
                ${
                    hasVideo
                        ? `<div style="position:absolute;bottom:4px;right:4px;background:black;color:white;font-size:11px;padding:2px 4px;border-radius:3px">▶ ${duration}</div>`
                        : ""
                }

            </div>

            <div>
                <div style="font-weight:600">
                    ${item.device_name} - ${item.message_type}
                </div>

                <div style="color:#888;font-size:0.85em">
                    ${time}
                </div>
            </div>

        </div>
        `;

        card.onclick = () => openMedia(item);

        historyContainer.appendChild(card);
    });
}

window.openMedia = function (item) {

    if (!mediaModal || !mediaContainer) return;

    const hasVideo = item.video_url?.trim() && item.video_sec > 0;
    const hasImage = item.image_url?.trim();

    if (hasVideo) {

        mediaContainer.innerHTML = `
        <video controls autoplay style="max-width:100%">
            <source src="${item.video_url}" type="video/mp4">
        </video>`;

    } 
    else if (hasImage) {

        mediaContainer.innerHTML =
            `<img src="${item.image_url}" style="max-width:100%">`;

    } 
    else {

        mediaContainer.innerHTML =
            `<div style="padding:40px;text-align:center;color:#999;font-size:16px;">
                 No media available
            </div>`;

    }

    mediaModal.style.display = "block";
};

/* =========================
   UI EVENTS
========================= */

function setupUI() {

    if (closeModalBtn) {

        closeModalBtn.onclick = () => {

            mediaModal.style.display = "none";

        };

    }

    if (deviceSelect) {

        deviceSelect.addEventListener("change", async function () {

            const vid = this.value;

            if (vid === "all") {

                await fetchNotificationHistory(allVids);

            } else {

                await fetchNotificationHistory([vid]);

            }

        });

    }

}


/* =========================
   CONTROL4 DEBUG HANDLERS
========================= */

function onSubscribeToDataToUiError(m){console.log("DataToUi error:",m)}
function onVariable(v){console.log("Variable:",v)}
function onSendCommandError(m){console.log("SendCommand error:",m)}
function onSubscribeToVariableError(v,m){console.log("Variable error:",v,m)}