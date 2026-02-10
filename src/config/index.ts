import { tmpdir } from "os";

import dotenv from "dotenv";

dotenv.config();

const requiredEnv = ["DISCORD_TOKEN", "DISCORD_APP_ID", "DISCORD_GUILD_ID"] as const;

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    // eslint-disable-next-line no-console
    console.warn(`Missing env var ${key} (set in .env)`);
  }
});

/** Parse an integer from an env var with a fallback. Returns fallback if NaN. */
function safeParseInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? fallback : parsed;
}

/** Comma-separated list of Discord role IDs allowed to run scans. Empty = no restriction. */
const allowedRoleIds = (process.env.ALLOWED_ROLE_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Comma-separated list of Discord user IDs allowed to run scans. Empty = no restriction. */
const allowedUserIds = (process.env.ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const config = {
  token: process.env.DISCORD_TOKEN ?? "",
  appId: process.env.DISCORD_APP_ID ?? "",
  guildId: process.env.DISCORD_GUILD_ID ?? "",
  masscanBin: process.env.MASSCAN_BIN ?? "masscan",
  nmapBin: process.env.NMAP_BIN ?? "nmap",
  workDir: process.env.WORK_DIR ?? `${tmpdir()}/scan-bot`,
  logDir: process.env.SCAN_LOG_DIR ?? `${tmpdir()}/scan-bot/logs`,
  webUsername: process.env.UI_USERNAME ?? "",
  webPasswordHash: process.env.UI_PASSWORD_HASH ?? "",
  webPort: safeParseInt(process.env.WEB_PORT, 3000),
  maxConcurrentScans: safeParseInt(process.env.MAX_CONCURRENT_SCANS, 3),
  maxConcurrentPerUser: safeParseInt(process.env.MAX_CONCURRENT_PER_USER, 1),
  allowedRoleIds,
  allowedUserIds
};
