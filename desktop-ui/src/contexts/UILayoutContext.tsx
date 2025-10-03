import React, { createContext, useContext, useReducer, ReactNode } from 'react';

export interface UILayoutState {
  // Main split: Chat (left) ⇆ Terminal (right)
  mainSplitSize: number;
  // Panel visibility
  sidebarVisible: boolean;
  rightPanelVisible: boolean;
}

export type UILayoutAction = 
  | { type: 'SET_MAIN_SPLIT_SIZE'; payload: number }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'TOGGLE_RIGHT_PANEL' }
  | { type: 'SET_SIDEBAR_VISIBLE'; payload: boolean }
  | { type: 'SET_RIGHT_PANEL_VISIBLE'; payload: boolean }
  | { type: 'RESET_LAYOUT' };

const initialState: UILayoutState = {
  mainSplitSize: 800, // Chat takes ~800px, terminal gets the rest
  sidebarVisible: true,
  rightPanelVisible: true,
};

const STORAGE_KEY = 'amp-ui-layout-state';

// Load persisted state from localStorage
const loadPersistedState = (): Partial<UILayoutState> => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn('Failed to load UI layout state from localStorage:', error);
    return {};
  }
};

// Save state to localStorage
const persistState = (state: UILayoutState) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to save UI layout state to localStorage:', error);
  }
};

const uiLayoutReducer = (state: UILayoutState, action: UILayoutAction): UILayoutState => {
  let newState: UILayoutState;

  switch (action.type) {
    case 'SET_MAIN_SPLIT_SIZE':
      newState = { ...state, mainSplitSize: action.payload };
      break;
      
    case 'TOGGLE_SIDEBAR':
      newState = { ...state, sidebarVisible: !state.sidebarVisible };
      break;
      
    case 'TOGGLE_RIGHT_PANEL':
      newState = { ...state, rightPanelVisible: !state.rightPanelVisible };
      break;
      
    case 'SET_SIDEBAR_VISIBLE':
      newState = { ...state, sidebarVisible: action.payload };
      break;
      
    case 'SET_RIGHT_PANEL_VISIBLE':
      newState = { ...state, rightPanelVisible: action.payload };
      break;
      
    case 'RESET_LAYOUT':
      newState = { ...initialState };
      break;
      
    default:
      return state;
  }

  // Persist the new state
  persistState(newState);
  return newState;
};

interface UILayoutContextType {
  state: UILayoutState;
  dispatch: React.Dispatch<UILayoutAction>;
  // Convenience methods
  setMainSplitSize: (size: number) => void;
  toggleSidebar: () => void;
  toggleRightPanel: () => void;
  setSidebarVisible: (visible: boolean) => void;
  setRightPanelVisible: (visible: boolean) => void;
  resetLayout: () => void;
}

const UILayoutContext = createContext<UILayoutContextType | undefined>(undefined);

export const useUILayout = (): UILayoutContextType => {
  const context = useContext(UILayoutContext);
  if (!context) {
    throw new Error('useUILayout must be used within a UILayoutProvider');
  }
  return context;
};

interface UILayoutProviderProps {
  children: ReactNode;
}

export const UILayoutProvider: React.FC<UILayoutProviderProps> = ({ children }) => {
  // Initialize state with persisted values
  const [state, dispatch] = useReducer(
    uiLayoutReducer,
    { ...initialState, ...loadPersistedState() }
  );

  // Convenience methods
  const setMainSplitSize = (size: number) => 
    dispatch({ type: 'SET_MAIN_SPLIT_SIZE', payload: size });
    
  const toggleSidebar = () => 
    dispatch({ type: 'TOGGLE_SIDEBAR' });
    
  const toggleRightPanel = () => 
    dispatch({ type: 'TOGGLE_RIGHT_PANEL' });
    
  const setSidebarVisible = (visible: boolean) => 
    dispatch({ type: 'SET_SIDEBAR_VISIBLE', payload: visible });
    
  const setRightPanelVisible = (visible: boolean) => 
    dispatch({ type: 'SET_RIGHT_PANEL_VISIBLE', payload: visible });
    
  const resetLayout = () => 
    dispatch({ type: 'RESET_LAYOUT' });

  const value: UILayoutContextType = {
    state,
    dispatch,
    setMainSplitSize,
    toggleSidebar,
    toggleRightPanel,
    setSidebarVisible,
    setRightPanelVisible,
    resetLayout,
  };

  return (
    <UILayoutContext.Provider value={value}>
      {children}
    </UILayoutContext.Provider>
  );
};
