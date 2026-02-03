import type { SlashCommand } from "../types/index.js";
import { masscanCommand } from "./masscan.js";
import { nmapCommand } from "./nmap.js";
import { masscanHelpCommand } from "./masscan_help.js";
import { nmapHelpCommand } from "./nmap_help.js";
import { scanHelperCommand } from "./scan_helper.js";
import { cancelCommand } from "./cancel.js";
import { nmapFromGnmapCommand } from "./nmap_from_gnmap.js";

export const commands: SlashCommand[] = [
  masscanCommand,
  nmapCommand,
  masscanHelpCommand,
  nmapHelpCommand,
  scanHelperCommand,
  cancelCommand,
  nmapFromGnmapCommand
];

export const commandMap = new Map<string, SlashCommand>(
  commands.map((cmd) => [cmd.data.name, cmd])
);
