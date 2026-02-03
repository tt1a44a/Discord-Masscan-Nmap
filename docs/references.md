## Reference Notes: Nmap, Masscan, Discord Bots

### Nmap (quick essentials)
- Common scan types: `-sS` (SYN), `-sT` (TCP connect), `-sU` (UDP), `-sV` (service/version), `-O` (OS detect), `-A` (aggressive: OS + version + scripts + traceroute).
- Host discovery: `-sn` ping-only, `-Pn` skip host discovery, `-PS/PA/PU/PY` TCP/UDP/SCTP probes, `-PE/PP/PM` ICMP echo/timestamp/netmask, `--traceroute`.
- Port selection: `-p 80,443,8000-8100`, `--top-ports <n>`, `-F` (fast fewer ports), `--exclude-ports`.
- Timing/perf: `-T0..5` (0=paranoid, 5=insane), `--min-rate/--max-rate`, `--min-parallelism/--max-parallelism`, `--host-timeout`, `--scan-delay`.
- Firewall/evasion: `-f/--mtu` fragment, `-D` decoys, `-S` spoof src IP, `-g/--source-port`, `--proxies`, `--data*` payload options, `--spoof-mac`.
- Scripts: `-sC` (default NSE), `--script <list|category>`, `--script-args k=v`, `--script-trace`, `--script-updatedb`.
- Output: `-oN/-oX/-oG/-oS` text/xml/grep/script-kiddie, `-oA <base>` all formats, `--append-output`, `--resume`, `--open`, `-v/-vv`, `-d/-dd`, `--packet-trace`.
- Examples: `nmap -v -A scanme.nmap.org`, `nmap -sn 192.168.0.0/16`, `nmap -p 80,443 -sV 10.0.0.0/8`.

### Masscan (quick essentials)
- Purpose: Internet-scale async SYN scanner (own TCP/IP stack). CLI similar to nmap but focused on speed.
- Required ports arg: must specify `-p <ports>`; targets are IP/CIDR or ranges (no DNS).
- Basic usage: `masscan -p80,8000-8100 10.0.0.0/8 --rate 100000` (default rate 100 pkt/s).
- Config echo: `--echo > cfg.conf` to dump current config; `-c cfg.conf` to reuse.
- Randomization: targets always randomized; behaves like implicit `-sS -Pn -n --randomize-hosts --send-eth`.
- Banner grab: `--banners` optionally with `--source-ip <ip>` or firewalling a dedicated `--source-port` to avoid local TCP stack RSTs.
- Output formats: `-oX scan.xml`, `-oJ scan.json`, `-oG scan.grep`, `-oL scan.list`, binary via `--output-format binary` + `--readscan` to convert.
- Excludes: `--excludefile exclude.txt`; supports IPv4/IPv6; sharding via `--shards <count>/<idx>`.
- Rate/safety: can exceed 1M pkt/s on bare metal; tune `--rate/--max-rate`; consider `--router-mac` or `--offline` for perf tests; high rates can melt local networks.
- Build/install: `make && make install` on Linux; bin at `bin/masscan`.

### Discord bots (API highlights for slash commands)
- App setup: create application in Developer Portal, add Bot user, copy bot token (keep secret), note Application ID and public key.
- Gateway vs HTTP interactions: Gateway (via discord.js) is default for slash commands; HTTP Interactions endpoint requires signature verification (Ed25519 with `X-Signature-Ed25519`/`X-Signature-Timestamp`) and responding to `PING` with `{ type: 1 }`.
- Application commands: slash/user/message commands registered per guild or globally. For fast iterations, register guild commands; propagate via REST `applicationGuildCommands` or `applicationCommands` (discord.js REST).
- Responding: on interaction, reply within 3s or defer; use interaction responses (channel message or ephemeral). For long scans: `interaction.deferReply({ ephemeral: true })` then follow-up when done.
- Intents: for slash commands, enable `Guilds` intent; `GuildMessages`/`MessageContent` not required unless reading messages.
- Permissions: set default member permissions per command; optionally guild-level restrictions/roles.
- Rate limits: Discord imposes per-route limits; keep scan queue to avoid blocking the bot loop.
- Useful docs: https://discord.com/developers/docs/intro , https://discord.com/developers/docs/interactions/application-commands , https://discord.com/developers/docs/interactions/receiving-and-responding
