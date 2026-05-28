const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const xml2js = require('xml2js');
const archiver = require('archiver');
const cors = require('cors');
const axios = require("axios");
const crypto = require("crypto"); // For HMAC-SHA256
const luamin = require('luamin');


const app = express();
app.use(cors());
// 🔹 Tuya API Credentials (Replace with your actual credentials)
const CLIENT_ID = "3twn5seuj8u734wcrhnt";
const SECRET = "6e08515a8e1147ec9161ab5c9d707f43";
const BASE_URL = "https://openapi.tuyain.com";
const REDIRECT_URI = "http://localhost:3000/auth";
const USER_ID ="in1739351967046fS0HZ";
const schema = "comslosmart";

const PORT = 5000;
const driverName = 'Smart-Switch'
const driverPath = '../../'+driverName
//const inputDir = path.join(__dirname, 'input-xmls');
const inputDir = path.join(__dirname,driverPath)
//const tempDir = path.join(__dirname, 'temp');
const outputZipPath = path.join(__dirname, driverName+'.zip');
const renamedZipPath = path.join(__dirname, driverName+'.c4z');

const list_drivers = [
    {"code":1, "name":"DimmerSwitch", "path":"../Smart-Dimmer-Switch", "tempDir":path.join(__dirname, 'temp1')},
    {"code":2, "name":"Lock", "path":"../Smart-Lock", "tempDir":path.join(__dirname, 'temp2')},
    {"code":3, "name":"Switch", "path":"../Smart-Switch", "tempDir":path.join(__dirname, 'temp3')},
    {"code":4, "name":"Thermostat", "path":"../Smart-Thermostat", "tempDir":path.join(__dirname, 'temp4')},
    //{"code":5, "name":"PetFedder", "path":"../Smart-PetFedder", "tempDir":path.join(__dirname, 'temp5')}
]

// Utility: Update XML Content
const updateXmlContent = async (xml) => {
  const result = await xml2js.parseStringPromise(xml);
  //console.log(result)
  // Modify something, e.g., add a timestamp
  result.devicedata.modified = [new Date().toISOString()];
  const builder = new xml2js.Builder();
  return builder.buildObject(result);
};
// Utility: Recursively process files and folders
async function processDirectoryRecursive(srcDir, destDir) {
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      await fs.ensureDir(destPath);
      await processDirectoryRecursive(srcPath, destPath);
    } else if (entry.isFile()) {
      if (entry.name.endsWith('.xml')) {
        const xml = await fs.readFile(srcPath, 'utf-8');
        const updatedXml = await updateXmlContent(xml);
        await fs.writeFile(destPath, updatedXml);
      } else {
        await fs.copyFile(srcPath, destPath); // Copy non-XML file as-is
      }
    }
  }
}
app.get('/process-xml', async (req, res) => {
  try {
    await fs.emptyDir(tempDir);

    // Recursively process input folder
    await processDirectoryRecursive(inputDir, tempDir);

    // Create .c4z zip
    const output = fs.createWriteStream(renamedZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();

    output.on('close', () => {
      res.download(renamedZipPath, driverName +'.c4z');
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Something went wrong.');
  }
});

//post
app.post('/process-xml', async (req, res) => {
  try {
    console.log(req.body)
    const { deviceType, deviceId } = req.body;
    console.log(deviceId)

    await fs.emptyDir(tempDir);

    // Recursively process input folder
    await processDirectoryRecursive(inputDir, tempDir);

    // Create .c4z zip
    const output = fs.createWriteStream(renamedZipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.pipe(output);
    archive.directory(tempDir, false);
    await archive.finalize();

    output.on('close', () => {
      res.download(renamedZipPath, driverName +'.c4z');
    });

  } catch (err) {
    console.error('Error:', err);
    res.status(500).send('Something went wrong.');
  }
});

// 🔹 Generate current timestamp
function getTimestamp() {
    return Date.now().toString(); // Milliseconds timestamp
}

// 🔹 Generate HMAC-SHA256 Signature
function calculateSignature(clientId, timestamp, nonce, signStr, secret) {
    const signSource = clientId + timestamp + nonce + signStr;
    return crypto.createHmac("sha256", secret).update(signSource).digest("hex").toUpperCase();
}

function calculateSignatureWithToken(clientId,token, timestamp, nonce, signStr, secret) {
    const signSource = clientId + token + timestamp + nonce + signStr;
    return crypto.createHmac("sha256", secret).update(signSource).digest("hex").toUpperCase();
}

// 🔹 Create String-to-Sign
function stringToSign(method, body, url) {
    const sha256Body = crypto.createHash("sha256").update(body || "").digest("hex");
    return `${method.toUpperCase()}\n${sha256Body}\n\n${url}`;
}

// 🔹 Route to fetch Tuya API token
app.get("/api/token", async (req, res) => {
    try {
        const timestamp = getTimestamp();
        const nonce = ""; // Can be left empty unless required
        const method = "GET";
        const body = ""; // GET request has no body
        const urlPath = "/v1.0/token?grant_type=1";

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);

        // 🔹 Generate Signature
        const signature = calculateSignature(CLIENT_ID, timestamp, nonce, signString, SECRET);

        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256"
        };

        // 🔹 Call Tuya API
        const response = await axios.get(BASE_URL + urlPath, { headers });

        // 🔹 Send Response to Frontend
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching token:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 Route to get user's list
app.get("/api/users/:token", async (req, res) => {
    try {
        
        const { uid, token } = req.params; // Get User ID from request params
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "GET";
        const body = "";
        const urlPath = `/v1.0/apps/${schema}/users`;

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);
        console.log(signString)
        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID, token, timestamp, nonce, signString, SECRET);
        console.log(signature)
        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token // Replace with actual token
        };
        console.log(headers)
        // 🔹 Call Tuya API to get the device list
        const response = await axios.get(BASE_URL + urlPath, { headers });
        //console.log('response')
        //console.log(response)
        // 🔹 Send response back to frontend
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching users:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// 🔹 Route to get user's device list
app.get("/api/devices/:uid/:token", async (req, res) => {
    try {
        const { uid, token } = req.params; // Get User ID from request params
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "GET";
        const body = "";
        const urlPath = `/v1.0/users/${uid}/devices`;

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);
        console.log(signString)
        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID, token, timestamp, nonce, signString, SECRET);
        console.log(signature)
        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token // Replace with actual token
        };
        console.log(headers)
        // 🔹 Call Tuya API to get the device list
        const response = await axios.get(BASE_URL + urlPath, { headers });
        console.log('response')
        //console.log(response)
        // 🔹 Send response back to frontend
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching devices:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

//unlink device
app.delete("/api/devices/:token/:uid/:deviceId", async (req, res) => {
    try {
        const { token, uid, deviceId } = req.params;
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "DELETE";
        const body = "";
        const urlPath = `/v1.0/devices/${deviceId}`;
        //const urlPath = `/v1.0/devices/${deviceId}/users/${uid}`;

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);

        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID,token, timestamp, nonce, signString, SECRET);

        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token // Replace with actual token
        };

        // 🔹 Call Tuya API to remove the device
        const response = await axios.delete(BASE_URL + urlPath, { headers });

        res.json({ message: "Device removed successfully", result: response.data });
    } catch (error) {
        console.error("Error removing device:", error.message);
        res.status(500).json({ error: "Failed to remove device" });
    }
});

//link device
app.post("/api/devices/:token/:uid/:deviceId", async (req, res) => {
    try {
        const { token, uid, deviceId } = req.params;
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "POST";
        let body = JSON.stringify({
            "state": 1
          });
        //const urlPath = `/v1.0/users/${uid}/devices`;
        const urlPath = `/v1.0/devices/${deviceId}`;

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);

        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID,token, timestamp, nonce, signString, SECRET);

        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token // Replace with actual token
        };
        console.log(`${BASE_URL}/${urlPath}`);
        const response = await axios.post(
            `${BASE_URL}/${urlPath}`,
            body,
            {
                headers: headers
            }
        );
        console.log(response.data);
        res.json({ message: "Device linked successfully", result: response.data });
    } catch (error) {
        console.error("Error linking device:", error.message);
        res.status(500).json({ error: "Failed to link device" });
    }
});

//freeze device
app.post("/api/freezedevice/:token/:deviceId", async (req, res) => {
    try {
        const { token, deviceId } = req.params;
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "POST";
        
        const urlPath = `/v2.0/cloud/thing/${deviceId}/freeze`;
        //const urlPath = `/v2.0/cloud/thing/${deviceId}/freeze`;
        let body = JSON.stringify({
            "state": 1
          });
        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);
        console.log(signString)
        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID,token, timestamp, nonce, signString, SECRET);
        console.log(signature)
        console.log(deviceId)
        console.log(token)
        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token,
            "Content-Type": "application/json"
        };
        console.log(headers)
        

        let config = {
            method: 'POST',
            url: BASE_URL + urlPath,
            headers:  {
                "client_id": CLIENT_ID,
                "sign": signature,
                "t": timestamp,
                "sign_method": "HMAC-SHA256",
                "access_token": token,
                "Content-Type": "application/json"
            },
            data : body
          };

          axios.request(config) .then((response) => {
            console.log(JSON.stringify(response.data));
            res.json({ message: "Device freezed successfully", result: response.data });
          })
          .catch((error) => {
            console.log(error);
          });


        
    } catch (error) {
        console.error("Error linking device:", error.message);
        res.status(500).json({ error: "Failed to link device" });
    }
});

// API to generate QR code for linking Smart Life user
app.get("/api/generate-qrold", async (req, res) => {
    try {
        const nonce = "";
        const timestamp = Date.now().toString();
        const signStr = "/v1.0/iot-01/associated-users/actions/associate";
        const sign = calculateSignature(CLIENT_ID,timestamp, nonce , signStr,SECRET);

        const response = await axios.post(
            `${BASE_URL}/v1.0/iot-01/associated-users/actions/associate`,
            {},
            {
                headers: {
                    "client_id": CLIENT_ID,
                    "sign": sign,
                    "t": timestamp,
                    "sign_method": "HMAC-SHA256",
                },
            }
        );
        console.log(response);
        res.json({ qrUrl: response.data.result.qr_code_url });
    } catch (error) {
        console.error("Error generating QR code:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to generate QR code" });
    }
});

app.get("/api/generate-qr/:token", async (req, res) => {
    try {
        console.log(req.params)
        const { uid, token } = req.params; // Get User ID from request params
        const timestamp = getTimestamp();
        const nonce = "";
        const method = "POST";
        const body = "";
        const urlPath = `/v1.0/iot-01/associated-users/actions/associate`;

        // 🔹 Generate String-to-Sign
        const signString = stringToSign(method, body, urlPath);

        // 🔹 Generate Signature
        const signature = calculateSignatureWithToken(CLIENT_ID, token, timestamp, nonce, signString, SECRET);
        console.log(signature)
        // 🔹 Set request headers
        const headers = {
            "client_id": CLIENT_ID,
            "sign": signature,
            "t": timestamp,
            "sign_method": "HMAC-SHA256",
            "access_token": token // Replace with actual token
        };
        console.log(headers)
        // 🔹 Call Tuya API to get the device list
        const response = await axios.get(BASE_URL + urlPath, { headers });
        console.log('response')
        console.log(response.data)
        // 🔹 Send response back to frontend
        res.json(response.data);
    } catch (error) {
        console.error("Error fetching devices:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

app.get("/api/login", (req, res) => {
    const authUrl = `https://auth.tuya.com/?client_id=${CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;
    res.redirect(authUrl);
});

app.get("/api/callback", async (req, res) => {
    //const { uid, token } = req.params; 
    const authCode = req.query.code;
    if (!authCode) {
        return res.status(400).send("Authorization code not found!");
    }

    try {
        const response = await axios.post(
            "https://openapi.tuya.com/v1.0/token?grant_type=authorization_code",
            {
                client_id: CLIENT_ID,
                secret: CLIENT_SECRET,
                code: authCode,
                redirect_uri: REDIRECT_URI
            }
        );
        console.log('callback response')
        console.log(response)
        
        const { access_token, refresh_token } = response.data;
        res.json({ access_token, refresh_token });

    } catch (error) {
        console.error("Error fetching access token:", error);
        res.status(500).send("Error during OAuth authentication");
    }
});


app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
