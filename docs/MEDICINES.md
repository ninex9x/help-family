# Medicamentos e apresentações por família

Em **http://127.0.0.1:3002**, entre na conta, abra a família e selecione
**Ver medicamentos**. É possível cadastrar e editar medicamentos e suas
apresentações. Cada cartão reúne as apresentações do medicamento; selecionar
uma apresentação abre sua edição. As telas são geradas pelo backend e funcionam
com JavaScript desativado, preservando cartões, paleta e tipografia do site.

Esta etapa entrega o catálogo. A integração com familiares e horários já está
disponível em [Rotinas](ROUTINES.md). A [agenda e o histórico de doses](DOSES.md) também estão integrados;
os documentos continuam como próxima etapa.
O catálogo não calcula doses nem recomenda tratamentos. Não há exclusão ou
transferência de registros nesta etapa. O site SQLite da porta 3001 continua
independente; nenhum dado antigo é importado automaticamente.

## Organização do código

```text
backend/modules/medicines/
  validation.js                 Campos, limites e cores permitidas
  repository.js                 SQL parametrizado e consultas por família
  service.js                    Permissões, cifras, quotas e versões
  routes.js                     Contrato HTTP, sessão e CSRF
backend/web/accounts/medicines/
  routes.js                     Formulários e erros processados no backend
  templates.js                  Cartões e HTML dos formulários
backend/database/postgres/migrations/003_medicines.sql
frontend/css/pages/medicines.css  Estilo original reutilizado
frontend/css/pages/catalog.css   Complementos para o catálogo SSR
tests/accounts/medicines.test.js
tests/accounts/medicines-web.test.js
```

As rotas HTML e JSON chamam os mesmos serviços/validadores. IDs da família e do
medicamento vêm do caminho, mas só são usados após verificar a sessão e o vínculo.
O corpo não pode informar proprietário, usuário, família ou medicamento de destino.
Nome, cor, concentração e apresentação são sempre validados no servidor.

## Permissões, persistência e concorrência

| Ação                                   | Proprietário | Cuidador | Leitor |
| -------------------------------------- | ------------ | -------- | ------ |
| Consultar medicamentos e apresentações | Sim          | Sim      | Sim    |
| Cadastrar e editar ambos               | Sim          | Sim      | Não    |

Um vínculo inativo perde acesso imediatamente. Famílias sem vínculo retornam 404,
inclusive quando o solicitante conhece IDs reais. Leitores não veem os controles
de edição e também são bloqueados nas rotas HTML/JSON e nas políticas RLS.

As tabelas `medicines` e `medicine_presentations` usam RLS. A chave estrangeira
composta `(family_id, medicine_id)` impede associar uma apresentação a um
medicamento de outra família, inclusive em SQL direto. O papel da aplicação não
pode alterar IDs/vínculos nem excluir registros. As consultas combinam família,
medicamento e apresentação quando necessário.

O conteúdo fica em `content_ciphertext`, com AES-256-GCM e a mesma chave clínica
privada do PostgreSQL: `data/postgres/clinical.key`. O contexto autenticado distingue
tipo de registro, família, ID e, para apresentações, medicamento. Trocar cifras
entre registros causa erro; a API não expõe detalhes criptográficos. IDs, vínculos,
versões e datas permanecem como metadados SQL. Isso não protege contra quem controla
o computador e consegue ler banco e chave.

Há limite de **100 medicamentos por família** e **20 apresentações por medicamento**.
A criação serializa a conferência da quota na transação; duas criações simultâneas
não ultrapassam o limite. O catálogo faz duas consultas de conteúdo: medicamentos
da família e suas apresentações, agrupadas no servidor. Não carrega familiares,
fotos, documentos ou o estado global. A listagem tem ordem estável por criação/ID,
sem busca textual ou paginação nesta etapa.

Cada medicamento e cada apresentação tem sua própria `version`. Uma edição só
grava se a versão enviada ainda for a atual; caso contrário, retorna 409. Editar
uma apresentação não incrementa a versão do medicamento. A tela de conflito exige
abrir a versão atual antes de uma nova tentativa, sem sobrescrever silenciosamente
a mudança de outra pessoa.

## Contrato da API

Prefixo: `/api/families/:familyId/medicines`. Todas as rotas exigem sessão e vínculo
ativo. Escritas exigem origem exata, `Content-Type: application/json` e
`X-CSRF-Token`; PATCH exige `If-Match`, por exemplo `"1"`. JSON mantém limite de
16 KiB. UUIDs são normalizados para minúsculas antes das operações.

| Método e caminho                           | Entrada                                      | Sucesso                                                          |
| ------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------------- |
| `GET /`                                    | Sessão                                       | 200, `{ items: [...] }`, com `presentations` em cada medicamento |
| `GET /:id`                                 | Sessão                                       | 200, `{ item: ... }`, medicamento sem apresentações embutidas    |
| `POST /`                                   | `name`, `color` opcional                     | 201, `{ item: ... }`                                             |
| `PATCH /:id`                               | Parte dos campos do medicamento, `If-Match`  | 200, nova versão                                                 |
| `GET /:id/presentations/:presentationId`   | Sessão                                       | 200, `{ item: ... }`                                             |
| `POST /:id/presentations`                  | `strength`, `form`                           | 201, `{ item: ... }`                                             |
| `PATCH /:id/presentations/:presentationId` | Parte dos campos da apresentação, `If-Match` | 200, nova versão                                                 |

`name` é obrigatório ao criar, com 1–160 caracteres após trim. `color` deve estar
na paleta de `validation.js`; o padrão é `#016b54`. `strength` (concentração/dosagem)
e `form` (apresentação) são textos obrigatórios de 1–80 caracteres após trim.
Caracteres de controle, tipos incorretos, campos desconhecidos e PATCH vazio são
recusados com 422. Os valores são registros informados pelo usuário; não há
conversão de unidades ou validação farmacológica.

Respostas acrescentam `id`, `familyId` e `version`; apresentações também contêm
`medicineId`. Não incluem cifras, chave ou identidades de outros usuários. Erros
seguem o [contrato de contas](ACCOUNTS.md): 401 sessão, 403 permissão/CSRF/origem,
404 ausência/escopo, 409 conflito, 422 validação/quota e 428 versão ausente/inválida.

## Formulários HTML

Em `/families/:familyId/medicines`, `/new` cadastra medicamento e `/:id/edit` edita.
`/:id/presentations/new` cadastra uma apresentação e
`/:id/presentations/:presentationId/edit` edita. O medicamento fica fixo no caminho
e aparece pelo nome no formulário; não há seletor que permita mudar o vínculo.

POST usa o caminho correspondente sem `/new` ou `/edit`, com formulário convencional
`application/x-www-form-urlencoded`, `_csrf` e, nas edições, `version`. A CSP não
permite scripts. Erros de validação preservam os campos; sucesso redireciona com
303 para o catálogo. Login continua público, sem menu lateral.

## Atualização local e recuperação

Execute `npm run db:setup` para aplicar `003_medicines.sql` e reinicie
`npm run dev:accounts`. Migrações anteriores não são alteradas. O setup não gera
uma chave substituta se houver conteúdo em `members`, `medicines` ou
`medicine_presentations`, mesmo que o banco não tenha familiares acompanhados.

Backup/restauração PostgreSQL ainda precisa ser implementado e ensaiado antes da
importação do acervo. `npm run backup` continua exclusivo do SQLite. Preserve a
chave junto do banco correspondente; não versione credenciais, chaves ou dados.
Tudo executa somente em localhost; não há implantação nem serviços externos.

## Testes

`npm run test:accounts` cria bancos descartáveis com identidades fictícias. Testa
cadastro/edição, criptografia, RLS, chave estrangeira entre famílias, vínculos
imutáveis, leitor/cuidador, revogação, campos adulterados, origem/CSRF, quotas sob
concorrência, versões independentes e chave ausente com apenas medicamentos salvos.
O navegador testa os formulários sem JavaScript, escapes de HTML, leitura sem
controles de edição, conflitos e largura dos cartões em celular/tablet. Capturas
de teste ficam em `test-results/`, ignorado pelo Git.
