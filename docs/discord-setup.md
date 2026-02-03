## Discord Bot Setup Checklist

Use this to set up and authorize the scan bot with correct scopes, permissions, and intents.

### 1) Create app and bot
- Go to https://discord.com/developers/applications → New Application.
- Note `Application ID` (aka Client ID) and `Public Key`.
- In “Bot” tab: Add Bot → toggle “Public Bot” (on if others may invite; off if private).
- Reset/COPY the Bot Token (store in `.env` as `DISCORD_TOKEN`).

### 2) Intents
- For slash-command-only bots you just need `Guilds` intent.
- In “Bot” tab → Privileged Gateway Intents: leave `GUILD_MEMBERS`, `MESSAGE_CONTENT`, `PRESENCE` off unless you truly need them. Our current bot does not need them.

### 3) Scopes for invite URL
- Required scopes: `bot`, `applications.commands`.
  - `bot` adds the bot user to a guild.
  - `applications.commands` allows registering slash commands in the guild.

### 4) Permissions to request (bitwise integer)
- Minimum for this bot to reply with attachments: `Send Messages`, `Embed Links`, `Attach Files`, `Use Application Commands`, `Read Message History`.
- Bit flags: SEND_MESSAGES (0x800), EMBED_LINKS (0x4000), ATTACH_FILES (0x8000), READ_MESSAGE_HISTORY (0x10000), USE_APPLICATION_COMMANDS (0x80000000).
- Combined permission integer: 0x800 + 0x4000 + 0x8000 + 0x10000 + 0x80000000 = **2147799041**.
  - Adjust upward only if you need more (e.g., Manage Messages to delete your own messages—typically unnecessary).

### 5) Build invite URL
- Base: `https://discord.com/oauth2/authorize`
- Query params: `client_id=<APPLICATION_ID>&scope=bot%20applications.commands&permissions=2147799041`
- Optional: `guild_id=<TARGET_GUILD_ID>` to preselect a server; `disable_guild_select=true` to force that guild if you have permission there.

### 6) Register slash commands (dev flow)
- Prefer guild-scoped during development for fast propagation.
- In `.env`, set `DISCORD_APP_ID`, `DISCORD_GUILD_ID`, `DISCORD_TOKEN`.
- Run: `npm run deploy:commands` (uses `scripts/deploy-commands.ts`).
- Commands available in the target guild within seconds; global commands can take up to an hour, so keep them guild-scoped while iterating.

### 7) Run the bot
- Local/dev: `npm run dev` (ts-node-dev) or `npm run build && npm start`.
- Docker: build with `docker build -t discord-scan-bot .`; run with `docker run --env-file .env discord-scan-bot`.
- Ensure `masscan` and `nmap` binaries are installed/accessible (Dockerfile already installs them).

### 8) Operational cautions
- Keep the bot token secret; never commit `.env`.
- Rate limits: Discord enforces per-route limits and ~2 gateway commands/sec; avoid spamming edits/replies.
- Permissions hierarchy: the bot’s highest role must be above any roles it needs to act on (not critical for this bot since it only sends messages).
- Elevated perms (ADMINISTRATOR/Manage Messages/etc.) require 2FA on the owner account when the guild has 2FA enabled.

### 9) Quick references
- OAuth2 scopes: https://discord.com/developers/docs/topics/oauth2#shared-resources-oauth2-scopes
- Bot authorization: https://discord.com/developers/docs/topics/oauth2#bot-users
- Permissions table: https://discord.com/developers/docs/topics/permissions
- Gateway intents: https://discord.com/developers/docs/topics/gateway#gateway-intents
