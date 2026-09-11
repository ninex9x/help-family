/** Rotas locais por fragmento; mantém voltar/avançar do navegador sem framework. */
export const navigation = [
  ['today', 'Hoje', 'today'],
  ['family', 'Familiares', 'family_restroom'],
  ['medicines', 'Medicamentos', 'medication'],
  ['history', 'Histórico', 'history'],
  ['documents', 'Documentos', 'description'],
];
export function currentPage() {
  const page = location.hash.slice(1);
  return navigation.some(([id]) => id === page) ? page : 'today';
}
export function navigate(page) {
  location.hash = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
