import { AlertCircle } from 'lucide-react';

export function BrowserSupport() {
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