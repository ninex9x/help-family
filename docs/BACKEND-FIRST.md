# Regras e validação no backend

O servidor é a autoridade para dados, permissões, cálculos e HTML das telas.
O frontend clínico mantém apenas navegação, tema, foco, diálogos, transporte HTTP
e exibição de arquivos. Não guarda uma cópia do estado clínico, não calcula agenda
ou percentuais e não transforma os campos em decisões de negócio.

## Limite entre as duas partes

| Responsabilidade                                                  | Onde executa                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------------- |
| Autenticação, sessão, autorização e isolamento das famílias       | Backend e PostgreSQL                                        |
| Cadastro/login, lista e seleção de famílias                       | HTML renderizado no backend; formulários nativos            |
| Agenda, dose pendente, progresso, histórico e paginação           | `backend/web/pages/`                                        |
| Formulários, opções de apresentações e pré-requisitos de cadastro | `backend/web/components/forms.js` e `backend/web/routes.js` |
| Normalização de textos, iniciais, horários e instrução padrão     | `backend/services/web-actions.js` e `family.js`             |
| Integridade relacional, revisão, transação e criptografia         | Serviços, repositórios e SQL                                |
| Data/hora da confirmação e vínculo do familiar à dose             | `backend/services/web-actions.js`                           |
| Tamanho/conteúdo de arquivos e recorte de foto                    | `backend/services/uploads.js`                               |
| Seleção visual, tema, foco, diálogos e envio dos campos           | `frontend/js/`                                              |
| Desenhar páginas do PDF e mostrar uma imagem/texto                | Visualizador do navegador; arquivo solicitado ao backend    |

O navegador inevitavelmente desenha a interface e captura cliques/entradas. Esses
comportamentos não concedem acesso nem validam regras de negócio. Os formulários
usam `novalidate`: erros são decididos no servidor. Atributos de acessibilidade,
tipos de campo e filtros do seletor de arquivo são conveniências visuais, não
proteções confiáveis. Alterar o HTML ou chamar a API diretamente não contorna
as regras do servidor.

## Telas clínicas durante a transição

O site clínico em **localhost:3001 continua usando SQLite local, sem login**.
Não fica protegido pela sessão da aplicação de contas, que roda em localhost:3002.
Não há ponte automática entre seus dados e uma conta recém-criada. Esta separação
é temporária até migrar os recursos clínicos com autorização por família.

O site recebe fragmentos HTML prontos de `/api/views/:page`, com a revisão do banco.
Filtros são parâmetros de consulta e são processados pelo servidor. O frontend
descarta respostas antigas quando há buscas concorrentes, para não mostrar um
filtro ultrapassado. Nenhuma tela chama mais `/api/state`.

O estado SQLite agregado ainda existe para compatibilidade de ferramentas locais.
A validação das gravações ainda percorre o estado no servidor. Portanto esta
mudança reduz dados e regras enviados ao navegador, mas não resolve sozinha o
custo de todas as operações SQLite. A migração clínica para PostgreSQL segue
dependente de consultas específicas e testes por família.

As listagens de tela excluem `documents.data_url` no SQL, sem ler ou descriptografar
o conteúdo dos arquivos. `/api/file-info/:id` retorna só os metadados necessários
ao visualizador. `/api/files/:id` busca somente o documento escolhido. No navegador,
PDF.js desenha o PDF, imagens usam um elemento de imagem e TXT usa `textContent`.
O conteúdo de um TXT nunca vira HTML executável.

## Comandos clínicos

- `POST /api/actions/forms/:kind`: recebe os valores do formulário e arquivos
  serializados; aceita somente os campos daquele formulário. `?id=...` identifica
  uma edição. Retorna a revisão confirmada.
- `POST /api/actions/doses`: recebe somente `routineId`, `scheduledTime` e `status`.
  O backend busca o familiar da rotina, recusa rotina inativa/horário inexistente
  e determina a data e o horário da confirmação. Campos extras são recusados.
- `POST /api/actions/routines/:id/toggle`: corpo `{}`; o servidor busca o valor
  atual e muda a ativação com verificação da revisão.

Todos exigem `If-Match` e validam antes de confirmar uma transação. A aplicação
não tenta resolver conflitos de revisão silenciosamente. A API REST anterior
continua aceitando registros históricos explícitos para compatibilidade; o
comando da agenda usa exclusivamente o relógio do servidor.

O fuso padrão da agenda e das confirmações é `America/Sao_Paulo`. Configure
`HELP_FAMILY_TIME_ZONE` no processo backend para outro fuso IANA, antes de iniciar.
Não inferir data, horário ou identidade a partir de um valor calculado no cliente.

## Arquivos

Arquivos novos são enviados em data URL base64. O backend exige base64 canônico,
mede os bytes decodificados e valida o formato anunciado. Documentos são limitados
a 1.000.000 bytes. PDF exige cabeçalho e marcador de final; PNG/JPEG/WEBP têm suas
assinaturas verificadas; TXT exige UTF-8 válido sem bytes nulos. Essa verificação
estrutural não é antivírus nem uma análise completa de toda instrução de um PDF.

Fotos de até 12.000.000 bytes são decodificadas pelo Sharp, com limite de 40 milhões
de pixels, e recodificadas como JPEG de 640×640. A operação recorta no centro,
corrige orientação e remove metadados. Há até duas operações simultâneas por
processo. O limite HTTP de 17 MiB acomoda base64; o limite real de cada arquivo
continua sendo verificado separadamente. Informar um `fileSize` falso não reduz
o tamanho calculado pelo servidor.

As proteções de upload são compartilhadas entre os comandos de formulário e as
rotas REST. As ferramentas de importação são operações internas distintas, com
validação de estado e planejamento de compatibilidade dos arquivos antigos.

## Contas sem JavaScript

Em **localhost:3002**, cadastro, login, seleção/criação/edição de famílias e logout
usam HTML completo e formulários HTTP convencionais. As rotas chamam os mesmos
serviços e validadores da API JSON. Não existe validação ou permissão implementada
em um script de login.

Escritas autenticadas exigem sessão e `_csrf`; a versão da família é um campo
oculto validado no servidor. A presença desses campos não é confiável por si só:
o backend compara o token e a versão, identifica o usuário pela sessão e verifica
o vínculo no PostgreSQL. O cookie usa `Path=/` para autenticar páginas e API;
o cookie antigo em `/api` é removido na autenticação/logout.

Uma CSP bloqueia scripts nas páginas de contas. `Referrer-Policy: same-origin`
preserva a origem dos formulários nativos e não envia referências a outros sites.
Não aceitar `Origin: null` para contornar problemas de formulário. Respostas de
erro mostram a mensagem do servidor e não preenchem novamente a senha.

## Validação e manutenção

`npm test` verifica comandos adulterados, campos/relacionamentos inválidos,
datas/horários, bytes reais de upload, recodificação da foto e consultas de HTML
sem conteúdo de documentos. `npm run test:browser` verifica os fluxos clínicos,
tema e responsividade com dados fictícios. `npm run test:accounts` inclui uma
navegação real com **JavaScript desativado**, além de isolamento, CSRF, permissões
e conflitos de versão. Os testes usam apenas localhost e bancos descartáveis.

Ao adicionar uma regra, coloque-a no serviço/validador do backend e teste também
a chamada HTTP sem a interface. Templates podem apresentar decisões tomadas no
servidor; scripts do navegador não devem duplicar regras clínicas ou de acesso.
Documentação, exemplos e capturas de teste devem usar somente dados fictícios;
credenciais, bancos e documentos privados permanecem fora do Git.
