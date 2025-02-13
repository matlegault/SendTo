export const PEER_CONFIG = {
  local: {
    host: 'localhost',
    port: 9000,
    path: '/myapp',
    config: { 
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    }
  },
  global: {
    // Use PeerJS public cloud server for global mode
    cloud: true, // This tells PeerJS to use their cloud server
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:global.stun.twilio.com:3478' }
      ]
    }
  }
};