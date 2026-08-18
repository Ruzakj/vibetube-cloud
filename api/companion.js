const MAX_MESSAGES = 16;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_SYSTEM_LENGTH = 12000;

function sendJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function cleanMessages(value) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(-MAX_MESSAGES)
    .map((item) => ({
      role: item?.role === "assistant" ? "assistant" : "user",
      content: typeof item?.content === "string" ? item.content.trim().slice(0, MAX_MESSAGE_LENGTH) : "",
    }))
    .filter((item) => item.content);
}

function configuredKeys() {
  return [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5,
  ].filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Gunakan POST." });
  }

  const system = typeof req.body?.system === "string"
    ? req.body.system.trim().slice(0, MAX_SYSTEM_LENGTH)
    : "";
  const messages = cleanMessages(req.body?.messages);
  if (!system || !messages.length) {
    return sendJson(res, 400, { error: "Pesan companion belum lengkap." });
  }

  const keys = configuredKeys();
  if (!keys.length) {
    return sendJson(res, 503, { error: "Konfigurasi AI Angel belum lengkap." });
  }

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const body = {
    model,
    temperature: 0.78,
    max_tokens: 420,
    messages: [{ role: "system", content: system }, ...messages],
  };

  let lastStatus = 502;
  for (const apiKey of keys) {
    try {
      const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!upstream.ok) {
        lastStatus = upstream.status;
        // Try the next key only for quota/auth/rate-limit failures.
        if ([401, 403, 429].includes(upstream.status)) continue;
        const detail = (await upstream.text()).slice(0, 300);
        console.error("Groq companion failed", upstream.status, detail);
        return sendJson(res, 502, { error: "AI Angel sedang tidak tersedia.", providerStatus: upstream.status });
      }

      const data = await upstream.json();
      const reply = String(data?.choices?.[0]?.message?.content || "").trim();
      if (!reply) return sendJson(res, 502, { error: "Balasan Angel kosong." });
      return sendJson(res, 200, { reply });
    } catch (error) {
      console.error("Companion provider error", error);
    }
  }

  return sendJson(res, 502, {
    error: "AI Angel sedang tidak tersedia.",
    providerStatus: lastStatus,
  });
}
