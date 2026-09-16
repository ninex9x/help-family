# Familiares acompanhados no PostgreSQL

Esta entrega adiciona cadastro, consulta e edição de familiares em
**http://127.0.0.1:3002**. Entre na conta, abra uma família e escolha **Ver familiares**.
O familiar acompanhado é um perfil de cuidado; não cria uma conta nem concede
acesso ao sistema. Uma conta pode ter vínculos com várias famílias.

## Funcionalidades e permissões

| Operação                            | Proprietário | Cuidador | Leitor |
| ----------------------------------- | ------------ | -------- | ------ |
| Consultar perfis e fotos da família | Sim          | Sim      | Sim    |
| Cadastrar e editar familiares       | Sim          | Sim      | Não    |
| Enviar, substituir e remover foto   | Sim          | Sim      | Não    |

O [catálogo de medicamentos e apresentações](MEDICINES.md) já foi integrado.
As [rotinas e horários por familiar](ROUTINES.md) também estão integradas.
Excluir/transferir perfis, convidar usuários, registro de doses e
documentos ainda não fazem parte desta entrega. Os vínculos de cuidador/leitor
existem no modelo e são exercitados em bancos descartáveis pelos testes; ainda
não há uma tela para compartilhar a família. O site SQLite da porta 3001 continua
independente, com seus dados anteriores. Não existe importação automática.

O backend limita cada família a 100 familiares, serializando a verificação durante
o cadastro. A consulta tem ordem estável por criação/ID e não retorna fotos em
base64. A edição usa uma versão individual: duas gravações concorrentes com a
mesma versão resultam em um sucesso e um conflito 409. No formulário, o conflito
exige abrir a versão atual antes de editar novamente.

## Organização

```text
backend/modules/members/
  routes.js       API, sessão, CSRF e contrato HTTP
  validation.js   Campos permitidos, limites e paleta
  service.js      Permissões, transações, criptografia, foto e concorrência
  repository.js   SQL parametrizado sempre limitado à família
  upload.js       Multipart com limites, sem gravar arquivos brutos no disco
backend/web/accounts/members.js                 Telas SSR e formulários
backend/database/postgres/migrations/002_members.sql  Tabela e políticas RLS
frontend/css/pages/members.css                  Complementos do estilo existente
scripts/postgres/clinical-key.js                Preparação segura da chave privada
tests/accounts/members.test.js                 API, RLS, fotos e criptografia
tests/accounts/members-web.test.js             Navegação sem JavaScript
```

HTML e API usam o mesmo serviço e validador. A identidade vem exclusivamente da
sessão. Os cartões reutilizam os estilos existentes, com nome, vínculo, observações,
foto e edição. Login e cadastro mantêm seu layout público sem menu lateral.
Não há script no navegador para permissões, validação, recorte de fotos ou
persistência. A CSP permite imagens da mesma origem e bloqueia scripts.

## API implementada

Prefixo: `/api/families/:familyId/members`. Todas as rotas exigem sessão e vínculo
ativo; IDs desconhecidos ou de famílias sem acesso retornam 404. Escritas exigem
origem exata e `X-CSRF-Token`. Edições também exigem `If-Match`, por exemplo `"1"`.
IDs UUID aceitam letras maiúsculas e são normalizados antes do uso criptográfico.

| Método e caminho    | Entrada                                      | Sucesso                           |
| ------------------- | -------------------------------------------- | --------------------------------- |
| `GET /`             | Sessão                                       | 200, `{ items: [...] }`           |
| `GET /:id`          | Sessão                                       | 200, `{ item: ... }`              |
| `POST /`            | JSON do perfil                               | 201, `{ item: ... }`              |
| `PATCH /:id`        | JSON parcial, `If-Match`                     | 200, `{ item: ... }`              |
| `GET /:id/photo`    | Sessão                                       | 200, JPEG; 404 se não houver foto |
| `POST /:id/photo`   | Multipart com um arquivo `photo`, `If-Match` | 200, perfil com nova versão       |
| `DELETE /:id/photo` | JSON `{}`, `If-Match`                        | 200, perfil com nova versão       |

Campos do perfil:

| Campo          | Regra no servidor                                          |
| -------------- | ---------------------------------------------------------- |
| `name`         | Obrigatório ao criar; de 1 a 120 caracteres, sem controles |
| `relationship` | Opcional, até 80 caracteres                                |
| `medicalNotes` | Opcional, até 4.000 caracteres; preserva quebras de linha  |
| `color`        | Uma das seis cores de `validation.js`; padrão `#7c8f69`    |

Campos desconhecidos, identidade, família, versão no corpo JSON e base64 de foto
no perfil são recusados. PATCH exige ao menos um campo. A resposta acrescenta
`id`, `familyId`, `version` e `hasPhoto`; nunca inclui texto cifrado nem a chave.
JSON continua limitado a 16 KiB, incluindo sua codificação e escapes.

Fotos têm limite de 12 MB e aceitam JPG, PNG ou WEBP. O servidor verifica bytes,
limita a decodificação a 40 milhões de pixels e recodifica para JPEG quadrado
640 × 640, removendo metadados. O upload usa
[Multer somente nas rotas previstas](https://expressjs.com/en/resources/middleware/multer/),
com até dois envios ativos por processo, um arquivo e limites de campos/partes.
O MIME declarado não substitui a validação do conteúdo. Arquivos inválidos retornam
422, excesso de tamanho 413 e limite de trabalho 503. Fotos são entregues por
uma rota autenticada, com `Cache-Control: no-store`, sem URL pública.

## HTML e concorrência

`GET /families/:familyId/members` lista perfis. `/new` abre o cadastro e
`/:id/edit` abre a edição. Os POSTs para a coleção ou `/:id` usam formulário
multipart com `_csrf`, campos do perfil, foto opcional e, na edição, `version`.
`removePhoto=yes` remove a foto atual; remover e enviar simultaneamente é recusado.
Nome/observações e foto são persistidos na mesma transação do formulário: uma foto
inválida não salva parcialmente o perfil. Após erro de validação, é necessário
selecionar o arquivo novamente. Sucesso redireciona com 303 para a listagem.

## Persistência e chave

A tabela `members` guarda `family_id`, IDs, versão e datas em texto/tipos SQL.
O perfil (nome, vínculo, observações e cor) e a foto ficam em colunas cifradas com
AES-256-GCM. O contexto autenticado inclui família, ID e tipo de conteúdo: copiar
uma cifra para outro registro causa falha de autenticação. Esses campos não são
pesquisáveis por SQL; a consulta busca somente a família autorizada e decifra no
servidor. A criptografia não esconde o número de registros nem seus vínculos.

RLS permite leitura por vínculo ativo e INSERT/UPDATE somente por proprietário ou
cuidador. O papel da aplicação não pode mudar `id`/`family_id`, excluir registros
ou contornar RLS. As verificações de serviço e consultas por família complementam
as políticas SQL. O administrador local ainda controla banco e chaves.

`npm run db:setup` aplica a migração e prepara **data/postgres/clinical.key**
(32 bytes aleatórios, permissão 0600), independente de `data/encryption.key` do
SQLite. O setup preserva a chave existente e recusa gerar uma substituta quando
já há familiares, medicamentos ou apresentações no PostgreSQL. A aplicação exige uma chave de tamanho válido;
uma chave incorreta impede decifrar os dados e produz erro genérico na leitura.
Nunca gere uma chave nova para tentar corrigir uma falha de leitura.

Preserve banco PostgreSQL e chave correspondente juntos. O comando `npm run backup`
continua exclusivo do SQLite; backup/restauração PostgreSQL ainda precisa ser
implementado e ensaiado antes da importação do acervo. Chaves, credenciais,
dados, capturas e arquivos reais permanecem fora do Git. Não há implantação:
desenvolvimento e testes são exclusivamente em localhost.

## Validação

`npm run test:accounts` usa bancos descartáveis e identidades `example.invalid`.
Verifica isolamento com IDs conhecidos, acesso direto sob RLS, revogação, leitor
e cuidador, validação de campos, CSRF/origem, conflitos simultâneos, cifras trocadas,
chave ausente, fotos adulteradas/grandes e remoção. A navegação real cobre cadastro,
edição, foto e permissões sem JavaScript, com capturas desktop/celular em
`test-results/` (ignoradas pelo Git). Os testes não alteram os dados locais de uso.
