import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { GameStateManager } from './game-state';
import {
  ClientMessage,
  IRegisterEvent,
  ISubmitAnswerEvent,
  IClientInfo,
  ExtendedWebSocket
} from './types';

export class MathDuellServer {
  private app = express();
  private server: http.Server;
  private wss: WebSocketServer;
  private gameStateManager: GameStateManager;
  private port: number;

  constructor(port: number = 3000) {
    this.port = port;
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.gameStateManager = new GameStateManager();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use((_req: Request, res: Response, next: NextFunction) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') {
        res.status(200).end();
        return;
      }
      next();
    });
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/api/status', (_req: Request, res: Response) => {
      res.json({ success: true, ...this.gameStateManager.getStatus() });
    });

    this.app.post('/api/force-task', (_req: Request, res: Response) => {
      if (this.gameStateManager.getPlayers().length === 0) {
        res.status(400).json({ success: false, message: 'No players' });
        return;
      }
      this.broadcastNewTask();
      res.json({ success: true, message: 'Task sent' });
    });

    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        players: this.gameStateManager.getPlayers().length
      });
    });
  }

  private setupWebSocket(): void {
    this.wss.on('connection', (ws: WebSocket) => {
      const extWs = ws as ExtendedWebSocket;
      extWs.isAlive = true;
      
      ws.on('pong', () => { extWs.isAlive = true; });
      ws.on('message', (data: WebSocket.RawData) => {
        try {
          this.handleWebSocketMessage(ws, JSON.parse(data.toString()) as ClientMessage);
        } catch (error) {
          ws.send(JSON.stringify({ type: 'ERROR', message: 'Invalid message' }));
        }
      });
      ws.on('close', () => this.cleanupDisconnectedClient(ws));
      ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Connected' }));
    });

    setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          this.cleanupDisconnectedClient(ws);
          return ws.terminate();
        }
        extWs.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  private handleWebSocketMessage(ws: WebSocket, message: ClientMessage): void {
    if (message.type === 'REGISTER') {
      this.handleRegister(ws, message);
    } else if (message.type === 'SUBMIT_ANSWER') {
      this.handleSubmitAnswer(ws, message);
    }
  }

  private handleRegister(ws: WebSocket, event: IRegisterEvent): void {
    if (this.gameStateManager.getClient(event.clientId)) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Already registered' }));
      return;
    }

    const clientInfo: IClientInfo = {
      socket: ws,
      clientId: event.clientId,
      name: event.name,
      role: event.role,
      score: 0
    };

    this.gameStateManager.registerClient(clientInfo);
    ws.send(JSON.stringify(this.gameStateManager.createRegisteredEvent(event.clientId, event.name)));
    this.broadcastPlayerList();

    // Auto-start game when 2 players join
    if (this.gameStateManager.getPlayers().length === 2) {
      setTimeout(() => this.broadcastNewTask(), 1000);
    }
  }

  private handleSubmitAnswer(ws: WebSocket, event: ISubmitAnswerEvent): void {
    const client = this.gameStateManager.getAllClients().find(c => c.socket === ws);
    if (!client) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Not registered' }));
      return;
    }

    const currentPlayer = this.gameStateManager.getCurrentPlayer();
    if (currentPlayer !== client.clientId) {
      ws.send(JSON.stringify({ type: 'ERROR', message: 'Not your turn' }));
      return;
    }

    const isCorrect = this.gameStateManager.checkAnswer(client.clientId, event.payload.answer);
    ws.send(JSON.stringify({
      type: 'ANSWER_RESULT',
      correct: isCorrect,
      yourScore: client.score,
      teamScore: this.gameStateManager.getScore()
    }));

    this.broadcastPlayerList();
    this.gameStateManager.selectNextPlayer();
    setTimeout(() => this.broadcastNewTask(), 1000);
  }

  private broadcastNewTask(): void {
    const event = this.gameStateManager.createNewTaskEvent();
    this.broadcast(event);
  }

  private broadcastPlayerList(): void {
    const players = this.gameStateManager.getPlayers();
    this.broadcast({
      type: 'PLAYER_LIST',
      players: players.map(p => ({
        clientId: p.clientId,
        name: p.name,
        role: p.role,
        score: p.score
      }))
    });
  }

  private cleanupDisconnectedClient(ws: WebSocket): void {
    const client = this.gameStateManager.getAllClients().find(c => c.socket === ws);
    if (client) {
      this.gameStateManager.removeClient(client.clientId);
      this.broadcastPlayerList();
    }
  }

  private broadcast(message: any): void {
    const msg = JSON.stringify(message);
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    });
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log(`Math Duell Server running on port ${this.port}`);
    });
  }

  public stop(): void {
    this.wss.close();
    this.server.close();
  }
}