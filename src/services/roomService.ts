export class RoomService {
  private ws: WebSocket;
  private myPeerId: string;
  private onPeerDiscoveredCallback: ((peerId: string) => void) | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimeout: number | null = null;

  constructor() {
    this.myPeerId = '';
    this.ws = this.createWebSocket();
  }

  private createWebSocket(): WebSocket {
    const wsUrl = import.meta.env.PROD 
      ? 'wss://real-pike-97.deno.dev/'
      : 'ws://sendtofriend.netlify.app/';
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'peers-list':
          data.peers.forEach((peerId: string) => {
            this.onPeerDiscoveredCallback?.(peerId);
          });
          break;
          
        case 'peer-joined':
          this.onPeerDiscoveredCallback?.(data.peerId);
          break;
      }
    };

    ws.onclose = () => {
      this.handleDisconnection();
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
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

  initialize(peerId: string) {
    this.myPeerId = peerId;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.register();
    } else {
      this.ws.onopen = () => {
        this.register();
        this.reconnectAttempts = 0;
      };
    }
  }

  private register() {
    this.ws.send(JSON.stringify({
      type: 'register',
      peerId: this.myPeerId
    }));
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