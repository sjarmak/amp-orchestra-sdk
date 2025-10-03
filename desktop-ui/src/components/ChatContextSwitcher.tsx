import { Monitor, Code } from "lucide-react";
import { ChatContext } from "../hooks/useDualChatContext";

interface ChatContextSwitcherProps {
  activeContext: ChatContext;
  onSwitch: (context: ChatContext) => void;
  productionMessageCount: number;
  developmentMessageCount: number;
}

export const ChatContextSwitcher = ({
  activeContext,
  onSwitch,
  productionMessageCount,
  developmentMessageCount,
}: ChatContextSwitcherProps) => {
  return (
    <div className="flex items-center space-x-1 bg-muted/50 rounded-md p-1">
      <button
        onClick={() => {
          onSwitch("production");
        }}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
          activeContext === "production"
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        }`}
        title="Switch to production chat"
      >
        <Monitor className="w-3 h-3" />
        <span>Production</span>
        {productionMessageCount > 0 && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeContext === "production"
                ? "bg-background/20 text-background"
                : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            {productionMessageCount}
          </span>
        )}
      </button>

      <button
        onClick={() => {
          onSwitch("development");
        }}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
          activeContext === "development"
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        }`}
        title="Switch to development chat"
      >
        <Code className="w-3 h-3" />
        <span>Development</span>
        {developmentMessageCount > 0 && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeContext === "development"
                ? "bg-background/20 text-background"
                : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            {developmentMessageCount}
          </span>
        )}
      </button>
    </div>
  );
};
