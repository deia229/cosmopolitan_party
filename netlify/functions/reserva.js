export default async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method" }), {
      status: 405, headers: { "Content-Type": "application/json" }
    });
  }
  try {
    const d = await req.json();
    const token = Netlify.env.get("TELEGRAM_TOKEN");
    const chat  = Netlify.env.get("TELEGRAM_CHAT");
    const linhas = [
      "\uD83D\uDCC5 Nova reserva \u2014 Cosmopolitan Party",
      "Data: " + (d.data || "-"),
      "Turno: " + (d.turno || "-"),
      "Hor\u00e1rio: " + (d.entrada || "-") + " \u2192 " + (d.saida || "-"),
      "Barris: " + (d.barris || "-"),
      "Total: " + (d.total || "-"),
      "Nome: " + (d.nome || "-"),
      "Contacto: " + (d.contacto || "-")
    ];
    const text = linhas.join("\n");
    const r = await fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text })
    });
    const j = await r.json();
    if (!j.ok) {
      return new Response(JSON.stringify({ ok: false, error: j.description }), {
        status: 502, headers: { "Content-Type": "application/json" }
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { "Content-Type": "application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { "Content-Type": "application/json" }
    });
  }
};

export const config = { path: "/.netlify/functions/reserva" };
