
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

// Navigation state for swipe gestures
let currentClips = []; // All available clips
let currentClipIndex = 0; // Current clip being viewed
let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

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
    
    // Test: Change loading message to confirm JS is running
    if (historyContainer) {
        historyContainer.innerHTML = '<div class="empty-state"><p>JavaScript loaded - waiting for data from driver...</p></div>';
    }
    
    try {
       
        C4.subscribeToDataToUi(true);
         C4.sendCommand("HandleSelect", "", false, false);
    } catch (e) {
        console.warn("Control4 not available (browser test mode)");
        if (historyContainer) {
            historyContainer.innerHTML = '<div class="empty-state"><p>Control4 not available - browser test mode</p></div>';
        }
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

    console.log("=== onDataToUi CALLED ===");
    console.log("Raw value:", value);
    console.log("Value type:", typeof value);

    try {
       
        console.log("Data from driver:", value);
        let json = JSON.parse(value);
        
        console.log("Parsed JSON:", json);
        
        // Check for icon_description (uibutton proxy pattern - matches Smart-Thermostat)
        if (json.hasOwnProperty("icon_description")) {
            console.log("Found icon_description, parsing...");
            let dataObject = JSON.parse(json.icon_description);
            console.log("Parsed icon_description:", dataObject);
            
            // Check if wrapped in command/data structure (like Smart-Thermostat)
            if (dataObject && dataObject.command === "UpdateData") {
                console.log("Found UpdateData command, parsing data field...");
                json = JSON.parse(dataObject.data);
                console.log("Parsed data from wrapper:", json);
            } else {
                json = dataObject;
            }
        }
        
        console.log("JSON type field:", json.type);
        
        // Handle new message format with type field
        if (json.type) {
            console.log("Message type:", json.type);
            
            if (json.type === "auth_token") {
                // Auth token message
                const token = json.token;
                if (token) {
                    window.AccessToken = token;
                    console.log("✅ Auth Token received via new format");
                    startSystem();
                }
                return;
            }
            
            if (json.type === "device_list") {
                // Device list message
                console.log("✅ Device list received:", json.devices);
                allDevices = json.devices || [];
                allVids = allDevices.map(d => d.vid);
                populateDevices(allDevices);
                return;
            }
            
            if (json.type === "history") {
                // Notification history message
                console.log("✅ History received:", json.history?.length || 0, "items");
                renderHistory(json.history || []);
                updateNotificationCount((json.history || []).length);
                return;
            }
        }
        
        // Handle old devicecommand format (for backwards compatibility)
        if (json.devicecommand) {
            const params = json.devicecommand?.params?.param || [];
            const nameParam = params.find(p => p.name === "Name");
            const valueParam = params.find(p => p.name === "Value");
            
            if (nameParam?.value?.static === "Auth Token") {
                const token = valueParam?.value?.static;
                if (token) {
                    window.AccessToken = token;
                    console.log("✅ Auth Token received via old format");
                    startSystem();
                }
            }
            return;
        }
        
        console.warn("⚠️ Unrecognized message format:", json);

    } catch (err) {

        console.error("❌ Token parse failed:", err);
        console.error("Failed value:", value);

    }

}



/* =========================
   START SYSTEM AFTER TOKEN
========================= */

async function startSystem() {
    if (window.devicesLoaded) return;

    window.devicesLoaded = true;
    console.log("System started - waiting for device list from driver");
    // Driver will send device_list and history messages automatically
    // No need to fetch here - just wait for messages via onDataToUi
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
        currentClips = [];
        return;
    }

    // Store clips for navigation
    currentClips = list;

    historyContainer.innerHTML = "";

    list.forEach((item, index) => {

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

        card.onclick = () => openMediaWithNavigation(index);

/* =========================
   OPEN MEDIA WITH NAVIGATION
========================= */

window.openMediaWithNavigation = function(index) {
    if (!currentClips || currentClips.length === 0) return;
    
    currentClipIndex = index;
    showCurrentClip();
    mediaModal.style.display = "block";
};

function showCurrentClip() {
    if (!mediaModal || !mediaContainer) return;
    if (currentClipIndex < 0 || currentClipIndex >= currentClips.length) return;

    const item = currentClips[currentClipIndex];
    const hasVideo = item.video_url?.trim() && item.video_sec > 0;
    const hasImage = item.image_url?.trim();

    const time = item.time ? new Date(item.time * 1000).toLocaleString() : "";
    const position = `${currentClipIndex + 1} of ${currentClips.length}`;

    let mediaHtml = '';

    if (hasVideo) {
        mediaHtml = `
        <video controls autoplay style="max-width:100%;max-height:70vh;border-radius:8px;">
            <source src="${item.video_url}" type="video/mp4">
        </video>`;
    } 
    else if (hasImage) {
        mediaHtml = `
        <img src="${item.image_url}" 
             style="max-width:100%;max-height:70vh;border-radius:8px;" 
             onerror="this.src='../icons/nomedia.png'">`;
    } 
    else {
        mediaHtml = `
        <div style="padding:60px;text-align:center;color:#999;font-size:18px;">
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

    // Setup swipe gestures on modal
    setupSwipeGestures();
    
    // Setup keyboard navigation
    setupKeyboardNavigation();
}

/* =========================
   SWIPE GESTURE SUPPORT
========================= */

function setupSwipeGestures() {
    if (!mediaModal) return;

    mediaModal.addEventListener('touchstart', handleTouchStart, { passive: true });
    mediaModal.addEventListener('touchmove', handleTouchMove, { passive: true });
    mediaModal.addEventListener('touchend', handleTouchEnd, { passive: true });
}

function handleTouchStart(e) {
    if (e.target.closest('#closeModal') || e.target.closest('.nav-btn')) {
        return; // Don't interfere with button clicks
    }

    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isSwiping = false;
}

function handleTouchMove(e) {
    if (!touchStartX || !touchStartY) return;

    const touchEndX = e.touches[0].clientX;
    const touchEndY = e.touches[0].clientY;

    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Determine if this is a horizontal swipe (not vertical scroll)
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 10) {
        isSwiping = true;
    }
}

function handleTouchEnd(e) {
    if (!isSwiping || !touchStartX) {
        touchStartX = 0;
        touchStartY = 0;
        isSwiping = false;
        return;
    }

    const touchEndX = e.changedTouches[0].clientX;
    const deltaX = touchEndX - touchStartX;

    const swipeThreshold = 50; // Minimum distance for a swipe

    if (Math.abs(deltaX) > swipeThreshold) {
        if (deltaX > 0) {
            // Swipe right - go to previous clip
            navigatePrevClip();
        } else {
            // Swipe left - go to next clip
            navigateNextClip();
        }
    }

    touchStartX = 0;
    touchStartY = 0;
    isSwiping = false;
}

/* =========================
   KEYBOARD NAVIGATION
========================= */

function setupKeyboardNavigation() {
    document.addEventListener('keydown', (e) => {
        // Only handle keys when modal is visible
        if (mediaModal.style.display !== 'block') return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            navigatePrevClip();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            navigateNextClip();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            mediaModal.style.display = "none";
        }
    });                </button>
            </div>
        </div>
    `;
}

/* =========================
   NAVIGATION FUNCTIONS
========================= */

window.navigatePrevClip = function() {
    if (currentClipIndex > 0) {
        currentClipIndex--;
        showCurrentClip();
    }
};

window.navigateNextClip = function() {
    if (currentClipIndex < currentClips.length - 1) {
        currentClipIndex++;
        showCurrentClip();
    }
};

// Legacy support for old openMedia calls
window.openMedia = function(item) {
    const index = currentClips.findIndex(clip => clip === item);
    if (index >= 0) {
        openMediaWithNavigation(index);
    }

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