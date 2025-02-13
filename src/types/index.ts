export interface PeerConnection {
  id: string;
  connection: any;
}

export interface FileTransfer {
  name: string;
  size: number;
  from: string;
  accepted?: boolean;
}

export type ConnectionStatus = 'initializing' | 'connected' | 'disconnected' | 'error';