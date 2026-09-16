# Interface web

A migração usa HTML, CSS e JavaScript nativos, preservando a identidade visual da
versão anterior. As referências estão em `legacy/app/page.tsx`,
`legacy/app/globals.css` e nas capturas de `legacy/docs/assets/`.
O frontend atual não importa código de `legacy/` em execução.

## Organização dos estilos

As telas de contas em localhost:3002 reutilizam esses estilos com complementos em
`pages/accounts.css`, `pages/members.css`, `pages/catalog.css` e `pages/routines.css` e `pages/doses.css`. O catálogo
reutiliza também `pages/medicines.css`. O login não tem menu lateral. Os
familiares autenticados mantêm cartões, paleta e tipografia, exibindo somente as
ações integradas nesta etapa; não simulam doses ou documentos ainda não migrados.

| Arquivo                            | Responsabilidade                                                     |
| ---------------------------------- | -------------------------------------------------------------------- |
| `frontend/css/base.css`            | Paleta clara/escura, tipografia, reset e acessibilidade básica       |
| `frontend/css/layout.css`          | Barra lateral, navegação móvel e largura do conteúdo                 |
| `frontend/css/components.css`      | Botões, avatares, diálogos, visualizador e notificações              |
| `frontend/css/forms.css`           | Formulários, painel lateral de familiar e painel inferior móvel      |
| `frontend/css/pages/today.css`     | Seletor circular de familiares, progresso, destaque da dose e agenda |
| `frontend/css/pages/family.css`    | Cartões de familiares, progresso individual e atalhos                |
| `frontend/css/pages/medicines.css` | Catálogo em cartões, apresentações, regras e interruptores           |
| `frontend/css/pages/history.css`   | Filtros por botões, tabela e paginação                               |
| `frontend/css/pages/documents.css` | Busca, categorias e cartões de documentos                            |

`frontend/js/main.js` importa os estilos nessa ordem. Cada tela tem seu próprio
template no servidor em `backend/web/pages/`; alterações específicas devem ficar no arquivo CSS
correspondente. Evite reintroduzir regras dessas telas em `layout.css` ou
`components.css`, pois isso cria sobreposições difíceis de manter.

## Comportamentos preservados

- Hoje destaca a primeira dose pendente do familiar selecionado, indicando se o
  horário já passou. Doses tomadas e não tomadas continuam distintas; concluir os
  registros não significa que todas foram tomadas.
- O progresso considera os horários das regras ativas e os registros do dia.
- Cada medicamento aparece uma vez no catálogo, com suas apresentações e regras.
  Vincular já seleciona o medicamento do cartão; se faltar apresentação, abre seu
  cadastro. O interruptor só muda definitivamente após a confirmação da API.
- Atalhos do familiar selecionam os filtros correspondentes. Filtros em botões
  anunciam a seleção com `aria-pressed` e preservam o foco ao atualizar a tela.
- O painel de familiar e os demais formulários usam `<dialog>` nativo, com foco
  controlado, fechamento por Escape e rótulos acessíveis.

## Responsividade e validação

A navegação inferior substitui a lateral até 767 px. Grades passam de três para
duas ou uma coluna conforme o espaço disponível. Em tablets estreitos, familiares
e medicamentos usam uma coluna para manter os controles legíveis. A tabela de
histórico pode rolar dentro de sua região sem alargar a página inteira.

Execute `npm run test:browser` para validar os fluxos e as cinco telas em tamanhos
de celular, tablet e desktop, nos temas claro e escuro. As capturas geradas em
`test-results/restored-*.png` servem para conferência visual manual; não são um
comparador automático de pixels. O servidor de testes usa dados fictícios e um
banco temporário em `127.0.0.1:3011`. Capturas e banco não entram no Git.

O desenvolvimento normal continua em `http://127.0.0.1:3001`. Todo teste e execução
permanecem em localhost.

## Área de contas

Cadastro, login, escolha e edição de famílias ficam em localhost:3002, com HTML
gerado por `backend/web/accounts/`. Os formulários funcionam sem JavaScript e
mostram os erros retornados pelo servidor. Essas telas reutilizam `layout.css`,
`components.css`, `forms.css` e `pages/family.css`: mesma barra lateral de 256 px,
marca, cabeçalho móvel, cartões de 16 px de raio e campos de 56 px de altura na
área autenticada. **Login e cadastro têm layout público próprio**, com marca e
formulário centralizados, sem menu lateral nem navegação de aplicativo. Seguir a
identidade visual significa compartilhar cores, fonte e acabamento; não copiar
a estrutura do painel para telas que têm outra função.
`frontend/css/pages/accounts.css` contém apenas adaptações para os fluxos de conta
e os arquivos locais da fonte Inter, com os pesos 400, 500, 600 e 700.

A paleta escura é definida pelos tokens `--theme-dark-*` de `base.css`. As telas
clínicas aplicam esses valores por `data-theme`; as telas SSR usam a preferência
do sistema, sem JavaScript. Não criar uma paleta independente para contas nem
reescrever os cartões e a navegação em cada tela nova.

`npm run test:accounts` verifica o fluxo com JavaScript desativado. A revisão visual
inclui login, cadastro, lista e edição de família, em desktop e celular, nos dois
temas. As capturas usam contas fictícias e ficam em `test-results/`, fora do Git.
