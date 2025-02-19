import React, { useState } from 'react';
import { Copy, Check, RefreshCw } from 'lucide-react';
import { usePeerConnection } from './hooks/usePeerConnection';
import { useFileTransfer } from './hooks/useFileTransfer';
import { BrowserSupport } from './components/BrowserSupport';
import { Header } from './components/Header';
import { Chat } from './components/Chat';

declare global {
  interface Window {
    onPeerData: ((data: any) => void) | undefined;
  }
}

function App() {
  const {
    myPeerId,
    peers,
    connectionStatus,
    browserSupported,
    connectError,
    isConnecting,
    connectToPeer,
    initializePeer,
    currentFileReception,
    transferError,
    seenPeers,
    messages,
    sendMessage
  } = usePeerConnection();

  const {
    selectedFile,
    incomingFiles,
    handleFileSelect,
    sendFile,
    handleIncomingFile,
    sendingFiles,
    setSendingFiles
  } = useFileTransfer();

  const [targetPeerId, setTargetPeerId] = useState('');
  const [copied, setCopied] = useState(false);

  // Set up the global handler for incoming peer data
  window.onPeerData = handleIncomingFile;

  const copyPeerId = async () => {
    try {
      await navigator.clipboard.writeText(myPeerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handleManualConnect = () => {
    if (targetPeerId) {
      connectToPeer(targetPeerId);
      setTargetPeerId('');
    }
  };

  const handleReconnect = () => {
    initializePeer();
  };

  const handleSendFile = () => {
    if (selectedFile && peers.length > 0) {
      sendFile(peers);
    }
  };

  if (!browserSupported) {
    return <BrowserSupport />;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto p-6">
        <Header 
          peerCount={peers.length} 
          onReconnect={handleReconnect}
        />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,400px] gap-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <div className="mb-6">
              <div className="flex items-center space-x-2 mb-4">
                <div className="flex-1 flex items-center space-x-2">
                  <p className="text-sm text-gray-500">Your ID:</p>
                  <code className="px-2 py-1 bg-gray-100 rounded text-sm">{myPeerId}</code>
                  <button
                    onClick={copyPeerId}
                    className="p-1 text-gray-500 hover:text-blue-500 transition-colors"
                    title="Copy ID"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  connectionStatus === 'connected' ? 'bg-green-100 text-green-800' : 
                  connectionStatus === 'error' ? 'bg-red-100 text-red-800' : 
                  'bg-yellow-100 text-yellow-800'
                }`}>
                  {connectionStatus}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={targetPeerId}
                    onChange={(e) => setTargetPeerId(e.target.value)}
                    placeholder="Enter peer ID to connect manually"
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  />
                  <button
                    onClick={handleManualConnect}
                    disabled={!targetPeerId || targetPeerId === myPeerId || isConnecting}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
                  >
                    {isConnecting ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Connecting...</span>
                      </>
                    ) : (
                      <span>Connect</span>
                    )}
                  </button>
                </div>
                {connectError && (
                  <p className="text-sm text-red-500">{connectError}</p>
                )}
              </div>

              <div className="flex w-full space-x-4">
                <div className={`${
                  selectedFile ? 'flex-1' : 'w-full'
                }`}>
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className={`block w-full flex items-center justify-center px-4 py-2 ${
                      selectedFile
                        ? 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    } rounded-md cursor-pointer`}
                  >
                    Choose File
                  </label>
                </div>
                {selectedFile && (
                  <button
                    onClick={handleSendFile}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                    disabled={peers.length === 0}
                  >
                    Send to all friends
                  </button>
                )}
              </div>
              {selectedFile && (
                <p className="mt-2 text-sm text-gray-500">
                  Selected: {selectedFile.name} ({Math.round(selectedFile.size / 1024)} KB)
                </p>
              )}
            </div>

            {peers.length > 0 && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <h2 className="text-sm font-medium text-gray-700 mb-2">
                  Connected {peers.length === 1 ? 'friend' : 'friends'}:
                </h2>
                <div className="space-y-1">
                  {peers.map((peer) => (
                    <div key={peer.id} className="text-sm text-gray-500">
                      {peer.id}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {incomingFiles.length > 0 && (
              <div className="border-t pt-4">
                <h2 className="text-lg font-semibold mb-4">Incoming Files</h2>
                <div className="space-y-3">
                  {incomingFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          From: {file.from} • {Math.round(file.size / 1024)} KB
                        </p>
                        {typeof file.progress === 'number' && !file.accepted && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.round(file.progress)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {Math.round(file.progress)}% downloaded
                            </p>
                          </div>
                        )}
                      </div>
                      {file.accepted ? (
                        <span className="text-green-500 text-sm">Downloaded</span>
                      ) : (
                        <button 
                          className="text-blue-500 hover:text-blue-600"
                          disabled={typeof file.progress === 'number' && file.progress < 100}
                        >
                          {typeof file.progress === 'number' && file.progress < 100 
                            ? 'Downloading...' 
                            : 'Download'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {currentFileReception && (
              <div className="mt-4">
                <div className="text-sm text-gray-600">
                  Receiving: {currentFileReception.name}
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                  <div 
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${(currentFileReception.receivedChunks / currentFileReception.totalChunks) * 100}%`
                    }}
                  />
                </div>
              </div>
            )}

            {transferError && (
              <div className="mt-4 text-sm text-red-500">
                {transferError}
              </div>
            )}

            {sendingFiles.length > 0 && (
              <div className="border-t pt-4">
                <h2 className="text-lg font-semibold mb-4">Sending Files</h2>
                <div className="space-y-3">
                  {sendingFiles.map((file, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                    >
                      <div className="flex-1">
                        <p className="font-medium">{file.name}</p>
                        <p className="text-sm text-gray-500">
                          {Math.round(file.size / 1024)} KB
                        </p>
                        {file.sending && (
                          <div className="mt-2">
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${Math.round(file.progress || 0)}%` }}
                              />
                            </div>
                            <p className="text-xs text-gray-500 mt-1">
                              {Math.round(file.progress || 0)}% sent
                            </p>
                          </div>
                        )}
                      </div>
                      {file.accepted ? (
                        <span className="text-green-500 text-sm">Sent</span>
                      ) : file.sending ? (
                        <span className="text-blue-500 text-sm">Sending...</span>
                      ) : (
                        <span className="text-red-500 text-sm">Failed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="bg-white rounded-lg h-[400px] shadow-lg overflow-hidden">
            <Chat
              myPeerId={myPeerId}
              peers={peers}
              onSendMessage={sendMessage}
              messages={messages}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;