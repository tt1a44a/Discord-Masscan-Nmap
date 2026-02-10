import { spawn } from "child_process";
import { randomUUID } from "crypto";
import { mkdir } from "fs/promises";
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

export function startManagedScan(request: ScanRequest): ManagedScan {
  const id = randomUUID();
  const workDir = join(config.workDir, id);

  // Hoist the process reference so kill() can reach it.
  let proc: ReturnType<typeof spawn> | null = null;
  let killTimer: ReturnType<typeof setTimeout> | null = null;

  const result = (async (): Promise<ScanResult> => {
    await mkdir(workDir, { recursive: true });
    const bin = request.kind === "masscan" ? config.masscanBin : config.nmapBin;
    const startedAt = Date.now();
    log.info("starting scan", { id, kind: request.kind, args: request.args });

    proc = spawn(bin, request.args, { cwd: workDir });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      request.onData?.({ stream: "stdout", data: text });
    });
    proc.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      request.onData?.({ stream: "stderr", data: text });
    });

    const exitCode: number | null = await new Promise((resolve) => {
      proc!.on("close", resolve);
      proc!.on("error", (err) => {
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

    // Clean up the SIGKILL fallback timer when the process finishes normally.
    if (killTimer) { clearTimeout(killTimer); killTimer = null; }
    return { id, exitCode, stdout, stderr };
  })();

  const kill = () => {
    try {
      if (proc && !proc.killed) {
        log.info("killing scan process", { id, pid: proc.pid });
        proc.kill("SIGTERM");
        // If SIGTERM doesn't work within 5s, force-kill.
        killTimer = setTimeout(() => {
          if (proc && !proc.killed) {
            log.warn("SIGTERM ineffective, sending SIGKILL", { id, pid: proc.pid });
            proc.kill("SIGKILL");
          }
          killTimer = null;
        }, 5000);
      }
    } catch (err) {
      log.warn("kill failed", { id, err: String(err) });
    }
    // Suppress unhandled rejection from the result promise.
    result.catch(() => undefined);
  };

  return { id, kill, result };
}
