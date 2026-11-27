import { construirMensagem, enviarTelegram } from "./_alertas/core.js";

// Todos os dias às 08:00 UTC (09:00 em Lisboa no verão, 08:00 no inverno)
export default async () => {
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!key) { console.error("SUPABASE_SERVICE_KEY em falta"); return; }
  const msg = await construirMensagem(key);
  if (!msg) { console.log("Sem pendentes hoje."); return; }
  await enviarTelegram(msg);
  console.log("Alerta enviado.");
};
export const config = { schedule: "0 8 * * *" };
