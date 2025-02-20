import { useEffect, useRef, useState, useCallback } from 'react';
import { Peer } from 'peerjs';
import { PeerConnection, ConnectionStatus } from '../types';
import { generatePeerId } from '../utils/nameGenerator';
import { PEER_CONFIG } from '../config/peer';
import { RoomService } from '../services/roomService';

interface FileTransfer {
  name: string;
  size: number;
  type: string;
  data: ArrayBuffer;
}

export function usePeerConnection() {
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initializing');
  const [browserSupported, setBrowserSupported] = useState(true);
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [currentFileReception, setCurrentFileReception] = useState<FileTransfer | null>(null);
  const [messages, setMessages] = useState<Array<{
    id: string;
    text: string;
    sender: string;
    timestamp: number;
  }>>([]);

  const peerInstance = useRef<any>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const seenPeers = useRef<Set<string>>(new Set());
  const discoveryInterval = useRef<NodeJS.Timeout>();
  const roomServiceRef = useRef<RoomService | null>(null);

  const handleConnection = (conn: any) => {
    if (!conn) {
      console.log('🔴 Connection object is null');
      return;
    }

    // If we already have this peer, keep the connection with the lower peer ID
    if (peers.some(p => p.id === conn.peer)) {
      console.log('🟨 Duplicate connection detected:', conn.peer);
      const shouldKeepNew = myPeerId < conn.peer;
      
      if (!shouldKeepNew) {
        console.log('🔄 Keeping existing connection');
        try {
          conn.close();
        } catch (e) {
          console.error('Error closing duplicate connection:', e);
        }
        return;
      } else {
        console.log('🔄 Replacing with new connection');
        // Close the existing connection
        const existingPeer = peers.find(p => p.id === conn.peer);
        try {
          existingPeer?.connection.close();
        } catch (e) {
          console.error('Error closing existing connection:', e);
        }
      }
    }

    console.log('🟡 Attempting connection with peer:', conn.peer);

    try {
      conn.on('data', handleIncomingData);
      
      conn.on('open', () => {
        console.log('🟢 Connection opened with peer:', conn.peer);
        setPeers(prev => {
          if (prev.some(p => p.id === conn.peer)) {
            console.log('🟨 Peer already connected:', conn.peer);
            return prev;
          }
          console.log('✅ Adding new peer:', conn.peer);
          return [...prev, { id: conn.peer, connection: conn }];
        });
        setConnectError('');
        setIsConnecting(false);
      });

      conn.on('close', () => {
        console.log('🔴 Connection closed with peer:', conn.peer);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
      });

      conn.on('error', (err: any) => {
        console.error('🔴 Connection error with peer:', conn.peer, err);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
        
        const errorMessage = err.type === 'peer-unavailable' 
          ? 'Peer is not available or has disconnected'
          : 'Connection failed: ' + (err.message || 'Unknown error');
        
        setConnectError(errorMessage);
        setIsConnecting(false);
      });
    } catch (error) {
      console.error('🔴 Error in handleConnection:', error);
      setConnectError('Failed to establish connection');
      setIsConnecting(false);
    }
  };

  const discoverAndConnectToPeers = () => {
    if (!peerInstance.current?.open) {
      console.log('🟨 Peer instance not ready for discovery');
      return;
    }

    console.log('🔍 Starting peer discovery...');
    const activePeers = new Set(peers.map(p => p.id));
    const now = Date.now();

    console.log('👥 Current active peers:', Array.from(activePeers));
    console.log('👀 Seen peers:', Array.from(seenPeers.current));

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('peer-')) continue;

      try {
        const data = JSON.parse(localStorage.getItem(key) || '');
        const age = now - data.timestamp;
        console.log('�� Found peer:', data.id, 'Age:', age + 'ms');
        
        if (!data.id || data.id === myPeerId || activePeers.has(data.id)) {
          console.log('⏭️ Skipping peer:', data.id, '(self or already connected)');
          continue;
        }

        if (age <= 10000 && !seenPeers.current.has(data.id)) {
          console.log('🤝 Attempting to connect to peer:', data.id);
          connectToPeer(data.id);
        } else {
          console.log('⏭️ Skipping peer:', data.id, '(stale or already seen)');
        }
      } catch (e) {
        console.error('🔴 Error parsing peer data:', e);
      }
    }
  };

  const startDiscovery = () => {
    if (!peerInstance.current?.open) return;

    const broadcastPresence = () => {
      if (!peerInstance.current?.open) return;

      // Clean up stale peer entries
      const now = Date.now();
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key?.startsWith('peer-')) {
          try {
            const data = JSON.parse(localStorage.getItem(key) || '');
            const age = now - data.timestamp;
            if (age > 15000) {
              localStorage.removeItem(key);
              seenPeers.current.delete(data.id);
            }
          } catch (e) {
            localStorage.removeItem(key);
          }
        }
      }
      
      // Broadcast our presence
      const presence = {
        id: myPeerId,
        timestamp: now
      };
      
      try {
        localStorage.setItem(`peer-${myPeerId}`, JSON.stringify(presence));
        discoverAndConnectToPeers();
      } catch (e) {
        console.error('Error in discovery:', e);
      }
    };

    // Initial broadcast and discovery
    broadcastPresence();
    
    // Set up regular intervals
    if (discoveryInterval.current) {
      clearInterval(discoveryInterval.current);
    }
    
    discoveryInterval.current = setInterval(broadcastPresence, 1000);

    // Listen for storage events from other tabs/windows
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith('peer-') && e.newValue) {
        try {
          const data = JSON.parse(e.newValue);
          if (data.id && 
              data.id !== myPeerId && 
              !peers.some(p => p.id === data.id) &&
              !seenPeers.current.has(data.id)) {
            connectToPeer(data.id);
          }
        } catch (e) {
          console.error('Error parsing peer presence:', e);
        }
      }
    };

    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('storage', handleStorage);
    };
  };

  const connectToPeer = (peerId: string) => {
    const shouldInitiateConnection = myPeerId < peerId;

    if (!peerInstance.current?.open || 
        !peerId || 
        peerId === myPeerId || 
        peers.some(p => p.id === peerId) ||
        !shouldInitiateConnection) {
      return;
    }

    setIsConnecting(true);
    setConnectError('');
    
    try {
      const conn = peerInstance.current.connect(peerId, {
        reliable: true,
        serialization: 'json',
        metadata: { id: myPeerId }
      });

      handleConnection(conn);
    } catch (error) {
      console.error('Error connecting to peer:', error);
      setConnectError('Failed to connect to peer');
      setIsConnecting(false);
    }
  };

  const initializePeer = useCallback(() => {
    try {
      // Clean up existing peer instance
      if (peerInstance.current) {
        console.log('🧹 Cleaning up existing peer instance');
        peers.forEach(peer => {
          try {
            peer.connection.close();
          } catch (e) {
            console.error('Error closing peer connection:', e);
          }
        });
        setPeers([]);
        seenPeers.current.clear();
        try {
          localStorage.removeItem(`peer-${myPeerId}`);
        } catch (e) {
          console.error('Error removing peer presence:', e);
        }
        try {
          peerInstance.current.destroy();
        } catch (e) {
          console.error('Error destroying peer:', e);
        }
      }

      // Clear any existing intervals/timeouts
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (discoveryInterval.current) clearInterval(discoveryInterval.current);

      // Initialize new peer
      const id = generatePeerId();
      
      console.log('🔧 Initializing PeerJS with config:', PEER_CONFIG);
      console.log('🆔 Generated Peer ID:', id);
      
      peerInstance.current = new Peer(id, PEER_CONFIG);
      setMyPeerId(id);
      setConnectionStatus('connecting');
      
      peerInstance.current.on('open', () => {
        console.log('✅ PeerJS connection established');
        setConnectionStatus('connected');
        if (roomServiceRef.current) {
          console.log('🧹 Cleaning up old RoomService');
          roomServiceRef.current.cleanup();
        }
        console.log('🏗️ Creating new RoomService');
        roomServiceRef.current = new RoomService();
        roomServiceRef.current.initialize(id);
      });

      peerInstance.current.on('error', (error: any) => {
        console.error('🔴 PeerJS error:', error);
        
        // Only set error state for critical connection issues
        if (error.type === 'network' || error.type === 'server-error' || error.type === 'browser-incompatible') {
          setConnectionStatus('error');
          setConnectError(`Connection error: ${error.type}`);
        } else if (error.type === 'peer-unavailable') {
          // Handle peer connection failures locally
          console.log(`⚠️ Could not connect to peer: ${error.peerId}`);
          setConnectError(`Could not connect to peer: ${error.peerId}`);
          // Clear error message after a delay
          setTimeout(() => setConnectError(''), 3000);
        } else {
          // Log other non-critical errors without changing connection status
          console.warn(`⚠️ Non-critical PeerJS error: ${error.type}`);
        }
      });

      peerInstance.current.on('disconnected', () => {
        console.log('🟡 PeerJS disconnected, attempting to reconnect...');
        setConnectionStatus('connecting');
        peerInstance.current?.reconnect();
      });

      peerInstance.current.on('close', () => {
        console.log('🔴 PeerJS connection closed');
        setConnectionStatus('disconnected');
      });

      // Add connection handler
      peerInstance.current.on('connection', handleConnection);

    } catch (error) {
      console.error('🔴 Error initializing peer:', error);
      setConnectionStatus('error');
    }
  }, [myPeerId, handleConnection]);

  const handleFileTransfer = useCallback((conn: DataConnection, file: File) => {
    const reader = new FileReader();
    
    reader.onload = async () => {
      if (reader.result instanceof ArrayBuffer) {
        const fileTransfer: FileTransfer = {
          name: file.name,
          size: file.size,
          type: file.type,
          data: reader.result
        };
        
        try {
          // Send file metadata first
          conn.send({
            type: 'file-metadata',
            name: file.name,
            size: file.size,
            fileType: file.type
          });

          // Send the actual file data in chunks
          const chunkSize = 16384; // 16KB chunks
          const totalChunks = Math.ceil(reader.result.byteLength / chunkSize);
          
          for (let i = 0; i < totalChunks; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, reader.result.byteLength);
            const chunk = reader.result.slice(start, end);
            
            conn.send({
              type: 'file-chunk',
              chunk,
              chunkIndex: i,
              totalChunks,
              fileName: file.name
            });

            // Add a small delay between chunks to prevent overwhelming the connection
            await new Promise(resolve => setTimeout(resolve, 10));
          }

          // Send completion message
          conn.send({
            type: 'file-complete',
            fileName: file.name
          });
        } catch (error) {
          console.error('Error sending file:', error);
          setTransferError(`Failed to send file: ${error.message}`);
        }
      }
    };

    reader.onerror = () => {
      setTransferError('Failed to read file');
    };

    reader.readAsArrayBuffer(file);
  }, []);

  const handleIncomingData = useCallback((data: any) => {
    if (typeof data === 'object' && data.type) {
      switch (data.type) {
        case 'chat-message': {
          setMessages(prev => [...prev, data.message]);
          break;
        }
        case 'file-metadata':
        case 'file-chunk':
        case 'file-complete': {
          // Pass file-related messages to the file handler
          window.onPeerData?.(data);
          break;
        }
      }
    }
  }, []);

  const sendMessage = useCallback((text: string) => {
    const message = {
      id: `${myPeerId}-${Date.now()}`,
      text,
      sender: myPeerId,
      timestamp: Date.now()
    };

    // Add message to local state
    setMessages(prev => [...prev, message]);

    // Send to all peers
    peers.forEach(peer => {
      try {
        peer.connection.send({
          type: 'chat-message',
          message
        });
      } catch (error) {
        console.error('Error sending message:', error);
      }
    });
  }, [myPeerId, peers]);

  useEffect(() => {
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setBrowserSupported(false);
      setConnectionStatus('error');
      return;
    }

    initializePeer();

    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      if (discoveryInterval.current) clearInterval(discoveryInterval.current);
      if (peerInstance.current) {
        try {
          peerInstance.current.destroy();
        } catch (e) {
          console.error('Error destroying peer:', e);
        }
      }
      try {
        localStorage.removeItem(`peer-${myPeerId}`);
      } catch (e) {
        console.error('Error removing peer presence:', e);
      }
    };
  }, []);

  useEffect(() => {
    const initializeRoom = () => {
      if (myPeerId && !roomServiceRef.current) {
        roomServiceRef.current = new RoomService();
        roomServiceRef.current.initialize(myPeerId);
        roomServiceRef.current.onPeerDiscovered((discoveredPeerId) => {
          connectToPeer(discoveredPeerId);
        });
      }
    };

    if (myPeerId) {
      initializeRoom();
    }

    return () => {
      roomServiceRef.current?.cleanup();
    };
  }, [myPeerId]);

  useEffect(() => {
    // Add debug command to window
    (window as any).debugPeerInfo = () => {
      console.log('🔍 Debug Info:');
      console.log('🆔 My Peer ID:', myPeerId);
      console.log('👥 Connected Peers:', peers);
      console.log('👀 Seen Peers:', Array.from(seenPeers.current || new Set()));
      console.log('🌐 Network Mode:', networkMode);
      console.log('📡 Connection Status:', connectionStatus);
      console.log('💾 LocalStorage:', Object.fromEntries(
        Object.entries(localStorage).filter(([key]) => key.startsWith('peer-'))
      ));
    };

    return () => {
      delete (window as any).debugPeerInfo;
    };
  }, [myPeerId, peers, connectionStatus]);

  return {
    myPeerId,
    peers,
    connectionStatus,
    browserSupported,
    connectError,
    isConnecting,
    connectToPeer,
    initializePeer,
    handleFileTransfer,
    transferError,
    currentFileReception,
    seenPeers,
    messages,
    setMessages,
    sendMessage
  };
}