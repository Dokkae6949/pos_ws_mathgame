import express, { Request, Response } from 'express';
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
  private gameStarted: boolean = false;

  constructor(port: number = 3000) {
    this.port = port;
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.gameStateManager = new GameStateManager();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupAutoTaskGeneration();
  }

  private setupMiddleware(): void {
    // Enable CORS for all routes
    this.app.use((req: Request, res: Response, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }

      next();
    });

    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));
  }

  private setupRoutes(): void {
    // GET /api/status - Returns current game status
    this.app.get('/api/status', (req: Request, res: Response) => {
      try {
        const status = this.gameStateManager.getStatus();
        console.log('GET /api/status - Returning status:', {
          currentPlayer: status.currentPlayer,
          currentPlayerName: status.currentPlayerName,
          score: status.score,
          players: status.players.length,
          gameStarted: status.gameStarted
        });
        res.json({
          success: true,
          ...status,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error in /api/status:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/force-task - Forces generation of new task
    this.app.post('/api/force-task', (req: Request, res: Response) => {
      try {
        console.log('POST /api/force-task - Forcing new task');

        // Check if we have players
        const players = this.gameStateManager.getPlayers();
        if (players.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'No players registered yet'
          });
        }

        // If game hasn't started and we have at least 2 players, start it
        if (!this.gameStarted && players.length >= 2) {
          console.log('Starting game with force-task (2+ players available)');
          this.gameStarted = this.gameStateManager.startGame();
        }

        // If still no current player but we have players, select one
        if (!this.gameStateManager.getCurrentPlayer() && players.length > 0) {
          console.log('Selecting first player for force-task');
          this.gameStateManager.selectNextPlayer();
        }

        // Force new task generation
        this.broadcastNewTask();

        res.json({
          success: true,
          message: 'New task generated and sent to all clients',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Error in /api/force-task:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // POST /api/start-game - Manually start the game
    this.app.post('/api/start-game', (req: Request, res: Response) => {
      try {
        const started = this.gameStateManager.startGame();
        if (started) {
          this.gameStarted = true;
          res.json({
            success: true,
            message: 'Game started successfully',
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(400).json({
            success: false,
            message: 'Need at least 2 players to start the game'
          });
        }
      } catch (error) {
        console.error('Error in /api/start-game:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        connections: this.wss.clients.size,
        players: this.gameStateManager.getPlayers().length
      });
    });

    // Root endpoint
    this.app.get('/', (req: Request, res: Response) => {
      res.json({
        success: true,
        message: 'Math Duell Game Server',
        endpoints: {
          websocket: `ws://localhost:${this.port}`,
          api: {
            status: `http://localhost:${this.port}/api/status`,
            forceTask: `http://localhost:${this.port}/api/force-task`,
            startGame: `http://localhost:${this.port}/api/start-game`,
            health: `http://localhost:${this.port}/health`
          }
        }
      });
    });

    // 404 handler
    this.app.use((req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.url}`
      });
    });
  }

  private setupWebSocket(): void {
    // Handle WebSocket connections
    this.wss.on('connection', (ws: ExtendedWebSocket) => {
      console.log('New WebSocket connection established');
      console.log(`Total connections: ${this.wss.clients.size}`);

      // Set up heartbeat
      ws.isAlive = true;
      ws.on('pong', () => {
        ws.isAlive = true;
      });

      // Handle incoming messages
      ws.on('message', (data: WebSocket.RawData) => {
        try {
          const message = JSON.parse(data.toString()) as ClientMessage;
          this.handleWebSocketMessage(ws, message);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'ERROR',
            message: 'Invalid message format',
            details: error instanceof Error ? error.message : 'Unknown error'
          }));
        }
      });

      // Handle connection close
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        console.log(`Remaining connections: ${this.wss.clients.size}`);
        this.cleanupDisconnectedClient(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.cleanupDisconnectedClient(ws);
      });

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'CONNECTED',
        message: 'Connected to Math Duell Server',
        serverTime: new Date().toISOString()
      }));
    });

    // Heartbeat interval to check for dead connections
    setInterval(() => {
      this.wss.clients.forEach((ws: WebSocket) => {
        const extWs = ws as ExtendedWebSocket;
        if (!extWs.isAlive) {
          console.log('Terminating dead WebSocket connection');
          this.cleanupDisconnectedClient(extWs);
          return ws.terminate();
        }
        extWs.isAlive = false;
        ws.ping();
      });
    }, 30000);
  }

  private handleWebSocketMessage(ws: WebSocket, message: ClientMessage): void {
    console.log(`Received WebSocket message: ${message.type}`);

    switch (message.type) {
      case 'REGISTER':
        this.handleRegisterEvent(ws, message);
        break;

      case 'SUBMIT_ANSWER':
        this.handleSubmitAnswerEvent(ws, message);
        break;

      default:
        console.warn(`Unknown message type: ${(message as any).type}`);
        ws.send(JSON.stringify({
          type: 'ERROR',
          message: `Unknown message type: ${(message as any).type}`
        }));
    }
  }

  private handleRegisterEvent(ws: WebSocket, event: IRegisterEvent): void {
    const { clientId, name, role } = event;

    // Check if client already registered
    const existingClient = this.gameStateManager.getClient(clientId);
    if (existingClient) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: `Client ID ${clientId} is already registered`
      }));
      return;
    }

    // Create client info
    const clientInfo: IClientInfo = {
      socket: ws,
      clientId,
      name,
      role,
      score: 0
    };

    // Register client in game state
    this.gameStateManager.registerClient(clientInfo);

    // Send registration confirmation
    const registeredEvent = this.gameStateManager.createRegisteredEvent(clientId, name);
    ws.send(JSON.stringify(registeredEvent));

    console.log(`Client registered: ${name} (${clientId}) as ${role}`);

    // Get current player list and broadcast update
    const players = this.gameStateManager.getPlayers();
    console.log(`Total players now: ${players.length}`);

    // Broadcast player list update to all clients
    this.broadcastPlayerList();

    // If we have at least 2 players and game hasn't started, start it
    if (players.length >= 2 && !this.gameStarted) {
      console.log(`2+ players registered! Starting game...`);
      const gameStarted = this.gameStateManager.startGame();
      if (gameStarted) {
        this.gameStarted = true;
        console.log(`Game started! Current player: ${this.gameStateManager.getCurrentPlayer()}`);

        // Send game started message to all clients
        this.broadcastGameStarted();

        // Start first task after a delay
        setTimeout(() => {
          this.broadcastNewTask();
        }, 2000);
      }
    }
  }

  private handleSubmitAnswerEvent(ws: WebSocket, event: ISubmitAnswerEvent): void {
    // Find client by WebSocket
    const clients = this.gameStateManager.getAllClients();
    const client = clients.find(c => c.socket === ws);

    if (!client) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Client not registered. Please register first.'
      }));
      return;
    }

    // Check if client is a player
    if (client.role !== 'player') {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'Only players can submit answers'
      }));
      return;
    }

    // Check if there's an active task
    const currentTask = this.gameStateManager.getCurrentTask();
    if (!currentTask) {
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: 'No active task. Wait for a new task.'
      }));
      return;
    }

    // Check if it's this player's turn
    const currentPlayer = this.gameStateManager.getCurrentPlayer();
    if (currentPlayer !== client.clientId) {
      const currentPlayerName = this.gameStateManager.getClient(currentPlayer!)?.name || 'unknown';
      ws.send(JSON.stringify({
        type: 'ERROR',
        message: `Not your turn. It's ${currentPlayerName}'s turn.`
      }));
      return;
    }

    console.log(`Processing answer from ${client.name}: ${event.payload.answer}`);

    // Check the answer
    const isCorrect = this.gameStateManager.checkAnswer(client.clientId, event.payload.answer);

    console.log(`Answer from ${client.name}: ${event.payload.answer} (${isCorrect ? 'correct' : 'incorrect'})`);

    // Send feedback to the client
    ws.send(JSON.stringify({
      type: 'ANSWER_RESULT',
      correct: isCorrect,
      yourScore: client.score,
      teamScore: this.gameStateManager.getScore(),
      yourAnswer: event.payload.answer
    }));

    // Broadcast updated scores to all clients
    this.broadcastPlayerList();

    // Move to next player BEFORE sending new task
    const nextPlayerId = this.gameStateManager.selectNextPlayer();
    const nextPlayer = this.gameStateManager.getClient(nextPlayerId!);

    console.log(`Next player selected: ${nextPlayer?.name || 'unknown'} (${nextPlayerId})`);

    // Broadcast turn change
    this.broadcastTurnChange(nextPlayerId!, nextPlayer?.name);

    // Wait 1.5 seconds and send new task
    setTimeout(() => {
      this.broadcastNewTask();
    }, 1500);
  }

  private broadcastNewTask(): void {
    const newTaskEvent = this.gameStateManager.createNewTaskEvent();
    const task = newTaskEvent.payload;

    console.log(`Broadcasting new task: ${task.a} ${task.operator} ${task.b} to ${task.currentPlayer}`);
    if (task.currentPlayer) {
      const currentPlayer = this.gameStateManager.getClient(task.currentPlayer);
      console.log(`Current player is: ${currentPlayer?.name || 'unknown'}`);
    }

    // Send to all connected clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(newTaskEvent));
      }
    });
  }

  private broadcastPlayerList(): void {
    const players = this.gameStateManager.getPlayers();
    const playerListEvent = {
      type: 'PLAYER_LIST',
      players: players.map(player => ({
        clientId: player.clientId,
        name: player.name,
        role: player.role,
        score: player.score
      }))
    };

    // Send to all connected clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(playerListEvent));
      }
    });
  }

  private broadcastGameStarted(): void {
    const currentPlayerId = this.gameStateManager.getCurrentPlayer();
    const currentPlayer = currentPlayerId ? this.gameStateManager.getClient(currentPlayerId) : null;

    const gameStartedEvent = {
      type: 'GAME_STARTED',
      message: 'Game started!',
      firstPlayer: currentPlayer?.name || 'unknown',
      timestamp: new Date().toISOString()
    };

    // Send to all connected clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(gameStartedEvent));
      }
    });
  }

  private broadcastTurnChange(playerId: ClientId, playerName?: string): void {
    const turnChangeEvent = {
      type: 'TURN_CHANGE',
      playerId: playerId,
      playerName: playerName || 'unknown',
      message: `Turn changed to ${playerName || 'unknown'}`,
      timestamp: new Date().toISOString()
    };

    // Send to all connected clients
    this.wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(turnChangeEvent));
      }
    });
  }

  private cleanupDisconnectedClient(ws: WebSocket): void {
    const clients = this.gameStateManager.getAllClients();
    const client = clients.find(c => c.socket === ws);

    if (client) {
      console.log(`Cleaning up disconnected client: ${client.name} (${client.clientId})`);
      this.gameStateManager.removeClient(client.clientId);

      // Check if we still have enough players
      const players = this.gameStateManager.getPlayers();
      if (players.length < 2) {
        this.gameStarted = false;
        console.log('Game paused: Need at least 2 players');
      }

      this.broadcastPlayerList();
    }
  }

  private setupAutoTaskGeneration(): void {
    // Generate new task every 10 seconds if game is started
    setInterval(() => {
      const players = this.gameStateManager.getPlayers();
      if (players.length >= 2 && this.gameStarted) {
        console.log('Auto-generating task (10s interval)');
        this.broadcastNewTask();
      }
    }, 10000);
  }

  public start(): void {
    this.server.listen(this.port, () => {
      console.log('='.repeat(50));
      console.log(`Math Duell Server started on port ${this.port}`);
      console.log(`WebSocket server: ws://localhost:${this.port}`);
      console.log(`REST API: http://localhost:${this.port}/api`);
      console.log(`Health check: http://localhost:${this.port}/health`);
      console.log('='.repeat(50));
    });
  }

  public stop(): void {
    this.wss.close();
    this.server.close();
    console.log('Math Duell Server stopped');
  }
}