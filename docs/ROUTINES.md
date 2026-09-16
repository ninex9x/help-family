# Rotinas e horários por familiar

Em **http://127.0.0.1:3002**, entre na conta, abra uma família e escolha
**Ver rotinas**. É possível criar e editar rotinas, definir horários diários,
pausar e reativar. O formulário exige um familiar e uma apresentação já cadastrados
nessa família. A seleção combina medicamento e apresentação, sem JavaScript.

O servidor deriva o medicamento a partir da apresentação. O navegador não calcula
quantidade, horários ou permissões. A quantidade e as instruções são textos
informados pelo usuário; o sistema não recomenda tratamentos nem converte doses.

## Escopo desta etapa

- Rotina diária com 1–24 horários diferentes no formato `HH:mm`.
- Quantidade por dose, instruções opcionais e estado ativa/pausada.
- Proprietário/cuidador cadastram, editam, pausam e reativam; leitor consulta.
- Telas e erros em HTML no servidor, inclusive com JavaScript desativado.

A [agenda e o histórico de doses](DOSES.md) já estão integrados.
Ainda não há lembretes, alarmes, dias da semana, intervalo de
datas, recorrência por intervalo ou conversão de fuso. Os horários são valores de
relógio, sem data/fuso associado na rotina; a agenda de doses aplica
explicitamente o fuso America/Sao_Paulo. Pausar preserva os dados e marca a rotina como inativa.
Não existe um agendador em segundo plano nesta entrega.

Os vínculos com familiar, medicamento e apresentação são fixos. Para trocar esses
vínculos, pause a rotina anterior e crie outra. Isso prepara a integridade do
histórico de doses. Nomes/concentrações exibidos vêm dos cadastros atuais; snapshots
históricos são preservados na etapa de [registro de doses](DOSES.md). Editar esses cadastros
não altera a versão da rotina.

## Pastas e responsabilidades

```text
backend/modules/routines/
  validation.js     Campos, horários, estado e conversão do formulário HTML
  repository.js     SQL por família e derivação do medicamento
  service.js        Permissões, referências, criptografia, quota e versão
  routes.js         API autenticada e CSRF
backend/web/accounts/routines/
  routes.js         Formulários, carregamento de opções e redirecionamentos
  templates.js      Cartões, selects e mensagens SSR
backend/database/postgres/migrations/004_routines.sql
frontend/css/pages/routines.css
tests/accounts/routines-fixture.js
tests/accounts/routines.test.js
tests/accounts/routines-web.test.js
```

A interface reutiliza os cartões do catálogo, estilos de formulário e paleta.
O login permanece sem menu lateral. Nenhum script é adicionado ao frontend.

## Persistência e integridade

`routines` tem chaves estrangeiras compostas para `(family_id, member_id)` e
`(family_id, medicine_id, presentation_id)`. Elas impedem misturar famílias ou usar
uma apresentação de outro medicamento. Os IDs são normalizados para minúsculas.

RLS permite leitura somente com vínculo ativo, e INSERT/UPDATE para proprietário
ou cuidador. O papel da aplicação não pode mudar IDs/vínculos nem excluir rotinas.
A identidade vem da sessão e o contexto RLS é limitado à transação. O serviço
também confere as referências explicitamente antes de criar o registro.

Quantidade, instruções, horários e estado ficam juntos em `content_ciphertext`
(AES-256-GCM). O contexto autenticado inclui tipo de recurso, família, familiar,
medicamento, apresentação e ID. A chave é `data/postgres/clinical.key`, a mesma
chave clínica privada das etapas anteriores. Trocar cifras entre registros causa
falha. IDs, vínculos, versão e datas ficam em tipos SQL visíveis. A proteção não
impede acesso por quem controla banco e chave no computador.

Os horários são validados e ordenados antes de cifrar; não há tabela separada de
horários nesta entrega. Consultas futuras de agenda precisarão considerar essa
decisão e o volume, sem expor conteúdo clínico em índices de texto simples.
O catálogo de rotinas é limitado a **500 registros por família**, incluindo
pausados, com ordem estável por criação/ID. A quota é verificada sob trava
transacional para não ser excedida por cadastros concorrentes.

A edição e a troca de estado incrementam `version` somente na própria rotina.
Gravações com versão antiga retornam 409; nenhuma alteração parcial é confirmada.
O formulário de conflito exige abrir a versão atual antes de tentar novamente.

## API

Prefixo: `/api/families/:familyId/routines`. Exige sessão e vínculo ativo.
Escritas exigem origem exata, JSON (até 16 KiB) e `X-CSRF-Token`. PATCH também
exige `If-Match`, por exemplo `"1"`.

| Método | Caminho | Entrada                       | Sucesso                 |
| ------ | ------- | ----------------------------- | ----------------------- |
| GET    | `/`     | Sessão                        | 200, `{ items: [...] }` |
| GET    | `/:id`  | Sessão                        | 200, `{ item: ... }`    |
| POST   | `/`     | Campos de criação             | 201, `{ item: ... }`    |
| PATCH  | `/:id`  | Campos editáveis e `If-Match` | 200, `{ item: ... }`    |

| Campo            | Regra                                                     |
| ---------------- | --------------------------------------------------------- |
| `memberId`       | UUID de familiar da família; somente na criação           |
| `presentationId` | UUID de apresentação da família; somente na criação       |
| `quantity`       | Texto obrigatório, até 120 caracteres                     |
| `instruction`    | Texto opcional, até 500 caracteres; padrão vazio          |
| `times`          | Array obrigatório de 1–24 horários `HH:mm`, sem repetição |
| `active`         | Booleano; padrão `true` ao criar                          |

PATCH aceita somente `quantity`, `instruction`, `times` e `active`, com ao menos
um campo. Para pausar, envie `{"active":false}`. Corpo desconhecido, horário
inválido, repetido ou estado como texto retornam 422. `medicineId`, `familyId`,
`userId` e `role` nunca são aceitos no corpo. Referências válidas em formato, mas
ausentes nessa família, retornam 404. Falta de sessão retorna 401; falta de
permissão, origem ou CSRF retorna 403; versão ausente/inválida retorna 428.

Respostas acrescentam `id`, `familyId`, `memberId`, `medicineId`, `presentationId`
e `version`. Listagens não incluem perfis, fotos ou documentos completos. Para
montar os cartões HTML, o backend carrega os cadastros da mesma família e resolve
os nomes; o navegador recebe apenas HTML.

## HTML

`GET /families/:familyId/routines` lista; `/new` abre o cadastro; `/:id/edit` abre
a edição. POST na coleção cria; POST em `/:id` edita; POST em `/:id/status`
pausa/reativa. O formulário envia `_csrf` e a edição envia `version`.
Horários separados por vírgula e estado `true`/`false` são convertidos no backend
antes do mesmo validador da API. Formulários não confiam em IDs ou versões ocultos.

Sem familiar ou apresentação, a tela orienta completar os cadastros da família.
Sucesso usa redirecionamento 303. A rotina não gera registros de dose ao ser criada
ou reativada. Todos os caminhos funcionam exclusivamente em localhost.

## Atualização, testes e próximos passos

Execute `npm run db:setup` e reinicie `npm run dev:accounts`. A migração 004 não
altera migrações anteriores nem importa dados do SQLite. O setup da chave considera
também `routines` ao impedir geração de chave substituta com conteúdo existente.
Backup/restauração PostgreSQL e importação continuam pendentes; `npm run backup`
permanece exclusivo do SQLite. Código e documentação podem ser públicos; dados,
chaves, credenciais e capturas reais continuam fora do Git.

`npm run test:accounts` verifica horários, ordenação, estado, referências cruzadas,
RLS, permissões, revogação, CSRF/origem, cifras trocadas, quota concorrente e conflitos.
O navegador testa criar/editar/pausar/reativar sem JavaScript, pré-requisitos,
leitor, versão antiga, escapes e cartões em celular/tablet. Os testes usam bancos
descartáveis e dados fictícios. A agenda e o registro de doses já estão integrados;
consulte [Doses](DOSES.md) para o comportamento e os limites atuais.
