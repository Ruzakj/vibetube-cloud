const MAX_TEXT_LENGTH = 800;

function sendJson(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return sendJson(res, 405, { error: "Gunakan POST." });
  }

  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (!text) return sendJson(res, 400, { error: "Teks suara kosong." });
  if (text.length > MAX_TEXT_LENGTH) {
    return sendJson(res, 413, { error: `Teks VN maksimal ${MAX_TEXT_LENGTH} karakter.` });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) {
    return sendJson(res, 503, { error: "Konfigurasi suara Angel belum lengkap." });
  }

  try {
    const upstream = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          language_code: "id",
          voice_settings: {
            stability: 0.48,
            similarity_boost: 0.78,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!upstream.ok) {
      const detail = (await upstream.text()).slice(0, 300);
      console.error("ElevenLabs voice failed", upstream.status, detail);
      return sendJson(res, 502, { error: "ElevenLabs gagal membuat audio.", providerStatus: upstream.status });
    }

    const audio = Buffer.from(await upstream.arrayBuffer());
    if (!audio.length) return sendJson(res, 502, { error: "Audio Angel kosong." });

    res.status(200);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "audio/mpeg");
    res.setHeader("Content-Length", String(audio.length));
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.end(audio);
  } catch (error) {
    console.error("Angel voice error", error);
    return sendJson(res, 502, { error: "Voice provider tidak dapat dihubungi." });
  }
}
