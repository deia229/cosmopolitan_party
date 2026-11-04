// Recebe o pedido de catering montado no site e notifica via Telegram.
async function notifyTelegram(d) {
  const token = Netlify.env.get("TELEGRAM_TOKEN");
  const chat = Netlify.env.get("TELEGRAM_CHAT");
  const text = String(d.resumo || "").slice(0, 3800) || "(sem resumo)";
  const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text: "🍽️ Novo pedido de catering\n\n" + text }),
  });
  const j = await r.json();
  if (!j.ok) throw new Error("telegram: " + j.description);
  // Imagem do menu como ficheiro (mantém a qualidade)
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(d.imagem || "");
  if (m) {
    const bytes = Uint8Array.from(atob(m[2]), (c) => c.charCodeAt(0));
    const fd = new FormData();
    fd.append("chat_id", chat);
    fd.append("caption", "Menu de " + (d.nome || "cliente") + " · " + (d.total || ""));
    fd.append("document", new Blob([bytes], { type: "image/" + m[1] }), "menu-catering." + (m[1] === "png" ? "png" : "jpg"));
    const r2 = await fetch("https://api.telegram.org/bot" + token + "/sendDocument", { method: "POST", body: fd });
    const j2 = await r2.json();
    if (!j2.ok) throw new Error("telegram-doc: " + j2.description);
  }
}

export default async (req) => {
  const h = { "Content-Type": "application/json" };
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), { status: 405, headers: h });
  }
  try {
    const d = await req.json();
    await notifyTelegram(d);
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), { status: 500, headers: h });
  }
};

export const config = { path: "/.netlify/functions/catering" };
