import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import { mkdir, readFile, stat } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

import type { SlashCommand } from "../types/index.js";
import { log } from "../services/logging.js";
import { scanManager } from "../services/scanManager.js";
import { safeString, splitFlags } from "../utils/validation.js";
import { logDiscordError, safeDefer, safeEdit, safeFollowUp } from "../utils/discord.js";
import { config } from "../config/index.js";
import { fileExists } from "../utils/fs.js";

const data = new SlashCommandBuilder()
  .setName("scan_helper")
  .setDescription("Get presets and run masscan or nmap with guided options")
  .addStringOption((option) =>
    option
      .setName("target")
      .setDescription("Target (CIDR/IP/hostname)")
      .setRequired(true)
  )
  .addStringOption((option) =>
    option.setName("ports").setDescription("Ports (e.g., 80,443 or 1-1024)").setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("flags")
      .setDescription("Extra flags (space-separated, appended before target)")
      .setRequired(false)
  )
  .addStringOption((option) =>
    option
      .setName("tool")
      .setDescription("Preferred tool")
      .addChoices({ name: "masscan", value: "masscan" }, { name: "nmap", value: "nmap" })
      .setRequired(false)
  );

const PRESETS = {
  masscan_fast: { tool: "masscan", desc: "Fast TCP top ports", args: ["--top-ports", "1000"] },
  masscan_full: { tool: "masscan", desc: "Full TCP 1-65535", args: ["-p", "1-65535"] },
  nmap_service: { tool: "nmap", desc: "Service/version detect", args: ["-sV"] },
  nmap_aggressive: { tool: "nmap", desc: "Aggressive (-A)", args: ["-A"] },
  nmap_udp: { tool: "nmap", desc: "UDP top common", args: ["-sU", "--top-ports", "200"] }
} as const;

type PresetKey = keyof typeof PRESETS;

async function execute(interaction: ChatInputCommandInteraction) {
  if (!(await safeDefer(interaction))) return;
  const target = safeString(interaction.options.getString("target", true), 200);
  const ports = interaction.options.getString("ports", false);
  const flags = interaction.options.getString("flags", false);
  const tool = interaction.options.getString("tool", false);

  const presetMenu = new StringSelectMenuBuilder()
    .setCustomId("scan_helper:preset")
    .setPlaceholder("Choose a preset (or skip)")
    .addOptions(
      Object.entries(PRESETS).map(([key, val]) => ({
        label: val.tool === "masscan" ? `masscan: ${val.desc}` : `nmap: ${val.desc}`,
        value: key
      }))
    );

  const runButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("scan_helper:run_masscan").setLabel("Run masscan").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("scan_helper:run_nmap").setLabel("Run nmap").setStyle(ButtonStyle.Secondary)
  );

  await interaction.editReply({
    content: `Target: ${target}\nPorts: ${ports ?? "(none)"}\nFlags: ${flags ?? "(none)"}\nPick a preset or run directly:`,
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(presetMenu), runButtons]
  });

  const collector = interaction.channel?.createMessageComponentCollector({
    filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("scan_helper:"),
    time: 30_000,
    max: 1
  });

  if (!collector) {
    await interaction.editReply({ content: "Collector unavailable.", components: [] });
    return;
  }

  collector.on("collect", async (i) => {
    try {
      await i.deferUpdate();
      let chosenTool = tool ?? "masscan";
      let args: string[] = [];

      if (i.isStringSelectMenu()) {
        const key = i.values[0] as PresetKey;
        const preset = PRESETS[key];
        chosenTool = preset.tool;
        args.push(...preset.args);
      } else if (i.isButton()) {
        chosenTool = i.customId === "scan_helper:run_masscan" ? "masscan" : "nmap";
      }

      if (flags) args.push(...splitFlags(flags));
      if (ports) {
        if (chosenTool === "masscan") {
          args.push("-p", safeString(ports, 100));
        } else {
          args.push("-p", safeString(ports, 100));
        }
      }

      args.push(target);

      const outDir = join(config.workDir, randomUUID());
      await mkdir(outDir, { recursive: true });
      const outFile = join(outDir, `${chosenTool}-results.gnmap`);
      args.push("-oG", outFile);

      log.info("scan_helper run", { tool: chosenTool, target, ports, flags, args });
      let buffer = "";
      let lastSend = Date.now();
      const sendUpdate = async (label: string, data: string) => {
        if (
          data.includes("GitHub - robertdavidgraham") ||
          data.includes("bit.ly/14GZzcT")
        )
          return;
        const now = Date.now();
        buffer += `\n[${label}] ${data}`;
        if (buffer.length > 1200 || now - lastSend > 2000) {
          await safeFollowUp(interaction, trimToDiscord(buffer));
          buffer = "";
          lastSend = now;
        }
      };

      const managed = scanManager.start(interaction.user.id, {
        kind: chosenTool as "masscan" | "nmap",
        args,
        onData: ({ stream, data }) => {
          void sendUpdate(stream, data);
        }
      });

      const result = await managed.result;

      const stdoutSnippet = result.stdout.slice(0, 1500) || "(empty)";
      const stderrSnippet = result.stderr.slice(0, 800) || "(empty)";

      let fileSnippet = "(no file)";
      let fileSize = 0;
      const fileExistsFlag = await fileExists(outFile);
      if (fileExistsFlag) {
        try {
          fileSize = (await stat(outFile)).size;
          fileSnippet = (await readFile(outFile, "utf8")).slice(0, 800) || "(empty file)";
        } catch (err) {
          log.warn(`${chosenTool} failed to read output file`, { err: String(err) });
        }
      } else {
        log.warn(`${chosenTool} output file missing`, { outFile });
      }

      const files = fileExistsFlag ? [outFile] : [];

      const content = [
        `${chosenTool} exit ${result.exitCode ?? -1}`,
        fileExistsFlag
          ? `file: ${fileSize} bytes (full attached)\nhead:\n\`\`\`\n${fileSnippet}\n\`\`\``
          : "file: not written",
        `args: ${args.join(" ")}`,
        `stdout:\n\`\`\`\n${stdoutSnippet}\n\`\`\``,
        `stderr:\n\`\`\`\n${stderrSnippet}\n\`\`\``
      ]
        .filter(Boolean)
        .join("\n");

      const trimmed =
        content.length > 1800 ? content.slice(0, 1800) + "\n...[truncated]..." : content;

      // final follow-up so it appears at the end with attachment
      await safeFollowUp(interaction, trimmed, files);
    } catch (err) {
      log.error("scan_helper failed", { err: String(err) });
      try {
        await interaction.editReply({
          content: "Scan helper failed.",
          components: []
        });
      } catch (e) {
        log.warn("scan_helper failed to edit reply", { err: String(e) });
      }
    }
  });

  collector.on("end", async (collected) => {
    if (collected.size === 0) {
      await interaction.editReply({
        content: "Timed out waiting for selection.",
        components: []
      });
    }
  });
}

function trimToDiscord(text: string): string {
  if (text.length <= 1900) return text;
  return text.slice(0, 1900) + "\n...[truncated]...";
}

async function safeEditPayload(
  interaction: ChatInputCommandInteraction,
  payload: { content: string; components?: []; files?: string[] }
) {
  try {
    const files =
      payload.files && payload.files.length > 0
        ? payload.files.map((p) => ({ attachment: p }))
        : undefined;
    const content =
      payload.content.length > 1800
        ? payload.content.slice(0, 1800) + "\n...[truncated]..."
        : payload.content;
    await interaction.editReply({ content, components: payload.components, files });
  } catch (err) {
    logDiscordError("scan_helper editReply failed", err);
  }
}

export const scanHelperCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
