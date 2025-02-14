export class RoomService {
  private ws: WebSocket;
  private myPeerId: string;
  private onPeerDiscoveredCallback: ((peerId: string) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;

  constructor() {
    console.log('🔧 Initializing RoomService');
    this.myPeerId = '';
    this.ws = this.createWebSocket();
  }

  private createWebSocket(): WebSocket {
    const wsUrl = import.meta.env.PROD 
      ? 'wss://real-pike-97.deno.dev/'  // Production Deno Deploy URL
      : 'ws://localhost:8080';           // Local development URL

    console.log('🔌 Connecting to WebSocket server:', wsUrl);
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('✅ WebSocket connection established');
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📥 Received WebSocket message:', data.type);
        
        switch (data.type) {
          case 'heartbeat':
            ws.send(JSON.stringify({ type: 'heartbeat' }));
            break;
          case 'peers-list':
            console.log('👥 Received peers list:', data.peers);
            data.peers.forEach((peerId: string) => {
              this.onPeerDiscoveredCallback?.(peerId);
            });
            break;
            
          case 'peer-joined':
            console.log('👤 New peer joined:', data.peerId);
            this.onPeerDiscoveredCallback?.(data.peerId);
            break;
        }
      } catch (e) {
        console.error('🔴 Error handling WebSocket message:', e);
      }
    };

    ws.onclose = () => {
      console.log('🔴 WebSocket connection closed');
      this.handleDisconnection();
    };

    ws.onerror = (error) => {
      console.error('🔴 WebSocket error:', error);
      // Don't propagate WebSocket errors unless they're critical
      if (this.ws.readyState === WebSocket.CLOSED) {
        this.handleDisconnection();
      }
    };

    return ws;
  }

  private handleDisconnection() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 10000);
      
      this.reconnectTimeout = window.setTimeout(() => {
        console.log(`Attempting to reconnect... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
        this.ws = this.createWebSocket();
        if (this.myPeerId) {
          this.initialize(this.myPeerId);
        }
      }, delay);
    }
  }

  public initialize(peerId: string) {
    console.log('🚀 Initializing RoomService with peer ID:', peerId);
    this.myPeerId = peerId;
    if (this.ws.readyState === WebSocket.OPEN) {
      console.log('📡 Registering peer with signaling server');
      this.ws.send(JSON.stringify({ type: 'register', peerId }));
    } else {
      console.log('⏳ Waiting for WebSocket connection...');
      this.ws.onopen = () => {
        console.log('📡 WebSocket now open, registering peer');
        this.ws.send(JSON.stringify({ type: 'register', peerId }));
      };
    }
  }

  onPeerDiscovered(callback: (peerId: string) => void) {
    this.onPeerDiscoveredCallback = callback;
  }

  cleanup() {
    if (this.reconnectTimeout) {
      window.clearTimeout(this.reconnectTimeout);
    }
    
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'disconnect',
        peerId: this.myPeerId
      }));
    }
    this.ws.close();
  }
} 