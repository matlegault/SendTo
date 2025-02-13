import { WebSocketServer } from 'ws';

const wss = new WebSocketServer({ port: 8080 });
const peers = new Map();

wss.on('connection', (ws) => {
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      
      switch (data.type) {
        case 'register':
          peers.set(data.peerId, ws);
          // Broadcast new peer to all others
          broadcastToPeers(data.peerId, {
            type: 'peer-joined',
            peerId: data.peerId
          });
          // Send existing peers to new peer
          ws.send(JSON.stringify({
            type: 'peers-list',
            peers: Array.from(peers.keys()).filter(id => id !== data.peerId)
          }));
          break;
          
        case 'disconnect':
          peers.delete(data.peerId);
          broadcastToPeers(data.peerId, {
            type: 'peer-left',
            peerId: data.peerId
          });
          break;
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  });

  ws.on('close', () => {
    // Find and remove disconnected peer
    for (const [peerId, socket] of peers.entries()) {
      if (socket === ws) {
        peers.delete(peerId);
        broadcastToPeers(peerId, {
          type: 'peer-left',
          peerId
        });
        break;
      }
    }
  });
});

function broadcastToPeers(excludePeerId: string, message: any) {
  for (const [peerId, socket] of peers.entries()) {
    if (peerId !== excludePeerId) {
      socket.send(JSON.stringify(message));
    }
  }
}

console.log('Signaling server running on ws://localhost:8080'); 