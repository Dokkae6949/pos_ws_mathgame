import { Role } from "./types";

export interface IRegisterMessage {
  type: "REGISTER";
  clientId: string;
  name: string;
  role: Role;
}

export interface ISubmitAnswerMessage {
  type: "SUBMIT_ANSWER";
  payload: { answer: number };
}