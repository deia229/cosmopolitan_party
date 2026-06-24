# 🎉 Cosmopolitan Party

Sistema completo de gestão operacional e site público do espaço de eventos
Cosmopolitan Party (Flamenga, Loures).

## 📦 Componentes

- **Site público** (raiz) — one-page: Início · O Espaço · Catering · Decoração · Reservar
  - `index.html`, `espaco-tour.mp4`
  - Função `netlify/functions/reserva.js` (notifica Telegram via bot)
  - Deploy: `cosmopolitanpartyfestas.netlify.app`
- **Dashboard CRM** (`dashboard/`) — interface web de gestão
  - Deploy: `cosmopolitanparty.netlify.app` (auto-deploy do `main`)
- **Contratos** (`contratos/`) — geração automática (Apps Script)
- **Marcação Ivo** (`marcacao_ivo/`) — Apps Script com formulário, lembretes
  diários por email (D-14/D-7/D-1) e integração com Google Calendar
- **Checklist Custos** (`checklists/`) — ferramenta offline para iPad
- **Documentação** (`docs/`) — guias de deploy e referência

## 🔐 Variáveis de ambiente (Netlify)

- `TELEGRAM_TOKEN` — token do bot que recebe notificações de reserva
- `TELEGRAM_CHAT` — chat ID para onde as reservas são enviadas

Nunca commitar tokens. As funções leem via `Netlify.env.get(...)`.

## 🚀 Quick Start

```bash
# Deploy do dashboard
cd dashboard
netlify deploy --prod

# Apps Script (contratos / marcação)
Copiar ficheiros das pastas correspondentes para script.google.com

# Checklist
Abrir checklists/cp_checklist_custos.html no iPad
```

## 📚 Documentação Completa

Ver `docs/deploy-guide.md` para instruções detalhadas.

---

**Equipa:**
- Andreia (tech/infraestrutura)
- Ivo (cosmopolitanparty.loures@gmail.com)
- Érica (ocasiaodemordomias@gmail.com)

**GitHub**: https://github.com/deia229/cosmopolitan_party
