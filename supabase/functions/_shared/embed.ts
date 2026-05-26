// Helper to embed text via Lovable AI gateway. Returns a 1536-dim vector.
export async function embedText(text: string): Promise<number[]> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new Error("LOVABLE_API_KEY is not configured");
  const r = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small", // 1536 dims to match our column
      input: text,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`embed failed ${r.status}: ${t}`);
  }
  const j = await r.json();
  return j.data[0].embedding as number[];
}
