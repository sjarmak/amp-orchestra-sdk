import { RefreshCw } from "lucide-react";
import { useDualServerStatus } from "../hooks/useDualServerStatus";

export const DualServerStatus = () => {
  const { status, refresh } = useDualServerStatus();

  const handleRefresh = async () => {
    try {
      await refresh();
    } catch (error) {
      console.error("Failed to refresh server status:", error);
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <div className="flex items-center space-x-2">
        <div className="text-xs font-medium text-muted-foreground">
          Servers:
        </div>

        {/* Production Status */}
        <div className="flex items-center space-x-1">
          <div
            className={`w-2 h-2 rounded-full ${
              status.production.available 
                ? "bg-foreground opacity-80" 
                : "bg-muted-foreground/40 border border-muted-foreground/60"
            }`}
          />
          <span className="text-xs text-muted-foreground">Prod</span>
        </div>

        {/* Development Status */}
        <div className="flex items-center space-x-1">
          <div
            className={`w-2 h-2 rounded-full ${
              status.development.available 
                ? "bg-foreground opacity-80" 
                : "bg-muted-foreground/40 border border-muted-foreground/60"
            }`}
          />
          <span className="text-xs text-muted-foreground">Dev</span>
        </div>
      </div>

      <button
        onClick={handleRefresh}
        className="p-1 hover:bg-accent rounded transition-colors"
        title="Refresh server status"
      >
        <RefreshCw className="w-3 h-3" />
      </button>
    </div>
  );
};

export const DualServerStatusDetailed = () => {
  const { status, refresh } = useDualServerStatus();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">Server Status</span>
        <button
          onClick={refresh}
          className="p-1 hover:bg-accent rounded transition-colors"
          title="Refresh server status"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Production Server */}
      <div className="p-3 rounded-md border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                status.production.available 
                  ? "bg-foreground opacity-80" 
                  : "bg-muted-foreground/40 border border-muted-foreground/60"
              }`}
            />
            <span className="text-sm font-medium">Production</span>
          </div>
          {status.production.version && (
            <span className="text-xs text-muted-foreground">
              v{status.production.version}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {status.production.connection_description}
        </div>
        {status.production.error && (
          <div className="text-xs text-muted-foreground/70 mt-1">
            Error: {status.production.error}
          </div>
        )}
      </div>

      {/* Development Server */}
      <div className="p-3 rounded-md border bg-muted/30">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full ${
                status.development.available 
                  ? "bg-foreground opacity-80" 
                  : "bg-muted-foreground/40 border border-muted-foreground/60"
              }`}
            />
            <span className="text-sm font-medium">Development</span>
          </div>
          {status.development.version && (
            <span className="text-xs text-muted-foreground">
              v{status.development.version}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">
          {status.development.connection_description}
        </div>
        {status.development.error && (
          <div className="text-xs text-muted-foreground/70 mt-1">
            Error: {status.development.error}
          </div>
        )}
      </div>
    </div>
  );
};
