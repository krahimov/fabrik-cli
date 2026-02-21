export interface SandboxOpts {
  language?: string;
  envVars?: Record<string, string>;
}

export interface ExecOpts {
  cwd?: string;
  timeout?: number;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface SandboxHandle {
  exec(command: string, opts?: ExecOpts): Promise<ExecResult>;
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string | Buffer): Promise<void>;
  cloneRepo(url: string, destPath: string): Promise<void>;
  findFiles(rootDir: string, pattern: string): Promise<string[]>;
}

export interface SandboxProvider {
  create(opts?: SandboxOpts): Promise<SandboxHandle>;
  destroy(handle: SandboxHandle): Promise<void>;
}
