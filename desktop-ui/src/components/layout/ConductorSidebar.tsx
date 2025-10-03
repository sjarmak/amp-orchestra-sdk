import React, { useEffect, useState } from 'react';
import { 
  PanelLeftClose,
  Search,
  Plus,
  Folder,
  History
} from 'lucide-react';
import { useRepository } from '../../contexts/RepositoryContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { WorkspaceNode } from '../sidebar/WorkspaceNode';
import { open } from '@tauri-apps/plugin-dialog';

interface ConductorSidebarProps {
  onToggle?: () => void;
}

export const ConductorSidebar: React.FC<ConductorSidebarProps> = ({ onToggle }) => {
  const { 
    workspaces, 
    activeWorkspace, 
    setActiveWorkspace, 
    loadRepositories, 
    addRepository 
  } = useRepository();
  const { recentFiles, openFile } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    // Load repositories on mount
    loadRepositories();
  }, [loadRepositories]);

  const handleAddRepository = async () => {
    try {
      const selectedPath = await open({
        directory: true,
        title: 'Select Repository Directory',
      });
      
      if (selectedPath) {
        await addRepository(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select repository directory:', error);
    }
  };

  const filteredWorkspaces = workspaces.filter(workspace =>
    workspace.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    workspace.repositories.some(repo => 
      repo.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="w-72 bg-background border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Explorer</h2>
        {onToggle && (
          <button 
            onClick={onToggle} 
            className="p-1 hover:bg-accent rounded-md transition-colors" 
            aria-label="Hide sidebar"
          >
            <PanelLeftClose className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Search Bar */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search workspaces and repositories..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-sm bg-muted/50 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-transparent"
          />
        </div>
      </div>

      {/* Workspaces Section */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Workspaces
            </h3>
            <button
              onClick={handleAddRepository}
              className="p-1 hover:bg-accent rounded-md transition-colors"
              title="Add repository to workspace"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="space-y-1">
            {filteredWorkspaces.length === 0 ? (
              <div className="text-center py-8">
                <Folder className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                <div className="text-sm text-muted-foreground/60 mb-3">
                  {searchQuery ? 'No matching workspaces found' : 'No workspaces available'}
                </div>
                {!searchQuery && (
                  <button
                    onClick={handleAddRepository}
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    Add Repository
                  </button>
                )}
              </div>
            ) : (
              filteredWorkspaces.map((workspace) => (
                <WorkspaceNode
                  key={workspace.id}
                  workspace={workspace}
                  isActive={activeWorkspace?.id === workspace.id}
                  onSelect={setActiveWorkspace}
                  onAddRepository={handleAddRepository}
                />
              ))
            )}
          </div>
        </div>

        {/* Recent Files Section */}
        {recentFiles.length > 0 && (
          <div className="border-t border-border p-4">
            <div className="flex items-center mb-3">
              <History className="w-3 h-3 mr-2" />
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Recent Files
              </h3>
            </div>
            
            <div className="space-y-1">
              {recentFiles.slice(0, 5).map((filePath) => {
                const fileName = filePath.split('/').pop() || filePath;
                return (
                  <button
                    key={filePath}
                    onClick={() => openFile(filePath)}
                    className="w-full text-left px-2 py-1 text-xs hover:bg-accent rounded-sm transition-colors text-muted-foreground hover:text-foreground truncate"
                    title={filePath}
                  >
                    {fileName}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
