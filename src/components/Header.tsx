import { Share2, Users, RefreshCw } from 'lucide-react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  peerCount: number;
  onReconnect: () => void;
}

export function Header({ peerCount, onReconnect }: HeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div className="flex items-center space-x-2">
        <Share2 className="w-6 h-6 text-blue-500" />
        <h1 className="text-2xl font-bold">P2P File Sharing</h1>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-500">
            {peerCount} connected peer(s)
          </span>
        </div>
        <button
          onClick={onReconnect}
          className="p-2 text-gray-500 hover:text-blue-500 transition-colors rounded-full hover:bg-gray-100"
          title="Reconnect"
        >
          <RefreshCw className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}