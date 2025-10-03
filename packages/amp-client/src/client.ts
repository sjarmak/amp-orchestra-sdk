import { spawn, ChildProcess } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { EventEmitter } from "events";
import { getAmpCliPath, getAmpExtraArgs, getAmpEnvironment, sanitizeEnvironment, AmpRuntimeConfig } from "./config.js";

export interface AmpAdapterConfig {
  ampPath?: string;
  ampArgs?: string[];
  enableJSONLogs?: boolean;
  env?: Record<string, string>;
  extraArgs?: string[];
  runtimeConfig?: AmpRuntimeConfig;
  ampSettings?: { mode?: string };
  // SDLC Agent configuration
  agentId?: string;
  autoRoute?: boolean;
  alloyMode?: boolean;
  multiProvider?: boolean;
}

export interface AmpIterationResult {
  success: boolean;
  output: string;
  telemetry: any;
  awaitingInput: boolean;
  threadId?: string;
}

export interface StreamingEvent {
  type:
    | "tool_start"
    | "tool_finish"
    | "token_usage"
    | "model_info"
    | "model_change"
    | "assistant_message"
    | "session_result"
    | "output"
    | "error";
  timestamp: string;
  data: any;
}

export interface InteractiveHandle {
  send(message: string): void;
  stop(): Promise<void>;
  on(
    event: "streaming-event" | "state" | "error",
    listener: (...args: any[]) => void
  ): this;
  off(event: string, listener: (...args: any[]) => void): this;
}

export type InteractiveState = "connecting" | "ready" | "closed" | "error";

export class AmpClient extends EventEmitter {
  private config: AmpAdapterConfig;
  public lastUsedArgs?: string[];
  private jsonBuffer: string = "";
  private lastModel: string | undefined;
  private capturedThreadId: string | undefined;
  private child?: ChildProcess;
  private state: InteractiveState = "closed";
  private toolCallsMap = new Map<string, { name: string; timestamp: string }>();

  constructor(config: AmpAdapterConfig = {}) {
    super();
    this.config = {
      ampPath:
        getAmpCliPath(config.runtimeConfig || {}) ||
        config.ampPath ||
        process.env.AMP_BIN ||
        "amp",
      ampArgs: config.ampArgs || [],
      enableJSONLogs: config.enableJSONLogs !== false, // Default to true for streaming
      env: config.env,
      extraArgs: [
        ...(config.extraArgs || []),
        ...getAmpExtraArgs(config.runtimeConfig || {}),
        ...this.buildAgentArgs(config),
      ],
      runtimeConfig: config.runtimeConfig,
      ampSettings: config.ampSettings,
    };
  }

  /**
   * Build agent-specific CLI arguments from configuration
   */
  private buildAgentArgs(config: AmpAdapterConfig): string[] {
    const args: string[] = [];

    if (config.agentId) {
      args.push('--agent', config.agentId);
    }

    if (config.autoRoute) {
      args.push('--auto-route');
    }

    if (config.alloyMode) {
      args.push('--alloy');
    }

    if (config.multiProvider) {
      args.push('--multi-provider');
    }

    return args;
  }

  async runIteration(
    prompt: string,
    workingDir: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    const args = ["-x"];
    
    // Add model override (case-insensitive)
    const modelLower = modelOverride?.toLowerCase();
    if (modelLower === "gpt-5") {
      args.push("--try-gpt5");
    } else if (modelLower === "glm-4.5") {
      args.push("--try-glm");
    }

    return this.executeAmpCommand(args, prompt, workingDir, modelOverride);
  }

  async continueThread(
    threadId: string,
    prompt: string,
    workingDir: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    const args = ["threads", "continue", threadId, "--execute", prompt];

    // Add model override (case-insensitive)
    const modelLower = modelOverride?.toLowerCase();
    if (modelLower === "gpt-5") {
      args.push("--try-gpt5");
    } else if (modelLower === "glm-4.5") {
      args.push("--try-glm");
    }

    // Enable streaming JSON for real-time telemetry if configured
    if (this.config.enableJSONLogs) {
      args.push("--stream-json");
    }

    return this.executeAmpCommandNoStdin(args, workingDir, modelOverride);
  }

  async validateThreadExists(threadId: string): Promise<boolean> {
    return new Promise(async (resolve) => {
      const child = spawn(this.config.ampPath!, ["threads", "list"], {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode: number) => {
        if (exitCode === 0 && !stderr.includes("Not logged in")) {
          resolve(stdout.includes(threadId));
        } else {
          resolve(false);
        }
      });

      child.on("error", () => {
        resolve(false);
      });
    });
  }

  private async executeAmpCommandNoStdin(
    args: string[],
    workingDir: string,
    modelOverride?: string
  ): Promise<AmpIterationResult> {
    return this.executeAmpCommand(args, "", workingDir, modelOverride, false);
  }

  private async executeAmpCommand(
    args: string[],
    finalPrompt: string,
    workingDir: string,
    modelOverride?: string,
    useStdin: boolean = true
  ): Promise<AmpIterationResult> {
    return new Promise(async (resolve) => {
      let debugLogFile: string | null = null;

      // Try to enable debug logging
      try {
        const tempLogFile = join(
          tmpdir(),
          `amp_debug_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.log`
        );
        const { writeFileSync, unlinkSync } = await import("fs");
        const testFile = tempLogFile + ".test";
        writeFileSync(testFile, "test", { mode: 0o600 });
        unlinkSync(testFile);

        debugLogFile = tempLogFile;
        args.push("--log-level", "debug", "--log-file", debugLogFile);
      } catch {
        debugLogFile = null;
      }

      if (this.config.enableJSONLogs) {
        args.push("--stream-json");
      }

      const combinedEnv = {
        ...process.env,
        ...getAmpEnvironment(this.config.runtimeConfig || {}, this.config.ampSettings),
        ...(this.config.env || {}),
      };

      const cleanEnv = sanitizeEnvironment(combinedEnv, this.config.ampSettings);

      const child = spawn(this.config.ampPath!, [...args, ...this.config.extraArgs!], {
        cwd: workingDir,
        env: cleanEnv,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let output = "";
      let errorOutput = "";
      const telemetryEvents: any[] = [];

      child.stdout?.on("data", (data) => {
        const text = data.toString();
        output += text;

        // Parse streaming JSON events if enabled
        if (this.config.enableJSONLogs) {
          this.jsonBuffer += text;
          this.processStreamingEvents();
        }
      });

      child.stderr?.on("data", (data) => {
        errorOutput += data.toString();
      });

      child.on("close", (exitCode) => {
        const success = exitCode === 0;
        const fullOutput = output + (errorOutput ? `\nSTDERR:\n${errorOutput}` : "");
        
        resolve({
          success,
          output: fullOutput,
          telemetry: {
            tokens: { prompt: 0, completion: 0, total: 0 },
            model: this.lastModel || "amp",
            duration: 0,
          },
          awaitingInput: false,
          threadId: this.capturedThreadId,
        });
      });

      child.on("error", (error) => {
        resolve({
          success: false,
          output: `Amp command failed: ${error.message}`,
          telemetry: {
            tokens: { prompt: 0, completion: 0, total: 0 },
            model: "amp",
            duration: 0,
          },
          awaitingInput: false,
        });
      });

      // Send prompt via stdin if needed
      if (useStdin && finalPrompt) {
        child.stdin?.write(finalPrompt);
        child.stdin?.end();
      }
    });
  }

  private processStreamingEvents() {
    const completeObjects = this.extractCompleteJSONObjects();
    for (const jsonString of completeObjects) {
      try {
        const parsed = JSON.parse(jsonString);
        const event = this.createStreamingEvent(parsed);
        if (event) {
          this.emit("streaming-event", event);
        }
      } catch (error) {
        console.error("Failed to parse streaming JSON:", error);
      }
    }
  }

  private createStreamingEvent(parsed: any): StreamingEvent | null {
    const ts = parsed.timestamp || new Date().toISOString();

    switch (parsed.type) {
      case "assistant":
        if (parsed.message?.usage) {
          this.emit("streaming-event", {
            type: "token_usage",
            timestamp: ts,
            data: {
              tokens: {
                prompt: parsed.message.usage.input_tokens || 0,
                completion: parsed.message.usage.output_tokens || 0,
                total: (parsed.message.usage.input_tokens || 0) + (parsed.message.usage.output_tokens || 0),
              },
              model: parsed.message.model || "amp",
            },
          });
        }
        return {
          type: "assistant_message",
          timestamp: ts,
          data: {
            content: parsed.message?.content,
            usage: parsed.message?.usage,
          },
        };

      case "user":
        return {
          type: "output",
          timestamp: ts,
          data: {
            content: parsed.message?.content,
          },
        };

      case "result":
        return {
          type: "session_result",
          timestamp: ts,
          data: {
            success: !parsed.is_error,
            result: parsed.result,
            duration_ms: parsed.duration_ms,
            usage: parsed.usage,
            agent_mode: (typeof process !== 'undefined' && (process as any).env && (process as any).env.AMP_EXPERIMENTAL_AGENT_MODE) ? (process as any).env.AMP_EXPERIMENTAL_AGENT_MODE : null,
          },
        };

      default:
        return null;
    }
  }

  private extractCompleteJSONObjects(): string[] {
    const completeObjects: string[] = [];
    let position = 0;

    while (position < this.jsonBuffer.length) {
      const jsonStart = this.findNextJSONStart(position);
      if (jsonStart === -1) {
        this.jsonBuffer = this.jsonBuffer.slice(position);
        break;
      }

      const jsonEnd = this.findJSONObjectEnd(jsonStart);
      if (jsonEnd === -1) {
        this.jsonBuffer = this.jsonBuffer.slice(jsonStart);
        break;
      }

      const jsonString = this.jsonBuffer.slice(jsonStart, jsonEnd + 1);
      completeObjects.push(jsonString);
      position = jsonEnd + 1;
    }

    if (completeObjects.length > 0 && position >= this.jsonBuffer.length) {
      this.jsonBuffer = "";
    }

    return completeObjects;
  }

  private findNextJSONStart(fromPosition: number): number {
    for (let i = fromPosition; i < this.jsonBuffer.length; i++) {
      if (this.jsonBuffer[i] === "{") {
        return i;
      }
    }
    return -1;
  }

  private findJSONObjectEnd(startPosition: number): number {
    let braceCount = 0;
    let inString = false;
    let escapeNext = false;

    for (let i = startPosition; i < this.jsonBuffer.length; i++) {
      const char = this.jsonBuffer[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") {
          braceCount++;
        } else if (char === "}") {
          braceCount--;
          if (braceCount === 0) {
            return i;
          }
        }
      }
    }

    return -1;
  }
}
