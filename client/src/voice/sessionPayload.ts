export interface TranscriptLine {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
}

/** Keep recent context within the server's 100 KB JSON limit, including UTF-8. */
export function createSessionPayload(
  sessionId: string,
  title: string,
  lines: TranscriptLine[],
) {
  const summary = (
    lines
      .slice(-8)
      .map((line) => `${line.role}: ${line.text}`)
      .join("\n") || `Voice session for ${title}`
  ).slice(0, 4000);
  const transcript: TranscriptLine[] = [];
  let bytes = 0;
  const encoder = new TextEncoder();
  for (const line of lines.slice(-500).reverse()) {
    const entry = { ...line, text: line.text.slice(0, 10000) };
    const size = encoder.encode(JSON.stringify(entry)).length + 1;
    if (bytes + size > 60_000) break;
    transcript.unshift(entry);
    bytes += size;
  }
  return { session_id: sessionId, summary, transcript };
}
