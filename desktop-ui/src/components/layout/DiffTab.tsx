import React, { useState, useCallback } from 'react';
import { 
  FileText, 
  FolderOpen,
  RefreshCw,
  Settings
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

interface DiffTabProps {
  data?: any;
}

interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesRemoved: number;
}

export const DiffTab: React.FC<DiffTabProps> = ({ data: _data }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [changes, _setChanges] = useState<FileChange[]>([]);
  const [loading, setLoading] = useState(false);
  const [diffContent, setDiffContent] = useState<string>('');

  const handleSelectFile = useCallback(async () => {
    try {
      const selectedPath = await open({
        title: 'Select file to diff',
        filters: [
          {
            name: 'All Files',
            extensions: ['*']
          }
        ]
      });
      
      if (selectedPath) {
        setSelectedFile(selectedPath);
        await loadDiffContent(selectedPath);
      }
    } catch (error) {
      console.error('Failed to select file:', error);
    }
  }, []);

  const loadDiffContent = useCallback(async (filePath: string) => {
    setLoading(true);
    try {
      // This would typically call a Tauri command to get git diff
      // For now, we'll just show a placeholder
      const content = await invoke<string>('get_file_diff', { path: filePath }).catch(() => 
        `diff --git a/${filePath} b/${filePath}
index 1234567..abcdefg 100644
--- a/${filePath}
+++ b/${filePath}
@@ -1,3 +1,4 @@
 existing line 1
 existing line 2
+new line added
 existing line 3`
      );
      
      setDiffContent(content);
    } catch (error) {
      console.error('Failed to load diff content:', error);
      setDiffContent('Error loading diff content');
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshDiff = useCallback(async () => {
    if (selectedFile) {
      await loadDiffContent(selectedFile);
    }
  }, [selectedFile, loadDiffContent]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'added':
        return 'text-green-500';
      case 'modified':
        return 'text-yellow-500';
      case 'deleted':
        return 'text-red-500';
      default:
        return 'text-muted-foreground';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'added':
        return '+';
      case 'modified':
        return '~';
      case 'deleted':
        return '-';
      default:
        return '?';
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {selectedFile ? selectedFile.split('/').pop() : 'Diff View'}
          </span>
          {selectedFile && (
            <span className="text-xs text-muted-foreground px-2 py-1 bg-muted/50 rounded">
              {selectedFile}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleSelectFile}
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            title="Select file"
          >
            <FolderOpen className="w-4 h-4" />
          </button>
          <button
            onClick={refreshDiff}
            disabled={!selectedFile || loading}
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground disabled:opacity-50"
            title="Refresh diff"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            className="p-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
            title="Diff settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex">
        {/* Changes sidebar (if we have multiple files) */}
        {changes.length > 0 && (
          <div className="w-64 border-r border-border bg-muted/10">
            <div className="p-3 border-b border-border">
              <h3 className="text-sm font-medium mb-2">Changes</h3>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{changes.length} files changed</span>
              </div>
            </div>
            
            <div className="overflow-y-auto">
              {changes.map((change) => (
                <div
                  key={change.path}
                  className={`p-3 border-b border-border/50 cursor-pointer hover:bg-accent/50 transition-colors ${
                    selectedFile === change.path ? 'bg-accent/30' : ''
                  }`}
                  onClick={() => setSelectedFile(change.path)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-mono ${getStatusColor(change.status)}`}>
                      {getStatusIcon(change.status)}
                    </span>
                    <span className="text-sm truncate">{change.path.split('/').pop()}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {change.linesAdded > 0 && (
                      <span className="text-green-500">+{change.linesAdded}</span>
                    )}
                    {change.linesAdded > 0 && change.linesRemoved > 0 && ' '}
                    {change.linesRemoved > 0 && (
                      <span className="text-red-500">-{change.linesRemoved}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 flex flex-col">
          {selectedFile ? (
            <div className="flex-1 overflow-auto">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading diff...
                  </div>
                </div>
              ) : (
                <pre className="p-4 text-sm font-mono whitespace-pre-wrap break-words">
                  {diffContent}
                </pre>
              )}
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <FileText className="w-16 h-16 text-muted-foreground/40 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">
                No file selected
              </h3>
              <p className="text-muted-foreground mb-4 max-w-sm">
                Select a file to view its diff or compare changes between different versions.
              </p>
              <button
                onClick={handleSelectFile}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                Select File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
