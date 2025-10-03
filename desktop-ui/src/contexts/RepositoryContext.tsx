import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface Repository {
  id: string;
  name: string;
  path: string;
  branch: string;
  isActive: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  repositories: Repository[];
  activeRepositoryId?: string;
}

interface RepositoryContextType {
  workspaces: Workspace[];
  activeWorkspace?: Workspace;
  setActiveWorkspace: (workspace: Workspace) => void;
  activeRepository?: Repository;
  setActiveRepository: (repository: Repository) => void;
  loadRepositories: () => Promise<void>;
  addRepository: (path: string) => Promise<void>;
  removeRepository: (repositoryId: string) => Promise<void>;
}

const RepositoryContext = createContext<RepositoryContextType | undefined>(undefined);

export const useRepository = (): RepositoryContextType => {
  const context = useContext(RepositoryContext);
  if (!context) {
    throw new Error('useRepository must be used within a RepositoryProvider');
  }
  return context;
};

interface RepositoryProviderProps {
  children: ReactNode;
}

export const RepositoryProvider: React.FC<RepositoryProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace>();
  const [activeRepository, setActiveRepositoryState] = useState<Repository>();

  const setActiveWorkspace = useCallback((workspace: Workspace) => {
    setActiveWorkspaceState(workspace);
    // Set the first repository as active if none is selected
    if (workspace.repositories.length > 0 && !workspace.activeRepositoryId) {
      setActiveRepositoryState(workspace.repositories[0]);
    } else if (workspace.activeRepositoryId) {
      const repo = workspace.repositories.find(r => r.id === workspace.activeRepositoryId);
      if (repo) {
        setActiveRepositoryState(repo);
      }
    }
  }, []);

  const setActiveRepository = useCallback((repository: Repository) => {
    setActiveRepositoryState(repository);
    // Update the workspace's active repository
    if (activeWorkspace) {
      const updatedWorkspace = {
        ...activeWorkspace,
        activeRepositoryId: repository.id
      };
      setActiveWorkspaceState(updatedWorkspace);
    }
  }, [activeWorkspace]);

  const loadRepositories = useCallback(async () => {
    try {
      // For now, create a default workspace with the current directory
      const currentPath = "/Users/sjarmak/amp-orchestra";
      const repoName = currentPath.split('/').pop() || 'workspace';
      
      // Get current branch
      let currentBranch = 'main';
      try {
        currentBranch = await invoke<string>('get_current_branch', { path: currentPath });
      } catch (error) {
        console.warn('Failed to get current branch:', error);
      }

      const defaultRepo: Repository = {
        id: 'default',
        name: repoName,
        path: currentPath,
        branch: currentBranch,
        isActive: true
      };

      const defaultWorkspace: Workspace = {
        id: 'default',
        name: 'Default Workspace',
        repositories: [defaultRepo],
        activeRepositoryId: defaultRepo.id
      };

      setWorkspaces([defaultWorkspace]);
      setActiveWorkspace(defaultWorkspace);
    } catch (error) {
      console.error('Failed to load repositories:', error);
    }
  }, [setActiveWorkspace]);

  const addRepository = useCallback(async (path: string) => {
    try {
      const repoName = path.split('/').pop() || 'repository';
      let currentBranch = 'main';
      
      try {
        currentBranch = await invoke<string>('get_current_branch', { path });
      } catch (error) {
        console.warn('Failed to get current branch for new repo:', error);
      }

      const newRepo: Repository = {
        id: `repo-${Date.now()}`,
        name: repoName,
        path,
        branch: currentBranch,
        isActive: false
      };

      if (activeWorkspace) {
        const updatedRepositories = [...activeWorkspace.repositories, newRepo];
        const updatedWorkspace = {
          ...activeWorkspace,
          repositories: updatedRepositories
        };
        
        setWorkspaces(prev => prev.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w));
        setActiveWorkspaceState(updatedWorkspace);
      }
    } catch (error) {
      console.error('Failed to add repository:', error);
    }
  }, [activeWorkspace]);

  const removeRepository = useCallback(async (repositoryId: string) => {
    if (activeWorkspace) {
      const updatedRepositories = activeWorkspace.repositories.filter(r => r.id !== repositoryId);
      const updatedWorkspace = {
        ...activeWorkspace,
        repositories: updatedRepositories,
        activeRepositoryId: activeWorkspace.activeRepositoryId === repositoryId 
          ? (updatedRepositories[0]?.id || undefined)
          : activeWorkspace.activeRepositoryId
      };
      
      setWorkspaces(prev => prev.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w));
      setActiveWorkspaceState(updatedWorkspace);

      // Update active repository if the removed one was active
      if (activeRepository?.id === repositoryId && updatedRepositories.length > 0) {
        setActiveRepositoryState(updatedRepositories[0]);
      }
    }
  }, [activeWorkspace, activeRepository]);

  const contextValue: RepositoryContextType = {
    workspaces,
    activeWorkspace,
    setActiveWorkspace,
    activeRepository,
    setActiveRepository,
    loadRepositories,
    addRepository,
    removeRepository,
  };

  return (
    <RepositoryContext.Provider value={contextValue}>
      {children}
    </RepositoryContext.Provider>
  );
};
