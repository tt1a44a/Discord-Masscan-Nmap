import { Client, Events, GatewayIntentBits } from "discord.js";

import { commandMap } from "./commands/index.js";
import { config } from "./config/index.js";
import { log } from "./services/logging.js";

async function main() {
  if (!config.token) {
    throw new Error("DISCORD_TOKEN is missing");
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, (c) => {
    log.info("Bot ready", { tag: c.user.tag });
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const command = commandMap.get(interaction.commandName);
    if (!command) {
      await interaction.reply({ content: "Unknown command", ephemeral: true });
      return;
    }

    log.info("interaction", {
      command: interaction.commandName,
      id: interaction.id,
      user: interaction.user.id,
      channel: interaction.channelId,
      guild: interaction.guildId
    });

    try {
      await command.execute(interaction);
    } catch (error) {
      log.error("Command execution failed", {
        command: interaction.commandName,
        error: String(error)
      });
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("There was an error executing that command.");
        } else {
          await interaction.reply({
            content: "There was an error executing that command.",
            flags: 1 << 6 // ephemeral
          });
        }
      } catch (err) {
        // Swallow unknown/acknowledged interaction errors to avoid crashing the client.
        log.warn("Failed to send error reply", { err: String(err) });
      }
    }
  });

  await client.login(config.token);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start bot", err);
  process.exit(1);
});
