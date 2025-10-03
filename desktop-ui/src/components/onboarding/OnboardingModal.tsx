import { useState, useEffect } from "react";
import {
  Globe,
  Terminal,
  Server,
  Download,
  ExternalLink,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  User,
  Search,
} from "lucide-react";
import { AmpProfile } from "../../hooks/useProfileManager";

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (
    profile: Omit<AmpProfile, "id" | "is_active" | "created_at" | "updated_at">
  ) => Promise<void>;
  onDetectCliPaths?: () => Promise<string[]>;
}

type Step = "welcome" | "connection-type" | "setup" | "complete";
type ConnectionType = "production" | "local-server" | "local-cli";

export const OnboardingModal = ({
  isOpen,
  onComplete,
  onDetectCliPaths,
}: OnboardingModalProps) => {
  const [currentStep, setCurrentStep] = useState<Step>("welcome");
  const [connectionType, setConnectionType] =
    useState<ConnectionType>("production");
  const [formData, setFormData] = useState({
    name: "",
    api_url: "https://localhost:7002",
    cli_path: "",
    token: "",
    tls_enabled: true,
  });

  const [detectedPaths, setDetectedPaths] = useState<string[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hasCheckedCli, setHasCheckedCli] = useState(false);
   const [error, setError] = useState<string>("");

  // Generate unique profile name
  const generateUniqueProfileName = (connectionType: ConnectionType) => {
    const timestamp = new Date().toLocaleString();
    switch (connectionType) {
      case "production":
        return `Production Profile (${timestamp})`;
      case "local-server":
        return `Local Server Profile (${timestamp})`;
      case "local-cli":
        return `CLI Profile (${timestamp})`;
      default:
        return `Profile (${timestamp})`;
    }
  };

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep("welcome");
      setConnectionType("production");
      setFormData({
        name: "",
        api_url: "https://localhost:7002",
        cli_path: "",
        token: "",
        tls_enabled: true,
      });
      setDetectedPaths([]);
      setHasCheckedCli(false);
        setError("");
        }
   }, [isOpen]);

  // Auto-detect CLI paths and generate profile name when connection type changes
  useEffect(() => {
    if (connectionType === "local-cli" && !hasCheckedCli && onDetectCliPaths) {
      setHasCheckedCli(true);
      handleDetectCliPaths();
    }
    
    // Generate unique name when connection type changes (if name is empty)
    if (!formData.name) {
      setFormData((prev) => ({
        ...prev,
        name: generateUniqueProfileName(connectionType)
      }));
    }
  }, [connectionType, hasCheckedCli, onDetectCliPaths, formData.name, generateUniqueProfileName]);

  const handleDetectCliPaths = async () => {
    if (!onDetectCliPaths) return;

    setIsDetecting(true);
    try {
      const paths = await onDetectCliPaths();
      setDetectedPaths(paths);
      if (paths.length > 0 && !formData.cli_path) {
        setFormData((prev) => ({ ...prev, cli_path: paths[0] }));
      }
    } catch (error) {
      console.error("Failed to detect CLI paths:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  const handleComplete = async () => {
  setIsCompleting(true);
  setError("");
  try {
  await onComplete({
  name: formData.name,
  connection_type: connectionType,
  api_url:
    connectionType === "local-server" ? formData.api_url : undefined,
  cli_path:
    connectionType === "local-cli" ? formData.cli_path : undefined,
  token:
  connectionType === "production" || connectionType === "local-server"
  ? formData.token
      : undefined,
  tls_enabled:
      connectionType === "local-server" ? formData.tls_enabled : undefined,
  });
    setCurrentStep("complete");
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
  const errorMessage = error instanceof Error ? error.message : "Failed to create profile.";
  setError(errorMessage);
     } finally {
       setIsCompleting(false);
     }
   };

  const handleRegenerateName = () => {
    setFormData((prev) => ({
      ...prev,
      name: generateUniqueProfileName(connectionType)
    }));
    setError("");
  };

  const canProceed = () => {
    switch (currentStep) {
      case "welcome":
        return true;
      case "connection-type":
        return true;
      case "setup":
        if (connectionType === "local-cli") {
          return formData.cli_path.trim() !== "";
        }
        if (connectionType === "local-server") {
        return (
        formData.api_url.trim() !== "" &&
        (formData.api_url.startsWith("http://") ||
        formData.api_url.startsWith("https://"))
        );
        }
        if (connectionType === "production") {
           return formData.token.trim() !== "";
         }
         return true;
      default:
        return false;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* Welcome Step */}
        {currentStep === "welcome" && (
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
              <User className="w-8 h-8 text-primary" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold">Welcome to Amp Orchestra</h1>
              <p className="text-muted-foreground">
                Let's set up your first Amp profile to get started with
                AI-powered coding assistance.
              </p>
            </div>

            <div className="space-y-3 text-left bg-muted/30 rounded-lg p-4">
              <h3 className="font-medium">What you'll need:</h3>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-foreground opacity-80 mt-0.5 flex-shrink-0" />
                  <span>
                    Choose your connection method (Production, Local Server, or
                    Local CLI)
                  </span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-foreground opacity-80 mt-0.5 flex-shrink-0" />
                  <span>Configure authentication if needed</span>
                </li>
                <li className="flex items-start space-x-2">
                  <CheckCircle className="w-4 h-4 text-foreground opacity-80 mt-0.5 flex-shrink-0" />
                  <span>Start coding with AI assistance!</span>
                </li>
              </ul>
            </div>

            <button
              onClick={() => setCurrentStep("connection-type")}
              className="flex items-center space-x-2 mx-auto px-6 py-3 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors"
            >
              <span>Get Started</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Connection Type Step */}
        {currentStep === "connection-type" && (
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Choose Connection Type</h2>
              <p className="text-muted-foreground">
                How do you want to connect to Amp?
              </p>
            </div>

            <div className="space-y-3">
              <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="production"
                  checked={connectionType === "production"}
                  onChange={(e) =>
                    setConnectionType(e.target.value as ConnectionType)
                  }
                  className="mr-4"
                />
                <Globe className="w-6 h-6 mr-3 text-muted-foreground/80" />
                <div className="flex-1">
                  <div className="font-medium">Production (Recommended)</div>
                  <div className="text-sm text-muted-foreground">
                    Connect to Amp's hosted service at ampcode.com
                  </div>
                  <div className="text-xs text-muted-foreground opacity-80 mt-1">
                  ✓ No setup required • ✓ Always up-to-date • ✓ Best
                  performance
                  </div>
                </div>
              </label>

              <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="local-server"
                  checked={connectionType === "local-server"}
                  onChange={(e) =>
                    setConnectionType(e.target.value as ConnectionType)
                  }
                  className="mr-4"
                />
                <Server className="w-6 h-6 mr-3 text-muted-foreground/80" />
                <div className="flex-1">
                  <div className="font-medium">Local Server</div>
                  <div className="text-sm text-muted-foreground">
                    Connect to a self-hosted Amp server instance
                  </div>
                  <div className="text-xs text-muted-foreground opacity-70 mt-1">
                  ⚠ Requires running local server • Advanced users only
                  </div>
                </div>
              </label>

              <label className="flex items-center p-4 border-2 rounded-lg cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="local-cli"
                  checked={connectionType === "local-cli"}
                  onChange={(e) =>
                    setConnectionType(e.target.value as ConnectionType)
                  }
                  className="mr-4"
                />
                <Terminal className="w-6 h-6 mr-3 text-muted-foreground/80" />
                <div className="flex-1">
                  <div className="font-medium">Local CLI</div>
                  <div className="text-sm text-muted-foreground">
                    Use a local Amp CLI installation
                  </div>
                  <div className="text-xs text-muted-foreground opacity-70 mt-1">
                  ⚠ Requires Amp CLI installation
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep("welcome")}
                className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep("setup")}
                disabled={!canProceed()}
                className="flex items-center space-x-2 px-6 py-2 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Setup Step */}
        {currentStep === "setup" && (
          <div className="p-8 space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-xl font-bold">Configure Connection</h2>
              <p className="text-muted-foreground">
                {connectionType === "production" &&
                  "You're almost ready! Just add your authentication token."}
                {connectionType === "local-server" &&
                  "Configure your local server connection."}
                {connectionType === "local-cli" &&
                  "Let's find your Amp CLI installation."}
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Profile Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="My Amp Profile"
                />
              </div>

              {connectionType === "production" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Authentication Token
                    <a
                      href="https://ampcode.com/settings/tokens"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-primary hover:underline inline-flex items-center text-xs"
                    >
                      Get your token <ExternalLink className="w-3 h-3 ml-1" />
                    </a>
                  </label>
                  <input
                    type="password"
                    value={formData.token}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        token: e.target.value,
                      }))
                    }
                    className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="amp_..."
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Don't have a token? Visit ampcode.com to create your free
                    account.
                  </p>
                </div>
              )}

              {connectionType === "local-server" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Server URL
                    </label>
                    <input
                      type="text"
                      value={formData.api_url}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          api_url: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="https://localhost:7002"
                    />
                  </div>

                  <div>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.tls_enabled}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            tls_enabled: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm">Enable TLS verification</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">
                      Authentication Token (Optional)
                    </label>
                    <input
                      type="password"
                      value={formData.token}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          token: e.target.value,
                        }))
                      }
                      className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      placeholder="Leave empty if no authentication required"
                    />
                  </div>
                </>
              )}

              {connectionType === "local-cli" && (
                <div>
                  <label className="block text-sm font-medium mb-1">
                    CLI Path
                  </label>
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={formData.cli_path}
                        onChange={(e) =>
                          setFormData((prev) => ({
                            ...prev,
                            cli_path: e.target.value,
                          }))
                        }
                        className="flex-1 px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="/usr/local/bin/amp"
                      />
                      <button
                        type="button"
                        onClick={handleDetectCliPaths}
                        disabled={isDetecting}
                        className="px-3 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                        title="Search for Amp CLI"
                      >
                        <Search
                          className={`w-4 h-4 ${
                            isDetecting ? "animate-spin" : ""
                          }`}
                        />
                      </button>
                    </div>

                    {detectedPaths.length === 0 &&
                    hasCheckedCli &&
                    !isDetecting && (
                    <div className="p-3 bg-muted/50 border border-border rounded-md">
                    <div className="flex items-start space-x-2">
                    <AlertCircle className="w-4 h-4 text-muted-foreground opacity-80 mt-0.5" />
                    <div className="flex-1">
                    <p className="text-sm text-foreground font-medium">
                    Amp CLI not found
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                    Install the Amp CLI first or choose a different
                    connection type.
                    </p>
                    <a
                    href="https://ampcode.com/docs/install"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline inline-flex items-center mt-2 transition-colors"
                    >
                    <Download className="w-3 h-3 mr-1" />
                    Installation Guide
                    </a>
                    </div>
                    </div>
                    </div>
                    )}

                    {detectedPaths.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Detected paths:
                        </p>
                        {detectedPaths.map((path) => (
                          <button
                            key={path}
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                cli_path: path,
                              }))
                            }
                            className={`block w-full text-left p-2 text-xs rounded transition-colors ${
                            formData.cli_path === path
                            ? "bg-accent border border-border ring-1 ring-ring/20"
                            : "bg-muted hover:bg-accent"
                            }`}
                          >
                            <CheckCircle className="w-3 h-3 inline mr-1 text-muted-foreground opacity-80" />
                            {path}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
              </div>

              {error && (
              <div className="p-3 bg-muted/50 border border-border rounded-md">
              <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-muted-foreground opacity-80 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
              <p className="text-sm text-foreground font-medium">
              Profile creation failed
              </p>
              <p className="text-xs text-muted-foreground mt-1">
              {error}
              </p>
              {error.includes("already exists") && (
                <button
                  onClick={handleRegenerateName}
                  className="text-xs text-primary hover:underline mt-2 transition-colors"
                >
                  Generate new name automatically
                </button>
              )}
              </div>
              </div>
              </div>
              )}

             <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep("connection-type")}
                className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleComplete}
                disabled={!canProceed() || isCompleting}
                className="flex items-center space-x-2 px-6 py-2 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50"
              >
                <span>
                  {isCompleting ? "Creating Profile..." : "Create Profile"}
                </span>
                {!isCompleting && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Complete Step */}
        {currentStep === "complete" && (
          <div className="p-8 text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-accent rounded-full flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-foreground opacity-80" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold">You're All Set!</h2>
              <p className="text-muted-foreground">
                Your Amp profile has been created successfully. You can now
                start using AI-powered coding assistance.
              </p>
            </div>

            <div className="p-4 bg-muted/30 rounded-lg text-left space-y-2">
              <h3 className="font-medium">Next steps:</h3>
              <ul className="space-y-1 text-sm text-muted-foreground">
                <li>• Open files to start coding</li>
                <li>• Use the chat interface to ask questions</li>
                <li>• Access the terminal for running commands</li>
                <li>• Create additional profiles if needed</li>
              </ul>
            </div>

            <p className="text-xs text-muted-foreground">
              This modal will close automatically in a few seconds...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
