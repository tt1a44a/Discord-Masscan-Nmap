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
