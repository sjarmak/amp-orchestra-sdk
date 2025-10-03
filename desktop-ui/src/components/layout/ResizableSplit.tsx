import React, { useCallback } from 'react';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';

interface ResizableSplitProps {
  /** Unique storage key for localStorage persistence */
  storageKey: string;
  /** Default size for the first panel (percentage) */
  defaultSize?: number;
  /** Minimum size for the first panel (percentage) */
  minSize?: number;
  /** Maximum size for the first panel (percentage) */
  maxSize?: number;
  /** Called when pane size changes */
  onSizeChange?: (size: number) => void;
  /** Child components to render in the split panes */
  children: [React.ReactNode, React.ReactNode];
  /** Split direction */
  direction?: 'horizontal' | 'vertical';
  /** Additional CSS class */
  className?: string;
}

const STORAGE_KEY_PREFIX = 'amp-split-';

/**
 * ResizableSplit is a wrapper around react-resizable-panels that provides:
 * - Automatic localStorage persistence of split positions
 * - Proper minimum/maximum size handling
 * - Clean API for managing resizable panels
 */
export const ResizableSplit: React.FC<ResizableSplitProps> = ({
  storageKey,
  defaultSize = 50,
  minSize = 20,
  maxSize = 80,
  onSizeChange,
  children,
  direction = 'horizontal',
  className = '',
}) => {
  const fullStorageKey = `${STORAGE_KEY_PREFIX}${storageKey}`;
  
  // Load initial size from localStorage or use default
  const getInitialSize = useCallback(() => {
    try {
      const saved = localStorage.getItem(fullStorageKey);
      if (saved !== null) {
        const parsedSize = parseFloat(saved);
        // Validate the saved size is within bounds
        if (parsedSize >= minSize && parsedSize <= maxSize) {
          return parsedSize;
        }
      }
    } catch (error) {
      console.warn(`Failed to load split size from localStorage for key ${fullStorageKey}:`, error);
    }
    return defaultSize;
  }, [fullStorageKey, defaultSize, minSize, maxSize]);

  const [firstPanelSize, setFirstPanelSize] = React.useState<number>(getInitialSize);

  const handleResize = useCallback((sizes: number[]) => {
    const newSize = sizes[0] || defaultSize;
    setFirstPanelSize(newSize);
    
    // Persist to localStorage
    try {
      localStorage.setItem(fullStorageKey, String(newSize));
    } catch (error) {
      console.warn(`Failed to save split size to localStorage for key ${fullStorageKey}:`, error);
    }

    // Call external handler
    onSizeChange?.(newSize);
  }, [fullStorageKey, onSizeChange, defaultSize]);

  return (
    <PanelGroup 
      direction={direction} 
      onLayout={handleResize}
      className={className}
    >
      <Panel 
        defaultSize={firstPanelSize}
        minSize={minSize}
        maxSize={maxSize}
      >
        {children[0]}
      </Panel>
      
      <PanelResizeHandle className="amp-resize-handle" />
      
      <Panel>
        {children[1]}
      </Panel>
    </PanelGroup>
  );
};
