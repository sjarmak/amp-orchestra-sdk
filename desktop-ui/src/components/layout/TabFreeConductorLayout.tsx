import React, { useEffect } from "react";
import {
  FolderOpen,
  GitBranch,
  PanelLeftOpen,
  PanelRightOpen,
  PanelRightClose,
} from "lucide-react";
import { ConductorSidebar } from "./ConductorSidebar";
import { ChatPane } from "./ChatPane";
import { DiffPane } from "./DiffPane";
import { TerminalPane } from "./TerminalPane";
import { ResizableSplit } from "./ResizableSplit";
import { useUILayout } from "../../contexts/UILayoutContext";
import { useRepository } from "../../contexts/RepositoryContext";
import { ThemeToggle } from "../ThemeToggle";
import { AgentModeSelect } from "../app/AgentModeSelect";
import { ToolboxProfileSelect } from "../app/ToolboxProfileSelect";

const TopBar = ({
  onToggleSidebar,
  sidebarVisible,
  onToggleRightPanel,
  rightPanelVisible,
  activeRepository,
}: {
  onToggleSidebar: () => void;
  sidebarVisible: boolean;
  onToggleRightPanel: () => void;
  rightPanelVisible: boolean;
  activeRepository?: any;
}) => {
  return (
    <div
      className="h-12 border-b border-border flex items-center justify-between px-4 relative"
      data-tauri-drag-region
    >
      <div className="flex items-center gap-4">
        {!sidebarVisible && (
          <button
            onClick={onToggleSidebar}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Show sidebar"
          >
            <PanelLeftOpen className="w-4 h-4" />
          </button>
        )}

        <div className={`flex items-center space-x-2 ${sidebarVisible ? 'ml-72' : ''}`}>
          <FolderOpen className="w-4 h-4" />
          <span className="font-medium select-none">
            {activeRepository?.name || "amp-orchestra"}
          </span>
          <GitBranch className="w-3 h-3" />
          <span className="text-sm text-muted-foreground select-none">
            {activeRepository?.branch || "main"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!rightPanelVisible && (
          <button
            onClick={onToggleRightPanel}
            className="p-2 hover:bg-accent rounded-md transition-colors"
            aria-label="Show diff/terminal panel"
          >
            <PanelRightOpen className="w-4 h-4" />
          </button>
        )}



        {/* Agent Mode dropdown and Toolbox Path selector */}
        <div className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground hidden xl:inline">
              Agent mode
            </span>
            <AgentModeSelect className="max-w-20 lg:max-w-32" />
          </div>
          <div className="hidden lg:flex items-center gap-1">
            <span className="text-xs text-muted-foreground hidden xl:inline">
              Toolbox
            </span>
            <ToolboxProfileSelect />
          </div>
        </div>

        <ThemeToggle />
      </div>
    </div>
  );
};

interface TabFreeConductorLayoutProps {
  className?: string;
}

/**
 * TabFreeConductorLayout implements the Oracle's conductor-style interface:
 * - Chat permanently visible in left panel
 * - Diff permanently visible in upper right panel
 * - Terminal permanently visible in lower right panel
 * - No tab switching at the top level
 * - Clean, conductor.build-inspired design with 3-panel resizable layout
 */
export const TabFreeConductorLayout: React.FC<TabFreeConductorLayoutProps> = ({
  className = "",
}) => {
  const { state, toggleSidebar, toggleRightPanel, setSidebarVisible } =
    useUILayout();

  const { activeRepository } = useRepository();

  // Calculate responsive minimum sizes based on window width (in percentages)
  const getMinimumSizes = () => {
    const windowWidth = window.innerWidth;

    // Convert pixel values to percentages for react-resizable-panels
    if (windowWidth < 1024) {
      // lg breakpoint - ensure both diff and terminal remain visible
      return {
        chatMin: 25, // Allow more space for right panel
        chatMax: 75, // Don't let chat take too much space
        chatDefault: 45,
        diffMin: 30, // Ensure diff doesn't get too small
        diffMax: 70, // Ensure terminal doesn't get too small
        diffDefault: 50,
      };
    } else if (windowWidth < 1280) {
      // xl breakpoint
      return {
        chatMin: 20, // More flexible on larger screens
        chatMax: 80,
        chatDefault: 55,
        diffMin: 25, // Still maintain usable diff size
        diffMax: 75, // Still maintain usable terminal size
        diffDefault: 45,
      };
    }

    // Full desktop sizes - more generous minimums to prevent cutoff
    return {
      chatMin: 15, // Chat can be smaller on desktop
      chatMax: 85, // Allow chat to expand more if needed
      chatDefault: 60,
      diffMin: 20, // Diff gets at least 20% of right panel height
      diffMax: 80, // Terminal gets at least 20% of right panel height
      diffDefault: 50,
    };
  };

  const [minimumSizes, setMinimumSizes] = React.useState(getMinimumSizes());

  // Update minimum sizes on window resize to ensure panels remain usable
  useEffect(() => {
    const handleResize = () => {
      setMinimumSizes(getMinimumSizes());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById(
          "chat-input"
        ) as HTMLInputElement | null;
        el?.focus();
        return;
      }

      // Toggle sidebar with Cmd/Ctrl + B
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        toggleSidebar();
        return;
      }

      // Toggle right panel with Cmd/Ctrl + Shift + T
      if (
        (e.metaKey || e.ctrlKey) &&
        e.shiftKey &&
        e.key.toLowerCase() === "t"
      ) {
        e.preventDefault();
        toggleRightPanel();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [toggleSidebar, toggleRightPanel]);

  return (
    <div
      className={`h-screen flex flex-col bg-background text-foreground ${className}`}
    >
      <TopBar
        onToggleSidebar={toggleSidebar}
        sidebarVisible={state.sidebarVisible}
        onToggleRightPanel={toggleRightPanel}
        rightPanelVisible={state.rightPanelVisible}
        activeRepository={activeRepository}
      />

      <div className="flex-1 flex min-h-0">
        {/* Left Sidebar */}
        {state.sidebarVisible && (
          <ConductorSidebar onToggle={() => setSidebarVisible(false)} />
        )}

        {/* Main Content Area: Chat (left) ⇆ Right panel with Diff/Terminal split */}
        <div className="flex-1 flex min-h-0">
          {state.rightPanelVisible ? (
            <ResizableSplit
              storageKey="main-chat-right"
              defaultSize={minimumSizes.chatDefault}
              minSize={minimumSizes.chatMin}
              maxSize={minimumSizes.chatMax}
              direction="horizontal"
            >
              {[
                <ChatPane />,
                /* R2 Resizer: Vertical split within right panel for Diff ⇆ Terminal */
                <ResizableSplit
                  storageKey="right-panel-diff-terminal"
                  defaultSize={minimumSizes.diffDefault}
                  minSize={minimumSizes.diffMin}
                  maxSize={minimumSizes.diffMax}
                  direction="vertical"
                >
                  {[<DiffPane />, <TerminalPane />]}
                </ResizableSplit>,
              ]}
            </ResizableSplit>
          ) : (
            // Only chat visible when right panel is hidden
            <ChatPane className="flex-1" />
          )}
        </div>

        {/* Right Panel Close Button */}
        {state.rightPanelVisible && (
          <div className="w-8 border-l border-border flex flex-col">
            <button
              onClick={toggleRightPanel}
              className="p-2 hover:bg-accent transition-colors flex items-center justify-center h-12 border-b border-border"
              aria-label="Hide diff/terminal panel"
            >
              <PanelRightClose className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
