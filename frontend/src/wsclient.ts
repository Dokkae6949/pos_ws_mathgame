// WebSocket client utilities
export function generateClientId(): string {
  return 'client_' + Math.random().toString(36).substring(2, 11);
}