## Project Notes

- Deploy via Docker on VPS; masscan/nmap available in image.
- Slash commands: `/masscan` and `/nmap` planned with arguments for target, ports/flags, and optional output.
- Long scans should defer replies and use a simple queue to avoid blocking the gateway loop.
- Minimal controls (per current choice): basic input validation and logging of invoker + args. Consider adding allowlists/rate limits later.
