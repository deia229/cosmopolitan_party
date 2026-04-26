# 🚀 Deploy Guide

## Dashboard CRM

### Netlify Deploy

```bash
cd dashboard
netlify deploy --prod
```

**URL Atual:** https://fanciful-dodol-5b7488.netlify.app

### Configuração CORS

O dashboard usa JSONP para comunicar com Apps Script (evita erros CORS).

## Apps Script

### Setup

1. Aceder a [script.google.com](https://script.google.com)
2. Criar novo projeto: "Cosmopolitan Party Backend"
3. Adicionar ficheiros:
   - `Contratos_v3.gs`
   - `Festas.gs`

### Deploy Web App

1. Clicar em "Deploy" > "New deployment"
2. Tipo: "Web app"
3. Execute as: "Me"
4. Who has access: "Anyone"
5. Copiar URL do deploy

### Script Properties

Configurar em Project Settings > Script Properties:

```
WEB_APP_URL = [URL do web app]
```

### Spreadsheet

ID: `1d4g95miZ9LFgvakB4nsJs8QHCY5O-0xWJOa5FcpekPQ`

Sheets necessários:
- `Respostas1` - Dados dos eventos

### Drive Folder

ID: `1nXDov7hD4hEG5xnNHT_awukav1SOMjV3`

Para PDFs gerados dos contratos.

## Supabase

### Database

URL: `https://fsbpakhrfkrmfgpaxyly.supabase.co`

### Tabelas

```sql
-- Documentos (orçamentos)
cp_documents (
  id, created_at, updated_at, 
  client_name, event_date, status, 
  pack_data, total_value
)

-- Extras
cp_document_extras (
  id, document_id, 
  description, quantity, unit_price
)
```

## Checklist Custos

Ferramenta offline - abrir `checklists/cp_checklist_custos.html` no iPad/Safari.

Usa `localStorage` para persistência offline.

---

## Troubleshooting

### CORS Errors
- Dashboard usa JSONP (`?callback=processData`)
- Nunca usar `fetch()` direto para Apps Script

### Apps Script 403
- Verificar permissões do Web App
- Re-deploy se necessário

### Supabase Connection
- Verificar API keys em variáveis de ambiente
- Tools carregam dados fallback se offline
