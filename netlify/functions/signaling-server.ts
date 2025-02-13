import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

const peers = new Map();
const channels = new Map();
const HEARTBEAT_INTERVAL = 30000; // 30 seconds
const CONNECTION_TIMEOUT = 60000; // 60 seconds

serve(async (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);
  let lastHeartbeat = Date.now();
  let peerId: string | null = null;

  // Set up heartbeat interval
  const heartbeatInterval = setInterval(() => {
    try {
      if (Date.now() - lastHeartbeat > CONNECTION_TIMEOUT) {
        console.log(`🔴 Connection timed out${peerId ? ` for peer ${peerId}` : ''}`);
        socket.close();
        return;
      }
      socket.send(JSON.stringify({ type: 'heartbeat' }));
    } catch (e) {
      console.error('🔴 Heartbeat error:', e);
    }
  }, HEARTBEAT_INTERVAL);

  socket.onopen = () => {
    console.log("✅ Client connected");
  };

  socket.onmessage = (event) => {
    lastHeartbeat = Date.now();
    try {
      const data = JSON.parse(event.data);
      console.log("📥 Received message type:", data.type);
      
      switch (data.type) {
        case 'heartbeat':
          // Client responding to heartbeat
          console.log(`💓 Heartbeat from${peerId ? ` peer ${peerId}` : ' client'}`);
          break;

        case 'register':
          peerId = data.peerId;
          peers.set(data.peerId, socket);
          console.log(`👤 Peer registered: ${data.peerId}`);
          console.log(`👥 Total peers: ${peers.size}`);
          
          // Broadcast new peer to all others
          for (const [id, sock] of peers.entries()) {
            if (id !== data.peerId) {
              console.log(`📢 Notifying peer ${id} about new peer ${data.peerId}`);
              sock.send(JSON.stringify({
                type: 'peer-joined',
                peerId: data.peerId
              }));
            }
          }
          
          // Send existing peers to new peer
          const existingPeers = Array.from(peers.keys()).filter(id => id !== data.peerId);
          console.log(`📤 Sending existing peers to ${data.peerId}:`, existingPeers);
          socket.send(JSON.stringify({
            type: 'peers-list',
            peers: existingPeers
          }));
          break;
          
        case 'disconnect':
          console.log(`👋 Peer disconnecting: ${data.peerId}`);
          peers.delete(data.peerId);
          for (const [id, sock] of peers.entries()) {
            console.log(`📢 Notifying peer ${id} about disconnection of ${data.peerId}`);
            sock.send(JSON.stringify({
              type: 'peer-left',
              peerId: data.peerId
            }));
          }
          break;

        default:
          console.log(`⚠️ Unknown message type: ${data.type}`);
      }
    } catch (e) {
      console.error('🔴 Error handling message:', e);
    }
  };

  socket.onclose = () => {
    console.log(`🔌 Connection closed${peerId ? ` for peer ${peerId}` : ''}`);
    clearInterval(heartbeatInterval);
    
    if (peerId) {
      peers.delete(peerId);
      for (const [id, sock] of peers.entries()) {
        console.log(`📢 Notifying peer ${id} about disconnection of ${peerId}`);
        sock.send(JSON.stringify({
          type: 'peer-left',
          peerId
        }));
      }
    }
  };

  socket.onerror = (error) => {
    console.error(`🔴 WebSocket error${peerId ? ` for peer ${peerId}` : ''}:`, error);
  };

  return response;
});
