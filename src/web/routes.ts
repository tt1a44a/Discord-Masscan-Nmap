import express from "express";
import multer from "multer";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import { log } from "../services/logging.js";
import { scanManager } from "../services/scanManager.js";
import { safeString, splitFlags } from "../utils/validation.js";
import { config } from "../config/index.js";
import { fileExists } from "../utils/fs.js";
import { validateFlags, validateTarget } from "../utils/sanitize.js";

const upload = multer({
  dest: "/tmp/uploads",
  limits: { fileSize: 5 * 1024 * 1024 } // 5 MB max
});
export const apiRouter = express.Router();

// POST /api/masscan
apiRouter.post("/masscan", async (req, res) => {
  try {
    const { target, ports, rate, options } = req.body;

    if (!target || !ports) {
      res.status(400).json({ error: "target and ports are required" });
      return;
    }

    const safeTarget = safeString(target, 200);
    const targetCheck = validateTarget(safeTarget);
    if (!targetCheck.ok) {
      res.status(400).json({ error: targetCheck.reason });
      return;
    }

    const args = ["-p", safeString(ports, 200)];
    if (rate) args.push("--rate", safeString(rate, 50));
    if (options) args.push(...safeString(options, 400).split(/\s+/));
    args.push(safeTarget);

    const flagCheck = validateFlags(args, "masscan");
    if (!flagCheck.ok) {
      res.status(400).json({ error: flagCheck.reason });
      return;
    }

    const outDir = join(config.workDir, randomUUID());
    await mkdir(outDir, { recursive: true });
    const outFile = join(outDir, "masscan-results.gnmap");
    args.push("-oG", outFile);

    log.info("web masscan requested", { user: "webui", target, ports, rate, options });

    const startResult = scanManager.start("webui", {
      kind: "masscan",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    if (!startResult.ok) {
      res.status(429).json({ error: startResult.reason });
      return;
    }

    const result = await startResult.managed.result;

    const fileExistsFlag = await fileExists(outFile);
    let fileContent = "";
    if (fileExistsFlag) {
      fileContent = await readFile(outFile, "utf8");
    }

    res.json({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      file: fileExistsFlag ? fileContent : null,
      downloadPath: fileExistsFlag ? `/api/download/${startResult.managed.id}` : null
    });
  } catch (err) {
    log.error("web masscan failed", { err: String(err) });
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/nmap
apiRouter.post("/nmap", async (req, res) => {
  try {
    const { target, ports, flags, options } = req.body;

    if (!target) {
      res.status(400).json({ error: "target is required" });
      return;
    }

    const safeTarget = safeString(target, 200);
    const targetCheck = validateTarget(safeTarget);
    if (!targetCheck.ok) {
      res.status(400).json({ error: targetCheck.reason });
      return;
    }

    const args: string[] = [];
    if (flags) args.push(...splitFlags(flags));
    if (ports) args.push("-p", safeString(ports, 200));
    if (options) args.push(...splitFlags(options));
    args.push(safeTarget);

    const flagCheck = validateFlags(args, "nmap");
    if (!flagCheck.ok) {
      res.status(400).json({ error: flagCheck.reason });
      return;
    }

    const outDir = join(config.workDir, randomUUID());
    await mkdir(outDir, { recursive: true });
    const outFile = join(outDir, "nmap-results.gnmap");
    args.push("-oG", outFile);

    log.info("web nmap requested", { user: "webui", target, ports, flags, options });

    const startResult = scanManager.start("webui", {
      kind: "nmap",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    if (!startResult.ok) {
      res.status(429).json({ error: startResult.reason });
      return;
    }

    const result = await startResult.managed.result;

    const fileExistsFlag = await fileExists(outFile);
    let fileContent = "";
    if (fileExistsFlag) {
      fileContent = await readFile(outFile, "utf8");
    }

    res.json({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      file: fileExistsFlag ? fileContent : null,
      downloadPath: fileExistsFlag ? `/api/download/${startResult.managed.id}` : null
    });
  } catch (err) {
    log.error("web nmap failed", { err: String(err) });
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/nmap-from-gnmap
apiRouter.post("/nmap-from-gnmap", upload.single("gnmap"), async (req, res) => {
  try {
    const { flags, ports } = req.body;
    const file = req.file;

    if (!file) {
      res.status(400).json({ error: "gnmap file is required" });
      return;
    }

    const workDir = join(config.workDir, randomUUID());
    await mkdir(workDir, { recursive: true });

    // Extract hosts from gnmap
    const gnmapText = await readFile(file.path, "utf8");
    const hosts = Array.from(gnmapText.matchAll(/Host:\s+(\d+\.\d+\.\d+\.\d+)/g)).map(
      (m) => m[1]
    );
    const uniqueHosts = Array.from(new Set(hosts));

    if (uniqueHosts.length === 0) {
      res.status(400).json({ error: "No hosts found in gnmap file" });
      return;
    }

    // Validate each extracted host against the target allowlist.
    for (const host of uniqueHosts) {
      const hostCheck = validateTarget(host);
      if (!hostCheck.ok) {
        res.status(400).json({ error: `Host from gnmap blocked: ${hostCheck.reason}` });
        return;
      }
    }

    const hostsFile = join(workDir, "hosts.txt");
    await writeFile(hostsFile, uniqueHosts.join("\n"), "utf8");

    // Validate user-provided flags BEFORE adding internal flags (-iL, -oG)
    // so the blocklist doesn't reject our own bot-generated arguments.
    const userArgs: string[] = [...splitFlags(flags ?? "-sV")];
    if (ports) userArgs.push("-p", safeString(ports, 200));

    const flagCheck = validateFlags(userArgs, "nmap");
    if (!flagCheck.ok) {
      res.status(400).json({ error: flagCheck.reason });
      return;
    }

    // Build full args with internal flags appended after validation.
    const outFile = join(workDir, "nmap-reshosts.gnmap");
    const args: string[] = [...userArgs, "-iL", hostsFile, "-oG", outFile];

    log.info("web nmap_from_gnmap requested", {
      user: "webui",
      hosts: uniqueHosts.length,
      flags,
      ports
    });

    const startResult = scanManager.start("webui", {
      kind: "nmap",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    if (!startResult.ok) {
      res.status(429).json({ error: startResult.reason });
      return;
    }

    const result = await startResult.managed.result;

    const fileExistsFlag = await fileExists(outFile);
    let fileContent = "";
    if (fileExistsFlag) {
      fileContent = await readFile(outFile, "utf8");
    }

    res.json({
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      file: fileExistsFlag ? fileContent : null,
      hosts: uniqueHosts.length,
      downloadPath: fileExistsFlag ? `/api/download/${startResult.managed.id}` : null
    });
  } catch (err) {
    log.error("web nmap_from_gnmap failed", { err: String(err) });
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/cancel
apiRouter.post("/cancel", (req, res) => {
  const result = scanManager.cancelByUser("webui");
  if (result.cancelled) {
    log.info("web scan cancelled", { id: result.id });
    res.json({ cancelled: true, id: result.id });
  } else {
    res.json({ cancelled: false });
  }
});
