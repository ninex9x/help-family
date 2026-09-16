# Revisão de dependências — 16/09/2026

Os três alertas abertos no GitHub estavam em `legacy/package-lock.json`.
O `npm audit` da raiz não apontou vulnerabilidades conhecidas. A revisão do
legado identificou ainda um segundo aviso de Browserslist e um aviso de fflate.
Pacotes intermediários também aparecem no relatório do npm por dependerem
dessas versões vulneráveis; não representam necessariamente falhas distintas.

## Correções

| Pacote no legado           | Antes                            | Depois             | Avisos corrigidos                                                                                                                                           |
| -------------------------- | -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sharp`                    | 0.35.2, além de uma cópia 0.35.4 | 0.35.4 deduplicado | [libheif](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)                                                                                                |
| `browserslist`             | 4.28.2                           | 4.29.0             | [Estatísticas não confiáveis](https://github.com/advisories/GHSA-73wf-gq98-2v4g), [crescimento de cache](https://github.com/advisories/GHSA-c83g-rgw3-j3cx) |
| `baseline-browser-mapping` | 2.10.30                          | 2.11.24            | [Encerramento por entrada inválida](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv)                                                                      |
| `fflate`                   | 0.7.4                            | 0.7.5              | [Loop em ZIP64 malformado](https://github.com/advisories/GHSA-px8p-9vwx-vf98)                                                                               |

Para receber `sharp` corrigido pela cadeia oficial de dependências, foram
atualizados `@cloudflare/vite-plugin` de 1.54.2 para 1.54.10 e `wrangler` de
4.127.1 para 4.132.0. Ambos usam `miniflare` 5.20260915.0-alpha, que fixa
`sharp` 0.35.4. O legado já usava uma versão alpha de Miniflare antes da revisão.

`@cloudflare/workers-types` passou de 5.20260829.1 para 5.20260915.1 para atender
à dependência compatível exigida pelo Wrangler. A autorização de instalação de
`workerd` acompanha a nova versão 1.20260915.1. Não foram usados `--force`,
`--legacy-peer-deps` nem substituições de dependências com `overrides`.

O lock foi regenerado pelo npm e inclui atualização dos dados de navegadores e
deduplicação de pacotes transitivos. As dependências e o código da aplicação
atual na raiz permanecem iguais. O legado continua arquivado durante a migração;
essas ferramentas são usadas apenas para compilação e execução local.

## Validação reproduzível

Na raiz:

```sh
npm audit
npm run build
npm run format:check
```

Em `legacy/`:

```sh
npm ci
npm audit
npm run typecheck
npm run lint
npm test
```

O teste do legado compila os bundles locais e executa seus testes de renderização,
estado, criptografia e demonstração. Não publica a aplicação nem executa deploy.
Não houve validação em aparelho Android nesta revisão.

O ESLint passou a ignorar `legacy/demo-dist/`, saída gerada pelo build já excluída
do Git. Isso permite executar o lint também depois dos testes, sem analisar
JavaScript minificado de terceiros. As regras dos arquivos-fonte foram preservadas.

Resultado desta revisão: auditorias da raiz e do legado sem vulnerabilidades
conhecidas; instalação limpa do legado, 10 testes, typecheck e builds aprovados.
O lint terminou sem erros, com três avisos existentes sobre o uso de `<img>` no
legado. O build da aplicação atual e a verificação de formatação também passaram.
