import { useEffect, useState } from 'react';
import { useAmpService } from '../../hooks/useAmpService';

// Default paths for development mode - hardcoded for frontend
const DEFAULT_CLI_PATH = '~/amp/cli/dist/main.js';
const DEFAULT_SERVER_URL = 'https://localhost:7002';

export function EnvironmentSwitcher({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { setEnvironment, connectionMode } = useAmpService();
  const [mode, setMode] = useState<'production' | 'local-cli'>('production');
  const [cliPath, setCliPath] = useState(DEFAULT_CLI_PATH);
  const [serverUrl, setServerUrl] = useState(DEFAULT_SERVER_URL);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    // Initialize from current connection mode
    setMode(connectionMode === 'local-cli' ? 'local-cli' : 'production');
  }, [isOpen, connectionMode]);

  if (!isOpen) return null;

  const switchEnvironment = async (newMode: 'production' | 'local-cli') => {
    try {
      setIsSaving(true);
      setError(null);
      if (newMode === 'production') {
        await setEnvironment('production');
      } else {
        await setEnvironment('local-cli', { cli_path: cliPath, server_url: serverUrl });
      }
      setMode(newMode);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const resetDefaults = async () => {
    setCliPath(DEFAULT_CLI_PATH);
    setServerUrl(DEFAULT_SERVER_URL);
    await switchEnvironment('production');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" role="dialog" aria-modal="true">
      <div className="w-[520px] bg-background border border-border rounded-lg shadow-lg">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold">Preferences</h2>
          <button onClick={onClose} className="text-sm px-2 py-1 hover:bg-accent rounded">Close</button>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <div className="text-xs text-muted-foreground mb-2">Environment</div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="env-mode"
                  value="production"
                  checked={mode === 'production'}
                  onChange={() => switchEnvironment('production')}
                  disabled={isSaving}
                  data-test-id="env-mode-radio-production"
                />
                Production (System amp)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="env-mode"
                  value="local-cli"
                  checked={mode === 'local-cli'}
                  onChange={() => switchEnvironment('local-cli')}
                  disabled={isSaving}
                  data-test-id="env-mode-radio-local-cli"
                />
                Development (Local CLI)
              </label>
            </div>
          </div>

          {mode === 'local-cli' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Using defaults: {DEFAULT_CLI_PATH}</span>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {showAdvanced ? 'Hide' : 'Customize'} paths
                </button>
              </div>
              
              {showAdvanced && (
                <div className="space-y-3 pt-2 border-t">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">CLI Path</label>
                    <input
                      type="text"
                      value={cliPath}
                      onChange={(e) => setCliPath(e.target.value)}
                      placeholder="/Users/you/amp/cli/dist/main.js"
                      className="px-2 py-1 bg-input border border-border rounded text-sm"
                      data-test-id="env-cli-path"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs text-muted-foreground">Server URL</label>
                    <input
                      type="text"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      placeholder="https://localhost:7002"
                      className="px-2 py-1 bg-input border border-border rounded text-sm"
                      data-test-id="env-server-url"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => switchEnvironment('local-cli')}
                    disabled={isSaving}
                    className="px-3 py-1 bg-primary text-primary-foreground rounded text-sm hover:bg-primary/90 disabled:opacity-50"
                  >
                    {isSaving ? 'Applying...' : 'Apply Custom Paths'}
                  </button>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="text-xs text-destructive" data-test-id="env-error">{error}</div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <div className={`w-2 h-2 rounded-full ${isSaving ? 'bg-yellow-500' : (mode === 'production' ? 'bg-blue-500' : 'bg-green-500')}`}></div>
              {isSaving ? 'Switching...' : `Connected to ${mode === 'production' ? 'Production' : 'Development'}`}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={resetDefaults}
                disabled={isSaving}
                className="px-2 py-1 border border-border rounded text-xs hover:bg-accent"
                data-test-id="env-reset-defaults"
              >
                Reset to Defaults
              </button>
              <button
                onClick={onClose}
                className="px-3 py-1 bg-foreground text-background rounded text-xs hover:bg-foreground/90"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
