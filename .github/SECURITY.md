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

A versão atual executa a interface, a API e o SQLite somente em localhost.
Banco, chave e backups ficam fora do Git. A implementação anterior do Android
e da demonstração está preservada em `legacy/`, incluindo suas automações
arquivadas. Este projeto não deve ser publicado em Sites ou outro provedor.

Consulte [a arquitetura](../docs/ARCHITECTURE.md) para entender quais campos são
criptografados e quais metadados permanecem disponíveis ao SQLite. Relatos de
exposição de dados ou chaves devem ser enviados pelo canal privado.
