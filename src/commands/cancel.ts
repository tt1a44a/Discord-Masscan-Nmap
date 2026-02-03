import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  type RESTPostAPIChatInputApplicationCommandsJSONBody
} from "discord.js";

import type { SlashCommand } from "../types/index.js";
import { scanManager } from "../services/scanManager.js";
import { log } from "../services/logging.js";

const data = new SlashCommandBuilder()
  .setName("cancel")
  .setDescription("Cancel your latest running scan (masscan/nmap).");

async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.deferReply({ ephemeral: true });
  const res = scanManager.cancelByUser(interaction.user.id);
  if (res.cancelled) {
    log.info("scan cancelled", { user: interaction.user.id, id: res.id });
    await interaction.editReply(`Cancelled scan ${res.id}`);
  } else {
    await interaction.editReply("No running scan found to cancel.");
  }
}

export const cancelCommand: SlashCommand = {
  data,
  toJSON: () => data.toJSON() as RESTPostAPIChatInputApplicationCommandsJSONBody,
  execute
};
