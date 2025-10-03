/**
 * Terminal View - Thin wrapper around SimpleTerminal following Oracle guidance
 *
 * This component replaces the old TerminalView with a wrapper around the
 * proven SimpleTerminal.tsx component as recommended by postmortem documents.
 */

import { memo } from "react";
import SimpleTerminal, { type SimpleTerminalKind } from "./SimpleTerminal";
import { SessionMode } from "./TerminalManagerContext";

interface TerminalViewProps {
  mode: SessionMode;
  className?: string;
  onReady?: () => void;
  onError?: (error: string) => void;
}

/**
 * TerminalView - Persistent Dual Session Implementation
 *
 * Following postmortem guidance: "Keep both terminal instances alive and toggle 
 * visibility instead of mounting/unmounting" for instant tab switching and 
 * preserved terminal state.
 */
const TerminalViewComponent = ({ mode, className = "" }: TerminalViewProps) => {

  // Create truly persistent terminal keys that don't change with session switches
  // This ensures terminals persist across session changes, maintaining their state
  const kinds: SimpleTerminalKind[] = ['terminal', 'shell'];
  
  return (
    <div className={`h-full w-full relative ${className}`}>
      {kinds.map((kind) => {
        const isActive = (kind === 'terminal' && mode === 'production') || 
                        (kind === 'shell' && mode === 'development');
        
        // Use amp-tui-hidden class for hidden terminals to preserve dimensions
        const terminalClassName = `absolute inset-0 ${isActive ? '' : 'amp-tui-hidden'}`;
        
        // Use a truly persistent key that never changes - this ensures terminals
        // maintain their state across all session switches
        const stableKey = `persistent-terminal-${kind}`;
        
        // Use standard session ID format expected by backend
        const sessionId = `${kind}_default`;
        
        return (
          <div 
            key={kind} 
            className={terminalClassName}
          >
            <SimpleTerminal
              key={stableKey} // Unique key per kind + session
              kind={kind}
              env={{}}
              cwd={undefined}
              className="h-full w-full"
              active={isActive} // Only the visible terminal is active
              sessionId={sessionId} // Standard session ID format
            />
          </div>
        );
      })}
    </div>
  );
};

// Memoize the TerminalView to prevent unnecessary re-renders
export const TerminalView = memo(
  TerminalViewComponent,
  (prevProps, nextProps) => {
    return (
      prevProps.mode === nextProps.mode &&
      prevProps.className === nextProps.className
    );
  }
);

TerminalView.displayName = "TerminalView";
