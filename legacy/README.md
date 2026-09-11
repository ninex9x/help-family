# Versão anterior preservada

Esta pasta contém o help-family anterior em React/TypeScript, Vinext e D1 local,
incluindo o aplicativo Android e a demonstração estática originais. Ela serve de
referência e compatibilidade durante a migração. Desenvolva as novas funções web
em `../frontend/` e `../backend/`.

O aplicativo atual é iniciado com `npm run dev` na raiz do repositório.
O histórico da migração e a recuperação de dados estão em
[`../docs/MIGRATION.md`](../docs/MIGRATION.md).

Os arquivos ignorados `.dev.vars` e `.wrangler/` podem conter a chave e o banco
originais desta máquina. Preserve-os até validar a migração e seus backups.
O Android ainda depende dos fontes desta pasta; não foi convertido nesta etapa.

As antigas automações GitHub ficam em `.github/workflows/` apenas como referência;
nessa localização não são workflows ativos do repositório.
