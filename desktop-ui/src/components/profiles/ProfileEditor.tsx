import { useState, useEffect } from "react";
import {
  X,
  User,
  Globe,
  Terminal,
  Server,
  Search,
  CheckCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { AmpProfile } from "../../hooks/useProfileManager";

interface ProfileEditorProps {
  profile?: AmpProfile;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    profile: Omit<AmpProfile, "id" | "is_active" | "created_at" | "updated_at">
  ) => Promise<void>;
  onDetectCliPaths?: () => Promise<string[]>;
}

type ConnectionType = "production" | "local-server" | "local-cli";

export const ProfileEditor = ({
  profile,
  isOpen,
  onClose,
  onSave,
  onDetectCliPaths,
}: ProfileEditorProps) => {
  const [formData, setFormData] = useState({
    name: "",
    connection_type: "production" as ConnectionType,
    api_url: "",
    cli_path: "",
    token: "",
    tls_enabled: true,
  });

  const [detectedPaths, setDetectedPaths] = useState<string[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load profile data when editing
  useEffect(() => {
    if (profile) {
      setFormData({
        name: profile.name,
        connection_type: profile.connection_type,
        api_url: profile.api_url || "",
        cli_path: profile.cli_path || "",
        token: profile.token || "",
        tls_enabled: profile.tls_enabled !== false,
      });
    } else {
      // Reset form for new profile
      setFormData({
        name: "",
        connection_type: "production",
        api_url: "",
        cli_path: "",
        token: "",
        tls_enabled: true,
      });
    }
    setErrors({});
  }, [profile, isOpen]);

  const handleDetectCliPaths = async () => {
    if (!onDetectCliPaths) return;

    setIsDetecting(true);
    try {
      const paths = await onDetectCliPaths();
      setDetectedPaths(paths);
    } catch (error) {
      console.error("Failed to detect CLI paths:", error);
    } finally {
      setIsDetecting(false);
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Profile name is required";
    }

    if (formData.connection_type === "local-server") {
      if (!formData.api_url.trim()) {
        newErrors.api_url = "API URL is required for local server";
      } else if (
        !formData.api_url.startsWith("http://") &&
        !formData.api_url.startsWith("https://")
      ) {
        newErrors.api_url = "API URL must start with http:// or https://";
      }
    }

    if (formData.connection_type === "local-cli" && !formData.cli_path.trim()) {
      newErrors.cli_path = "CLI path is required for local CLI";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      // Transform formData to match backend expectations
      const profileData = {
        name: formData.name,
        connection_type: formData.connection_type,
        api_url: formData.api_url.trim() || undefined,
        cli_path: formData.cli_path.trim() || undefined,
        token: formData.token.trim() || undefined,
        tls_enabled: formData.tls_enabled,
      };
      
      console.log("ProfileEditor: Transformed profile data:", profileData);
      
      await onSave(profileData);
      onClose();
    } catch (error) {
      console.error("ProfileEditor: Save failed:", error);
      setErrors({
        general:
          error instanceof Error ? error.message : "Failed to save profile",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background border border-border rounded-lg shadow-lg w-full max-w-lg mx-4">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="text-lg font-semibold">
            {profile ? "Edit Profile" : "New Profile"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-accent rounded-md transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {errors.general && (
            <div className="p-3 bg-muted/30 border border-muted-foreground/30 rounded-md">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-muted-foreground/60" />
                <span className="text-sm text-muted-foreground/80">
                  {errors.general}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              Profile Name
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                className={`w-full pl-10 pr-3 py-2 border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                  errors.name ? "border-muted-foreground/60" : "border-border"
                }`}
                placeholder="My Amp Profile"
              />
            </div>
            {errors.name && (
            <p className="text-muted-foreground/70 text-xs mt-1">{errors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Connection Type
            </label>
            <div className="grid grid-cols-1 gap-2">
              <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="production"
                  checked={formData.connection_type === "production"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      connection_type: e.target.value as ConnectionType,
                    }))
                  }
                  className="mr-3"
                />
                <Globe className="w-4 h-4 mr-2 text-muted-foreground/80" />
                <div>
                  <div className="font-medium">Production (ampcode.com)</div>
                  <div className="text-xs text-muted-foreground">
                    Connect to Amp's hosted service
                  </div>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="local-server"
                  checked={formData.connection_type === "local-server"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      connection_type: e.target.value as ConnectionType,
                    }))
                  }
                  className="mr-3"
                />
                <Server className="w-4 h-4 mr-2 text-muted-foreground/80" />
                <div>
                  <div className="font-medium">Local Server</div>
                  <div className="text-xs text-muted-foreground">
                    Connect to a local Amp server instance
                  </div>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded-md cursor-pointer hover:bg-accent/50 transition-colors">
                <input
                  type="radio"
                  name="connection_type"
                  value="local-cli"
                  checked={formData.connection_type === "local-cli"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      connection_type: e.target.value as ConnectionType,
                    }))
                  }
                  className="mr-3"
                />
                <Terminal className="w-4 h-4 mr-2 text-muted-foreground/80" />
                <div>
                  <div className="font-medium">Local CLI</div>
                  <div className="text-xs text-muted-foreground">
                    Use a local Amp CLI installation
                  </div>
                </div>
              </label>
            </div>
          </div>

          {formData.connection_type === "local-server" && (
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
                  className={`w-full px-3 py-2 border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                    errors.api_url ? "border-muted-foreground/60" : "border-border"
                  }`}
                  placeholder="https://localhost:7002"
                />
                {errors.api_url && (
                  <p className="text-muted-foreground/70 text-xs mt-1">{errors.api_url}</p>
                )}
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
                <p className="text-xs text-muted-foreground mt-1">
                  Disable for local development with self-signed certificates
                </p>
              </div>
            </>
          )}

          {formData.connection_type === "local-cli" && (
            <div>
              <label className="block text-sm font-medium mb-1">CLI Path</label>
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
                    className={`flex-1 px-3 py-2 border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring ${
                      errors.cli_path ? "border-muted-foreground/60" : "border-border"
                    }`}
                    placeholder="/usr/local/bin/amp"
                  />
                  <button
                    type="button"
                    onClick={handleDetectCliPaths}
                    disabled={isDetecting}
                    className="px-3 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    <Search
                      className={`w-4 h-4 ${isDetecting ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>
                {errors.cli_path && (
                  <p className="text-muted-foreground/70 text-xs mt-1">{errors.cli_path}</p>
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
                          setFormData((prev) => ({ ...prev, cli_path: path }))
                        }
                        className="block w-full text-left p-2 text-xs bg-muted rounded hover:bg-accent transition-colors"
                      >
                        <CheckCircle className="w-3 h-3 inline mr-1 text-foreground opacity-80" />
                        {path}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {(formData.connection_type === "production" ||
            formData.connection_type === "local-server") && (
            <div>
              <label className="block text-sm font-medium mb-1">
                Authentication Token
                {formData.connection_type === "production" && (
                  <a
                    href="https://ampcode.com/settings/tokens"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-1 text-primary hover:underline inline-flex items-center text-xs"
                  >
                    (get token) <ExternalLink className="w-3 h-3 ml-1" />
                  </a>
                )}
              </label>
              <input
                type="password"
                value={formData.token}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, token: e.target.value }))
                }
                className="w-full px-3 py-2 border border-border rounded-md bg-input text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="Enter your authentication token"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end space-x-2 p-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : "Save Profile"}
          </button>
        </div>
      </div>
    </div>
  );
};
