import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  GitBranch, 
  FolderOpen,
  Circle,
  MoreHorizontal 
} from 'lucide-react';
import { Repository } from '../../contexts/RepositoryContext';
import { useSessionManager, Session, SessionEnvironment } from '../../contexts/SessionManagerContext';
import { SessionLeaf } from './SessionLeaf';
import { NewSessionLeaf } from './NewSessionLeaf';

interface RepositoryNodeProps {
  repository: Repository;
  isActive: boolean;
  onSelect: (repository: Repository) => void;
  onRemove?: (repositoryId: string) => void;
}

export const RepositoryNode: React.FC<RepositoryNodeProps> = ({
  repository,
  isActive,
  onSelect,
  onRemove,
}) => {
  const { getSessionsForRepo, currentSession, createSession, renameSession, deleteSession } = useSessionManager();
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [showMenu, setShowMenu] = useState(false);
  
  const repoSessions = getSessionsForRepo(repository.id);
  const hasActiveSessions = repoSessions.length > 0;

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelect(repository);
    setIsExpanded(true);
  };

  const handleRemove = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onRemove) {
      onRemove(repository.id);
    }
  };

  const handleMenuToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(!showMenu);
  };

  const handleCreateSession = async (name: string, environment?: SessionEnvironment) => {
    const repoId = repository.id;          // for state
    const repoPath = repository.path;      // for git worktree
    console.log('RepositoryNode.handleCreateSession called with:', { repoId, repoPath, name, environment });
    
    try {
      // Always use production as default since environment is now managed globally
      const branch = 'main'; // Default branch for new sessions
      const sessionId = await createSession(repoId, name, environment || 'production', branch, undefined, repoPath);
      console.log('Session created successfully from RepositoryNode:', sessionId);
    } catch (error) {
      console.error('Failed to create session from RepositoryNode:', error);
    }
  };

  const handleSessionSelect = (_session: Session) => {
    // Optional: could trigger repository selection too
    // onSelect(repository);
  };

  const handleSessionRename = (sessionId: string, newName: string) => {
    renameSession(sessionId, newName);
  };

  const handleSessionDelete = (sessionId: string) => {
    // Only delete if there are other sessions for this repository
    if (repoSessions.length > 1) {
      deleteSession(sessionId);
    }
  };

  return (
    <div className="relative">
      <div
        className={`flex items-center px-3 py-2 text-sm cursor-pointer transition-colors group ${
          isActive 
            ? 'bg-accent/80 text-accent-foreground border-l-2 border-primary' 
            : 'hover:bg-accent/50 text-muted-foreground'
        }`}
        onClick={handleSelect}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          className="p-0.5 rounded-sm hover:bg-accent/70 transition-colors mr-1"
        >
          {isExpanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </button>
        
        <div className="flex items-center flex-1 min-w-0">
          <FolderOpen className="w-4 h-4 mr-2 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="truncate font-medium">{repository.name}</div>
            <div className="flex items-center text-xs text-muted-foreground/70 mt-0.5">
              <GitBranch className="w-3 h-3 mr-1 flex-shrink-0" />
              <span className="truncate">{repository.branch}</span>

            </div>
          </div>
        </div>

        <button
          onClick={handleMenuToggle}
          className="p-1 rounded-sm opacity-0 group-hover:opacity-100 hover:bg-accent/70 transition-all ml-1 flex-shrink-0"
        >
          <MoreHorizontal className="w-3 h-3" />
        </button>

        {showMenu && (
          <div className="absolute right-2 top-8 bg-popover border border-border rounded-md shadow-lg z-10 py-1 min-w-32">
            <button
              onClick={handleRemove}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-accent transition-colors text-destructive"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="border-l border-border/50">
          <div className="ml-6 pl-4 py-1 text-xs text-muted-foreground/60">
            {repository.path}
          </div>
          
          {/* Sessions for this repository */}
          <div className="py-1">
            {repoSessions.map((session) => (
              <SessionLeaf
                key={session.id}
                session={session}
                isActive={currentSession?.id === session.id}
                onSelect={handleSessionSelect}
                onRename={handleSessionRename}
                onDelete={handleSessionDelete}
              />
            ))}
            
            <NewSessionLeaf
              onCreateSession={handleCreateSession}
            />
          </div>
          
          {/* File tree placeholder - TODO: Add file tree or recent files here */}
          {!hasActiveSessions && (
            <div className="ml-6 pl-4 py-1 text-xs text-muted-foreground/60">
              <div className="flex items-center">
                <Circle className="w-1 h-1 mr-2 fill-current" />
                Ready for work
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
