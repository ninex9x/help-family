# help-family

Gestão de saúde familiar em **HTML, CSS e JavaScript**, com **API Node.js/Express**
e **SQLite local**. A interface reúne agenda de doses, familiares, medicamentos,
histórico e documentos. O projeto funciona exclusivamente em localhost.

## Executar localmente

Requisitos: Node.js 24 ou superior e npm. Execute na raiz do repositório:

```bash
npm ci
npm run dev
```

Abra **http://127.0.0.1:3001**. Interface e API compartilham o mesmo servidor.
O banco e a chave são criados em `data/`, fora do versionamento.
Uma instalação nova começa vazia; a instalação migrada conserva seus registros.

**Contas e famílias:** abra **http://127.0.0.1:3002** após `npm run db:setup` e
`npm run dev:accounts`. Cadastro, login, famílias, perfis de familiares (incluindo fotos) e catálogo de medicamentos funcionam com
HTML gerado no servidor, inclusive sem JavaScript. Rotinas e horários por familiar
também estão integrados, com pausa/reativação. A agenda permite registrar doses
tomadas/não tomadas e consultar o histórico por familiar. Os cuidados clínicos na porta
3001 ainda usam SQLite e não estão vinculados a essas contas. Consulte o
[guia de contas e PostgreSQL](docs/ACCOUNTS.md) para instalar, executar e testar.

## Estrutura

```text
frontend/              HTML, estilos e JavaScript do navegador
  js/components/       Interações visuais, transporte de formulários e exibição de PDFs
  css/                 Temas, layout e componentes
backend/               Regras, validação, HTML e persistência
  web/pages/           Templates das cinco telas clínicas
  web/accounts/        Telas de contas, famílias, familiares e medicamentos
  web/components/      Formulários e componentes HTML gerados pelo servidor
  routes/              Endpoints HTTP
  services/            Regras, validação e criptografia
  repositories/        Mapeamento e consultas SQL parametrizadas
  database/migrations/ Estrutura versionada do banco
  modules/             Nova API: autenticação, famílias, familiares e medicamentos
  database/postgres/   Pool, migrações e isolamento PostgreSQL da API nova
scripts/               Migração, backup e servidor de testes
tests/                Testes automatizados da API e do navegador
docs/                 Guias de arquitetura, API e operação
data/                 Banco, chave e backups locais; ignorados pelo Git
legacy/               Aplicação anterior e Android durante a transição
```

## Documentação

- [Arquitetura e responsabilidades](docs/ARCHITECTURE.md)
- [Frontend de apresentação e regras no backend](docs/BACKEND-FIRST.md)
- [Contas e PostgreSQL: instalação, endpoints e limites da etapa atual](docs/ACCOUNTS.md)
- [Agenda e histórico de doses: snapshots e confirmação](docs/DOSES.md)
- [Rotinas e horários: permissões, API e integridade](docs/ROUTINES.md)
- [Medicamentos no PostgreSQL: catálogo, apresentações e permissões](docs/MEDICINES.md)
- [Familiares no PostgreSQL: permissões, fotos e criptografia](docs/MEMBERS.md)
- [Arquitetura-alvo de contas e famílias separadas](docs/decisions/001-multiuser-backend.md)
- [API, campos e tratamento de erros](docs/API.md)
- [Migração, testes, backup e recuperação](docs/MIGRATION.md)
- [Versão anterior e Android](legacy/README.md)

## Comandos

| Comando                     | Função                                                             |
| --------------------------- | ------------------------------------------------------------------ |
| `npm run dev` / `npm start` | Iniciar interface e API somente em localhost                       |
| `npm run build`             | Gerar os arquivos web em `dist/`, sem publicar                     |
| `npm test`                  | Testar API, SQLite, integridade, criptografia e importação         |
| `npm run test:browser`      | Testar os fluxos da interface com banco descartável                |
| `npm run format`            | Formatar o código e a documentação da versão nova                  |
| `npm run format:check`      | Conferir a formatação                                              |
| `npm run migrate:legacy`    | Importar o D1 antigo para um banco novo vazio                      |
| `npm run demo:pdfs`         | Criar PDFs fictícios e adicioná-los ao site em localhost:3001      |
| `npm run backup`            | Criar backup consistente do SQLite e da chave locais               |
| `npm run db:setup`          | Preparar/iniciar PostgreSQL local e aplicar migrações da API nova  |
| `npm run dev:accounts`      | Iniciar páginas e API de contas em localhost:3002                  |
| `npm run test:accounts`     | Testar autenticação e isolamento em bancos PostgreSQL descartáveis |
| `npm run db:stop`           | Encerrar o cluster PostgreSQL do projeto sem apagar dados          |

Antes do primeiro teste de navegador, instale o Chromium de testes com
`npx playwright install chromium`. Todos os testes executam em localhost e usam
bancos temporários com dados fictícios.

## PDFs de demonstração

Com o site local em execução (`npm run dev`), execute `npm run demo:pdfs` para
criar uma receita, um exame de duas páginas e um atestado inteiramente fictícios.
As amostras aparecem em **Documentos**, no perfil **Pessoa Demonstração**, com
prefixo `[DEMO]`. Cada página indica que não possui validade médica.

O gerador usa o Chromium do Playwright e o modelo em
`scripts/fixtures/demo-pdf-template.html`. Os PDFs ficam em `data/demo-pdfs/`,
fora do Git, e também são armazenados na API local. Reexecutar o comando adiciona
somente as amostras ausentes, sem duplicar o perfil ou substituir documentos.

## Dados e transição

No site SQLite, os campos de conteúdo são criptografados com AES-256-GCM. O SQLite mantém
identificadores e vínculos necessários às relações. A chave está em
`data/encryption.key`; banco e chave devem ser preservados juntos nos backups.
A API impede gravações baseadas em revisões antigas de outra sessão.

A versão web já utiliza a estrutura nova. O Android e sua digitalização nativa
permanecem em `legacy/` e ainda precisam de adaptação. Nenhum APK foi migrado
nesta etapa. As antigas automações de publicação também foram arquivadas nessa
pasta. Não há implantação ou publicação autorizada para este projeto.

## Repositório público

Versione apenas código, documentação e exemplos fictícios. `data/`, credenciais,
chaves, bancos e backups permanecem fora do Git. Revise também os arquivos novos
antes de cada commit e faça a varredura de segredos com `.gitleaks.toml`.
Os scripts PostgreSQL geram credenciais locais aleatórias; não existe senha padrão
nem conta de demonstração pré-cadastrada. Consulte os
[limites e testes da API nova](docs/ACCOUNTS.md) antes de ampliar seu uso.
