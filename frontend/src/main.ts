import {connectWS} from "./wsclient";
import express from "express";

// TODO: Ping/Pong Ablauf
//  Todo-Aufruf: Ping-Msg an Sever senden

// Serve index.html with express
const app = express();
const port = 8080;

app.use(express.static("public"));

app.listen(port, () => {
  console.log(`Server is running at http://localhost:${port}`);
});