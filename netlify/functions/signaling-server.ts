import { serve } from "https://deno.land/std@0.140.0/http/server.ts";

const peers = new Map();
const channels = new Map();

serve(async (req) => {
  if (req.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onopen = () => {
    console.log("Client connected");
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      
      switch (data.type) {
        case 'register':
          peers.set(data.peerId, socket);
          // Broadcast new peer to all others
          for (const [id, sock] of peers.entries()) {
            if (id !== data.peerId) {
              sock.send(JSON.stringify({
                type: 'peer-joined',
                peerId: data.peerId
              }));
            }
          }
          // Send existing peers to new peer
          socket.send(JSON.stringify({
            type: 'peers-list',
            peers: Array.from(peers.keys()).filter(id => id !== data.peerId)
          }));
          break;
          
        case 'disconnect':
          peers.delete(data.peerId);
          for (const [, sock] of peers.entries()) {
            sock.send(JSON.stringify({
              type: 'peer-left',
              peerId: data.peerId
            }));
          }
          break;
      }
    } catch (e) {
      console.error('Error handling message:', e);
    }
  };

  socket.onclose = () => {
    for (const [peerId, sock] of peers.entries()) {
      if (sock === socket) {
        peers.delete(peerId);
        for (const [, otherSock] of peers.entries()) {
          otherSock.send(JSON.stringify({
            type: 'peer-left',
            peerId
          }));
        }
        break;
      }
    }
  };

  return response;
});
