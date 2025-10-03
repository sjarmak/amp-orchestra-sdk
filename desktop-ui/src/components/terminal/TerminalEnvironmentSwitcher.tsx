import { Monitor, Code } from "lucide-react";
import { AmpProfileKind } from "./TerminalSessionProvider";

interface TerminalEnvironmentSwitcherProps {
  activeEnvironment: AmpProfileKind;
  onSwitch: (environment: AmpProfileKind) => void;
  disabled?: boolean;
  envKind?: 'local' | 'production';
}

export const TerminalEnvironmentSwitcher = ({
  activeEnvironment,
  onSwitch,
  disabled = false,
  envKind = 'local',
}: TerminalEnvironmentSwitcherProps) => {
  return (
    <div className="flex items-center space-x-1 bg-muted/50 rounded-md p-1" style={{ pointerEvents: 'auto', zIndex: 10 }}>
      <button
        onClick={() => {
          console.log('TerminalEnvironmentSwitcher: Production button clicked');
          onSwitch("prod");
        }}
        disabled={disabled}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
          activeEnvironment === "prod"
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        style={{ pointerEvents: 'auto', zIndex: 10 }}
        title={disabled ? "Environment switching locked in production" : "Switch to production terminal"}
      >
        <Monitor className="w-3 h-3" />
        <span>Production</span>
        {envKind !== 'local' && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeEnvironment === "prod"
                ? "bg-background/20 text-background"
                : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            LOCKED
          </span>
        )}
      </button>

      <button
        onClick={() => {
          console.log('TerminalEnvironmentSwitcher: Development button clicked');
          onSwitch("dev");
        }}
        disabled={disabled}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded text-xs transition-colors ${
          activeEnvironment === "dev"
            ? "bg-foreground text-background font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/80"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
        style={{ pointerEvents: 'auto', zIndex: 10 }}
        title={disabled ? "Environment switching locked in production" : "Switch to development terminal"}
      >
        <Code className="w-3 h-3" />
        <span>Development</span>
        {envKind === 'local' && activeEnvironment === "dev" && (
          <span
            className={`text-xs px-1.5 py-0.5 rounded-full ${
              activeEnvironment === "dev"
                ? "bg-background/20 text-background"
                : "bg-muted-foreground/20 text-muted-foreground"
            }`}
          >
            LOCAL
          </span>
        )}
      </button>
    </div>
  );
};
