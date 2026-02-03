import { REST, Routes } from "discord.js";

import { commands } from "../src/commands/index.js";
import { config } from "../src/config/index.js";
import { log } from "../src/services/logging.js";

async function main() {
  if (!config.token || !config.appId || !config.guildId) {
    throw new Error("Missing DISCORD_TOKEN, DISCORD_APP_ID, or DISCORD_GUILD_ID");
  }

  const rest = new REST({ version: "10" }).setToken(config.token);
  const body = commands.map((cmd) => cmd.toJSON());

  log.info("Registering guild commands", { guildId: config.guildId });
  await rest.put(Routes.applicationGuildCommands(config.appId, config.guildId), {
    body
  });

  log.info("Guild commands registered", { count: body.length });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to deploy commands", err);
  process.exit(1);
});
