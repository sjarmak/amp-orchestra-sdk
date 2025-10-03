import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface WorkspaceFile {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'directory';
  isOpen: boolean;
  isDirty: boolean;
  content?: string;
}

export interface WorkspaceState {
  openFiles: WorkspaceFile[];
  activeFileId?: string;
  recentFiles: string[];
  expandedDirectories: Set<string>;
}

interface WorkspaceContextType extends WorkspaceState {
  openFile: (path: string) => Promise<void>;
  closeFile: (fileId: string) => void;
  setActiveFile: (fileId: string) => void;
  saveFile: (fileId: string, content: string) => Promise<void>;
  toggleDirectory: (path: string) => void;
  refreshWorkspace: () => Promise<void>;
  getFileContent: (path: string) => Promise<string>;
  searchFiles: (query: string) => Promise<WorkspaceFile[]>;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export const useWorkspace = (): WorkspaceContextType => {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
};

interface WorkspaceProviderProps {
  children: ReactNode;
}

export const WorkspaceProvider: React.FC<WorkspaceProviderProps> = ({ children }) => {
  const [openFiles, setOpenFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>();
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(new Set());

  const openFile = useCallback(async (path: string) => {
    try {
      // Check if file is already open
      const existingFile = openFiles.find(f => f.path === path);
      if (existingFile) {
        setActiveFileId(existingFile.id);
        return;
      }

      // Read file content
      const content = await invoke<string>('read_file', { path });
      const fileName = path.split('/').pop() || 'Unknown';
      
      const newFile: WorkspaceFile = {
        id: `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: fileName,
        path,
        type: 'file',
        isOpen: true,
        isDirty: false,
        content
      };

      setOpenFiles(prev => [...prev, newFile]);
      setActiveFileId(newFile.id);
      
      // Update recent files
      setRecentFiles(prev => {
        const filtered = prev.filter(p => p !== path);
        return [path, ...filtered].slice(0, 10); // Keep last 10
      });
    } catch (error) {
      console.error('Failed to open file:', error);
    }
  }, [openFiles]);

  const closeFile = useCallback((fileId: string) => {
    setOpenFiles(prev => {
      const fileToClose = prev.find(f => f.id === fileId);
      if (fileToClose?.isDirty) {
        // TODO: Show unsaved changes dialog
        console.warn('File has unsaved changes');
      }
      return prev.filter(f => f.id !== fileId);
    });

    // Update active file if the closed file was active
    setActiveFileId(prev => {
      if (prev === fileId) {
        const remainingFiles = openFiles.filter(f => f.id !== fileId);
        return remainingFiles.length > 0 ? remainingFiles[remainingFiles.length - 1].id : undefined;
      }
      return prev;
    });
  }, [openFiles]);

  const setActiveFile = useCallback((fileId: string) => {
    const file = openFiles.find(f => f.id === fileId);
    if (file) {
      setActiveFileId(fileId);
    }
  }, [openFiles]);

  const saveFile = useCallback(async (fileId: string, content: string) => {
    try {
      const file = openFiles.find(f => f.id === fileId);
      if (!file) return;

      await invoke('write_file', { path: file.path, content });
      
      setOpenFiles(prev => prev.map(f => 
        f.id === fileId 
          ? { ...f, content, isDirty: false }
          : f
      ));
    } catch (error) {
      console.error('Failed to save file:', error);
    }
  }, [openFiles]);

  const toggleDirectory = useCallback((path: string) => {
    setExpandedDirectories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  const refreshWorkspace = useCallback(async () => {
    // TODO: Refresh file tree and update open file states
    console.log('Refreshing workspace...');
  }, []);

  const getFileContent = useCallback(async (path: string): Promise<string> => {
    try {
      return await invoke<string>('read_file', { path });
    } catch (error) {
      console.error('Failed to read file:', error);
      return '';
    }
  }, []);

  const searchFiles = useCallback(async (query: string): Promise<WorkspaceFile[]> => {
    try {
      // TODO: Implement file search using Tauri command
      console.log('Searching for:', query);
      return [];
    } catch (error) {
      console.error('Failed to search files:', error);
      return [];
    }
  }, []);

  const contextValue: WorkspaceContextType = {
    openFiles,
    activeFileId,
    recentFiles,
    expandedDirectories,
    openFile,
    closeFile,
    setActiveFile,
    saveFile,
    toggleDirectory,
    refreshWorkspace,
    getFileContent,
    searchFiles,
  };

  return (
    <WorkspaceContext.Provider value={contextValue}>
      {children}
    </WorkspaceContext.Provider>
  );
};
