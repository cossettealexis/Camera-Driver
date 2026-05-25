import React, { useState } from "react";
import { BrowserRouter as Router, Route, Routes, Link } from "react-router-dom";
import axios from "axios";
import "./App.css";

const App = () => {
  const [token, setToken] = useState();
    const [devices, setDevices] = useState([]);
    const [users, setUsers] = useState([]);
    const [userId, setUserId] = useState("");
    const [deviceId,setDeviceId] = useState("");
    const [qrUrl, setQrUrl] = useState("");
  
    const [finddevices, setFindDevices] = useState([]);
    const [error, setError] = useState(null);
    const [activeRow, setActiveRow] = useState(null);

    const authenticateUser = () => {
      axios.get("http://localhost:5000/api/token")
      .then(response => {
        console.log(response)
        setToken(response.data.result.access_token)
      })
      .catch(error => console.error("Error:", error));
  
    }
  
    const fetchDevices = async (i,uid) => {
      
      try {
        setActiveRow(i);
        setUserId(uid)
        console.log(token)
          const response = await axios.get(`http://localhost:5000/api/devices/${uid}/${token}`);
          setDevices(response.data.result || []); // Handle Tuya API response
      } catch (error) {
          console.error("Error fetching devices:", error);
      }
    };
    const fetchUsers = async () => {
      try {
        console.log(token)
          const response = await axios.get(`http://localhost:5000/api/users/${token}`);
          setUsers(response.data.result.list || []); // Handle Tuya API response
      } catch (error) {
          console.error("Error fetching devices:", error);
      }
    };
  
    
  // to unlink device
  const removeDevice = async (dId) => {
    try {
        await axios.delete(`http://localhost:5000/api/devices/${token}/${userId}/${dId}`);
        setDevices(devices.filter(device => device.id !== dId)); // Update UI
    } catch (error) {
        console.error("Error removing device:", error);
    }
  };
  //to link device
  const linkDevice = async () => {
    try {
        await axios.post(`http://localhost:5000/api/devices/${token}/${userId}/${deviceId}`);
        setDevices(devices.filter(device => device.id !== deviceId)); // Update UI
    } catch (error) {
        console.error("Error removing device:", error);
    }
  };
  //to freeze device
  const freezeDevice = async (did) => {
    try {
        await axios.post(`http://localhost:5000/api/freezedevice/${token}/${did}`);
        
    } catch (error) {
        console.error("Error removing device:", error);
    }
  };
  const fetchQrCode = async () => {
    try {
        const response = await axios.get(`http://localhost:5000/api/generate-qr/${token}`);
        setQrUrl(response.data.qrUrl);
    } catch (error) {
        console.error("Error fetching QR code:", error);
    }
  };
  const handleDownload = async () => {
    try {
      const response = await fetch("http://localhost:5000/process-xml", {
        method: "GET",
      });

      if (!response.ok) {
        throw new Error("Download failed");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "updated_xmls.zip");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error("Error downloading zip:", error);
      alert("Failed to download the zip file.");
    }
  };

  return (
    
      <div className="p-4 max-w-lg mx-auto bg-white shadow rounded">
      <h2 className="text-xl font-bold mb-2">Tuya Authentication, Users and Devices</h2>
      <button onClick={() => authenticateUser()} className="bg-blue-500 text-white p-2 rounded w-full">
        Authenticate
      </button>
      <button onClick={() => fetchUsers()} className="bg-blue-500 text-white p-2 rounded w-full">
        Get Users
      </button>     
      
      <div className="mt-4">
        <h3 className="font-bold"></h3>
        <p>Access Token: {token == undefined ? "Click Authenticate to fetch token" : "Token is available"}</p>
      </div>      
      <br></br>
      <div>
        <table class="styled-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>UID</th>
              <th></th>
              <th></th>
            </tr>
          </thead>
          <tbody>            
                  {users.map((u,i) => (
                    <tr key={i} className={activeRow === i ? 'active-row' : ''}>
                      <td>{u.username}</td>
                      <td>{u.email}</td>
                      <td>{u.uid}</td>
                      <td><button onClick={() => fetchDevices(i,u.uid)}>Get Devices</button></td>         
                      <td><button onClick={() => fetchDevices(i,u.uid)}>Download</button></td>                 
                    </tr>
                  ))}
              
          </tbody></table>
      </div>
      <br></br>
      
      <div>
        {devices?.length > 0 && <table class="styled-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>UUID</th>
                <th></th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              
                    {devices.map((device) => (
                      <tr>
                        <td>{device.name}</td>
                        <td>{device.category}</td>
                        <td>{device.uuid}</td>
                        <td><button onClick={() => removeDevice(device.id)}>Remove</button></td>
                        <td><button onClick={() => freezeDevice(device.id)}>Controllable</button></td>
                      </tr>
                    ))}
                
            </tbody></table>}
      </div>
      
    
     
        <div className="p-4 text-center">
      
      {finddevices.length > 0 && (
        <div className="mt-4">
          <h2 className="text-lg font-semibold">Discovered Devices:</h2>
          <ul className="mt-2">
            {finddevices.map((device, index) => (
              <li key={index} className="mt-1">
                <strong>{device.name}</strong> (ID: {device.id})
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && <p className="text-red-600 mt-2">{error}</p>}
    </div>
    </div> /*  last div */
  );
}

export default App;
