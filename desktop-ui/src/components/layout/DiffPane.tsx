import React, { useState } from 'react';
import { FileText, GitCompare, AlertCircle } from 'lucide-react';

interface DiffPaneProps {
  className?: string;
}

/**
 * DiffPane displays file diffs and changes
 * This is a placeholder implementation that can be enhanced with git integration
 */
export const DiffPane: React.FC<DiffPaneProps> = ({ className = '' }) => {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  // Mock diff data - replace with real git diff integration
  const mockChangedFiles = [
    { path: 'src/components/layout/ConductorLayout.tsx', changes: '+12 -3' },
    { path: 'src/contexts/UILayoutContext.tsx', changes: '+45 -0' },
    { path: 'desktop-ui/package.json', changes: '+1 -0' },
  ];

  const mockDiffContent = `@@ -1,6 +1,12 @@
 import React, { useState, useEffect } from 'react';
+import { ResizableSplit } from './ResizableSplit';
+import { useUILayout } from '../../contexts/UILayoutContext';
 import {
   FolderOpen,
   GitBranch,
   PanelLeftOpen,
   PanelRightOpen,
   PanelRightClose,`;

  return (
    <div className={`flex flex-col bg-background border-r border-border ${className}`} style={{ minHeight: '100px' }}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <GitCompare className="w-4 h-4" />
          <span className="font-medium text-sm">Changes</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {mockChangedFiles.length} files
        </span>
      </div>

      {/* File list */}
      <div className="flex-1 min-h-0 flex flex-col" style={{ minHeight: '60px' }}>
        {mockChangedFiles.length > 0 ? (
          <>
            <div className="p-2 space-y-1">
              {mockChangedFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file.path)}
                  className={`w-full text-left p-2 rounded-md text-xs transition-colors ${
                    selectedFile === file.path
                      ? 'bg-accent text-accent-foreground'
                      : 'hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="truncate">{file.path}</span>
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      {file.changes}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Diff content */}
            {selectedFile && (
              <div className="flex-1 border-t border-border">
                <div className="p-2 border-b border-border">
                  <span className="text-xs font-medium">{selectedFile}</span>
                </div>
                <div className="p-2 font-mono text-xs bg-muted/20 h-full overflow-auto">
                  <pre className="whitespace-pre-wrap text-muted-foreground">
                    {mockDiffContent}
                  </pre>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="text-sm">No changes to display</p>
              <p className="text-xs mt-1">File modifications will appear here</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
