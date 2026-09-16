# Política de segurança

## Versões suportadas

Apenas a versão mais recente da branch `main` recebe correções de segurança.

## Relatar uma vulnerabilidade

Use **Security → Report a vulnerability** no repositório do GitHub. Não abra uma issue pública e não inclua dados médicos reais, chaves ou documentos no relato.

Inclua, quando possível:

- componente e versão afetados;
- passos mínimos para reprodução com dados fictícios;
- impacto esperado;
- sugestão de correção, se houver.

A interface e as APIs executam somente em localhost: a arquitetura de contas
usa PostgreSQL; a versão anterior da API local usa SQLite. Bancos, chaves e
backups ficam fora do Git. A implementação anterior do Android
e da demonstração está preservada em `legacy/`, incluindo suas automações
arquivadas. Este projeto não deve ser publicado em Sites ou outro provedor.

Consulte [a arquitetura](../docs/ARCHITECTURE.md) para entender quais campos são
criptografados e quais metadados permanecem disponíveis nos bancos. Relatos de
exposição de dados ou chaves devem ser enviados pelo canal privado.

## Dependências

Audite os dois arquivos de dependências, inclusive o legado arquivado:

```sh
npm audit
npm --prefix legacy audit
```

O segundo comando é necessário porque `legacy/package-lock.json` também é
analisado pelo Dependabot. Corrija as versões, preserve os arquivos de lock e
valide a instalação com `npm ci` no diretório afetado. Evite `npm audit fix
--force`: atualizações devem respeitar as dependências compatíveis e passar
pelos testes locais antes do envio. Uma auditoria sem alertas conhecidos não
garante ausência de vulnerabilidades.

Consulte o [registro da revisão de dependências](../docs/DEPENDENCIES.md) para
as correções, fontes e validação da revisão de 16/09/2026.
