import { Users } from 'lucide-react';
import { ConnectionStatus } from '../types';

interface HeaderProps {
  peerCount: number;
  onReconnect: () => void;
}

export function Header({ 
  peerCount, 
  onReconnect 
}: HeaderProps) {
  return (
    <div className="flex flex-wrap gap-4 mb-6">
      <div className="flex items-center space-x-2">
        <img src="/favicon.svg" alt="SendTo Logo" className="w-6 h-6" />
        <h1 className="text-2xl font-bold">Send To Friends</h1>
      </div>
      <div className="flex flex-wrap items-center gap-4 ml-auto sm:ml-auto sm:w-auto w-full">
        <div className="flex items-center space-x-2">
          <Users className="w-5 h-5 text-gray-500" />
          <span className="text-sm text-gray-500">
            {peerCount} connected {peerCount === 1 ? 'friend' : 'friends'}
          </span>
        </div>
      </div>
    </div>
  );
}