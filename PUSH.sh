#!/bin/bash

echo "🚀 Cosmopolitan Party - Push para GitHub"
echo "=========================================="
echo ""

# Adicionar todos os ficheiros
echo "📦 A adicionar ficheiros..."
git add .

# Verificar se há algo para commit
if git diff --staged --quiet; then
  echo "⚠️  Nenhuma alteração para commit"
  exit 0
fi

# Commit
echo "💾 A criar commit..."
git commit -m "feat: Add complete system files

- Dashboard CRM (Netlify)
- Sistema de contratos (Apps Script)
- Checklist custos (iPad offline)
- Documentação completa
- Ready for production"

# Push
echo "🚢 A fazer push para GitHub..."
git push origin main

echo ""
echo "✅ DONE!"
echo ""
echo "Ver em: https://github.com/deia229/cosmopolitan_party"
echo ""
