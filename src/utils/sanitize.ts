/**
 * Sanitize and validate scan arguments before they reach the scanner.
 *
 * - Block dangerous nmap/masscan flags that could be abused.
 * - Optionally restrict which target CIDRs/IPs are scannable.
 */

import { log } from "../services/logging.js";

// ── Blocked flags ──────────────────────────────────────────────────────────────
// These could write to arbitrary files, execute scripts, or leak system info.

const BLOCKED_NMAP_FLAGS = new Set([
  "--script",
  "-sc",               // default NSE scripts (case-insensitive match)
  "--script-args",
  "--script-trace",
  "--script-updatedb",
  "-a",                // aggressive — internally enables NSE scripts
  "--datadir",         // override data directory
  "--servicedb",
  "--versiondb",
  "--resume",          // could read arbitrary files
  "--stylesheet",      // could reference external URLs
  "--webxml",
  "-ir",               // random targets — defeats allowlist
  "--proxies",         // could tunnel through internal hosts
  // Block output flags to prevent arbitrary file writes (we control -oG).
  "-on",
  "-ox",
  "-os",
  "-oa",
  "--append-output"
]);

const BLOCKED_MASSCAN_FLAGS = new Set([
  "--resume",
  "--echo",            // dump config to stdout (minor, but unnecessary)
  "-c",                // load config file — could contain anything
  "--conf",
  "--readscan",        // reads arbitrary binary files
  "--include-file",
  "--exclude-file",    // reads files
  "-il",               // read targets from file
  "--pcap",            // write raw pcap to file
  "--output-filename", // override output path
  // Block output flags to prevent arbitrary file writes (we control -oG).
  "-oj",
  "-ox",
  "-ol",
  "--output-format"
]);

// Combined set for quick checking (covers both tools).
const ALL_BLOCKED = new Set([...BLOCKED_NMAP_FLAGS, ...BLOCKED_MASSCAN_FLAGS]);

// ── Allowed target CIDRs (optional) ───────────────────────────────────────────
// If ALLOWED_TARGETS is set (comma-separated CIDRs/IPs), only those ranges are
// permitted. If empty, any target is allowed.

/** Parse an IPv4 address string to a 32-bit unsigned integer. Returns null on failure. */
function ipToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = parseInt(part, 10);
    if (isNaN(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0; // force unsigned
}

/** Build a bitmask for a given CIDR prefix length (0–32). */
function cidrMask(bits: number): number {
  if (bits <= 0) return 0;
  if (bits >= 32) return 0xffffffff;
  return (~0 << (32 - bits)) >>> 0;
}

type ParsedCIDR = { network: number; mask: number };

function parseCIDR(cidr: string): ParsedCIDR | null {
  const slashIdx = cidr.indexOf("/");
  if (slashIdx === -1) {
    // Treat bare IP as /32.
    const ip = ipToInt(cidr);
    if (ip === null) return null;
    return { network: ip, mask: 0xffffffff };
  }
  const ip = ipToInt(cidr.slice(0, slashIdx));
  const bits = parseInt(cidr.slice(slashIdx + 1), 10);
  if (ip === null || isNaN(bits) || bits < 0 || bits > 32) return null;
  const mask = cidrMask(bits);
  return { network: (ip & mask) >>> 0, mask };
}

const allowedTargetsRaw = (process.env.ALLOWED_TARGETS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Pre-parsed CIDR ranges for fast bitwise comparison. */
const allowedCIDRs: ParsedCIDR[] = allowedTargetsRaw
  .map(parseCIDR)
  .filter((c): c is ParsedCIDR => c !== null);

if (allowedTargetsRaw.length > 0 && allowedCIDRs.length !== allowedTargetsRaw.length) {
  // eslint-disable-next-line no-console
  console.warn(
    `[sanitize] Some ALLOWED_TARGETS entries could not be parsed as IPv4 CIDRs. ` +
    `Parsed ${allowedCIDRs.length} of ${allowedTargetsRaw.length}.`
  );
}

// ── Public API ─────────────────────────────────────────────────────────────────

export type SanitizeResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Validate an array of CLI args that will be passed to masscan or nmap.
 * Returns `{ ok: false, reason }` if any blocked flag is found.
 */
export function validateFlags(args: string[], tool: "masscan" | "nmap"): SanitizeResult {
  const blocked = tool === "masscan" ? BLOCKED_MASSCAN_FLAGS : BLOCKED_NMAP_FLAGS;

  for (const arg of args) {
    const normalised = arg.toLowerCase();

    // Exact match against tool-specific or combined blocklist.
    if (blocked.has(normalised) || ALL_BLOCKED.has(normalised)) {
      log.warn("blocked flag", { flag: arg, tool });
      return { ok: false, reason: `The flag \`${arg}\` is not allowed.` };
    }

    // Catch --script=<value> style flags for nmap.
    if (tool === "nmap" && normalised.startsWith("--script=")) {
      log.warn("blocked flag (prefix)", { flag: arg, tool });
      return { ok: false, reason: "NSE `--script` flags are not allowed." };
    }
  }

  return { ok: true };
}

/**
 * Validate a target string (IPv4 address or CIDR).
 *
 * If ALLOWED_TARGETS is configured, the target IP must fall within at least one
 * allowed CIDR using proper bitwise comparison (works for any prefix length
 * including /12, /20, etc.).
 *
 * When ALLOWED_TARGETS is empty, any target is accepted.
 */
export function validateTarget(target: string): SanitizeResult {
  // Reject obviously malicious targets that look like flags.
  if (target.startsWith("-")) {
    return { ok: false, reason: "Target must not start with `-`." };
  }

  if (allowedCIDRs.length === 0) {
    return { ok: true };
  }

  // If the target is itself a CIDR (e.g. "10.0.0.0/24"), extract just the IP portion.
  const ipStr = target.includes("/") ? target.split("/")[0] : target;
  const targetIp = ipToInt(ipStr);

  if (targetIp === null) {
    // Not a valid IPv4 address — could be a hostname. Allow if no CIDR restrictions,
    // but since we have restrictions configured, block non-IP targets.
    log.warn("blocked target (not IPv4)", { target });
    return {
      ok: false,
      reason: `Target \`${target}\` is not a valid IPv4 address and cannot be checked against the allowlist.`
    };
  }

  // Bitwise check: (targetIp & allowedMask) === allowedNetwork
  const matches = allowedCIDRs.some(
    ({ network, mask }) => ((targetIp & mask) >>> 0) === network
  );

  if (!matches) {
    log.warn("blocked target", { target, allowedTargets: allowedTargetsRaw });
    return { ok: false, reason: `Target \`${target}\` is not in the allowed target list.` };
  }

  return { ok: true };
}
