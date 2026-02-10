import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";

import type { SlashCommand } from "../types/index.js";
import { config } from "../config/index.js";
import { runHelp, formatHelpOutput } from "../utils/help.js";

const data = new SlashCommandBuilder()
  .setName("masscan_help")
  .setDescription("Show masscan -h output (truncated)");

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const output = await runHelp(config.masscanBin, ["--help"]);
  await interaction.editReply({
    content: formatHelpOutput("masscan --help", output)
  });
}

export const masscanHelpCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
