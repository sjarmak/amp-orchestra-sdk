import { useState } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  Clock,
  ExternalLink,
} from "lucide-react";
import { ProfileStatus, AmpProfile } from "../../hooks/useProfileManager";

interface ConnectionStatusProps {
  profile: AmpProfile;
  status?: ProfileStatus;
  onRetry: (profileId: string) => Promise<void>;
  compact?: boolean;
}

export const ConnectionStatus = ({
  profile,
  status,
  onRetry,
  compact = false,
}: ConnectionStatusProps) => {
  const [isRetrying, setIsRetrying] = useState(false);

  const handleRetry = async () => {
    if (isRetrying) return;

    setIsRetrying(true);
    try {
      await onRetry(profile.id);
    } catch (error) {
      console.error("Retry failed:", error);
    } finally {
      setIsRetrying(false);
    }
  };

  const isConnected = status?.is_connected || false;
  const healthCheck = status?.health_check;
  const lastChecked = status?.last_checked;

  if (compact) {
    return (
      <div className="flex items-center space-x-1">
        {isConnected ? (
          <CheckCircle className="w-3 h-3 text-foreground opacity-80" />
        ) : (
          <AlertCircle className="w-3 h-3 text-muted-foreground/60" />
        )}
        <span
          className={`text-xs ${
            isConnected
              ? "text-foreground opacity-80"
              : "text-muted-foreground/70"
          }`}
        >
          {isConnected ? "Online" : "Offline"}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {isConnected ? (
            <Wifi className="w-4 h-4 text-foreground opacity-80" />
          ) : (
            <WifiOff className="w-4 h-4 text-muted-foreground/60" />
          )}
          <span className="font-medium">
            {isConnected ? "Connected" : "Disconnected"}
          </span>
        </div>

        <button
          onClick={handleRetry}
          disabled={isRetrying}
          className="p-1 hover:bg-accent rounded transition-colors disabled:opacity-50"
          title="Retry connection"
        >
          <RefreshCw
            className={`w-4 h-4 ${isRetrying ? "animate-spin" : ""}`}
          />
        </button>
      </div>

      {healthCheck && (
        <div
          className={`p-3 rounded-md border ${
            healthCheck.success
              ? "bg-muted/30 border-muted-foreground/20"
              : "bg-muted/20 border-muted-foreground/30"
          }`}
        >
          <div className="space-y-2">
            <div className="flex items-start space-x-2">
              {healthCheck.success ? (
                <CheckCircle className="w-4 h-4 text-foreground opacity-80 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-muted-foreground/60 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm font-medium ${
                    healthCheck.success
                      ? "text-foreground opacity-90"
                      : "text-muted-foreground/80"
                  }`}
                >
                  {healthCheck.success
                    ? "Connection Healthy"
                    : "Connection Failed"}
                </p>
                <p
                  className={`text-xs mt-1 ${
                    healthCheck.success
                      ? "text-muted-foreground/80"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {healthCheck.message}
                </p>
              </div>
            </div>

            {healthCheck.success && (
              <div className="pl-6 space-y-1">
                <div className="text-xs text-muted-foreground/80">
                  <span className="font-medium">Mode:</span>{" "}
                  {healthCheck.connection_mode}
                </div>
                <div className="text-xs text-muted-foreground/80">
                  <span className="font-medium">Description:</span>{" "}
                  {healthCheck.connection_description}
                </div>
                {healthCheck.version && (
                  <div className="text-xs text-muted-foreground/80">
                    <span className="font-medium">Version:</span>{" "}
                    {healthCheck.version}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {lastChecked && (
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          <span>Last checked: {new Date(lastChecked).toLocaleString()}</span>
        </div>
      )}

      {!isConnected && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            Troubleshooting steps:
          </p>
          <ul className="text-xs text-muted-foreground space-y-1 pl-4">
            {profile.connection_type === "local-cli" && (
              <>
                <li>• Check that the Amp CLI is installed and accessible</li>
                <li>
                  • Verify the CLI path: {profile.cli_path || "Not specified"}
                </li>
                <li>
                  • Run{" "}
                  <code className="bg-muted px-1 rounded">amp --version</code>{" "}
                  in terminal
                </li>
              </>
            )}
            {profile.connection_type === "local-server" && (
              <>
                <li>• Ensure the local Amp server is running</li>
                <li>
                  • Check server URL: {profile.api_url || "Not specified"}
                </li>
                <li>• Verify firewall and network settings</li>
              </>
            )}
            {profile.connection_type === "production" && (
              <>
                <li>• Check your internet connection</li>
                <li>• Verify your authentication token is valid</li>
                <li>
                  • Visit{" "}
                  <a
                    href="https://ampcode.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline inline-flex items-center"
                  >
                    ampcode.com <ExternalLink className="w-3 h-3 ml-1" />
                  </a>{" "}
                  for status updates
                </li>
              </>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};
