# Discord Scan Bot - Improvements Tracker

## Improvements

1. [x] **Fix broken `kill()`** * — The `kill()` function in `startManagedScan` was a no-op. The `ChildProcess` reference was trapped inside the async IIFE and never exposed. Fixed by hoisting the `proc` variable so `kill()` can call `proc.kill("SIGTERM")` with a 5-second SIGKILL fallback. (`src/services/scanner.ts`)

2. [x] **Add role-based access control** * — Added `ALLOWED_ROLE_IDS` and `ALLOWED_USER_IDS` env vars (comma-separated). Access is checked centrally in the interaction handler before any command runs. If both lists are empty, open mode is used (no restrictions). (`src/config/index.ts`, `src/utils/access.ts`, `src/index.ts`, `.env.example`)

3. [x] **Add target/flag allowlists** * — Created `src/utils/sanitize.ts` with `validateFlags()` (blocklists dangerous nmap/masscan flags like `--script`, `-sC`, `--readscan`, `-c`, etc.) and `validateTarget()` (optional `ALLOWED_TARGETS` env var restricts which CIDRs/IPs can be scanned). Wired into all 4 scan commands: `masscan.ts`, `nmap.ts`, `nmap_from_gnmap.ts`, `scan_helper.ts`. (`.env.example` updated)

4. [x] **DRY up duplicated helpers** * — Moved `trimToDiscord()` and `trimToLimit()` into `src/utils/validation.ts`. Removed local copies from `masscan.ts`, `nmap.ts`, `nmap_from_gnmap.ts`, and `scan_helper.ts`; all now import from the shared module.

5. [x] **Wire up scan queue / concurrency limits** * — Rebuilt `ScanManager` with `MAX_CONCURRENT_SCANS` (global, default 3) and `MAX_CONCURRENT_PER_USER` (default 1) limits. Returns a `StartResult` discriminated union so callers get a clear rejection reason. Added a `drain()` mechanism that auto-starts queued scans when slots free up. Updated all 4 Discord commands and all 3 web API routes to handle the new result type. (`.env.example` updated with new env vars)

6. [x] **Clean up dead code** * — Removed `runScan()` and `cleanupScan()` from `scanner.ts`. Deleted `src/services/queue.ts` (replaced by ScanManager concurrency). Removed `safeEditPayload()` from `scan_helper.ts`. Removed unused imports (`logDiscordError`, `safeEdit`, `spawn`) from `masscan.ts`, `nmap.ts`, `scan_helper.ts`, and `nmap_from_gnmap.ts`.

---

*Items marked with `*` have been completed.*
