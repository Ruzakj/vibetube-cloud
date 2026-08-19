const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

function sendText(res, status, body, type = "text/plain; charset=utf-8") {
  res.status(status);
  res.setHeader("Content-Type", type);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.end(body);
}

function isBlockedHostname(hostname) {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (/^(127|10)\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  if (host === "169.254.169.254") return true;
  if (host === "0.0.0.0") return true;
  return false;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    return res.end();
  }
  if (req.method !== "GET") return sendText(res, 405, "Gunakan GET.");

  const rawUrl = typeof req.query?.url === "string" ? req.query.url.trim() : "";
  if (!rawUrl) return sendText(res, 400, "Parameter url wajib diisi.");

  let target;
  try {
    target = new URL(rawUrl);
  } catch {
    return sendText(res, 400, "URL playlist tidak valid.");
  }
  if (!ALLOWED_PROTOCOLS.has(target.protocol)) return sendText(res, 400, "Hanya HTTP/HTTPS yang didukung.");
  if (isBlockedHostname(target.hostname)) return sendText(res, 403, "Host lokal/private tidak didukung.");

  try {
    const upstream = await fetch(target.toString(), {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "application/vnd.apple.mpegurl, application/x-mpegURL, audio/mpegurl, text/plain, */*",
        "User-Agent": "RicTV/1.0 playlist-fetcher",
      },
    });

    if (!upstream.ok) return sendText(res, 502, `Server playlist mengembalikan HTTP ${upstream.status}.`);

    const type = upstream.headers.get("content-type") || "text/plain; charset=utf-8";
    const length = Number(upstream.headers.get("content-length") || 0);
    if (length > MAX_BYTES) return sendText(res, 413, "Playlist terlalu besar (maksimal 8 MB).");

    const buffer = Buffer.from(await upstream.arrayBuffer());
    if (buffer.length > MAX_BYTES) return sendText(res, 413, "Playlist terlalu besar (maksimal 8 MB).");
    if (!buffer.length) return sendText(res, 502, "Playlist kosong.");

    res.status(200);
    res.setHeader("Content-Type", type.includes("html") ? "text/plain; charset=utf-8" : type);
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-RicTV-Proxy", "1");
    return res.end(buffer);
  } catch (error) {
    console.error("Ric TV playlist proxy error", error);
    return sendText(res, 502, "Playlist tidak dapat diambil dari server sumber.");
  }
}
