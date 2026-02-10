import type { ChatInputCommandInteraction, GuildMember } from "discord.js";

import { config } from "../config/index.js";
import { log } from "../services/logging.js";

// Pre-build Sets for O(1) lookups.
const allowedUserSet = new Set(config.allowedUserIds);
const allowedRoleSet = new Set(config.allowedRoleIds);

/**
 * Check whether the invoking user is authorised to run scan commands.
 *
 * Rules:
 *  - If both ALLOWED_ROLE_IDS and ALLOWED_USER_IDS are empty, everyone is allowed (open mode).
 *  - If ALLOWED_USER_IDS is set, the user's ID must be in the list.
 *  - If ALLOWED_ROLE_IDS is set, the user must have at least one of the listed roles.
 *  - If both are set, satisfying **either** grants access.
 *
 * Returns `true` if allowed, `false` (and replies with an error) if denied.
 */
export async function checkAccess(interaction: ChatInputCommandInteraction): Promise<boolean> {
  // Open mode — no restrictions configured.
  if (allowedUserSet.size === 0 && allowedRoleSet.size === 0) {
    return true;
  }

  const userId = interaction.user.id;

  // Check user allowlist (O(1) via Set).
  if (allowedUserSet.size > 0 && allowedUserSet.has(userId)) {
    return true;
  }

  // Check role allowlist.
  if (allowedRoleSet.size > 0) {
    const member = interaction.member as GuildMember | null;
    if (member) {
      const hasRole = member.roles.cache.some((_, roleId) => allowedRoleSet.has(roleId));
      if (hasRole) return true;
    }
  }

  // Denied.
  log.warn("access denied", {
    user: userId,
    command: interaction.commandName,
    guild: interaction.guildId
  });

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply("You do not have permission to use this command.");
    } else {
      await interaction.reply({
        content: "You do not have permission to use this command.",
        ephemeral: true
      });
    }
  } catch {
    // Swallow if we can't even reply.
  }

  return false;
}
