# Agenda de hoje e histórico de doses

Em **http://127.0.0.1:3002**, entre na conta, abra a família e selecione
**Doses de hoje**. A agenda reúne os horários das rotinas ativas e permite marcar
**Tomada** ou **Não tomada**, com observação opcional. **Ver histórico** consulta
os registros, com filtros por familiar e período. Proprietário/cuidador registram;
leitor consulta. As páginas funcionam sem JavaScript, com regras no backend.

## Data, confirmação e limites funcionais

A aplicação usa **America/Sao_Paulo** para determinar o dia da agenda. O instante
real do registro é obtido do relógio do servidor e armazenado em UTC; o horário
planejado permanece separado. O navegador não fornece autor, instante real,
quantidade ou nomes que serão gravados.

O formulário inclui a data exibida, conferida contra o dia atual após adquirir
as travas de escrita. Assim, uma página aberta antes da meia-noite não registra
silenciosamente a dose em outro dia. Apenas ocorrências do dia atual podem ser
registradas. Qualquer horário previsto para esse dia pode ser marcado, inclusive
antes do horário planejado; o histórico conserva o instante efetivo da confirmação.
Não há preenchimento automático de doses passadas nem recomendação de tratamento.

A confirmação verifica versão, estado ativo e horário da rotina. Um token HMAC
`context`, emitido na agenda, vincula o envio aos dados clínicos exibidos. Mudanças
no nome do familiar, medicamento, concentração, forma, quantidade ou instruções
exigem recarregar a agenda, mesmo que a versão da rotina não tenha mudado.
Esse token não substitui sessão, CSRF ou permissão.

Há **um único registro por família/rotina/data/horário**. Envios duplicados ou
concorrentes retornam 409 sem criar outra dose. Registros confirmados não podem
ser alterados/excluídos nesta entrega. Correções com trilha de auditoria, lembretes,
alarmes, registro retroativo e configuração de fuso por família permanecem pendentes.
O sistema registra a declaração do usuário, sem comprovar administração física.

## Histórico preservado

Cada dose guarda uma cópia dos nomes do familiar e medicamento, concentração,
apresentação, quantidade, instruções, versão da rotina, horário planejado, estado,
observação e fuso no momento do registro. Alterar os cadastros depois não modifica
o histórico. Registros do dia continuam visíveis mesmo após pausar a rotina ou
remover aquele horário; ocorrências futuras não confirmadas usam a rotina atual.

Antes de gravar, o servidor bloqueia para leitura consistente a rotina e seus
cadastros vinculados na mesma transação. O banco recusa combinações incompatíveis
de família, rotina e familiar, além de garantir a unicidade da ocorrência.

## Organização

```text
backend/modules/doses/
  validation.js    Data civil, fuso, entrada, filtros e cursor
  repository.js    Consultas por família, travas, unicidade e paginação
  service.js       Agenda, confirmação, snapshots, relógio e cifras
  routes.js        API com sessão, CSRF e If-Match
backend/web/accounts/doses/
  templates.js     Agenda, filtros, cartões e histórico SSR
  routes.js        Formulários nativos e respostas de erro
backend/database/postgres/migrations/005_doses.sql
frontend/css/pages/doses.css
tests/accounts/doses.test.js
tests/accounts/doses-web.test.js
```

O relógio pode ser injetado internamente nos testes. Não existe parâmetro HTTP
ou variável de ambiente para o navegador controlar a data. Testes usam bancos
descartáveis, identidades fictícias e horários determinísticos.

## Banco, criptografia e permissões

`dose_logs` usa RLS: leitura por vínculo ativo e inserção por proprietário/cuidador.
A política exige `recorded_by = request_user_id()`. O papel da aplicação recebe
apenas SELECT/INSERT; UPDATE e DELETE não são permitidos.

Snapshots, horário planejado, estado e observação ficam cifrados com AES-256-GCM.
O contexto autentica família, rotina, familiar, ID, data, chave de ocorrência,
autor e instante do registro. A chave clínica é `data/postgres/clinical.key`.
Alterar ou trocar cifras/metadados provoca falha na leitura.

A chave de ocorrência é um HMAC da família/rotina/data/horário. Ela permite
detectar duplicatas sem armazenar o horário planejado em texto simples no índice.
IDs, vínculos, data civil, autor e instante UTC permanecem em tipos SQL, permitindo
consultas do histórico. Isso não protege contra quem controla banco e chave local.

A quota é de **12.000 registros por família/dia**, serializada no servidor. A
agenda consulta até 500 rotinas e os registros do dia, calcula totais no backend
e apresenta **50 ocorrências por página**. Pode incluir registros preservados de
horários/rotinas que foram alterados. Não retorna fotos nem documentos.

O histórico consulta até **31 dias**, com **25 registros por página**, em ordem
decrescente de instante/ID. O cursor mantém ordem estável mesmo com instantes
iguais. Filtros e cursores nunca removem o escopo da família. Sem período explícito,
a consulta considera os últimos sete dias, incluindo hoje.

## Contrato HTTP

Prefixo: `/api/families/:familyId/doses`.

| Método e caminho | Entrada                                                | Sucesso                             |
| ---------------- | ------------------------------------------------------ | ----------------------------------- |
| `GET /today`     | `memberId` e `page` opcionais                          | Data, fuso, itens, totais e páginas |
| `GET /history`   | `memberId`, `from`, `to`, `cursor` opcionais           | Itens, período e `nextCursor`       |
| `POST /`         | JSON de confirmação, sessão, CSRF, origem e `If-Match` | 201, `{ item: ... }`                |

JSON de confirmação: `routineId`, `date` (`YYYY-MM-DD`), `time` (`HH:mm`),
`status` (`taken` ou `skipped`), `context` recebido na agenda e `note` opcional
(até 500 caracteres). `If-Match` contém a versão da rotina exibida. Campos extras,
datas impossíveis, horários inválidos, estados desconhecidos e snapshots enviados
pelo cliente são recusados. Datas aceitas nos filtros são de 1900 a 9999.

Um item pendente da agenda inclui `version` e `context` para confirmar. Um item
registrado inclui o snapshot, ID e instante real. O histórico contém apenas itens
registrados. Nenhuma resposta revela cifras, chaves ou identidades de outras contas.

Erros: 401 sem sessão; 403 sem permissão/origem/CSRF; 404 para família/rotina/familiar
fora do escopo; 409 para duplicata, rotina pausada ou contexto/data/versão antigos;
422 para entrada, filtros ou quota inválidos; 428 sem versão válida. As mesmas
regras se aplicam a formulários e API. POST HTML usa `_csrf`, `version` e os mesmos
campos de ocorrência, redirecionando com 303 após sucesso.

## Operação e testes

Execute `npm run db:setup` para aplicar a migração 005 e reinicie
`npm run dev:accounts`. O setup da chave inclui `dose_logs` na verificação que
impede gerar uma chave substituta com dados existentes. Não há importação do acervo
SQLite. Backup/restauração PostgreSQL e importação continuam pendentes; `npm run
backup` segue exclusivo do SQLite. Dados, chaves e capturas reais ficam fora do Git.

`npm run test:accounts` cobre confirmação, snapshots após edição dos cadastros,
duplicidade concorrente, meia-noite de São Paulo, rotina pausada/alterada, RLS,
autor autenticado, escrita imutável, CSRF, campos falsificados, filtros e paginação.
O navegador testa registro dos dois estados, notas escapadas, filtros, leitor,
contexto desatualizado e responsividade sem JavaScript. Execução exclusivamente
em localhost, sem serviços de envio ou publicação.
