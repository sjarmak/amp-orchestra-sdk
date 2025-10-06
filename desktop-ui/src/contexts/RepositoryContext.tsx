import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';
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

// LocalStorage keys
const WORKSPACES_STORAGE_KEY = 'amp_workspaces_v1';
const ACTIVE_WORKSPACE_ID_KEY = 'amp_active_workspace_id_v1';
const ACTIVE_REPOSITORY_ID_KEY = 'amp_active_repository_id_v1';

// Helper functions for localStorage persistence
function saveWorkspacesToStorage(workspaces: Workspace[]): void {
  try {
    localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(workspaces));
  } catch (error) {
    console.warn('[RepositoryContext] Failed to save workspaces to localStorage:', error);
  }
}

function loadWorkspacesFromStorage(): Workspace[] {
  try {
    const stored = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (error) {
    console.warn('[RepositoryContext] Failed to load workspaces from localStorage:', error);
  }
  return [];
}

function saveActiveWorkspaceId(workspaceId: string | undefined): void {
  try {
    if (workspaceId) {
      localStorage.setItem(ACTIVE_WORKSPACE_ID_KEY, workspaceId);
    } else {
      localStorage.removeItem(ACTIVE_WORKSPACE_ID_KEY);
    }
  } catch (error) {
    console.warn('[RepositoryContext] Failed to save active workspace ID:', error);
  }
}

function loadActiveWorkspaceId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_WORKSPACE_ID_KEY) || undefined;
  } catch (error) {
    console.warn('[RepositoryContext] Failed to load active workspace ID:', error);
    return undefined;
  }
}

function saveActiveRepositoryId(repositoryId: string | undefined): void {
  try {
    if (repositoryId) {
      localStorage.setItem(ACTIVE_REPOSITORY_ID_KEY, repositoryId);
    } else {
      localStorage.removeItem(ACTIVE_REPOSITORY_ID_KEY);
    }
  } catch (error) {
    console.warn('[RepositoryContext] Failed to save active repository ID:', error);
  }
}

function loadActiveRepositoryId(): string | undefined {
  try {
    return localStorage.getItem(ACTIVE_REPOSITORY_ID_KEY) || undefined;
  } catch (error) {
    console.warn('[RepositoryContext] Failed to load active repository ID:', error);
    return undefined;
  }
}

export const RepositoryProvider: React.FC<RepositoryProviderProps> = ({ children }) => {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspace, setActiveWorkspaceState] = useState<Workspace>();
  const [activeRepository, setActiveRepositoryState] = useState<Repository>();
  const [isInitialized, setIsInitialized] = useState(false);

  const setActiveWorkspace = useCallback((workspace: Workspace) => {
    console.log('[RepositoryContext] setActiveWorkspace called with:', workspace);
    setActiveWorkspaceState(workspace);
    saveActiveWorkspaceId(workspace.id);

    // Set the first repository as active if none is selected
    if (workspace.repositories.length > 0 && !workspace.activeRepositoryId) {
      console.log('[RepositoryContext] Setting first repository as active:', workspace.repositories[0]);
      setActiveRepositoryState(workspace.repositories[0]);
      saveActiveRepositoryId(workspace.repositories[0].id);
    } else if (workspace.activeRepositoryId) {
      const repo = workspace.repositories.find(r => r.id === workspace.activeRepositoryId);
      if (repo) {
        console.log('[RepositoryContext] Setting active repository from activeRepositoryId:', repo);
        setActiveRepositoryState(repo);
        saveActiveRepositoryId(repo.id);
      }
    } else {
      console.log('[RepositoryContext] No repositories in workspace');
      setActiveRepositoryState(undefined);
      saveActiveRepositoryId(undefined);
    }
  }, []);

  const setActiveRepository = useCallback((repository: Repository) => {
    console.log('[RepositoryContext] setActiveRepository called with:', repository);
    setActiveRepositoryState(repository);
    saveActiveRepositoryId(repository.id);

    // Update the workspace's active repository
    if (activeWorkspace) {
      const updatedWorkspace = {
        ...activeWorkspace,
        activeRepositoryId: repository.id
      };
      setActiveWorkspaceState(updatedWorkspace);

      // Update workspaces array and save to storage
      setWorkspaces(prev => {
        const updated = prev.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w);
        saveWorkspacesToStorage(updated);
        return updated;
      });
    }
  }, [activeWorkspace]);

  const loadRepositories = useCallback(async () => {
    try {
      // First, try to load from localStorage
      const savedWorkspaces = loadWorkspacesFromStorage();
      const savedActiveWorkspaceId = loadActiveWorkspaceId();
      const savedActiveRepositoryId = loadActiveRepositoryId();

      console.log('[RepositoryContext] Loading from storage:', {
        savedWorkspaces,
        savedActiveWorkspaceId,
        savedActiveRepositoryId
      });

      if (savedWorkspaces.length > 0) {
        // Restore from localStorage
        setWorkspaces(savedWorkspaces);

        // Restore active workspace
        if (savedActiveWorkspaceId) {
          const workspace = savedWorkspaces.find(w => w.id === savedActiveWorkspaceId);
          if (workspace) {
            setActiveWorkspaceState(workspace);

            // Restore active repository
            if (savedActiveRepositoryId) {
              const repo = workspace.repositories.find(r => r.id === savedActiveRepositoryId);
              if (repo) {
                setActiveRepositoryState(repo);
                console.log('[RepositoryContext] Restored workspace and repository from storage:', workspace, repo);
                return;
              }
            }

            // If no saved repository, use the first one
            if (workspace.repositories.length > 0) {
              const firstRepo = workspace.repositories[0];
              setActiveRepositoryState(firstRepo);
              saveActiveRepositoryId(firstRepo.id);
              console.log('[RepositoryContext] Restored workspace, using first repository:', workspace, firstRepo);
              return;
            }
          }
        }

        // If we couldn't restore active workspace, use the first one
        const firstWorkspace = savedWorkspaces[0];
        setActiveWorkspaceState(firstWorkspace);
        saveActiveWorkspaceId(firstWorkspace.id);

        if (firstWorkspace.repositories.length > 0) {
          const firstRepo = firstWorkspace.repositories[0];
          setActiveRepositoryState(firstRepo);
          saveActiveRepositoryId(firstRepo.id);
        }

        console.log('[RepositoryContext] Restored from storage, using first workspace');
        return;
      }

      // No saved workspaces, create a default workspace with the current directory
      const currentPath = await invoke<string>('get_current_working_directory');
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

      const newWorkspaces = [defaultWorkspace];
      setWorkspaces(newWorkspaces);
      setActiveWorkspace(defaultWorkspace);
      saveWorkspacesToStorage(newWorkspaces);
      console.log('[RepositoryContext] Created default workspace:', defaultWorkspace);
    } catch (error) {
      console.error('Failed to load repositories:', error);
      // Create empty workspace as fallback
      const emptyWorkspace: Workspace = {
        id: 'default',
        name: 'Default Workspace',
        repositories: [],
        activeRepositoryId: undefined
      };
      const newWorkspaces = [emptyWorkspace];
      setWorkspaces(newWorkspaces);
      setActiveWorkspace(emptyWorkspace);
      saveWorkspacesToStorage(newWorkspaces);
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
          repositories: updatedRepositories,
          // Set as active repository if it's the first one
          activeRepositoryId: updatedRepositories.length === 1 ? newRepo.id : activeWorkspace.activeRepositoryId
        };

        setWorkspaces(prev => {
          const updated = prev.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w);
          saveWorkspacesToStorage(updated);
          return updated;
        });
        setActiveWorkspaceState(updatedWorkspace);

        // If this is the first repository, set it as active
        if (updatedRepositories.length === 1) {
          setActiveRepositoryState(newRepo);
          saveActiveRepositoryId(newRepo.id);
        }
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

      setWorkspaces(prev => {
        const updated = prev.map(w => w.id === activeWorkspace.id ? updatedWorkspace : w);
        saveWorkspacesToStorage(updated);
        return updated;
      });
      setActiveWorkspaceState(updatedWorkspace);

      // Update active repository if the removed one was active
      if (activeRepository?.id === repositoryId) {
        if (updatedRepositories.length > 0) {
          setActiveRepositoryState(updatedRepositories[0]);
          saveActiveRepositoryId(updatedRepositories[0].id);
        } else {
          setActiveRepositoryState(undefined);
          saveActiveRepositoryId(undefined);
        }
      }
    }
  }, [activeWorkspace, activeRepository]);

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      console.log('[RepositoryContext] Initializing...');
      loadRepositories();
      setIsInitialized(true);
    }
  }, [isInitialized, loadRepositories]);

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
