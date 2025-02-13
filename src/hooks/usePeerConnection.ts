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
  const [networkMode, setNetworkMode] = useState<'local' | 'global'>('local');

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

    console.log('🟡 Attempting connection with peer:', conn.peer);

    try {
      conn.on('data', (data: any) => {
        if (typeof window.onPeerData === 'function') {
          window.onPeerData(data);
        }
      });
      
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
    if (!peerInstance.current?.open || 
        !peerId || 
        peerId === myPeerId || 
        peers.some(p => p.id === peerId) ||
        seenPeers.current.has(peerId)) {
      return;
    }

    setIsConnecting(true);
    setConnectError('');
    seenPeers.current.add(peerId);

    try {
      const conn = peerInstance.current.connect(peerId, {
        reliable: true,
        serialization: 'json',
        metadata: { id: myPeerId }
      });

      const timeout = setTimeout(() => {
        if (!peers.some(p => p.id === peerId)) {
          setConnectError('Connection attempt timed out');
          setIsConnecting(false);
          try {
            conn.close();
          } catch (e) {
            console.error('Error closing connection:', e);
          }
        }
      }, 5000);

      handleConnection(conn);

      conn.on('open', () => {
        clearTimeout(timeout);
      });

      conn.on('error', () => {
        clearTimeout(timeout);
      });
    } catch (error) {
      console.error('Error connecting to peer:', error);
      setConnectError('Failed to connect to peer');
      setIsConnecting(false);
    }
  };

  const initializePeer = useCallback(() => {
    try {
      const id = generatePeerId();
      const config = networkMode === 'local' ? PEER_CONFIG.local : PEER_CONFIG.global;
      
      console.log('🔧 Initializing PeerJS with config:', config);
      console.log('🆔 Generated Peer ID:', id);
      
      peerInstance.current = new Peer(id, config);
      setMyPeerId(id);
      setConnectionStatus('connecting');
      
      peerInstance.current.on('open', () => {
        console.log('✅ PeerJS connection established');
        setConnectionStatus('connected');
        if (roomServiceRef.current) {
          console.log('🧹 Cleaning up old RoomService');
          roomServiceRef.current.cleanup();
        }
        console.log('��️ Creating new RoomService');
        roomServiceRef.current = new RoomService(networkMode);
        roomServiceRef.current.initialize(id);
      });

      peerInstance.current.on('error', (error: any) => {
        console.error('🔴 PeerJS error:', error);
        setConnectionStatus('error');
        setConnectError(`Connection error: ${error.type}`);
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
  }, [networkMode]);

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
        case 'file-metadata': {
          // Initialize file reception
          const fileReception = {
            name: data.name,
            size: data.size,
            type: data.fileType,
            chunks: [],
            receivedChunks: 0,
            totalChunks: Math.ceil(data.size / 16384)
          };
          setCurrentFileReception(fileReception);
          break;
        }
        
        case 'file-chunk': {
          setCurrentFileReception(prev => {
            if (!prev || prev.name !== data.fileName) return prev;
            
            const newChunks = [...prev.chunks];
            newChunks[data.chunkIndex] = data.chunk;
            
            return {
              ...prev,
              chunks: newChunks,
              receivedChunks: prev.receivedChunks + 1
            };
          });
          break;
        }
        
        case 'file-complete': {
          setCurrentFileReception(prev => {
            if (!prev || prev.name !== data.fileName) return prev;
            
            // Combine all chunks into a single file
            const fileBlob = new Blob(prev.chunks, { type: prev.type });
            
            // Create download link
            const url = URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = prev.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            return null; // Clear the reception state
          });
          break;
        }
        
        // ... handle other message types ...
      }
    }
  }, []);

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
    if (peerInstance.current) {
      peerInstance.current.on('connection', (conn) => {
        conn.on('data', handleIncomingData);
      });
    }
  }, [handleIncomingData]);

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
    networkMode,
    setNetworkMode,
    seenPeers
  };
}