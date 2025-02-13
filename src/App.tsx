import React, { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';
import { Share2, Users, FileUp, Download, AlertCircle, Copy, Check, RefreshCw } from 'lucide-react';
import { generatePeerId } from './utils/nameGenerator';

interface PeerConnection {
  id: string;
  connection: any;
}

interface FileTransfer {
  name: string;
  size: number;
  from: string;
  accepted?: boolean;
}

function App() {
  const [myPeerId, setMyPeerId] = useState<string>('');
  const [peers, setPeers] = useState<PeerConnection[]>([]);
  const [incomingFiles, setIncomingFiles] = useState<FileTransfer[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('initializing');
  const [browserSupported, setBrowserSupported] = useState(true);
  const [targetPeerId, setTargetPeerId] = useState('');
  const [copied, setCopied] = useState(false);
  const [connectError, setConnectError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const peerInstance = useRef<any>(null);
  const reconnectTimeout = useRef<NodeJS.Timeout>();
  const seenPeers = useRef<Set<string>>(new Set());
  const discoveryInterval = useRef<NodeJS.Timeout>();

  const initializePeer = () => {
    try {
      if (peerInstance.current) {
        peerInstance.current.destroy();
      }

      const peerId = generatePeerId();
      const peer = new Peer(peerId, {
        debug: 2,
        config: {
          iceServers: [
            { urls: 'stun:stun.relay.metered.ca:80' },
            { urls: 'turn:a.relay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:a.relay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:a.relay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'turn:a.relay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
          ],
          iceCandidatePoolSize: 10,
        },
        host: '0.peerjs.com',
        secure: true,
        port: 443,
        path: '/',
        pingInterval: 3000,
        retryTimer: 1000,
      });

      peerInstance.current = peer;

      peer.on('open', (id) => {
        console.log('Peer opened with ID:', id);
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
        } else if (error.type === 'disconnected' || error.type === 'network') {
          setConnectionStatus('disconnected');
          
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          reconnectTimeout.current = setTimeout(() => {
            initializePeer();
          }, 3000);
        }
      });

      peer.on('disconnected', () => {
        console.log('Peer disconnected, attempting reconnect...');
        setConnectionStatus('disconnected');
        
        try {
          peer.reconnect();
        } catch (e) {
          console.error('Reconnect failed, reinitializing...', e);
          setTimeout(() => {
            initializePeer();
          }, 1000);
        }
      });

      return peer;
    } catch (error) {
      console.error('Failed to initialize peer:', error);
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
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (discoveryInterval.current) {
        clearInterval(discoveryInterval.current);
      }
      if (peerInstance.current) {
        try {
          peerInstance.current.destroy();
        } catch (e) {
          console.error('Error destroying peer:', e);
        }
      }
    };
  }, []);

  const startDiscovery = () => {
    if (discoveryInterval.current) {
      clearInterval(discoveryInterval.current);
    }

    const broadcastPresence = () => {
      if (peerInstance.current?.open) {
        const presence = {
          id: myPeerId,
          timestamp: Date.now(),
          userAgent: navigator.userAgent
        };
        
        try {
          localStorage.setItem(`peer-${myPeerId}`, JSON.stringify(presence));
          
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith('peer-')) {
              try {
                const data = JSON.parse(localStorage.getItem(key) || '');
                if (Date.now() - data.timestamp < 10000 && data.id !== myPeerId) {
                  handlePeerDiscovery(data.id);
                } else if (Date.now() - data.timestamp >= 10000) {
                  localStorage.removeItem(key);
                }
              } catch (e) {
                localStorage.removeItem(key);
              }
            }
          }
        } catch (e) {
          console.error('Error in discovery:', e);
        }
      }
    };

    broadcastPresence();
    discoveryInterval.current = setInterval(broadcastPresence, 5000);

    window.addEventListener('storage', (e) => {
      if (e.key?.startsWith('peer-')) {
        try {
          const data = JSON.parse(e.newValue || '');
          if (data.id && data.id !== myPeerId) {
            handlePeerDiscovery(data.id);
          }
        } catch (e) {
          console.error('Error parsing peer presence:', e);
        }
      }
    });
  };

  const handlePeerDiscovery = (remotePeerId: string) => {
    if (!remotePeerId || seenPeers.current.has(remotePeerId) || remotePeerId === myPeerId) {
      return;
    }

    console.log('Discovered peer:', remotePeerId);
    seenPeers.current.add(remotePeerId);
    connectToPeer(remotePeerId);
  };

  const handleConnection = (conn: any) => {
    if (!conn || peers.some(p => p.id === conn.peer)) {
      return;
    }

    console.log('Handling incoming connection from:', conn.peer);

    try {
      conn.on('data', handleIncomingData);
      
      conn.on('open', () => {
        console.log('Connection opened with:', conn.peer);
        setPeers(prev => {
          const filtered = prev.filter(p => p.id !== conn.peer);
          return [...filtered, { id: conn.peer, connection: conn }];
        });
        setConnectError('');
        setIsConnecting(false);
      });

      conn.on('close', () => {
        console.log('Connection closed with:', conn.peer);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
      });

      conn.on('error', (error: any) => {
        console.error('Connection error with:', conn.peer, error);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        seenPeers.current.delete(conn.peer);
        setConnectError('Failed to connect to peer');
        setIsConnecting(false);
      });
    } catch (error) {
      console.error('Error in handleConnection:', error);
      setConnectError('Failed to establish connection');
      setIsConnecting(false);
    }
  };

  const connectToPeer = (peerId: string) => {
    if (!peerInstance.current?.open || !peerId || peerId === myPeerId || peers.some(p => p.id === peerId)) {
      return;
    }

    setIsConnecting(true);
    setConnectError('');
    console.log('Attempting to connect to peer:', peerId);

    try {
      const conn = peerInstance.current.connect(peerId, {
        reliable: true,
        serialization: 'json',
        metadata: { id: myPeerId }
      });

      setTimeout(() => {
        if (isConnecting && !peers.some(p => p.id === peerId)) {
          setConnectError('Connection attempt timed out');
          setIsConnecting(false);
          seenPeers.current.delete(peerId);
        }
      }, 10000);

      handleConnection(conn);
    } catch (error) {
      console.error('Error connecting to peer:', error);
      setConnectError('Failed to connect to peer');
      setIsConnecting(false);
      seenPeers.current.delete(peerId);
    }
  };

  const handleIncomingData = (data: any) => {
    try {
      if (data.type === 'file-offer') {
        setIncomingFiles(prev => [...prev, {
          name: data.fileName,
          size: data.fileSize,
          from: data.from
        }]);
      } else if (data.type === 'file-data') {
        const blob = new Blob([data.content]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.fileName;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error handling incoming data:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const sendFile = async () => {
    if (!selectedFile) return;

    peers.forEach(peer => {
      try {
        peer.connection.send({
          type: 'file-offer',
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          from: myPeerId
        });

        const reader = new FileReader();
        reader.onload = () => {
          try {
            peer.connection.send({
              type: 'file-data',
              fileName: selectedFile.name,
              content: reader.result
            });
          } catch (error) {
            console.error('Error sending file data:', error);
          }
        };
        reader.readAsArrayBuffer(selectedFile);
      } catch (error) {
        console.error('Error in sendFile:', error);
      }
    });

    setSelectedFile(null);
  };

  const copyPeerId = async () => {
    try {
      await navigator.clipboard.writeText(myPeerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleManualConnect = () => {
    if (targetPeerId) {
      connectToPeer(targetPeerId);
      setTargetPeerId('');
    }
  };

  const handleReconnect = () => {
    setConnectionStatus('initializing');
    initializePeer();
  };

  if (!browserSupported) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
          <div className="flex items-center space-x-3 text-red-500 mb-4">
            <AlertCircle className="w-6 h-6" />
            <h1 className="text-xl font-bold">Browser Not Supported</h1>
          </div>
          <p className="text-gray-600">
            Your browser doesn't support WebRTC, which is required for peer-to-peer file sharing.
            Please try using a modern browser like Chrome, Firefox, or Edge.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-2">
              <Share2 className="w-6 h-6 text-blue-500" />
              <h1 className="text-2xl font-bold">P2P File Sharing</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-gray-500" />
                <span className="text-sm text-gray-500">
                  {peers.length} connected peer(s)
                </span>
              </div>
              <button
                onClick={handleReconnect}
                className="p-2 text-gray-500 hover:text-blue-500 transition-colors rounded-full hover:bg-gray-100"
                title="Reconnect"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-4">
              <div className="flex-1 flex items-center space-x-2">
                <p className="text-sm text-gray-500">Your ID:</p>
                <code className="px-2 py-1 bg-gray-100 rounded text-sm">{myPeerId}</code>
                <button
                  onClick={copyPeerId}
                  className="p-1 text-gray-500 hover:text-blue-500 transition-colors"
                  title="Copy ID"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 
                connectionStatus === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-yellow-100 text-yellow-800'
              }`}>
                {connectionStatus}
              </span>
            </div>

            <div className="space-y-2 mb-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={targetPeerId}
                  onChange={(e) => setTargetPeerId(e.target.value)}
                  placeholder="Enter peer ID to connect manually"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
                <button
                  onClick={handleManualConnect}
                  disabled={!targetPeerId || targetPeerId === myPeerId || isConnecting}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                >
                  {isConnecting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Connecting...</span>
                    </>
                  ) : (
                    <span>Connect</span>
                  )}
                </button>
              </div>
              {connectError && (
                <p className="text-sm text-red-500">{connectError}</p>
              )}
            </div>

            <div className="flex space-x-4">
              <div className="flex-1">
                <input
                  type="file"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-input"
                />
                <label
                  htmlFor="file-input"
                  className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer"
                >
                  <FileUp className="w-5 h-5 mr-2" />
                  Choose File
                </label>
              </div>
              {selectedFile && (
                <button
                  onClick={sendFile}
                  className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={peers.length === 0}
                >
                  Send to All Peers
                </button>
              )}
            </div>
            {selectedFile && (
              <p className="mt-2 text-sm text-gray-500">
                Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
              </p>
            )}
          </div>

          {peers.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg">
              <h2 className="text-sm font-medium text-gray-700 mb-2">Connected Peers:</h2>
              <div className="space-y-1">
                {peers.map((peer) => (
                  <div key={peer.id} className="text-sm text-gray-500">
                    {peer.id}
                  </div>
                ))}
              </div>
            </div>
          )}

          {incomingFiles.length > 0 && (
            <div className="border-t pt-4">
              <h2 className="text-lg font-semibold mb-4">Incoming Files</h2>
              <div className="space-y-3">
                {incomingFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                  >
                    <div>
                      <p className="font-medium">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        From: {file.from} • {Math.round(file.size / 1024)} KB
                      </p>
                    </div>
                    {!file.accepted && (
                      <Download className="w-5 h-5 text-blue-500 cursor-pointer" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;