import { Users, RefreshCw } from 'lucide-react';
import { ConnectionStatus } from '../types';
import { NetworkModeSelector } from './NetworkModeSelector';

interface HeaderProps {
  peerCount: number;
  onReconnect: () => void;
  networkMode: 'local' | 'global';
  onNetworkModeChange: (mode: 'local' | 'global') => void;
}

export function Header({ 
  peerCount, 
  onReconnect, 
  networkMode, 
  onNetworkModeChange 
}: HeaderProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex items-center space-x-2">
        <img src="/favicon.svg" alt="SendTo Logo" className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Send To Friends</h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 ml-auto sm:ml-auto sm:w-auto w-full">
        <NetworkModeSelector 
          mode={networkMode} 
          onChange={onNetworkModeChange} 
        />
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-500">
            {peerCount} connected {peerCount === 1 ? 'friend' : 'friends'}
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