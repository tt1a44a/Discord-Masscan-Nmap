import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";

import { commandMap } from "./commands/index.js";
import { config } from "./config/index.js";
import { log } from "./services/logging.js";
import { startWebServer } from "./web/server.js";
import { checkAccess } from "./utils/access.js";

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
      try {
        await interaction.reply({ content: "Unknown command", ephemeral: true });
      } catch (err) {
        log.warn("Failed to reply to unknown command", { err: String(err) });
      }
      return;
    }

    log.info("interaction", {
      command: interaction.commandName,
      id: interaction.id,
      user: interaction.user.id,
      channel: interaction.channelId,
      guild: interaction.guildId
    });

    // Role/user-based access control — checked before every command.
    if (!(await checkAccess(interaction))) return;

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
            flags: MessageFlags.Ephemeral
          });
        }
      } catch (err) {
        // Swallow unknown/acknowledged interaction errors to avoid crashing the client.
        log.warn("Failed to send error reply", { err: String(err) });
      }
    }
  });

  // Start optional web server (no-ops if credentials are not set).
  startWebServer();

  await client.login(config.token);

  // Graceful shutdown.
  const shutdown = () => {
    log.info("Shutting down...");
    client.destroy();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start bot", err);
  process.exitCode = 1;
});
