import dotenv from "dotenv";

dotenv.config();

const requiredEnv = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.warn(`Missing env var ${key} (set in .env)`);
  }
});

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  appId: process.env.DISCORD_APP_ID ?? "",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  masscanBin: process.env.MASSCAN_BIN ?? "masscan",
  nmapBin: process.env.NMAP_BIN ?? "nmap",
  workDir: process.env.WORK_DIR ?? "/tmp/scan-bot",
  webUsername: process.env.UI_USERNAME ?? "",
  webPasswordHash: process.env.UI_PASSWORD_HASH ?? "",
  webPort: parseInt(process.env.WEB_PORT ?? "3000", 10)
};
