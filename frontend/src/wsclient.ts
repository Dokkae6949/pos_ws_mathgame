import {IClientMessage} from "./interfaces";
import {ServerMsgType} from "./types";

//Todo: WS- global verfügbar
export function connectWS(clientId: string) {
  console.log("connectWS clientId : " + clientId);
  const ws = new WebSocket("ws://localhost:3000"); //Request
  ws.onopen = () => {
    console.log("WebSocket Connected");

    //Registrieren ClientID für WebSocket am Server
    const registerMsg: IClientMessage = {
      type: "REGISTER",
      clientId: clientId
    }
    ws.send(JSON.stringify(registerMsg));
  }

  ws.onmessage = (event: MessageEvent) => {
    const parsed = JSON.parse(event.data as string);
    const type = parsed.type as ServerMsgType

    switch (type) {
      case "REGISTERED": {
        console.log("Registered Message from Server:", parsed.msg);
        break;
      }
      case "PONG": {
        console.log("PONG Message from Server:", parsed.msg);
        break;
      }
      default: {
        console.log("Unknown Message Type from Server:", type);
      }
    }
  }

  // send Ping Message to server every 5 seconds
  setInterval(() => {
    const pingMsg: IClientMessage = {
      type: "PING"
    }
    ws.send(JSON.stringify(pingMsg));
    console.log("Sent PING to server");
  }, 5000);
}

// Send rest via http ping message to server and expect ws pong response
export function sendPingHTTP(clientId: string) {
  fetch(`http://localhost:3000/ping/${clientId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  })
    .then(response => response.json())
    .then(data => {
      console.log("HTTP Ping Response:", data);
    })
    .catch(error => {
      console.error("Error sending HTTP Ping:", error);
    });
}

setInterval(() => {
  sendPingHTTP("didi");
}, 2500);