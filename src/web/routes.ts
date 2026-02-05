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

const upload = multer({ dest: "/tmp/uploads" });
export const apiRouter = express.Router();

// POST /api/masscan
apiRouter.post("/masscan", async (req, res) => {
  try {
    const { target, ports, rate, options } = req.body;

    if (!target || !ports) {
      res.status(400).json({ error: "target and ports are required" });
      return;
    }

    const args = ["-p", safeString(ports, 200)];
    if (rate) args.push("--rate", safeString(rate, 50));
    if (options) args.push(...safeString(options, 400).split(/\s+/));
    args.push(safeString(target, 200));

    const outDir = join(config.workDir, randomUUID());
    await mkdir(outDir, { recursive: true });
    const outFile = join(outDir, "masscan-results.gnmap");
    args.push("-oG", outFile);

    log.info("web masscan requested", { user: "webui", target, ports, rate, options });

    const managed = scanManager.start("webui", {
      kind: "masscan",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    const result = await managed.result;

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
      downloadPath: fileExistsFlag ? `/api/download/${managed.id}` : null
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

    const args: string[] = [];
    if (flags) args.push(...splitFlags(flags));
    if (ports) args.push("-p", safeString(ports, 200));
    if (options) args.push(...splitFlags(options));
    args.push(safeString(target, 200));

    const outDir = join(config.workDir, randomUUID());
    await mkdir(outDir, { recursive: true });
    const outFile = join(outDir, "nmap-results.gnmap");
    args.push("-oG", outFile);

    log.info("web nmap requested", { user: "webui", target, ports, flags, options });

    const managed = scanManager.start("webui", {
      kind: "nmap",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    const result = await managed.result;

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
      downloadPath: fileExistsFlag ? `/api/download/${managed.id}` : null
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

    const hostsFile = join(workDir, "hosts.txt");
    await writeFile(hostsFile, uniqueHosts.join("\n"), "utf8");

    const outFile = join(workDir, "nmap-reshosts.gnmap");
    const args: string[] = [...splitFlags(flags ?? "-A -sV"), "-iL", hostsFile, "-oG", outFile];
    if (ports) args.push("-p", safeString(ports, 200));

    log.info("web nmap_from_gnmap requested", {
      user: "webui",
      hosts: uniqueHosts.length,
      flags,
      ports
    });

    const managed = scanManager.start("webui", {
      kind: "nmap",
      args,
      onData: () => {
        /* no streaming to web for now */
      }
    });

    const result = await managed.result;

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
      downloadPath: fileExistsFlag ? `/api/download/${managed.id}` : null
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
