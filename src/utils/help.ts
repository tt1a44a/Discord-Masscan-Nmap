/**
 * Shared helper for spawning scanner --help / -h and formatting the output.
 * Used by masscan_help, nmap_help, and the inline getHelp() in masscan/nmap commands.
 */

import { spawn } from "child_process";

export type HelpResult = { code: number | null; out: string };

/** Spawn a binary with args and capture combined stdout+stderr (with 10 s timeout). */
export function runHelp(bin: string, args: string[]): Promise<HelpResult> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args);
    let buf = "";
    const timeout = setTimeout(() => {
      proc.kill();
      resolve({ code: -1, out: buf || "help command timed out" });
    }, 10_000);
    proc.stdout.on("data", (c: Buffer) => (buf += c.toString("utf8")));
    proc.stderr.on("data", (c: Buffer) => (buf += c.toString("utf8")));
    proc.on("close", (code) => { clearTimeout(timeout); resolve({ code, out: buf }); });
    proc.on("error", () => { clearTimeout(timeout); resolve({ code: -1, out: "failed to spawn help" }); });
  });
}

/** Format a HelpResult into a Discord-safe code block. */
export function formatHelpOutput(title: string, result: HelpResult): string {
  const snippet = result.out.slice(0, 1900) || "(empty)";
  return `${title} (exit ${result.code ?? -1})\n\`\`\`\n${snippet}\n\`\`\``;
}
