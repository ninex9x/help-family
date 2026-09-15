# API local

Base: `http://127.0.0.1:3001/api`. JSON UTF-8. Respostas não são armazenadas em
cache. O servidor valida origem e Host e atende somente conexões locais.

Este é o contrato clínico SQLite. As contas/famílias PostgreSQL e suas telas em
localhost:3002 estão documentadas em [ACCOUNTS.md](ACCOUNTS.md).

## HTML e comandos utilizados pelo site

| Método | Caminho                           | Resultado                                                                                                 |
| ------ | --------------------------------- | --------------------------------------------------------------------------------------------------------- |
| GET    | `/views/:page`                    | `{ html, revision }`; páginas `today`, `family`, `medicines`, `history`, `documents`                      |
| GET    | `/forms/:kind`                    | `{ title, html, kind, revision, notice? }`; tipos `member`, `drug`, `presentation`, `routine`, `document` |
| GET    | `/forms/presentations?drugId=...` | Opções HTML do medicamento solicitado                                                                     |
| POST   | `/actions/forms/:kind?id=...`     | Campos crus e arquivos; `id` somente ao editar; retorna `{ revision }`                                    |
| POST   | `/actions/doses`                  | `{ routineId, scheduledTime, status }`; servidor define familiar, data e hora                             |
| POST   | `/actions/routines/:id/toggle`    | Corpo `{}`; servidor alterna o estado atual                                                               |
| GET    | `/file-info/:id`                  | `{ item: { id, title, fileName, mimeType } }`                                                             |
| GET    | `/files/:id`                      | Bytes do arquivo; `?download=1` força download com nome original                                          |

As telas não chamam `/state`. Cada comando de escrita exige `If-Match`. O
formulário recebe arquivos em `{ name, type, dataUrl }`; o servidor não confia no
MIME nem no tamanho declarado. Os filtros visuais vão na query de `/views/:page`:
`memberId`, `medicineMember`, `historyMember`, `historySearch`, `historyPage`,
`documentMember`, `documentCategory`, `documentSearch` e `theme`. Eles não alteram
registros nem concedem permissões. Veja [BACKEND-FIRST.md](BACKEND-FIRST.md).

## Endpoints

| Método | Caminho           | Resultado                                                   |
| ------ | ----------------- | ----------------------------------------------------------- |
| GET    | `/health`         | Estado do servidor, mecanismo de armazenamento e modo local |
| GET    | `/state`          | `{ state, revision }`, fotografia consistente dos cadastros |
| GET    | `/{recurso}`      | `{ items: [...] }`                                          |
| GET    | `/{recurso}/{id}` | `{ item: {...} }`                                           |
| POST   | `/{recurso}`      | Cria registro e retorna `{ item, revision }` com HTTP 201   |
| PATCH  | `/{recurso}/{id}` | Altera campos e retorna `{ item, revision }`                |
| DELETE | `/{recurso}/{id}` | Exclui registro e retorna `{ item: null, revision }`        |

Recursos: `members`, `medicines`, `presentations`, `routines`, `dose-logs` e
`documents`. Os IDs de novos registros são UUIDs gerados no servidor. O campo
`id` de um PATCH não muda a identidade do registro.

## Campos

| Recurso         | Campos principais                                                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `members`       | `name`, `relationship`, `initials`, `color`; opcionais: `photo`, `medicalNotes`                                       |
| `medicines`     | `name`, `color`                                                                                                       |
| `presentations` | `drugId`, `strength`, `form`                                                                                          |
| `routines`      | `drugId`, `presentationId`, `memberId`, `quantity`, `times`, `instruction`; opcional: `active`                        |
| `dose-logs`     | `routineId`, `memberId`, `date`, `scheduledTime`, `status`, `recordedAt`                                              |
| `documents`     | `memberId`, `title`, `category`, `date`, `fileName`, `mimeType`; opcionais: `dataUrl`, `fileSize`, `nativeDocumentId` |

Por compatibilidade, o estado agregado usa `drugs` para medicamentos e `logs`
para doses. As URLs públicas usam `medicines` e `dose-logs`.

Datas têm formato `AAAA-MM-DD`; horários, `HH:mm`. Status da dose: `taken` ou
`skipped`. Categorias de documento: `prescription`, `exam`, `certificate`.
Fotos são data URLs JPEG/PNG/WEBP; documentos aceitam também PDF e TXT.
Iniciais são derivadas do nome no servidor, inclusive se o cliente enviar outro
valor. Fotos novas são processadas no backend; `fileSize` de documentos com
conteúdo é recalculado pelos bytes reais. Novos uploads exigem base64 válido e
verificação de conteúdo. Documentos têm limite de 1 MB e fotos de entrada, 12 MB.

`PATCH /members/{id}` aceita `null` para remover `photo` ou `medicalNotes`.
Campos omitidos permanecem inalterados. Apagar um familiar com rotinas ou
documentos vinculados é recusado para preservar o histórico.

## Revisões e gravação

Toda alteração exige `Content-Type: application/json` e `If-Match: N`, em que
`N` é a revisão recebida em `/state` ou na última alteração confirmada.

```js
const snapshot = await fetch('/api/state').then((response) => response.json());
const response = await fetch('/api/members', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'If-Match': String(snapshot.revision),
  },
  body: JSON.stringify({
    name: 'Pessoa de exemplo',
    relationship: 'Irmã',
    initials: 'PE',
    color: '#016b54',
  }),
});
const result = await response.json();
if (!response.ok) throw new Error(result.error);
```

O serviço valida todos os relacionamentos antes de gravar. A alteração e o
incremento da revisão acontecem na mesma transação. Se houver falha, ambos são
desfeitos. `POST /dose-logs` atualiza a ocorrência já existente para a mesma
rotina/data/horário, evitando duas doses duplicadas.

## Erros

| Status | Significado                                                |
| ------ | ---------------------------------------------------------- |
| 400    | JSON ou corpo inválido                                     |
| 403    | Conexão, Host ou origem não permitidos                     |
| 404    | Recurso, registro ou endpoint inexistente                  |
| 409    | Revisão desatualizada ou conflito de integridade no SQLite |
| 413    | Corpo acima de 17 MiB                                      |
| 422    | Campos ou relacionamentos inválidos                        |
| 428    | Revisão não informada ou malformada                        |
| 500    | Falha interna, sem expor detalhes do banco ou chaves       |

Erros retornam `{ "error": "mensagem" }`. Em caso de HTTP 409 por revisão,
recarregue os dados antes de decidir reenviar a edição; não faça tentativas
automáticas que possam sobrescrever alterações de outra aba.
