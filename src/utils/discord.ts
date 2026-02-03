import { AttachmentBuilder, type ChatInputCommandInteraction } from "discord.js";

import { log } from "../services/logging.js";

export function maskToken(token?: string) {
  if (!token) return "";
  if (token.length < 12) return "***";
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}

export function logDiscordError(context: string, err: unknown) {
  const e = err as any;
  log.error(context, {
    code: e?.code,
    status: e?.status,
    message: e?.message,
    raw: e?.rawError
  });
}

export async function safeDefer(interaction: ChatInputCommandInteraction) {
  try {
    await interaction.deferReply({ ephemeral: true });
    return true;
  } catch (err) {
    logDiscordError("defer failed", err);
    return false;
  }
}

export async function safeFollowUp(
  interaction: ChatInputCommandInteraction,
  content: string,
  files?: string[]
): Promise<void> {
  try {
    const attachments =
      files && files.length > 0 ? files.map((p) => new AttachmentBuilder(p)) : undefined;
    await interaction.followUp({ content, ephemeral: true, files: attachments });
  } catch (err) {
    logDiscordError("followUp failed", err);
  }
}

export async function safeEdit(
  interaction: ChatInputCommandInteraction,
  content: string,
  filePaths?: string[]
): Promise<void> {
  try {
    const files =
      filePaths && filePaths.length > 0
        ? filePaths.map((p) => new AttachmentBuilder(p))
        : undefined;
    await interaction.editReply({ content, files });
  } catch (err) {
    logDiscordError("editReply failed", err);
  }
}
