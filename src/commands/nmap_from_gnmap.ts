import {
  AttachmentBuilder,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import type { SlashCommand } from "../types/index.js";
import { log } from "../services/logging.js";
import { scanManager } from "../services/scanManager.js";
import { chunkString, safeString, splitFlags } from "../utils/validation.js";
import { safeDefer, safeFollowUp } from "../utils/discord.js";
import { config } from "../config/index.js";
import { fileExists } from "../utils/fs.js";

const data = new SlashCommandBuilder()
  .setName("nmap_from_gnmap")
  .setDescription("Run nmap against hosts from an uploaded gnmap file")
  .addAttachmentOption((option) =>
    option.setName("gnmap").setDescription("Grepable output file from masscan/nmap").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("flags")
      .setDescription('Nmap flags (default: "-A -sV")')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("ports").setDescription("Ports (e.g., 80,443 or 1-1024)").setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await safeDefer(interaction))) return;

  const attachment = interaction.options.getAttachment("gnmap", true);
  const flags = interaction.options.getString("flags", false) ?? "-A -sV";
  const ports = interaction.options.getString("ports", false);

  try {
    const workDir = join(config.workDir, randomUUID());
    await mkdir(workDir, { recursive: true });
    const gnmapPath = join(workDir, "input.gnmap");

    // Download attachment
    const res = await fetch(attachment.url);
    if (!res.ok) {
      await interaction.editReply("Failed to download attachment.");
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(gnmapPath, buf);

    // Extract hosts
    const gnmapText = await readFile(gnmapPath, "utf8");
    const hosts = Array.from(gnmapText.matchAll(/Host:\s+(\d+\.\d+\.\d+\.\d+)/g)).map((m) => m[1]);
    const uniqueHosts = Array.from(new Set(hosts));
    if (uniqueHosts.length === 0) {
      await interaction.editReply("No hosts found in gnmap file.");
      return;
    }
    const hostsFile = join(workDir, "hosts.txt");
    await writeFile(hostsFile, uniqueHosts.join("\n"), "utf8");

    // Prepare output
    const outFile = join(workDir, "nmap-reshosts.gnmap");

    // Build args
    const args: string[] = [...splitFlags(flags), "-iL", hostsFile, "-oG", outFile];
    if (ports) {
      args.push("-p", safeString(ports, 200));
    }

    log.info("nmap_from_gnmap requested", {
      user: interaction.user.id,
      hosts: uniqueHosts.length,
      flags,
      ports
    });

    let buffer = "";
    let lastSend = Date.now();
    const sendUpdate = async (label: string, data: string) => {
      const now = Date.now();
      buffer += `\n[${label}] ${data}`;
      if (buffer.length > 1200 || now - lastSend > 2000) {
        await safeFollowUp(interaction, trimToDiscord(buffer));
        buffer = "";
        lastSend = now;
      }
    };

    const managed = scanManager.start(interaction.user.id, {
      kind: "nmap",
      args,
      onData: ({ stream, data }) => {
        void sendUpdate(stream, data);
      }
    });

    const result = await managed.result;

    if (buffer.trim().length > 0) {
      await safeFollowUp(interaction, trimToDiscord(buffer));
    }

    const fileExistsFlag = await fileExists(outFile);
    let fileSnippet = "(no file)";
    let fileSize = 0;
    if (fileExistsFlag) {
      try {
        fileSize = (await stat(outFile)).size;
        fileSnippet = (await readFile(outFile, "utf8")).slice(0, 800) || "(empty file)";
      } catch (err) {
        log.warn("nmap_from_gnmap failed to read output file", { err: String(err) });
      }
    }

    const stdoutSnippet = result.stdout.slice(0, 1500) || "(empty)";
    const stderrSnippet = result.stderr.slice(0, 800) || "(empty)";

    const rawContent = [
      `nmap_from_gnmap exit ${result.exitCode ?? -1}`,
      fileExistsFlag
        ? `file: ${fileSize} bytes (full attached)\nhead:\n\`\`\`\n${fileSnippet}\n\`\`\``
        : "file: not written",
      `hosts: ${uniqueHosts.length}`,
      `flags: ${flags}`,
      ports ? `ports: ${ports}` : null,
      `stdout:\n\`\`\`\n${stdoutSnippet}\n\`\`\``,
      `stderr:\n\`\`\`\n${stderrSnippet}\n\`\`\``
    ]
      .filter(Boolean)
      .join("\n");

    const content = trimToLimit(rawContent, 1800);
    const files =
      fileExistsFlag && result.exitCode === 0
        ? [new AttachmentBuilder(outFile).setName("nmap-reshosts.gnmap")]
        : undefined;

    await interaction.followUp({ content, files, ephemeral: true });
  } catch (err) {
    log.error("nmap_from_gnmap failed", { err: String(err) });
    try {
      await interaction.editReply("nmap_from_gnmap failed to run.");
    } catch {
      /* ignore */
    }
  }
}

function getHelp(): Promise<string> {
  return new Promise((resolve) => {
    const proc = spawn("nmap", ["-h"]);
    let buf = "";
    proc.stdout.on("data", (c) => (buf += c.toString()));
    proc.stderr.on("data", (c) => (buf += c.toString()));
    proc.on("close", () => resolve(buf));
    proc.on("error", () => resolve("failed to retrieve nmap help"));
  });
}

function trimToDiscord(text: string): string {
  if (text.length <= 1900) return text;
  return text.slice(0, 1900) + "\n...[truncated]...";
}

function trimToLimit(text: string, limit = 1900): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n...[truncated]...";
}

export const nmapFromGnmapCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
