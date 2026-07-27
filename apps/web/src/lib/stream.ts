/**
 * Consume an ndjson response line-by-line — the client half of the streaming
 * AI routes (/api/ai/draft, /api/ai/interview, /api/ai/convert).
 */
export async function* streamEvents<T>(response: Response): AsyncIterable<T> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) yield JSON.parse(line) as T;
    }
  }
}
