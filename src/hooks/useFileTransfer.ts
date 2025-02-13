import { useState } from 'react';
import { FileTransfer, PeerConnection } from '../types';

const CHUNK_SIZE = 8192; // 8KB chunks - even smaller for better reliability

interface FileMetadata {
  fileName: string;
  fileSize: number;
  totalChunks: number;
  from: string;
  fileType: string;
}

interface FileChunkData {
  chunks: string[];  // Changed to string[] for base64 chunks
  metadata: FileMetadata;
  receivedChunks: number;
}

interface FileTransfer {
  name: string;
  size: number;
  from: string;
  accepted: boolean;
  progress?: number;
  sending?: boolean;
}

export function useFileTransfer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomingFiles, setIncomingFiles] = useState<FileTransfer[]>([]);
  const [transferProgress, setTransferProgress] = useState<{ [key: string]: number }>({});
  const [fileTransfers] = useState<Map<string, FileChunkData>>(new Map());
  const [sendingFiles, setSendingFiles] = useState<FileTransfer[]>([]);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const sendFile = async (peers: PeerConnection[]) => {
    if (!selectedFile || peers.length === 0) return;

    // Add file to sending list
    setSendingFiles(prev => [...prev, {
      name: selectedFile.name,
      size: selectedFile.size,
      from: 'me',
      accepted: false,
      progress: 0,
      sending: true
    }]);

    const reader = new FileReader();
    reader.onload = async () => {
      if (!(reader.result instanceof ArrayBuffer)) return;

      const arrayBuffer = reader.result;
      const uint8Array = new Uint8Array(arrayBuffer);
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);

      try {
        // Send metadata to all peers simultaneously
        await Promise.all(peers.map(peer => {
          const metadata: FileMetadata = {
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            totalChunks,
            fileType: selectedFile.type,
            from: peer.connection.peer
          };
          return peer.connection.send({ type: 'file-metadata', metadata });
        }));

        // Send chunks to all peers simultaneously
        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, arrayBuffer.byteLength);
          const chunk = uint8Array.slice(start, end);
          
          // Convert chunk to base64
          const base64Chunk = btoa(
            String.fromCharCode.apply(null, Array.from(chunk))
          );

          const chunkData = {
            type: 'file-chunk',
            fileName: selectedFile.name,
            chunkIndex: i,
            totalChunks,
            chunk: base64Chunk
          };

          // Send the same chunk to all peers simultaneously
          await Promise.all(peers.map(peer => 
            new Promise<void>((resolve) => {
              peer.connection.send(chunkData);
              resolve();
            })
          ));

          // Update sending progress once per chunk
          const progress = ((i + 1) / totalChunks) * 100;
          setSendingFiles(prev => 
            prev.map(file => 
              file.name === selectedFile.name
                ? { ...file, progress }
                : file
            )
          );

          // Small delay between chunks to prevent overwhelming connections
          await new Promise(resolve => setTimeout(resolve, 50));
        }

        // Mark as complete
        setSendingFiles(prev => 
          prev.map(file => 
            file.name === selectedFile.name
              ? { ...file, progress: 100, accepted: true, sending: false }
              : file
          )
        );

      } catch (error) {
        console.error('Error sending file:', error);
        setSendingFiles(prev => 
          prev.map(file => 
            file.name === selectedFile.name
              ? { ...file, progress: 0, accepted: false, sending: false }
              : file
          )
        );
      }
    };

    reader.readAsArrayBuffer(selectedFile);
    setSelectedFile(null);
  };

  const handleIncomingFile = (data: any) => {
    try {
      if (data.type === 'file-metadata') {
        const metadata = data.metadata as FileMetadata;
        fileTransfers.set(metadata.fileName, {
          chunks: new Array(metadata.totalChunks),
          metadata,
          receivedChunks: 0
        });
        
        setIncomingFiles(prev => [...prev, {
          name: metadata.fileName,
          size: metadata.fileSize,
          from: metadata.from,
          accepted: false,
          progress: 0
        }]);
      } 
      else if (data.type === 'file-chunk') {
        const transfer = fileTransfers.get(data.fileName);
        if (!transfer) return;

        transfer.chunks[data.chunkIndex] = data.chunk;
        transfer.receivedChunks++;

        // Update progress
        const progress = (transfer.receivedChunks / transfer.metadata.totalChunks) * 100;
        setIncomingFiles(prev => 
          prev.map(file => 
            file.name === data.fileName 
              ? { ...file, progress } 
              : file
          )
        );

        if (transfer.receivedChunks === transfer.metadata.totalChunks) {
          const allChunksReceived = transfer.chunks.every(chunk => chunk !== undefined);
          
          if (allChunksReceived) {
            // Convert base64 chunks back to Uint8Array and combine
            const uint8Arrays = transfer.chunks.map(base64Chunk => {
              const binaryString = atob(base64Chunk);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              return bytes;
            });

            const blob = new Blob(uint8Arrays, { type: transfer.metadata.fileType });
            
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = transfer.metadata.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            fileTransfers.delete(data.fileName);
            setIncomingFiles(prev => 
              prev.map(file => 
                file.name === data.fileName ? { ...file, accepted: true } : file
              )
            );
          }
        }
      }
    } catch (error) {
      console.error('Error handling incoming file:', error);
    }
  };

  return {
    selectedFile,
    incomingFiles,
    handleFileSelect,
    sendFile,
    handleIncomingFile,
    transferProgress,
    sendingFiles,
    setSendingFiles
  };
}