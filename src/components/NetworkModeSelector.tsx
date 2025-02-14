import { Share2, Users } from 'lucide-react';

interface NetworkModeSelectorProps {
  mode: 'local' | 'global';
  onChange: (mode: 'local' | 'global') => void;
}

export function NetworkModeSelector({ mode, onChange }: NetworkModeSelectorProps) {
  return (
    <div className="flex space-x-2 items-center">
      <span className="text-sm text-gray-500">Network:</span>
      <div className="flex bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => onChange('local')}
          className={`flex items-center px-3 py-1 rounded-md text-sm ${
            mode === 'local'
              ? 'bg-white shadow-sm text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Users className="w-4 h-4 mr-1" />
          Local
        </button>
        <button
          onClick={() => onChange('global')}
          className={`flex items-center px-3 py-1 rounded-md text-sm ${
            mode === 'global'
              ? 'bg-white shadow-sm text-blue-600'
              : 'text-gray-600 hover:text-gray-800'
          }`}
        >
          <Share2 className="w-4 h-4 mr-1" />
          Public
        </button>
      </div>
    </div>
  );
} 