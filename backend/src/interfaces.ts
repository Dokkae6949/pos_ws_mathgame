import {ClientMsgType, ServerMsgType} from "./types";

export interface IClientMessage {
    type: ClientMsgType;
    clientId?: string;
    //TODO Anpassen für andere MEssages
}

export interface IServerMessage {
    type: ServerMsgType;
    msg?: string;
    //TODO Anpassen für andere MEssages
}