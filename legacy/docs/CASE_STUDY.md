# Estudo de caso — help-family

## Visão geral

O help-family é uma aplicação local-first para organizar medicamentos, doses e
documentos de saúde de diferentes familiares. A mesma interface React atende o
navegador local e o aplicativo Android, enquanto cada plataforma usa o mecanismo
de armazenamento seguro mais adequado ao seu ambiente.

O projeto demonstra desenvolvimento full stack e mobile: interface responsiva,
modelagem de domínio, validação de dados, concorrência otimista, criptografia,
integração nativa com Android, testes e automação de segurança.

## Problema

Rotinas de medicação familiares combinam horários, apresentações diferentes do
mesmo medicamento, registros históricos e documentos potencialmente sensíveis.
Uma solução útil precisava manter essas relações consistentes sem exigir conta,
nuvem ou exposição de dados médicos a um serviço público.

Os principais requisitos foram:

- separar medicamentos, apresentações e regras de uso por familiar;
- registrar doses tomadas ou não tomadas sem perder o histórico;
- impedir referências quebradas e estados maiores que os limites aceitos;
- proteger gravações concorrentes contra sobrescrita silenciosa;
- armazenar fotos, estado e documentos de forma cifrada;
- funcionar no navegador local e offline no Android;
- manter o repositório e a interface auditáveis sem expor dados reais ou um
  serviço público de saúde.

## Solução

```text
Navegador local
        │
        ├──> interface React ──> API local ──> validação ──> AES-256-GCM ──> D1 local
        │
Android WebView
        └──> interface React ──> bridge nativa ──> Android Keystore + arquivos cifrados
                                      └────────> scanner multipágina

GitHub Pages
        └──> interface React ──> API simulada ──> sessionStorage da aba
```

O domínio compartilhado valida o estado completo e suas relações antes da
persistência. No navegador, a API local controla revisão e criptografia. No
Android, uma bridge restrita conecta a interface empacotada ao Keystore e ao
scanner de documentos.

## Decisões técnicas

### Interface compartilhada

A experiência principal permanece em React. O build web atende o servidor
local, uma entrada Vite gera os mesmos recursos para a WebView Android e outra
gera a demonstração estática. Isso evita manter interfaces diferentes e reduz
divergências entre plataformas.

### Estado validado como unidade

Familiares, medicamentos, apresentações, regras, registros e documentos formam
um único estado validado. Identificadores, tamanhos, datas e relacionamentos são
verificados antes de qualquer gravação.

### Concorrência otimista

Cada snapshot local possui uma revisão. Uma atualização baseada em revisão
antiga recebe conflito HTTP 409, evitando que duas abas sobrescrevam mudanças
sem aviso.

### Criptografia específica por plataforma

O backend local usa AES-256-GCM com uma chave criada na primeira execução e
mantida fora do Git. No Android, a chave AES é não exportável e fica no Android
Keystore; estado e documentos são cifrados antes de chegar ao armazenamento.

### Aplicação real local e demonstração isolada

O servidor real aceita somente hosts locais, e o Android funciona com recursos
empacotados. Para avaliação técnica, o GitHub Pages entrega uma demonstração
estática que troca a API por armazenamento temporário na sessão do navegador.
Ela contém apenas dados fictícios e não acessa backend, D1, chave de
criptografia ou documentos da aplicação local.

## Segurança e privacidade

- `.dev.vars`, bancos, APKs, certificados e artefatos gerados são ignorados;
- estado e documentos são cifrados em repouso;
- a API local valida origem, host, revisão e estrutura dos dados;
- a WebView bloqueia navegação externa, conteúdo misto e recursos não locais;
- backups Android estão desabilitados;
- CI e GitHub executam varredura de segredos em cada alteração pública;
- exemplos, testes, documentação e demonstração usam somente dados fictícios;
- a demonstração mantém alterações apenas em `sessionStorage`, sem backend.

## Qualidade

A suíte automatizada cobre validação do domínio, relacionamentos, limites,
renderização da aplicação, criptografia e adulteração do cofre local. O CI
executa typecheck, lint, testes, builds web/demo/mobile, compilação do APK e scan
do histórico Git. Um workflow independente publica apenas o artefato estático da
demonstração no GitHub Pages.

## Competências demonstradas

- TypeScript, React e arquitetura local-first;
- APIs, validação de domínio e concorrência otimista;
- AES-GCM, gestão de chaves e privacidade de dados;
- Cloudflare D1 local e Drizzle ORM;
- integração Java/Android, WebView, Keystore e ML Kit;
- design responsivo, acessibilidade e temas claro/escuro;
- testes automatizados, GitHub Actions e documentação pública.

## Próximos passos

As evoluções planejadas estão em [ROADMAP.md](ROADMAP.md). O foco permanece em
acessibilidade, testes ponta a ponta e opções seguras de backup local, sem
transformar a aplicação em um serviço hospedado.
