import React, { useState } from 'react';
import { 
  ChevronRight, 
  ChevronDown, 
  Briefcase, 
  Plus, 
  Settings,
  FolderPlus
} from 'lucide-react';
import { Workspace, useRepository } from '../../contexts/RepositoryContext';
import { RepositoryNode } from './RepositoryNode';

interface WorkspaceNodeProps {
  workspace: Workspace;
  isActive: boolean;
  onSelect: (workspace: Workspace) => void;
  onAddRepository?: () => void;
}

export const WorkspaceNode: React.FC<WorkspaceNodeProps> = ({
  workspace,
  isActive,
  onSelect,
  onAddRepository,
}) => {
  const [isExpanded, setIsExpanded] = useState(isActive);
  const [showActions, setShowActions] = useState(false);
  const { 
    activeRepository, 
    setActiveRepository, 
    removeRepository 
  } = useRepository();

  const handleToggle = () => {
    setIsExpanded(!isExpanded);
  };

  const handleSelect = () => {
    onSelect(workspace);
    setIsExpanded(true);
  };

  const handleAddRepository = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAddRepository) {
      onAddRepository();
    }
  };

  return (
    <div className="mb-2">
      <div
        className={`flex items-center px-3 py-2 text-sm cursor-pointer transition-colors group ${
          isActive 
            ? 'bg-accent/60 text-accent-foreground' 
            : 'hover:bg-accent/30 text-foreground'
        }`}
        onClick={handleSelect}
        onMouseEnter={() => setShowActions(true)}
        onMouseLeave={() => setShowActions(false)}
      >
        <button
          onClick={(e) => { e.stopPropagation(); handleToggle(); }}
          className="p-0.5 rounded-sm hover:bg-accent/70 transition-colors mr-2"
        >
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        
        <Briefcase className="w-4 h-4 mr-2 text-primary/80" />
        <span className="flex-1 font-medium truncate">{workspace.name}</span>
        
        <div className={`flex items-center gap-1 transition-opacity ${
          showActions ? 'opacity-100' : 'opacity-0'
        }`}>
          <button
            onClick={handleAddRepository}
            className="p-1 rounded-sm hover:bg-accent/70 transition-colors"
            title="Add repository"
          >
            <FolderPlus className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => e.stopPropagation()}
            className="p-1 rounded-sm hover:bg-accent/70 transition-colors"
            title="Workspace settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="ml-2">
          {workspace.repositories.length === 0 ? (
            <div className="px-6 py-4 text-center">
              <div className="text-muted-foreground/60 text-sm mb-2">
                No repositories in this workspace
              </div>
              <button
                onClick={handleAddRepository}
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-primary/10 text-primary rounded-md hover:bg-primary/20 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Repository
              </button>
            </div>
          ) : (
            <div className="space-y-0.5">
              {workspace.repositories.map((repository) => (
                <RepositoryNode
                  key={repository.id}
                  repository={repository}
                  isActive={activeRepository?.id === repository.id}
                  onSelect={setActiveRepository}
                  onRemove={removeRepository}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
