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
