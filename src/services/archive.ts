/**
 * Archive scan results to a persistent log directory.
 *
 * Structure:
 *   {logDir}/
 *     YYYY-MM-DD/
 *       {HHmmss}_{tool}_{user}_{scanId}/
 *         scan-meta.json       ← metadata (user, tool, args, exit code, duration)
 *         stdout.txt           ← full stdout
 *         stderr.txt           ← full stderr (if non-empty)
 *         *.gnmap              ← copied output files from the work dir
 */

import { mkdir, writeFile, readdir, copyFile, stat } from "fs/promises";
import { join } from "path";

import { config } from "../config/index.js";
import { log } from "./logging.js";
import type { ScanKind } from "./scanner.js";

export type ArchiveInput = {
  scanId: string;
  user: string;
  tool: ScanKind;
  args: string[];
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  workDir: string;
};

/**
 * Archive a completed scan's results. Never throws — failures are logged and swallowed
 * so archiving issues don't break scan delivery to the user.
 */
export async function archiveScan(input: ArchiveInput): Promise<string | null> {
  try {
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, ""); // HHmmss
    const folderName = `${timeStr}_${input.tool}_${input.user}_${input.scanId.slice(0, 8)}`;

    const archiveDir = join(config.logDir, dateStr, folderName);
    await mkdir(archiveDir, { recursive: true });

    // Write metadata.
    const meta = {
      scanId: input.scanId,
      user: input.user,
      tool: input.tool,
      args: input.args,
      exitCode: input.exitCode,
      durationMs: input.durationMs,
      archivedAt: now.toISOString()
    };
    await writeFile(join(archiveDir, "scan-meta.json"), JSON.stringify(meta, null, 2), "utf8");

    // Write stdout.
    if (input.stdout.length > 0) {
      await writeFile(join(archiveDir, "stdout.txt"), input.stdout, "utf8");
    }

    // Write stderr.
    if (input.stderr.length > 0) {
      await writeFile(join(archiveDir, "stderr.txt"), input.stderr, "utf8");
    }

    // Copy any output files (.gnmap, .txt, etc.) from the scan work directory.
    try {
      const files = await readdir(input.workDir);
      for (const file of files) {
        const filePath = join(input.workDir, file);
        const fileStat = await stat(filePath);
        if (fileStat.isFile()) {
          await copyFile(filePath, join(archiveDir, file));
        }
      }
    } catch {
      // workDir may not exist or be empty — that's fine.
    }

    log.info("scan archived", { scanId: input.scanId, archiveDir });
    return archiveDir;
  } catch (err) {
    log.warn("failed to archive scan", { scanId: input.scanId, err: String(err) });
    return null;
  }
}
