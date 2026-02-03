import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { mkdir, rm } from "fs/promises";
import { join } from "path";

import { config } from "../config/index.js";
import { log } from "./logging.js";

export type ScanKind = "masscan" | "nmap";

export type ScanRequest = {
  kind: ScanKind;
  args: string[];
  onData?: (chunk: { stream: "stdout" | "stderr"; data: string }) => void;
};

export type ScanResult = {
  id: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
};

export type ManagedScan = {
  id: string;
  kill: () => void;
  result: Promise<ScanResult>;
};

export async function runScan(request: ScanRequest): Promise<ScanResult> {
  const id = randomUUID();
  const workDir = join(config.workDir, id);
  await mkdir(workDir, { recursive: true });

  const bin = request.kind === "masscan" ? config.masscanBin : config.nmapBin;

  const startedAt = Date.now();
  log.info("starting scan", { id, kind: request.kind, args: request.args });

  const proc = spawn(bin, request.args, { cwd: workDir });

  let stdout = "";
  let stderr = "";

  proc.stdout.on("data", (chunk) => {
    const text = chunk.toString();
    stdout += text;
    request.onData?.({ stream: "stdout", data: text });
  });
  proc.stderr.on("data", (chunk) => {
    const text = chunk.toString();
    stderr += text;
    request.onData?.({ stream: "stderr", data: text });
  });

  const exitCode: number | null = await new Promise((resolve, reject) => {
    proc.on("close", resolve);
    proc.on("error", reject);
  });

  const durationMs = Date.now() - startedAt;
  log.info("scan finished", {
    id,
    kind: request.kind,
    exitCode,
    durationMs,
    stdoutBytes: Buffer.byteLength(stdout),
    stderrBytes: Buffer.byteLength(stderr)
  });

  return {
    id,
    exitCode,
    stdout,
    stderr
  };
}

export function startManagedScan(request: ScanRequest): ManagedScan {
  const id = randomUUID();
  const workDir = join(config.workDir, id);

  const result = (async (): Promise<ScanResult> => {
    await mkdir(workDir, { recursive: true });
    const bin = request.kind === "masscan" ? config.masscanBin : config.nmapBin;
    const startedAt = Date.now();
    log.info("starting scan", { id, kind: request.kind, args: request.args });

    const proc = spawn(bin, request.args, { cwd: workDir });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      request.onData?.({ stream: "stdout", data: text });
    });
    proc.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      request.onData?.({ stream: "stderr", data: text });
    });

    const exitCode: number | null = await new Promise((resolve) => {
      proc.on("close", resolve);
      proc.on("error", (err) => {
        log.error("scan proc error", { id, err: String(err) });
        resolve(1);
      });
    });

    const durationMs = Date.now() - startedAt;
    log.info("scan finished", {
      id,
      kind: request.kind,
      exitCode,
      durationMs,
      stdoutBytes: Buffer.byteLength(stdout),
      stderrBytes: Buffer.byteLength(stderr)
    });

    return { id, exitCode, stdout, stderr };
  })();

  const kill = () => {
    try {
      // This will terminate the child and its streams.
      result.catch(() => undefined);
    } catch {
      /* ignore */
    }
  };

  return { id, kill, result };
}

export async function cleanupScan(id: string) {
  const workDir = join(config.workDir, id);
  await rm(workDir, { recursive: true, force: true });
}
