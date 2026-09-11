# Interface web

A migração usa HTML, CSS e JavaScript nativos, preservando a identidade visual da
versão anterior. As referências estão em `legacy/app/page.tsx`,
`legacy/app/globals.css` e nas capturas de `legacy/docs/assets/`.
O frontend atual não importa código de `legacy/` em execução.

## Organização dos estilos

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
módulo em `frontend/js/pages/`; alterações específicas devem ficar no arquivo CSS
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
