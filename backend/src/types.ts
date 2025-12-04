export type Operator = "+" | "-" | "*";
export type Role = "player" | "observer" | "admin";
export type ClientId = string;

// Client Events (Business Events)
export interface IRegisterEvent {
  type: "REGISTER";
  clientId: ClientId;
  name: string;
  role: Role;
}

export interface ISubmitAnswerEvent {
  type: "SUBMIT_ANSWER";
  payload: {
    answer: number;
  };
}

export type ClientMessage = IRegisterEvent | ISubmitAnswerEvent;

// Server Events (Transport Events)
export interface IRegisteredEvent {
  type: "REGISTERED";
  message: string;
  clientId: ClientId;
}

export interface INewTaskEvent {
  type: "NEW_TASK";
  payload: {
    a: number;
    b: number;
    operator: Operator;
    currentPlayer: ClientId;
    score: number;
  };
}

export type ServerMessage = IRegisteredEvent | INewTaskEvent;

// Client Info
export interface IClientInfo {
  socket: WebSocket;
  clientId: ClientId;
  name: string;
  role: Role;
  score: number;
}

// Game State
export interface IGameState {
  currentPlayer: ClientId | null;
  score: number;
  currentTask: {
    a: number;
    b: number;
    operator: Operator;
  } | null;
}

// WebSocket with additional type safety
export interface ExtendedWebSocket extends WebSocket {
  isAlive?: boolean;
}