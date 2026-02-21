import type { SandboxProvider, SandboxHandle, SandboxOpts, ExecOpts, ExecResult } from "./interface.js";

interface DaytonaConfig {
  apiKey: string;
  target?: string;
}

class DaytonaSandboxHandle implements SandboxHandle {
  private sandbox: any;

  constructor(sandbox: any) {
    this.sandbox = sandbox;
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    const result = await this.sandbox.process.exec(command, {
      cwd: opts?.cwd,
      timeout: opts?.timeout ?? 30000,
    });
    return {
      exitCode: result.exitCode ?? 0,
      stdout: result.result ?? "",
      stderr: "",
    };
  }

  async readFile(path: string): Promise<string> {
    const content = await this.sandbox.fs.downloadFile(path);
    return content.toString();
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    const buf = typeof content === "string" ? Buffer.from(content) : content;
    await this.sandbox.fs.uploadFile(buf, path);
  }

  async cloneRepo(url: string, destPath: string): Promise<void> {
    await this.sandbox.git.clone(url, destPath);
  }

  async findFiles(rootDir: string, pattern: string): Promise<string[]> {
    const result = await this.exec(
      `find ${rootDir} -maxdepth 5 -type f -name "${pattern}" | head -200`
    );
    return result.stdout
      .split("\n")
      .map((l: string) => l.trim())
      .filter(Boolean);
  }
}

export class DaytonaSandbox implements SandboxProvider {
  private daytona: any;

  constructor(config: DaytonaConfig) {
    // Dynamically import @daytonaio/sdk so it remains an optional dependency
    this.init(config);
  }

  private async init(config: DaytonaConfig): Promise<void> {
    try {
      const { Daytona } = await import("@daytonaio/sdk");
      this.daytona = new Daytona({ apiKey: config.apiKey, target: config.target });
    } catch {
      throw new Error(
        "Daytona SDK not installed. Install it with: pnpm add @daytonaio/sdk\n" +
          "Or use --dir for local discovery (no sandbox needed)."
      );
    }
  }

  async create(opts?: SandboxOpts): Promise<SandboxHandle> {
    if (!this.daytona) {
      throw new Error("Daytona SDK not initialized");
    }
    const sandbox = await this.daytona.create({
      language: opts?.language ?? "typescript",
      envVars: opts?.envVars,
    });
    return new DaytonaSandboxHandle(sandbox);
  }

  async destroy(handle: SandboxHandle): Promise<void> {
    // The handle wraps the Daytona sandbox — we'd need the raw ref to delete.
    // For now, Daytona auto-cleans idle sandboxes.
    void handle;
  }
}
