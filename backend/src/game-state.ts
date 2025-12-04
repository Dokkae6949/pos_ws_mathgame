import {
  IClientInfo,
  ClientId,
  Operator,
  IGameState,
  INewTaskEvent,
  IRegisteredEvent
} from './types';

export class GameStateManager {
  private clients: Map<ClientId, IClientInfo> = new Map();
  private gameState: IGameState = {
    currentPlayer: null,
    score: 0,
    currentTask: null
  };

  registerClient(clientInfo: IClientInfo): void {
    this.clients.set(clientInfo.clientId, clientInfo);
    const players = this.getPlayers();
    
    // Auto-start game when 2 players join
    if (players.length === 2) {
      this.gameState.currentPlayer = players[Math.floor(Math.random() * players.length)].clientId;
    }
  }

  removeClient(clientId: ClientId): void {
    this.clients.delete(clientId);
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
    return this.getAllClients().filter(c => c.role === 'player');
  }

  getCurrentPlayer(): ClientId | null {
    return this.gameState.currentPlayer;
  }

  getCurrentTask() {
    return this.gameState.currentTask;
  }

  getScore(): number {
    return this.gameState.score;
  }

  selectNextPlayer(): ClientId | null {
    const players = this.getPlayers();
    if (players.length === 0) {
      this.gameState.currentPlayer = null;
      return null;
    }

    const currentIndex = players.findIndex(p => p.clientId === this.gameState.currentPlayer);
    const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % players.length;
    this.gameState.currentPlayer = players[nextIndex].clientId;
    return this.gameState.currentPlayer;
  }

  generateTask(): { a: number; b: number; operator: Operator } {
    const operators: Operator[] = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * 3)];
    const a = Math.floor(Math.random() * 10) + 1;
    const b = Math.floor(Math.random() * 10) + 1;
    this.gameState.currentTask = { a, b, operator };
    return { a, b, operator };
  }

  checkAnswer(clientId: ClientId, answer: number): boolean {
    const client = this.getClient(clientId);
    const task = this.gameState.currentTask;

    if (!client || !task || client.role !== 'player') return false;

    const correctAnswer = this.calculateAnswer(task.a, task.b, task.operator);
    if (answer === correctAnswer) {
      this.gameState.score++;
      client.score++;
      return true;
    }
    return false;
  }

  private calculateAnswer(a: number, b: number, operator: Operator): number {
    switch (operator) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
    }
  }

  createRegisteredEvent(clientId: ClientId, name: string): IRegisteredEvent {
    const playerCount = this.getPlayers().length;
    return {
      type: "REGISTERED",
      message: `Welcome ${name}! ${playerCount} player${playerCount !== 1 ? 's' : ''} connected.`,
      clientId
    };
  }

  createNewTaskEvent(): INewTaskEvent {
    const task = this.generateTask();
    if (!this.gameState.currentPlayer && this.getPlayers().length > 0) {
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

  getStatus() {
    const players = this.getPlayers();
    const currentPlayer = this.getCurrentPlayer();
    return {
      currentPlayer,
      currentPlayerName: currentPlayer ? this.getClient(currentPlayer)?.name : null,
      score: this.gameState.score,
      currentTask: this.gameState.currentTask,
      players: players.map(p => ({
        clientId: p.clientId,
        name: p.name,
        role: p.role,
        score: p.score,
        isCurrent: p.clientId === currentPlayer
      })),
      totalClients: this.clients.size,
      gameStarted: players.length >= 2 && currentPlayer !== null
    };
  }
}