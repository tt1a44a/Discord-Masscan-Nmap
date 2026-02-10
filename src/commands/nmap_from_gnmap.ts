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
import { safeString, splitFlags, trimToLimit } from "../utils/validation.js";
import { safeDefer, safeFollowUp } from "../utils/discord.js";
import { config } from "../config/index.js";
import { fileExists } from "../utils/fs.js";
import { validateFlags, validateTarget } from "../utils/sanitize.js";

const data = new SlashCommandBuilder()
  .setName("nmap_from_gnmap")
  .setDescription("Run nmap against hosts from an uploaded gnmap file")
  .addAttachmentOption((option) =>
    option.setName("gnmap").setDescription("Grepable output file from masscan/nmap").setRequired(true)
  )
  .addStringOption((option) =>
    option
      .setName("flags")
      .setDescription('Nmap flags (default: "-sV")')
      .setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("ports").setDescription("Ports (e.g., 80,443 or 1-1024)").setRequired(false)
  );

async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await safeDefer(interaction))) return;

  const attachment = interaction.options.getAttachment("gnmap", true);
  const flags = interaction.options.getString("flags", false) ?? "-sV";
  const ports = interaction.options.getString("ports", false);

  // Guard against excessively large attachments (max 5 MB).
  const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
  if (attachment.size > MAX_ATTACHMENT_BYTES) {
    await interaction.editReply(
      `Attachment too large (${(attachment.size / 1024 / 1024).toFixed(1)} MB). Maximum is 5 MB.`
    );
    return;
  }

  try {
    const workDir = join(config.workDir, randomUUID());
    await mkdir(workDir, { recursive: true });
    const gnmapPath = join(workDir, "input.gnmap");

    // Download attachment with timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(attachment.url, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
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

    // Validate each extracted host against the target allowlist.
    for (const host of uniqueHosts) {
      const hostCheck = validateTarget(host);
      if (!hostCheck.ok) {
        await interaction.editReply(`Host from gnmap blocked: ${hostCheck.reason}`);
        return;
      }
    }

    // Validate user-provided flags BEFORE adding internal flags (-iL, -oG)
    // so the blocklist doesn't reject our own bot-generated arguments.
    const userArgs: string[] = [...splitFlags(flags)];
    if (ports) {
      userArgs.push("-p", safeString(ports, 200));
    }

    const flagCheck = validateFlags(userArgs, "nmap");
    if (!flagCheck.ok) {
      await interaction.editReply(flagCheck.reason);
      return;
    }

    // Build full args with internal flags appended after validation.
    const args: string[] = [...userArgs, "-iL", hostsFile, "-oG", outFile];

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
        await safeFollowUp(interaction, trimToLimit(buffer));
        buffer = "";
        lastSend = now;
      }
    };

    const startResult = scanManager.start(interaction.user.id, {
      kind: "nmap",
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

    try {
      await interaction.followUp({ content, files, ephemeral: true });
    } catch (err) {
      log.warn("nmap_from_gnmap followUp failed", { err: String(err) });
    }
  } catch (err) {
    log.error("nmap_from_gnmap failed", { err: String(err) });
    try {
      await interaction.editReply("nmap_from_gnmap failed to run.");
    } catch {
      /* ignore */
    }
  }
}

export const nmapFromGnmapCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
