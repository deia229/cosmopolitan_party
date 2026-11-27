import { construirMensagem, enviarTelegram } from "./_alertas/core.js";

// Teste manual: /.netlify/functions/alertas-teste?token=<ALERTAS_TOKEN>[&enviar=1]
// Sem enviar=1 só devolve o texto (não manda Telegram).
export default async (req) => {
  const u = new URL(req.url);
  const tok = process.env.ALERTAS_TOKEN;
  if (!tok || u.searchParams.get("token") !== tok) return new Response("forbidden", { status: 403 });
  try {
    const msg = await construirMensagem(process.env.SUPABASE_SERVICE_KEY);
    if (msg && u.searchParams.get("enviar") === "1") await enviarTelegram(msg);
    return new Response(msg || "Sem pendentes hoje.", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  } catch (e) {
    return new Response("erro: " + e.message, { status: 500 });
  }
};
export const config = { path: "/.netlify/functions/alertas-teste" };
