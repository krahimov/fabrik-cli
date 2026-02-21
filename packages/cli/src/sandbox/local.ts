import { exec as execCb } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join } from "node:path";
import type { SandboxProvider, SandboxHandle, SandboxOpts, ExecOpts, ExecResult } from "./interface.js";

const execAsync = promisify(execCb);

class LocalSandboxHandle implements SandboxHandle {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = rootDir;
  }

  async exec(command: string, opts?: ExecOpts): Promise<ExecResult> {
    const timeout = opts?.timeout ?? 30000;
    const cwd = opts?.cwd ?? this.rootDir;

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { exitCode: 0, stdout, stderr };
    } catch (e: unknown) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return {
        exitCode: err.code ?? 1,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? String(e),
      };
    }
  }

  async readFile(path: string): Promise<string> {
    return readFile(path, "utf-8");
  }

  async writeFile(path: string, content: string | Buffer): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content, "utf-8");
  }

  async cloneRepo(url: string, destPath: string): Promise<void> {
    await this.exec(`git clone --depth 1 ${url} ${destPath}`);
  }

  async findFiles(rootDir: string, pattern: string): Promise<string[]> {
    const result = await this.exec(
      `find ${rootDir} -maxdepth 5 -type f -name "${pattern}" | head -200`
    );
    return result.stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  }
}

export class LocalSandbox implements SandboxProvider {
  private rootDir: string;

  constructor(rootDir?: string) {
    this.rootDir = rootDir ?? process.cwd();
  }

  async create(_opts?: SandboxOpts): Promise<SandboxHandle> {
    return new LocalSandboxHandle(this.rootDir);
  }

  async destroy(_handle: SandboxHandle): Promise<void> {
    // No cleanup needed for local sandbox
  }
}
