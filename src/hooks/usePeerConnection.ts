import { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { PeerConnection, ConnectionStatus } from '../types';
import { generatePeerId } from '../utils/nameGenerator';
import { PEER_CONFIG } from '../config/peer';
import { RoomService } from '../services/roomService';

export function usePeerConnection() {
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('initializing');
  const [browserSupported, setBrowserSupported] = useState(true);
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  const peerInstance = useRef<any>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const seenPeers = useRef<Set<string>>(new Set());
  const discoveryInterval = useRef<NodeJS.Timeout>();
  const roomServiceRef = useRef<RoomService | null>(null);

  const handleConnection = (conn: any) => {
    if (!conn) return;

    try {
      conn.on('data', (data: any) => {
        if (typeof window.onPeerData === 'function') {
          window.onPeerData(data);
        }
      });
      
      conn.on('open', () => {
        setPeers(prev => {
          if (prev.some(p => p.id === conn.peer)) {
            return prev;
          }
          return [...prev, { id: conn.peer, connection: conn }];
        });
        setConnectError('');
        setIsConnecting(false);
      });

      conn.on('close', () => {
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
      });

      conn.on('error', (err: any) => {
        console.error('Connection error:', err);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
        
        const errorMessage = err.type === 'peer-unavailable' 
          ? 'Peer is not available or has disconnected'
          : 'Connection failed: ' + (err.message || 'Unknown error');
        
        setConnectError(errorMessage);
        setIsConnecting(false);
      });
    } catch (error) {
      console.error('Error in handleConnection:', error);
      setConnectError('Failed to establish connection');
      setIsConnecting(false);
    }
  };

  const discoverAndConnectToPeers = () => {
    if (!peerInstance.current?.open) return;

    const activePeers = new Set(peers.map(p => p.id));
    const now = Date.now();

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('peer-')) continue;

      try {
        const data = JSON.parse(localStorage.getItem(key) || '');
        const peerId = data.id;
        
        // Skip if it's our own ID or already connected
        if (!peerId || peerId === myPeerId || activePeers.has(peerId)) continue;

        // Only connect to peers that have been seen in the last 3 seconds
        if (now - data.timestamp <= 3000 && !seenPeers.current.has(peerId)) {
          connectToPeer(peerId);
        }
      } catch (e) {
        console.error('Error parsing peer data:', e);
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
            if (now - data.timestamp > 5000) {
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

  const initializePeer = () => {
    try {
      if (peerInstance.current) {
        peerInstance.current.destroy();
      }

      seenPeers.current.clear();

      const peerId = generatePeerId();
      const peer = new Peer(peerId, PEER_CONFIG);

      peerInstance.current = peer;

      peer.on('open', (id) => {
        setMyPeerId(id);
        setConnectionStatus('connected');
        startDiscovery();
      });

      peer.on('connection', handleConnection);

      peer.on('error', (error) => {
        console.error('Peer error:', error);
        if (error.type === 'browser-incompatible') {
          setBrowserSupported(false);
          setConnectionStatus('error');
        } else if (error.type === 'peer-unavailable') {
          setConnectError('Peer is not available');
          setIsConnecting(false);
        } else if (error.type === 'disconnected' || error.type === 'network') {
          setConnectionStatus('disconnected');
          
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          reconnectTimeout.current = setTimeout(initializePeer, 3000);
        }
      });

      peer.on('disconnected', () => {
        setConnectionStatus('disconnected');
        try {
          peer.reconnect();
        } catch (e) {
          console.error('Error reconnecting:', e);
          setTimeout(initializePeer, 1000);
        }
      });

      return peer;
    } catch (error) {
      console.error('Error initializing peer:', error);
      setConnectionStatus('error');
      return null;
    }
  };

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

  return {
    myPeerId,
    peers,
    connectionStatus,
    browserSupported,
    connectError,
    isConnecting,
    connectToPeer,
    initializePeer
  };
}