import {
  IClientInfo,
  ClientId,
  Operator,
  IGameState,
  Role,
  INewTaskEvent
} from './types';

export class GameStateManager {
  private clients: Map<ClientId, IClientInfo> = new Map();
  private gameState: IGameState = {
    currentPlayer: null,
    score: 0,
    currentTask: null
  };

  // Client Management
  registerClient(clientInfo: IClientInfo): void {
    this.clients.set(clientInfo.clientId, clientInfo);
    console.log(`Registered client: ${clientInfo.name} (${clientInfo.role})`);

    // If this is the first player registered and they're a player, set them as current player
    const players = this.getPlayers();
    if (players.length === 1 && clientInfo.role === 'player') {
      this.gameState.currentPlayer = clientInfo.clientId;
      console.log(`Set first player as current: ${clientInfo.name}`);
    }
  }

  removeClient(clientId: ClientId): void {
    this.clients.delete(clientId);
    console.log(`Removed client: ${clientId}`);

    // If removed client was current player, select new one
    if (this.gameState.currentPlayer === clientId) {
      this.selectNextPlayer();
    }
  }

  getClient(clientId: ClientId): IClientInfo | undefined {
    return this.clients.get(clientId);
  }

  getAllClients(): IClientInfo[] {
    return Array.from(this.clients.values());
  }

  getPlayers(): IClientInfo[] {
    return this.getAllClients().filter(client => client.role === 'player');
  }

  // Game State Management
  getGameState(): IGameState {
    return { ...this.gameState };
  }

  setCurrentPlayer(playerId: ClientId | null): void {
    this.gameState.currentPlayer = playerId;
  }

  getCurrentPlayer(): ClientId | null {
    return this.gameState.currentPlayer;
  }

  incrementScore(): void {
    this.gameState.score++;
  }

  getScore(): number {
    return this.gameState.score;
  }

  // Player Selection - Fixed logic
  selectNextPlayer(): ClientId | null {
    const players = this.getPlayers();

    console.log(`Selecting next player from ${players.length} players`);
    console.log(`Current players:`, players.map(p => ({ name: p.name, id: p.clientId })));
    console.log(`Current player ID: ${this.gameState.currentPlayer}`);

    if (players.length === 0) {
      this.gameState.currentPlayer = null;
      console.log('No players available');
      return null;
    }

    // If no current player, select first player
    if (!this.gameState.currentPlayer) {
      this.gameState.currentPlayer = players[0].clientId;
      console.log(`No current player, selecting first: ${players[0].name}`);
      return this.gameState.currentPlayer;
    }

    // Find current player index
    const currentIndex = players.findIndex(p => p.clientId === this.gameState.currentPlayer);

    // If current player not found or no players, select first player
    if (currentIndex === -1) {
      this.gameState.currentPlayer = players[0].clientId;
      console.log(`Current player not in list, selecting first: ${players[0].name}`);
      return this.gameState.currentPlayer;
    }

    // Select next player in rotation
    const nextIndex = (currentIndex + 1) % players.length;
    this.gameState.currentPlayer = players[nextIndex].clientId;

    console.log(`Selected next player: ${players[nextIndex].name} (index: ${nextIndex})`);

    return this.gameState.currentPlayer;
  }

  // Start the game - call this when we have at least 2 players
  startGame(): boolean {
    const players = this.getPlayers();

    if (players.length < 2) {
      console.log(`Cannot start game: Need at least 2 players, have ${players.length}`);
      return false;
    }

    // Select a random player to start
    const randomIndex = Math.floor(Math.random() * players.length);
    this.gameState.currentPlayer = players[randomIndex].clientId;

    console.log(`Game started! First player is: ${players[randomIndex].name}`);

    return true;
  }

  // Task Management
  generateTask(): { a: number; b: number; operator: Operator } {
    const operators: Operator[] = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;

    this.gameState.currentTask = { a, b, operator };
    return { a, b, operator };
  }

  getCurrentTask() {
    return this.gameState.currentTask;
  }

  calculateAnswer(a: number, b: number, operator: Operator): number {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
    }
  }

  // Check answer and update score
  checkAnswer(clientId: ClientId, answer: number): boolean {
    const client = this.getClient(clientId);
    const task = this.gameState.currentTask;

    if (!client || !task || client.role !== 'player') {
      console.log(`Cannot check answer: client=${client?.name}, task exists=${!!task}, is player=${client?.role === 'player'}`);
      return false;
    }

    const correctAnswer = this.calculateAnswer(task.a, task.b, task.operator);

    console.log(`Checking answer: ${answer} vs ${correctAnswer} for ${task.a} ${task.operator} ${task.b}`);

    if (answer === correctAnswer) {
      this.incrementScore();
      client.score++;
      console.log(`Correct! New score: client=${client.score}, team=${this.gameState.score}`);
      return true;
    }

    console.log(`Incorrect answer`);
    return false;
  }

  // Create events
  createRegisteredEvent(clientId: ClientId, name: string): IRegisteredEvent {
    const players = this.getPlayers();
    const playerCount = players.length;

    return {
      type: "REGISTERED",
      message: `Welcome ${name}! ${playerCount} player${playerCount !== 1 ? 's' : ''} connected.`,
      clientId
    };
  }

  createNewTaskEvent(): INewTaskEvent {
    const task = this.generateTask();
    const currentPlayer = this.getCurrentPlayer();
    const players = this.getPlayers();

    console.log(`Creating new task event. Current player: ${currentPlayer}`);
    console.log(`Available players: ${players.map(p => p.name).join(', ')}`);

    // If no current player but we have players, select one
    if (!currentPlayer && players.length > 0) {
      this.selectNextPlayer();
    }

    return {
      type: "NEW_TASK",
      payload: {
        a: task.a,
        b: task.b,
        operator: task.operator,
        currentPlayer: this.gameState.currentPlayer || '',
        score: this.gameState.score
      }
    };
  }

  // Get status for REST API
  getStatus() {
    const players = this.getPlayers();
    const currentPlayer = this.getCurrentPlayer();
    const currentPlayerInfo = currentPlayer ? this.getClient(currentPlayer) : null;

    return {
      currentPlayer: currentPlayer,
      currentPlayerName: currentPlayerInfo?.name || null,
      score: this.gameState.score,
      currentTask: this.gameState.currentTask,
      players: players.map(player => ({
        clientId: player.clientId,
        name: player.name,
        role: player.role,
        score: player.score,
        isCurrent: player.clientId === currentPlayer
      })),
      observers: this.getAllClients()
        .filter(client => client.role === 'observer')
        .map(observer => ({
          clientId: observer.clientId,
          name: observer.name
        })),
      totalClients: this.clients.size,
      gameStarted: players.length >= 2 && this.gameState.currentPlayer !== null
    };
  }
}