import {IClientMessage} from "./interfaces";

//Todo: WS- global verfügbar
export function connectWS(clientId:string) {
    console.log("connectWS clientId : " + clientId);
    const ws = new WebSocket("ws://localhost:3000"); //Request
    ws.onopen = () => {
        console.log("WebSocket Connected");

        //Registrieren ClientID für WebSocket am Server
        const registerMsg:IClientMessage = {
            type:"REGISTER",
            clientId: clientId
        }
        ws.send(JSON.stringify(registerMsg));
    }

    ws.onmessage = (event:MessageEvent) => {
        console.log("Received Message Message:data=", event.data);
        const parsed = JSON.parse(event.data as string);
        console.log("parsed=", parsed);
        //Todo: parsed verarbeiten => Switch: msg.type-Kommando
        //TODO: wenn REGISTERED:  Ausgabe
        //TODO: wenn PONG:    Ausgabe

    }
}

// TODO: Ping/Pong Ablauf
//  Todo: Funktion für Ping-Msg an Sever senden




