import { WebSocketServer } from 'ws';

const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds
const wss = new WebSocketServer({ port: 8080 });
const peers = new Map();

wss.on('connection', (ws) => {
  let lastHeartbeat = Date.now();
  let peerId: string | null = null;

  // Set up heartbeat interval
  const heartbeatInterval = setInterval(() => {
    try {
      if (Date.now() - lastHeartbeat > CONNECTION_TIMEOUT) {
        console.log(`🔴 Connection timed out${peerId ? ` for peer ${peerId}` : ''}`);
        ws.terminate();
        return;
      }
      ws.send(JSON.stringify({ type: 'heartbeat' }));
    } catch (e) {
      console.error('🔴 Heartbeat error:', e);
    }
  }, HEARTBEAT_INTERVAL);

  console.log("✅ Client connected");

  ws.on('message', (message) => {
    lastHeartbeat = Date.now();
    try {
      const data = JSON.parse(message.toString());
      console.log("📥 Received message type:", data.type);
      
      switch (data.type) {
        case 'heartbeat':
          console.log(`💓 Heartbeat from${peerId ? ` peer ${peerId}` : ' client'}`);
          break;

        case 'register':
          peerId = data.peerId;
          peers.set(data.peerId, ws);
          console.log(`👤 Peer registered: ${data.peerId}`);
          console.log(`👥 Total peers: ${peers.size}`);
          
          // Broadcast new peer to all others
          broadcastToPeers(data.peerId, {
            type: 'peer-joined',
            peerId: data.peerId
          });
          
          // Send existing peers to new peer
          const existingPeers = Array.from(peers.keys()).filter(id => id !== data.peerId);
          console.log(`📤 Sending existing peers to ${data.peerId}:`, existingPeers);
          ws.send(JSON.stringify({
            type: 'peers-list',
            peers: existingPeers
          }));
          break;
          
        case 'disconnect':
          console.log(`👋 Peer disconnecting: ${data.peerId}`);
          peers.delete(data.peerId);
          broadcastToPeers(data.peerId, {
            type: 'peer-left',
            peerId: data.peerId
          });
          break;
      }
    } catch (e) {
      console.error('🔴 Error handling message:', e);
    }
  });

  ws.on('close', () => {
    console.log(`🔌 Connection closed${peerId ? ` for peer ${peerId}` : ''}`);
    clearInterval(heartbeatInterval);
    if (peerId) {
      peers.delete(peerId);
      broadcastToPeers(peerId, {
        type: 'peer-left',
        peerId
      });
    }
  });

  ws.on('error', (error) => {
    console.error(`🔴 WebSocket error${peerId ? ` for peer ${peerId}` : ''}:`, error);
  });
});

function broadcastToPeers(excludePeerId: string, message: any) {
  for (const [peerId, socket] of peers.entries()) {
    if (peerId !== excludePeerId) {
      console.log(`📢 Notifying peer ${peerId} about message:`, message.type);
      socket.send(JSON.stringify(message));
    }
  }
}

console.log('✨ Signaling server running on ws://localhost:8080'); 