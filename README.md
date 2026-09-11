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

## Estrutura

```text
frontend/              HTML, estilos e JavaScript do navegador
  js/pages/            Hoje, familiares, medicamentos, histórico e documentos
  js/components/       Controles, formulários, diálogos e arquivos
  css/                 Temas, layout e componentes
backend/               API e persistência
  routes/              Endpoints HTTP
  services/            Regras, validação e criptografia
  repositories/        Mapeamento e consultas SQL parametrizadas
  database/migrations/ Estrutura versionada do banco
scripts/               Migração, backup e servidor de testes
tests/                Testes automatizados da API e do navegador
docs/                 Guias de arquitetura, API e operação
data/                 Banco, chave e backups locais; ignorados pelo Git
legacy/               Aplicação anterior e Android durante a transição
```

## Documentação

- [Arquitetura e responsabilidades](docs/ARCHITECTURE.md)
- [API, campos e tratamento de erros](docs/API.md)
- [Migração, testes, backup e recuperação](docs/MIGRATION.md)
- [Versão anterior e Android](legacy/README.md)

## Comandos

| Comando                     | Função                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `npm run dev` / `npm start` | Iniciar interface e API somente em localhost                  |
| `npm run build`             | Gerar os arquivos web em `dist/`, sem publicar                |
| `npm test`                  | Testar API, SQLite, integridade, criptografia e importação    |
| `npm run test:browser`      | Testar os fluxos da interface com banco descartável           |
| `npm run format`            | Formatar o código e a documentação da versão nova             |
| `npm run format:check`      | Conferir a formatação                                         |
| `npm run migrate:legacy`    | Importar o D1 antigo para um banco novo vazio                 |
| `npm run demo:pdfs`         | Criar PDFs fictícios e adicioná-los ao site em localhost:3001 |
| `npm run backup`            | Criar backup consistente do SQLite e da chave locais          |

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

Os campos de conteúdo são criptografados com AES-256-GCM. O SQLite mantém
identificadores e vínculos necessários às relações. A chave está em
`data/encryption.key`; banco e chave devem ser preservados juntos nos backups.
A API impede gravações baseadas em revisões antigas de outra sessão.

A versão web já utiliza a estrutura nova. O Android e sua digitalização nativa
permanecem em `legacy/` e ainda precisam de adaptação. Nenhum APK foi migrado
nesta etapa. As antigas automações de publicação também foram arquivadas nessa
pasta. Não há implantação ou publicação autorizada para este projeto.
