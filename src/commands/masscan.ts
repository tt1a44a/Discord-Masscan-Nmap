import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import { mkdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import { spawn } from "child_process";

import type { SlashCommand } from "../types/index.js";
import { log } from "../services/logging.js";
import { scanManager } from "../services/scanManager.js";
import { chunkString, safeString, trimToLimit } from "../utils/validation.js";
import { safeDefer, safeFollowUp } from "../utils/discord.js";
import { config } from "../config/index.js";
import { fileExists } from "../utils/fs.js";
import { validateFlags, validateTarget } from "../utils/sanitize.js";

const data = new SlashCommandBuilder()
  .setName("masscan")
  .setDescription("Run a masscan scan")
  .addStringOption((option) =>
    option.setName("target").setDescription("Target (CIDR/IP)").setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("ports").setDescription("Ports (e.g., 80,443 or 1-1024)").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("rate")
      .setDescription("Max packet rate (e.g., 100000)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("options")
      .setDescription("Extra masscan options/flags (space-separated)")
      .setRequired(false)
  )
  .addBooleanOption((option) =>
    option
      .setName("show_flags")
      .setDescription("Show all masscan flags/help instead of running")
      .setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await safeDefer(interaction))) return;
  const target = safeString(interaction.options.getString("target", true), 200);
  const ports = safeString(interaction.options.getString("ports", true), 100);
  const rate = interaction.options.getString("rate", false);
  const extra = interaction.options.getString("options", false);
  const showFlags = interaction.options.getBoolean("show_flags", false) ?? false;

  if (showFlags) {
    const help = await getHelp();
    const chunks = chunkString(help, 1800);
    const header = `masscan --help (truncated to ${chunks.length} part${chunks.length > 1 ? "s" : ""})`;
    const content = [header, ...chunks.map((c) => `\`\`\`\n${c}\n\`\`\``)].join("\n");
    await interaction.editReply({ content });
    return;
  }

  // Validate target against allowlist.
  const targetCheck = validateTarget(target);
  if (!targetCheck.ok) {
    await interaction.editReply(targetCheck.reason);
    return;
  }

  log.info("masscan requested", { user: interaction.user.id, target, ports, rate, extra });

  const args = ["-p", ports];
  if (rate) {
    args.push("--rate", safeString(rate, 50));
  }
  if (extra) {
    args.push(...safeString(extra, 400).split(/\s+/));
  }
  args.push(target);

  // Validate assembled flags against blocklist.
  const flagCheck = validateFlags(args, "masscan");
  if (!flagCheck.ok) {
    await interaction.editReply(flagCheck.reason);
    return;
  }

  const outDir = join(config.workDir, randomUUID());
  await mkdir(outDir, { recursive: true });
  const outFile = join(outDir, "masscan-results.gnmap");
  args.push("-oG", outFile);

  let buffer = "";
  let lastSend = Date.now();
  const sendUpdate = async (label: string, data: string) => {
    if (data.includes("GitHub - robertdavidgraham") || data.includes("bit.ly/14GZzcT")) return;
    const now = Date.now();
    buffer += `\n[${label}] ${data}`;
    if (buffer.length > 1200 || now - lastSend > 2000) {
      await safeFollowUp(interaction, trimToLimit(buffer));
      buffer = "";
      lastSend = now;
    }
  };

  const startResult = scanManager.start(interaction.user.id, {
    kind: "masscan",
    args,
    onData: ({ stream, data }) => {
      void sendUpdate(stream, data);
    }
  });

  if (!startResult.ok) {
    await interaction.editReply(startResult.reason);
    return;
  }

  const result = await startResult.managed.result;

  let fileSnippet = "(no file)";
  let fileSize = 0;
  const fileExistsFlag = await fileExists(outFile);
  if (fileExistsFlag) {
    try {
      fileSize = (await stat(outFile)).size;
      fileSnippet = (await readFile(outFile, "utf8")).slice(0, 800) || "(empty file)";
    } catch (err) {
      log.warn("failed to read masscan output file", { err: String(err) });
    }
  } else {
    log.warn("masscan output file missing", { outFile });
  }

  const stdoutSnippet = result.stdout.slice(0, 1500) || "(empty)";
  const stderrSnippet = result.stderr.slice(0, 800) || "(empty)";

  const rawContent = [
    `masscan exit ${result.exitCode ?? -1}`,
    fileExistsFlag
      ? `file: ${fileSize} bytes (full attached)\nhead:\n\`\`\`\n${fileSnippet}\n\`\`\``
      : "file: not written",
    `stdout:\n\`\`\`\n${stdoutSnippet}\n\`\`\``,
    `stderr:\n\`\`\`\n${stderrSnippet}\n\`\`\``
  ].join("\n");

  const content = trimToLimit(rawContent, 1800);

  const files = fileExistsFlag ? [outFile] : [];

  // send final summary as a new follow-up so it appears at the bottom
  await safeFollowUp(interaction, content, files);
}

function getHelp(): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn(config.masscanBin, ["--help"]);
    let buf = "";
    const timeout = setTimeout(() => {
      proc.kill();
      resolve(buf || "masscan --help timed out");
    }, 10_000);
    proc.stdout.on("data", (c) => (buf += c.toString("utf8")));
    proc.stderr.on("data", (c) => (buf += c.toString("utf8")));
    proc.on("close", () => { clearTimeout(timeout); resolve(buf); });
    proc.on("error", () => { clearTimeout(timeout); resolve("failed to retrieve masscan help"); });
  });
}

export const masscanCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
