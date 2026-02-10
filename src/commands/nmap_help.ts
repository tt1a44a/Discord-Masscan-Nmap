import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";

import type { SlashCommand } from "../types/index.js";
import { config } from "../config/index.js";
import { runHelp, formatHelpOutput } from "../utils/help.js";

const data = new SlashCommandBuilder()
  .setName("nmap_help")
  .setDescription("Show nmap -h output (truncated)");

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const output = await runHelp(config.nmapBin, ["-h"]);
  await interaction.editReply({
    content: formatHelpOutput("nmap -h", output)
  });
}

export const nmapHelpCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
