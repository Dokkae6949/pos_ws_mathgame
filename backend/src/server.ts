import express, {Request, Response} from "express";
import http from "http";
import {WebSocketServer, WebSocket} from "ws";
import {IClientMessage, IServerMessage} from "./interfaces";

const app = express();

//Config
const PORT:number = 3000;
//ClientID => Cient-WebSocket
const clients = new Map<string, WebSocket>

//Middleware
app.use(express.json());

//HTTP-Server + WebSocketServer
const server = http.createServer(app);
const wss = new WebSocketServer({server});

//**************************************** WebSocketServer **********
//Connection-Aufbau vom Client her
wss.on ("connection", (ws:WebSocket) => {
    console.log("Connected to WebSocket server");

    //Register Client
    ws.on("message", (data      ) => {
        const msg_str:string = data.toString();
        const msg:IClientMessage = JSON.parse(msg_str);
        console.log("wsmessage=",msg);
        //.2 TODO: WS MEssage vom Client empfangen und auslesen
        switch (msg.type) {
            case "REGISTER": {
                if (!msg.clientId || msg.clientId !== "") {
                    console.log("Error:Register: keine ClientID");
                    //Todo send an Client
                    return;
                }
                //.1 Speichern
                clients.set(msg.clientId, ws);

                //2. Send ServerNachricht
                const svrmsg: IServerMessage ={
                    type: "REGISTERED",
                    msg: JSON.stringify({info:`Registered as ${msg.clientId}`}),
                }
                ws.send(JSON.stringify(svrmsg));
                break;
            }
            // TODO: Ping: Pong-Msg an Client senden
        }

    })
});


//**************************************** REST API Routes  **********
 app.post ("/api/toClient", async (req:Request, res:Response)=> {
     const { clientId, msg} = req.body as {clientId?:string ; msg?:string};
     if (!clientId || !clients.has(clientId)) {
         return res.status(400).json ({ error: "Client ID not found" });
     }

    //WS für ClientID holen
     const clientws : WebSocket | undefined = clients.get(clientId);
     if (!clientws) {
         return res.status(400).json ({ error: "Client WebSocket not found" });
     }
     //TODO: REST-API Request verarbeiten & WS- Requestes senden
     //Todo: Switch: msg.type-Kommando
     //TODO: wenn Ping:  Ping Anforderung an WebSocket (type+clientId)=> WebSocket sendet zum Client "PONG"

     //Request Status
     res.status(201).send({
                clientId:clientId,
                 wsalive:true,
                 success:true
                //Todo:Alive optional
                });
 })

//TODO: BUGFIX: server (WSS+App-Server) starten statt nur app.listen (...)
server.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
})