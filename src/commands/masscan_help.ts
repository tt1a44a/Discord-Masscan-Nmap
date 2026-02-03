import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";
import { spawn } from "child_process";

import type { SlashCommand } from "../types/index.js";
import { config } from "../config/index.js";

const data = new SlashCommandBuilder()
  .setName("masscan_help")
  .setDescription("Show masscan -h output (truncated)");

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const output = await runHelp(config.masscanBin, ["--help"]);
  await interaction.editReply({
    content: formatOutput("masscan --help", output)
  });
}

function runHelp(bin: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    const proc = spawn(bin, args);
    let buf = "";
    proc.stdout.on("data", (c) => (buf += c.toString()));
    proc.stderr.on("data", (c) => (buf += c.toString()));
    proc.on("close", (code) => resolve({ code, out: buf }));
    proc.on("error", () => resolve({ code: -1, out: "failed to spawn help" }));
  });
}

function formatOutput(title: string, result: { code: number | null; out: string }) {
  const snippet = result.out.slice(0, 1900) || "(empty)";
  return `${title} (exit ${result.code ?? -1})\n\`\`\`\n${snippet}\n\`\`\``;
}

export const masscanHelpCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
