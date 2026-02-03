# Discord Scan Bot (Masscan + Nmap)

Node.js + TypeScript Discord bot that triggers masscan and nmap scans via slash commands. Designed to run in Docker on a VPS.

## Setup (dev)
1. Copy `.env.example` to `.env` and fill in `DISCORD_TOKEN`, `DISCORD_APP_ID`, `DISCORD_GUILD_ID`.
2. Install dependencies: `npm install`
3. Register commands (guild-scoped): `npm run dev` after adding command registration logic, or run `ts-node scripts/deploy-commands.ts`.
4. Start in dev: `npm run dev`
5. Build/run: `npm run build && npm start`

## Scanners
- masscan: required in container/host; configure rate and output in commands.
- nmap: required in container/host.

## Docker
- Build image: `docker build -t discord-scan-bot .`
- Run: `docker run --env-file .env discord-scan-bot`

See `docs/references.md` for quick notes on Nmap, Masscan, and Discord API. More implementation to come.***
