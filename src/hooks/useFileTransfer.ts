import { useState } from 'react';
import { FileTransfer, PeerConnection } from '../types';

const CHUNK_SIZE = 262144; // 256KB chunks

interface FileMetadata {
  fileName: string;
  fileSize: number;
  totalChunks: number;
  from: string;
}

interface FileChunkData {
  chunks: (ArrayBuffer | null)[];
  metadata: FileMetadata;
  receivedChunks: number;
}

export function useFileTransfer() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [incomingFiles, setIncomingFiles] = useState<FileTransfer[]>([]);
  const [fileTransfers] = useState<Map<string, FileChunkData>>(new Map());

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
    }
  };

  const sendFile = async (peers: PeerConnection[]) => {
    if (!selectedFile || peers.length === 0) return;

    const reader = new FileReader();
    reader.onload = async () => {
      const arrayBuffer = reader.result as ArrayBuffer;
      const totalChunks = Math.ceil(arrayBuffer.byteLength / CHUNK_SIZE);
      
      peers.forEach(peer => {
        try {
          // Send file metadata first
          const metadata = {
            type: 'file-metadata',
            fileName: selectedFile.name,
            fileSize: selectedFile.size,
            totalChunks,
            from: peer.connection.peer
          };
          
          peer.connection.send(metadata);

          // Send chunks
          for (let i = 0; i < totalChunks; i++) {
            const chunk = arrayBuffer.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const chunkData = {
              type: 'file-chunk',
              fileName: selectedFile.name,
              chunkIndex: i,
              totalChunks,
              data: chunk
            };

            // Add a small delay between chunks to prevent overwhelming the connection
            setTimeout(() => {
              try {
                peer.connection.send(chunkData);
              } catch (error) {
                console.error(`Error sending chunk ${i}:`, error);
              }
            }, i * 10); // 10ms delay between chunks
          }
        } catch (error) {
          console.error('Error initiating file transfer:', error);
        }
      });
    };

    reader.onerror = (error) => {
      console.error('Error reading file:', error);
    };

    reader.readAsArrayBuffer(selectedFile);
    setSelectedFile(null);
  };

  const handleIncomingFile = (data: any) => {
    try {
      if (data.type === 'file-metadata') {
        const metadata = data as FileMetadata;
        
        // Initialize new file transfer
        fileTransfers.set(metadata.fileName, {
          chunks: new Array(metadata.totalChunks).fill(null),
          metadata,
          receivedChunks: 0
        });
        
        setIncomingFiles(prev => [...prev, {
          name: metadata.fileName,
          size: metadata.fileSize,
          from: metadata.from,
          accepted: false
        }]);
      } 
      else if (data.type === 'file-chunk') {
        const transfer = fileTransfers.get(data.fileName);
        if (!transfer) return;

        // Store the chunk
        transfer.chunks[data.chunkIndex] = data.data;
        transfer.receivedChunks++;

        // Check if we have all chunks
        if (transfer.receivedChunks === transfer.metadata.totalChunks) {
          // Verify all chunks are present
          const allChunksReceived = transfer.chunks.every(chunk => chunk !== null);
          
          if (allChunksReceived) {
            // Combine all chunks into final file
            const fileBlob = new Blob(transfer.chunks, { 
              type: 'application/octet-stream' 
            });

            // Create download
            const url = URL.createObjectURL(fileBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = data.fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Cleanup
            URL.revokeObjectURL(url);
            fileTransfers.delete(data.fileName);

            // Update UI
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
    handleIncomingFile
  };
}