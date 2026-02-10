export function safeString(input: string, maxLen = 200): string {
  return input.trim().slice(0, maxLen);
}

export function splitFlags(input: string): string[] {
  const trimmed = safeString(input, 400);
  const tokens = trimmed.match(/\S+/g);
  return tokens ?? [];
}

export function chunkString(input: string, size = 1800): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < input.length; i += size) {
    chunks.push(input.slice(i, i + size));
  }
  return chunks;
}

/** Trim text to a custom limit (with truncation marker). Defaults to Discord's ~2000 char limit. */
export function trimToLimit(text: string, limit = 1900): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + "\n...[truncated]...";
}
