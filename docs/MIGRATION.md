# Migração, operação e recuperação local

## Estado desta etapa

As cinco áreas web foram convertidas para HTML/CSS/JavaScript. A nova API usa
Express e um SQLite próprio. A implementação anterior, incluindo o Android e
seus arquivos locais, está em `legacy/` para referência durante a transição.

Os arquivos React/TypeScript de `legacy/` não fazem parte do build web novo.
As regras de validação foram convertidas para JavaScript e preservadas em
`backend/services/validation.js`. A identidade visual mantém fontes locais,
paleta, tema escuro e navegação responsiva, com componentes web reescritos.

## Iniciar

Na raiz, execute `npm ci` e `npm run dev`. O servidor abre exclusivamente em
`http://127.0.0.1:3001`. `HELP_FAMILY_PORT` permite escolher outra porta local.
`HELP_FAMILY_DATA_DIR` permite escolher outro diretório de dados, usado pelos
testes. Nenhuma dessas opções permite escutar em interfaces externas.

O primeiro início cria banco vazio e chave local se não houver banco. Os dados
de exemplo só são usados explicitamente nos testes. A instalação migrada recebe
os registros da instalação anterior, sem misturá-los com exemplos novos.

## Importar o banco antigo

```bash
npm run migrate:legacy
```

O comando procura um único banco D1 contendo `family_state` dentro de
`legacy/.wrangler/state/v3/d1/`, lê a chave em `legacy/.dev.vars`, abre o banco
antigo em modo somente leitura e cria um backup consistente com a API SQLite.
O payload é descriptografado em memória, validado e importado em uma transação
para as novas tabelas. Os conteúdos são criptografados com a chave do banco novo.

O banco de destino só pode estar vazio, com revisão zero. Reexecutar o comando
em uma instalação já importada é recusado. O script não apaga nem sobrescreve
o banco e a chave antigos. O estado com IDs e vínculos originais é preservado;
rotinas sem o campo `active` recebem o valor equivalente `true`.

Antes desta migração, uma cópia dos fontes, banco antigo e chave foi preservada
localmente em `.git/help-family-backups/`. Esses backups não fazem parte de um
clone do repositório. Os backups adicionais de dados ficam em `data/backups/`.

## Backup da versão nova

```bash
npm run backup
```

O comando usa a API de backup online do SQLite, incluindo dados confirmados no
WAL, e copia a chave correspondente para uma subpasta datada de `data/backups/`.
Pode ser executado com a aplicação aberta. Guarde o par `help-family.sqlite` e
`encryption.key`; o banco sozinho não permite recuperar os conteúdos cifrados.

Para restaurar: encerre o servidor, preserve uma cópia de `data/`, separe o banco
atual e seus arquivos `-wal`/`-shm`, e restaure o banco e a chave do mesmo backup.
Inicie novamente e confira os registros. Nunca misture a chave de um backup com
o banco de outro. O backup deve receber a mesma proteção de acesso do banco ativo.

## Testes

```bash
npm test
npx playwright install chromium
npm run test:browser
npm run build
npm run format:check
```

Os testes de API criam bancos temporários. Os testes do navegador iniciam uma
instalação descartável em `127.0.0.1:3011`, com dados fictícios. Nenhum teste
precisa alterar o banco real de `data/` ou consultar um serviço externo.
O download inicial das ferramentas/dependências é separado da execução local.

## Pendências explícitas da transição

- Integrar a interface nova ao armazenamento e digitalizador do Android.
- Portar, se desejado, o modo de demonstração isolado para a interface nova.
- Substituir gradualmente a leitura agregada por consultas paginadas se o volume
  de registros exigir isso.

As automações antigas foram arquivadas em `legacy/.github/workflows/`.
O projeto continua destinado exclusivamente a localhost, sem publicação.
