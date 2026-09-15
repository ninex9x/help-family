/** Arquivos locais organizados por familiar e categoria, com ações acessíveis por cartão. */
import {
  button,
  escapeHtml as e,
  icon,
  filterChips,
  dateLabel,
  categoryLabels,
} from '../components/ui.js';
export function renderDocuments(state, ui) {
  const search = ui.documentSearch.toLocaleLowerCase('pt-BR');
  const entries = state.documents
    .filter(
      (d) =>
        (ui.documentMember === 'all' || d.memberId === ui.documentMember) &&
        (ui.documentCategory === 'all' || d.category === ui.documentCategory),
    )
    .filter((d) =>
      [d.title, d.fileName, state.members.find((m) => m.id === d.memberId)?.name ?? ''].some(
        (value) => value.toLocaleLowerCase('pt-BR').includes(search),
      ),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return /* HTML */ `<section class="documents-page">
    <header class="documents-page-heading">
      <div>
        <h1>Meus Documentos</h1>
        <p>Receitas, exames e atestados em um só lugar.</p>
      </div>
      ${button(`${icon('upload_file')}Adicionar Documento`, 'document-new')}
    </header>
    <section class="document-filters-panel">
      <label class="document-search"
        >${icon('search')}<input
          type="search"
          aria-label="Buscar documentos"
          placeholder="Buscar documento ou familiar"
          data-search="documentSearch"
          value="${e(ui.documentSearch)}"
      /></label>
      <div class="document-member-filter">
        <span>Familiar</span>
        <div>
          ${filterChips([{ id: 'all', name: 'Todos os familiares' }, ...state.members], ui.documentMember, 'documentMember')}
        </div>
      </div>
      <div class="document-type-filter">
        <span>Tipo de documento</span>
        <div class="document-filter-tabs">
          ${filterChips(
            Object.entries({ all: 'Todos', ...categoryLabels }).map(([id, name]) => ({ id, name })),
            ui.documentCategory,
            'documentCategory',
          )}
        </div>
      </div>
    </section>
    <div class="document-grid">
      ${
        entries
          .map(
            (doc) =>
              /* HTML */ `<article class="document-card ${e(doc.category)}">
                <div class="document-card-top">
                  <span class="document-type-icon"
                    >${icon({ prescription: 'description', exam: 'science', certificate: 'medical_information' }[doc.category])}</span
                  ><span class="document-category-badge">${categoryLabels[doc.category]}</span>
                </div>
                <div class="document-card-copy">
                  <h2 title="${e(doc.title)}">${e(doc.title)}</h2>
                  <p>
                    ${icon('person')}${e(state.members.find((m) => m.id === doc.memberId)?.name)}
                  </p>
                </div>
                <footer>
                  <time datetime="${e(doc.date)}">${dateLabel(doc.date)}</time>
                  <div class="document-card-actions">
                    <button
                      data-action="document-download"
                      data-id="${e(doc.id)}"
                      aria-label="Baixar documento ${e(doc.title)}"
                    >
                      ${icon('download')}</button
                    ><button
                      data-action="document-view"
                      data-id="${e(doc.id)}"
                      aria-label="Visualizar ${e(doc.title)}"
                    >
                      ${icon('visibility')}
                    </button>
                  </div>
                </footer>
              </article>`,
          )
          .join('') ||
        `<div class="document-empty-card"><span>${icon('folder_open')}</span><h2>Nenhum documento encontrado</h2><p>Altere os filtros ou adicione um arquivo da família.</p></div>`
      }
    </div>
    <p class="documents-local-note">
      ${icon('lock')}Seus documentos ficam armazenados neste computador.
    </p>
  </section>`;
}
