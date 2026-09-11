# Como contribuir

Obrigado pelo interesse no help-family. O código é público para avaliação e
portfólio. A aplicação e os testes devem executar somente em localhost.

## Fluxo recomendado

1. Abra uma issue antes de iniciar mudanças maiores.
2. Crie uma branch curta e focada.
3. Implemente a alteração usando somente dados fictícios.
4. Execute toda a validação local.
5. Abra um pull request explicando problema, solução e evidências.

## Privacidade e segurança

- não inclua nomes, documentos, fotos ou informações médicas reais;
- não versione `.dev.vars`, bancos, backups, certificados, APKs ou builds;
- não conecte a demonstração à API real, D1, uploads ou qualquer backend;
- não use Sites nem adicione `project_id` a `.openai/hosting.json`;
- revise logs e capturas para remover caminhos e notificações pessoais;
- relate vulnerabilidades pelo canal privado em [SECURITY.md](SECURITY.md).

## Desenvolvimento

Na raiz do repositório:

```bash
npm ci
npm run dev
```

Antes de abrir um pull request:

```bash
npm run format:check
npm test
npm run test:browser
npm run build
```

O Android original está em `legacy/`. Mudanças nessa integração devem ser
validadas separadamente no dispositivo. No Windows, dentro de `legacy/`:

```powershell
npm run android:apk
```

Capturas de interface devem usar os dados fictícios incluídos no projeto.

Siga [a arquitetura](../docs/ARCHITECTURE.md) e atualize os guias ao alterar
contratos ou responsabilidades. Novas funcionalidades web ficam em `frontend/`
e `backend/`; `legacy/` é preservado durante a transição.
