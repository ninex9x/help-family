/** Apresenta documentos filtrados por familiar, categoria e busca textual. */
import {
  button,
  empty,
  escapeHtml as e,
  icon,
  memberFilter,
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
  return /* HTML */ `<section class="page-heading">
      <div>
        <span class="eyebrow">ARQUIVOS DA FAMÍLIA</span>
        <h1>Meus Documentos</h1>
        <p>Receitas, exames e atestados guardados neste dispositivo.</p>
      </div>
      ${button(`${icon('upload_file')}Adicionar Documento`, 'document-new')}
    </section>
    <section class="filter-bar">
      ${memberFilter(state, ui.documentMember, 'documentMember')}<label class="search-field"
        >${icon('search')}<input
          type="search"
          aria-label="Buscar documentos"
          placeholder="Buscar documento"
          data-search="documentSearch"
          value="${e(ui.documentSearch)}" /></label
      ><select aria-label="Categoria de documento" data-filter="documentCategory">
        ${Object.entries({ all: 'Todas as categorias', ...categoryLabels })
          .map(
            ([key, label]) =>
              /* HTML */ `<option value="${key}" ${key === ui.documentCategory ? 'selected' : ''}>
                ${label}
              </option>`,
          )
          .join('')}
      </select>
    </section>
    <div class="document-grid">
      ${
        entries
          .map(
            (doc) =>
              /* HTML */ `<article class="document-card">
                <div class="document-icon">
                  ${icon(doc.category === 'exam' ? 'science' : 'description')}
                </div>
                <span class="eyebrow">${categoryLabels[doc.category]}</span>
                <h2>${e(doc.title)}</h2>
                <p>${e(state.members.find((m) => m.id === doc.memberId)?.name)}</p>
                <small>${dateLabel(doc.date)}</small>
                <div class="document-card-actions">
                  ${button('Visualizar', 'document-view', doc.id, 'secondary-button')}${button(icon('download'), 'document-download', doc.id, 'icon-button')}
                </div>
              </article>`,
          )
          .join('') || empty('Nenhum documento encontrado.')
      }
    </div>`;
}
