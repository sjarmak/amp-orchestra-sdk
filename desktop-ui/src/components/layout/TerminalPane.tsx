import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import SimpleTerminalFixed from '../terminal/SimpleTerminalFixed';
import { Terminal, Plus, X } from 'lucide-react';

interface TerminalPaneProps {
  className?: string;
}

interface TerminalTab {
  id: string;
  name: string;
  cwd: string;
}

/**
 * TerminalPane wraps the existing SimpleTerminal component for use in the resizable layout
 */
export const TerminalPane: React.FC<TerminalPaneProps> = ({ className = '' }) => {
  const [cwd, setCwd] = useState<string>('');
  const [terminals, setTerminals] = useState<TerminalTab[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState('default');

  useEffect(() => {
    invoke<string>('get_current_working_directory').then(dir => {
      setCwd(dir);
      setTerminals([{ id: 'default', name: 'Terminal', cwd: dir }]);
    }).catch(err => {
      console.error('Failed to get current directory:', err);
      // Fallback to home directory
      const fallback = '~';
      setCwd(fallback);
      setTerminals([{ id: 'default', name: 'Terminal', cwd: fallback }]);
    });
  }, []);

  const addTerminal = () => {
    const newTerminal: TerminalTab = {
      id: `terminal-${Date.now()}`,
      name: `Terminal ${terminals.length + 1}`,
      cwd: cwd || '~'
    };
    setTerminals([...terminals, newTerminal]);
    setActiveTerminalId(newTerminal.id);
  };

  const closeTerminal = (terminalId: string) => {
    if (terminals.length <= 1) return; // Keep at least one terminal
    
    const updatedTerminals = terminals.filter(t => t.id !== terminalId);
    setTerminals(updatedTerminals);
    
    // If closing the active terminal, switch to the first available one
    if (activeTerminalId === terminalId) {
      setActiveTerminalId(updatedTerminals[0].id);
    }
  };

  // const activeTerminal = terminals.find(t => t.id === activeTerminalId) || terminals[0];

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      {/* Header with tabs */}
      <div className="flex items-center border-b border-border shrink-0">
        <div className="flex items-center flex-1 min-w-0">
          {terminals.map((terminal) => (
            <div
              key={terminal.id}
              className={`flex items-center gap-1 px-3 py-2 border-r border-border cursor-pointer transition-colors ${
                activeTerminalId === terminal.id
                  ? 'bg-background'
                  : 'bg-muted/30 hover:bg-muted/50'
              }`}
              onClick={() => setActiveTerminalId(terminal.id)}
            >
              <Terminal className="w-3 h-3" />
              <span className="text-xs font-medium truncate">{terminal.name}</span>
              {terminals.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    closeTerminal(terminal.id);
                  }}
                  className="p-0.5 hover:bg-muted-foreground/20 rounded transition-colors"
                  title="Close terminal"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          ))}
        </div>
        
        <button
          onClick={addTerminal}
          className="p-2 hover:bg-accent rounded-md transition-colors shrink-0"
          title="New terminal"
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>
      
      {/* Terminal content - Oracle's fix: ensure proper height calculation */}
      <div className="flex-1 relative">
        {terminals.map((terminal) => (
          <div
            key={terminal.id}
            className={`absolute inset-0 ${activeTerminalId === terminal.id ? 'block' : 'hidden'}`}
          >
            <SimpleTerminalFixed 
              key={terminal.id} // Force re-mount when switching terminals
              kind="shell"
              className="h-full w-full" 
              cwd={terminal.cwd}
            />
          </div>
        ))}
      </div>
    </div>
  );
};
