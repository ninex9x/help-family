# Contas e famílias: backend e telas de acesso

Esta etapa implementa cadastro, login, logout, sessões e famílias privadas em uma
API PostgreSQL separada. **O site em `http://127.0.0.1:3001` ainda usa SQLite e não
exige login.** A aplicação nova em `http://127.0.0.1:3002` oferece telas de cadastro,
login, famílias, familiares e catálogo de medicamentos gerados pelo servidor. Não lê os dados clínicos anteriores.
As duas aplicações executam exclusivamente em localhost.

## O que funciona e o que vem depois

| Recurso                                                            | Situação                                                                                    |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Conta individual, senha e sessão revogável                         | Implementado na API nova                                                                    |
| Criar, listar, consultar e renomear famílias                       | Implementado, com autorização e versão por família                                          |
| Uma conta participar de várias famílias                            | Modelo implementado; a API permite criar famílias próprias                                  |
| Papel de proprietário, cuidador e leitor                           | Modelo implementado; leitura por vínculo e edição do nome pelo proprietário                 |
| Compartilhar uma família com outra conta                           | Ainda sem endpoint ou tela de convite; vínculos compartilhados são exercitados pelos testes |
| Tela de cadastro/login e seletor de família                        | Implementado em HTML gerado no servidor, sem depender de JavaScript                         |
| Familiares acompanhados no PostgreSQL                              | Cadastro, consulta, edição e fotos implementados; veja [Familiares](MEMBERS.md)             |
| Medicamentos e apresentações no PostgreSQL                         | Cadastro, consulta e edição implementados; veja [Medicamentos](MEDICINES.md)                |
| Rotinas e horários no PostgreSQL                                   | Cadastro, edição, pausa e reativação implementados; veja [Rotinas](ROUTINES.md)             |
| Agenda e histórico de doses no PostgreSQL                          | Implementados por família; veja [Doses](DOSES.md)                                           |
| Documentos no PostgreSQL                                           | Ainda não migrados; continuam funcionando no site SQLite                                    |
| Recuperação/troca de senha, verificação de e-mail, MFA e auditoria | Pendentes                                                                                   |
| Importação do SQLite para uma conta escolhida                      | Pendente; cadastro nunca assume os dados antigos                                            |

Uma **conta** representa quem acessa o sistema. Uma **família** é um espaço de dados
compartilhado por vínculos com permissões. Um **familiar acompanhado** é a pessoa
cujos cuidados são registrados: pode ser uma criança ou alguém sem login. Novos
familiares já podem ser cadastrados na família autenticada; os registros antigos
continuam no SQLite e não são importados automaticamente.

## Instalação local

Requisitos: Node.js 24 ou superior, npm e binários do PostgreSQL 16. A configuração
foi validada em Linux Ubuntu 24.04/Zorin, arquitetura amd64. Execute como usuário
comum. Não é necessário instalar um serviço global nem criar contêineres.

Se os binários já estiverem em `/usr/lib/postgresql/16/bin`, prossiga para o setup.
Outro caminho pode ser informado pela variável `HELP_FAMILY_PG_BIN`. Em Ubuntu
24.04 amd64 com os repositórios oficiais configurados, é possível baixar e extrair
os pacotes para a pasta privada do projeto, executando da raiz:

```bash
mkdir -p data/postgres/packages data/postgres/runtime
chmod 700 data/postgres
(
  cd data/postgres/packages
  apt-get download postgresql-16 postgresql-client-16 libpq5
  for package in ./*.deb; do
    dpkg-deb -x "$package" ../runtime
  done
)
npm ci
npm run db:setup
npm run dev:accounts
```

O download usa a versão disponível nos repositórios do sistema. Os pacotes e o
cluster permanecem em `data/`, ignorados pelo Git. A configuração validada utilizou
PostgreSQL 16.15. Não copie esses binários para outra distribuição/arquitetura;
utilize os binários compatíveis e ajuste `HELP_FAMILY_PG_BIN` nesse caso.

`db:setup` cria ou inicia **somente** o cluster do projeto em `127.0.0.1:55432`,
gera credenciais aleatórias e aplica as migrações. Pode ser reexecutado sem apagar
dados. Não redefine credenciais existentes. Um cluster encontrado sem o arquivo
de credenciais provoca erro: restaure o arquivo privado correspondente.

Em outro terminal, confira apenas a saúde da API:

```bash
curl --fail http://127.0.0.1:3002/api/health
```

Para executar o site existente, use `npm run dev` em outro terminal e abra
`http://127.0.0.1:3001`. Para as novas contas, abra `http://127.0.0.1:3002/login`.
`HELP_FAMILY_ACCOUNTS_PORT` pode mudar a porta HTTP nova, mantendo o loopback.
Uma chamada do navegador da porta 3001 para 3002 será recusada por origem diferente;
as telas de contas e sua API já compartilham a origem 3002.

Para encerrar, use `Ctrl+C` no terminal da API e depois `npm run db:stop`. Esse
comando encerra apenas o cluster em `data/postgres/cluster`, preservando dados.
O PostgreSQL não é configurado para iniciar automaticamente com o computador.

### Credenciais e papéis do banco

O setup gera `data/postgres/credentials.json` com permissão `0600`, dentro de
diretório `0700`. Não há senha padrão nem conta de usuário pré-cadastrada.

| Papel PostgreSQL        | Uso                                                                       |
| ----------------------- | ------------------------------------------------------------------------- |
| `help_family_admin`     | Preparação do cluster e criação/remoção dos bancos descartáveis de teste  |
| `help_family_migration` | Proprietário do banco/tabelas; executor de migrações                      |
| `help_family_app`       | Consultas da API, sem superusuário, propriedade de tabelas ou `BYPASSRLS` |

A API recusa iniciar com credenciais que permitiriam ignorar o isolamento RLS.
O arquivo de configuração local contém os três papéis; quem controla esse usuário
do sistema operacional pode lê-lo. A separação de papéis limita as consultas da
aplicação, mas não isola o banco de quem controla o computador.

`npm run backup` continua sendo **exclusivo do SQLite**. Ainda não há comando de
backup/restauração PostgreSQL no projeto. Use somente dados fictícios nesta etapa;
não migre o acervo até implementar e validar o procedimento de recuperação.

## Pastas e responsabilidades

```text
backend/
  accounts-server.js             Processo HTTP em loopback e encerramento
  accounts-app.js                Composição da API nova
  config/accounts.js            Configuração local e validação de porta
  database/postgres/
    pool.js                     Papel de execução, pool e contexto por transação
    migrate.js                  Migrações transacionais, checksum e permissões
    migrations/001_accounts.sql Contas, sessões, famílias, vínculos e RLS
    migrations/002_members.sql  Familiares cifrados e políticas por família
    migrations/003_medicines.sql Catálogo e apresentações por família
    migrations/004_routines.sql  Rotinas e vínculos clínicos compostos
    migrations/005_doses.sql     Histórico imutável e ocorrência única
  middleware/
    local-access.js             Host, origem, loopback e tipo de conteúdo
    session.js                  Cookie, autenticação e CSRF
  modules/
    auth/                       Rotas, validação, serviço e repositório de contas
    families/                   Rotas, validação, serviço e repositório de famílias
    members/                    Perfis acompanhados, fotos e isolamento clínico
    medicines/                  Medicamentos e apresentações por família
    routines/                   Rotinas diárias e horários por familiar
    doses/                      Agenda, confirmação e histórico por família
  web/accounts/                 Templates HTML e formulários processados pelo servidor
  shared/
    errors.js                   Respostas sem detalhes internos de SQL/segredos
    security/                   Argon2id e limite de tentativas
scripts/postgres/               Setup, encerramento e auxiliares locais
tests/accounts/                 Integração HTTP e PostgreSQL com dados fictícios
```

As rotas tratam o contrato HTTP, os serviços aplicam as regras e os repositórios
executam SQL parametrizado. A identidade vem da sessão; não aceitar `userId`, `role`
ou hashes como campos de cadastro. Não misturar esses módulos com os repositórios
SQLite existentes durante a transição.

Migrações aplicadas são imutáveis: adicione um novo arquivo SQL numerado. O executor
confere o checksum, serializa execuções e grava a versão na mesma transação.
Concessões do papel de execução ficam explícitas no executor de migrações.

## Contrato HTTP implementado

Base: `http://127.0.0.1:3002/api`. Os corpos JSON têm limite de 16 KiB. A rota específica de foto aceita multipart;
veja o [contrato de familiares](MEMBERS.md#api-implementada).
Nomes possuem 1–120 caracteres após remoção de espaços nas extremidades. E-mails
são normalizados para minúsculas e limitados a 254 caracteres; a validação sintática
não comprova a titularidade do endereço. Cadastro exige senha de 15–128 caracteres.
Campos desconhecidos são recusados com 422.

| Método e caminho      | Entrada / requisito                         | Resposta de sucesso                                                                      |
| --------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GET /health`         | Nenhum                                      | 200, saúde do PostgreSQL e etapa `accounts`                                              |
| `POST /auth/register` | `name`, `email`, `password`, `familyName`   | 201, `{ user, csrfToken }` e cookie; cria uma família vazia com papel `owner`            |
| `POST /auth/login`    | `email`, `password`                         | 200, `{ user, csrfToken }` e novo cookie                                                 |
| `GET /auth/session`   | Cookie, se houver                           | 200, `{ authenticated: false }` ou `{ authenticated: true, user, csrfToken, expiresAt }` |
| `POST /auth/logout`   | Sessão, CSRF e corpo `{}`                   | 204, revoga sessão e remove cookie                                                       |
| `GET /families`       | Sessão                                      | 200, `{ items: [...] }`, até 100 vínculos ativos                                         |
| `GET /families/:id`   | Sessão e vínculo ativo                      | 200, `{ item: ... }`                                                                     |
| `POST /families`      | Sessão, CSRF, `{ name }`                    | 201, `{ item: ... }`; cria outra família própria                                         |
| `PATCH /families/:id` | Proprietário, CSRF, `If-Match` e `{ name }` | 200, `{ item: ... }`, versão incrementada                                                |

`user` contém somente `id`, `name` e `email`. Um item de família contém `id`, `name`,
`version` e `role`. Os IDs são UUIDs. O limite atual de criação é 100
famílias ativas por conta; a listagem tem ordem estável e ainda não oferece cursor.

Operações de escrita exigem `Content-Type: application/json` e
`Origin: http://127.0.0.1:3002` (ajuste se mudar a porta). Depois de autenticar,
envie o cookie e `X-CSRF-Token` com o valor devolvido na própria sessão. O login e
o cadastro exigem origem válida, mas não CSRF prévio. O navegador administra o
cookie `HttpOnly`; não copie tokens para exemplos versionados ou `localStorage`.

Para renomear uma família com `version: 1`, envie `If-Match: "1"` e
`{"name":"Família de exemplo"}`. O próximo resultado terá versão 2. Repetir a
gravação com a versão antiga retorna 409. Alterar outra família não invalida essa
versão. A tela HTML mostra o conflito e recarrega a versão atual, sem sobrescrever a alteração.

Erros retornam `{ "error": "mensagem" }`: 400 para JSON inválido, 401 para ausência
de sessão/login inválido, 403 para origem/CSRF/permissão, 404 para recurso ausente
ou família sem vínculo, 409 para conflito, 413 para tamanho, 415 para tipo de
conteúdo, 422 para validação, 428 para versão ausente/inválida, 429 para limite de
tentativas e 503 para limite de trabalho de senha. Falhas internas retornam 500
genérico. Login inexistente e senha incorreta têm a mesma resposta; cadastro
duplicado retorna 409, portanto o cadastro ainda permite inferir disponibilidade
de endereço. Não existe endpoint de consulta pública de usuários.

## Proteções e limites desta etapa

### Páginas HTML

`GET /login`, `GET /register`, `GET /families` e `GET /families/:id` retornam HTML
gerado no backend. Os POSTs correspondentes processam formulários convencionais;
`POST /families/:id/rename` edita o nome e `POST /logout` encerra a sessão.
Depois de salvar, o servidor redireciona com HTTP 303. Os mesmos serviços e
validadores da API JSON são reutilizados; nenhum script do navegador decide acesso.

Escritas autenticadas usam `_csrf` no corpo do formulário e a edição da família
envia `version`, conferida no backend. A origem deve corresponder exatamente ao
servidor local. Essas páginas usam `Referrer-Policy: same-origin` para preservar
`Origin` nos formulários nativos, além de CSP sem execução de scripts. Os limites
de autenticação são compartilhados entre formulários HTML e API JSON.

### Sessão e persistência

- Senhas usam Argon2id com salt da biblioteca, 64 MiB, três passagens e paralelismo
  um. Há no máximo duas operações de senha simultâneas por processo, sem fila
  ilimitada; login inexistente também verifica um hash fictício.
- Tokens de sessão têm 32 bytes aleatórios. O banco recebe somente SHA-256 do
  token de autenticação. O token CSRF é separado e fica armazenado na sessão.
- Sessões duram no máximo oito horas, expiram após 30 minutos sem atividade e são
  limitadas a cinco por usuário. Login substitui a sessão apresentada no cookie;
  logout revoga a sessão atual. A atividade é persistida no máximo uma vez por
  minuto. Registros expirados do usuário são limpos em uma nova autenticação;
  ainda não há limpeza periódica global.
- Cookie `help_family_accounts`: `HttpOnly`, `SameSite=Strict`, `Path=/`, sem
  `Domain`. Não possui `Secure` porque esta execução usa HTTP em loopback. Isso
  não equivale a um ambiente HTTPS. Cookies não são isolados por porta; a origem
  exata e o token CSRF complementam a proteção entre aplicações locais.
- Cadastro/login compartilham limites de 30 tentativas por endereço e dez por
  e-mail a cada 15 minutos, inclusive tentativas bem-sucedidas. O controle mantém
  no máximo 5.000 chaves em memória e reinicia com o processo. Como o uso é local,
  contas diferentes podem compartilhar o limite do mesmo endereço.
- RLS protege `families`, `family_memberships`, `members`, `medicines` e
  `medicine_presentations`, `routines` e `dose_logs`. Cada operação configura o usuário
  apenas dentro da transação e usa o mesmo cliente até commit/rollback. Consultas
  também filtram o vínculo explicitamente. Sem contexto não há leitura de famílias.
- O papel da API não cria vínculos diretamente. Uma função `SECURITY DEFINER`, com
  nomes qualificados e `search_path` fixo, cria apenas uma família nova e seu vínculo
  de proprietário. O dono das tabelas pode contornar RLS; somente a ferramenta de
  migração usa esse papel, nunca as consultas HTTP. RLS não substitui validação,
  autorização e consultas parametrizadas.
- Nomes de conta/família e e-mails são metadados em texto no PostgreSQL; somente as
  senhas e os tokens de autenticação têm hash. Perfis, fotos e catálogo clínico usam
  AES-256-GCM com chave independente em `data/postgres/clinical.key`. Consulte
  [criptografia, permissões e recuperação de familiares](MEMBERS.md).

## Testes e cuidados com o repositório público

Instale o navegador de testes uma vez com `npx playwright install chromium`.
Com o cluster local iniciado por `npm run db:setup`:

```bash
npm run test:accounts
npm test
npm run test:browser
npm run build
npm run format:check
```

Os testes de contas criam bancos `help_family_test_<UUID>`, usam somente identidades
fictícias em `example.invalid`, abrem a API em uma porta efêmera de loopback e
removem apenas esses bancos ao terminar. Não limpam `help_family_accounts`, não
leem o acervo SQLite e não enviam e-mails. O processo precisa das credenciais locais
de setup para criar esses bancos isolados. Uma interrupção forçada pode deixar um
banco descartável; não remova bancos desconhecidos para resolver isso.

A suíte verifica hashes, sessão/expiração/logout, origem/CSRF/Host, limites de corpo
e tentativas, duas contas com IDs conhecidos, leitor e revogação, contexto RLS em
conexões reutilizadas, rollback, versões independentes e recusa de credenciais
privilegiadas. Também navega nas telas de contas com JavaScript desabilitado,
validando cadastro, seleção de família, edição, isolamento e logout. As suítes
anteriores verificam a API SQLite e os fluxos visuais.

Nunca versione `data/`, credenciais, chaves, backups, PDFs pessoais, bancos ou
capturas com dados reais. Os testes usam senhas fictícias e não representam contas
disponíveis na aplicação. Antes de um commit, revise `git diff`, `git diff --cached`
e `git status --short`; confira arquivos novos e execute uma varredura de segredos
com a configuração `.gitleaks.toml`. Não crie exceções genéricas para esconder
achados. O `.gitignore` previne inclusão acidental, mas não remove arquivos já
versionados nem substitui a revisão do conteúdo.

## Próxima entrega

Com familiares, medicamentos, rotinas e doses implementados, avançar para
documentos nas famílias autenticadas, preservando os templates
gerados no servidor e o design existente, com
escopo obrigatório de família e testes de autorização. Dados antigos só poderão
ser atribuídos a uma conta/família escolhida explicitamente, após backup e ensaio
da importação. O plano completo está em
[Backend multiusuário](decisions/001-multiuser-backend.md).
