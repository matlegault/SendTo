import React, { useEffect, useState, useRef } from 'react';
import { Peer } from 'peerjs';
import { nanoid } from 'nanoid';
import { Share2, Users, FileUp, Download, AlertCircle } from 'lucide-react';

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
  const peerInstance = useRef<any>(null);
  const broadcastChannel = useRef<BroadcastChannel | null>(null);
  const connectionAttempts = useRef<{[key: string]: number}>({});
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    // Check for WebRTC support
    if (!navigator.mediaDevices || !window.RTCPeerConnection) {
      setBrowserSupported(false);
      setConnectionStatus('error');
      return;
    }

    const initializePeer = () => {
      // Initialize peer with a random ID and more robust configuration
      const peer = new Peer(nanoid(10), {
        debug: 1, // Reduced debug level
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ],
          iceCandidatePoolSize: 5
        }
      });

      peerInstance.current = peer;

      peer.on('open', (id) => {
        setMyPeerId(id);
        setConnectionStatus('connected');
        initializeBroadcastChannel(id);
      });

      peer.on('connection', handleConnection);

      peer.on('error', (error) => {
        console.error('Peer error:', error);
        
        if (error.type === 'browser-incompatible') {
          setBrowserSupported(false);
          setConnectionStatus('error');
        } else if (error.type === 'disconnected' || error.type === 'network') {
          setConnectionStatus('disconnected');
          
          // Clear any existing reconnection timeout
          if (reconnectTimeout.current) {
            clearTimeout(reconnectTimeout.current);
          }
          
          // Try to reconnect after a delay
          reconnectTimeout.current = setTimeout(() => {
            if (peerInstance.current) {
              try {
                peerInstance.current.destroy();
              } catch (e) {
                console.error('Error destroying peer:', e);
              }
              initializePeer();
            }
          }, 5000);
        }
      });

      peer.on('disconnected', () => {
        setConnectionStatus('disconnected');
        // Try to reconnect
        peer.reconnect();
      });
    };

    initializePeer();

    // Cleanup
    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (broadcastChannel.current) {
        broadcastChannel.current.close();
      }
      // Clean up all peer connections
      peers.forEach(peer => {
        if (peer.connection) {
          try {
            peer.connection.close();
          } catch (e) {
            console.error('Error closing peer connection:', e);
          }
        }
      });
      if (peerInstance.current) {
        try {
          peerInstance.current.destroy();
        } catch (e) {
          console.error('Error destroying peer:', e);
        }
      }
    };
  }, []);

  const initializeBroadcastChannel = (peerId: string) => {
    if (!browserSupported) return;

    try {
      // Close existing channel if any
      if (broadcastChannel.current) {
        broadcastChannel.current.close();
      }

      // Create new broadcast channel
      const bc = new BroadcastChannel('file-sharing-app');
      broadcastChannel.current = bc;

      // Announce presence immediately
      bc.postMessage({ type: 'peer-joined', peerId });

      // Listen for other peers
      bc.onmessage = (event) => {
        if (event.data.type === 'peer-joined' && event.data.peerId !== peerId) {
          // Check if we've already tried to connect too many times
          const attempts = connectionAttempts.current[event.data.peerId] || 0;
          if (attempts < 3 && !peers.some(p => p.id === event.data.peerId)) {
            connectionAttempts.current[event.data.peerId] = attempts + 1;
            connectToPeer(event.data.peerId);
          }
        }
      };
    } catch (error) {
      console.error('Failed to initialize broadcast channel:', error);
      setConnectionStatus('error');
    }
  };

  const handleConnection = (conn: any) => {
    if (!conn || peers.some(p => p.id === conn.peer)) {
      return;
    }

    try {
      conn.on('data', handleIncomingData);
      
      conn.on('open', () => {
        setPeers(prev => {
          // Remove any existing connection with this peer
          const filtered = prev.filter(p => p.id !== conn.peer);
          return [...filtered, { id: conn.peer, connection: conn }];
        });
      });

      conn.on('close', () => {
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
        // Reset connection attempts for this peer
        delete connectionAttempts.current[conn.peer];
      });

      conn.on('error', (error: any) => {
        console.error('Connection error:', error);
        setPeers(prev => prev.filter(p => p.id !== conn.peer));
      });
    } catch (error) {
      console.error('Error in handleConnection:', error);
    }
  };

  const connectToPeer = (peerId: string) => {
    if (!peerInstance.current || peerId === myPeerId || peers.some(p => p.id === peerId)) {
      return;
    }

    try {
      const conn = peerInstance.current.connect(peerId, {
        reliable: true,
        serialization: 'json'
      });

      if (!conn) {
        throw new Error('Failed to create connection');
      }

      conn.on('open', () => {
        conn.on('data', handleIncomingData);
        setPeers(prev => {
          const filtered = prev.filter(p => p.id !== peerId);
          return [...filtered, { id: peerId, connection: conn }];
        });
      });

      conn.on('close', () => {
        setPeers(prev => prev.filter(p => p.id !== peerId));
        delete connectionAttempts.current[peerId];
      });

      conn.on('error', (error: any) => {
        console.error('Connection error:', error);
        setPeers(prev => prev.filter(p => p.id !== peerId));
      });
    } catch (error) {
      console.error('Error in connectToPeer:', error);
      delete connectionAttempts.current[peerId];
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
        // Handle incoming file data
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
        // Send file offer
        peer.connection.send({
          type: 'file-offer',
          fileName: selectedFile.name,
          fileSize: selectedFile.size,
          from: myPeerId
        });

        // Send the actual file
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
            <div className="flex items-center space-x-2">
              <Users className="w-5 h-5 text-gray-500" />
              <span className="text-sm text-gray-500">
                {peers.length} connected peer(s)
              </span>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center space-x-2 mb-2">
              <p className="text-sm text-gray-500">Your ID: {myPeerId}</p>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 
                connectionStatus === 'error' ? 'bg-red-100 text-red-800' : 
                'bg-yellow-100 text-yellow-800'
              }`}>
                {connectionStatus}
              </span>
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