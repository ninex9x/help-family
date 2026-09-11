/** Cliente HTTP: serializa gravações e só avança a revisão após confirmação do servidor. */
let revision = 0;
let pending = false;
export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Não foi possível concluir a operação.');
  return result;
}
export async function loadState() {
  const result = await request('/state');
  revision = result.revision;
  return result.state;
}
/** Atualiza um recurso e retorna a fotografia confirmada para renderização. */
export async function save(resource, body, id, method) {
  if (pending) throw new Error('Aguarde a gravação atual.');
  pending = true;
  try {
    const result = await request(`/${resource}${id ? `/${encodeURIComponent(id)}` : ''}`, {
      method: method || (id ? 'PATCH' : 'POST'),
      headers: { 'If-Match': String(revision) },
      body: JSON.stringify(body),
    });
    revision = result.revision;
    return await loadState();
  } finally {
    pending = false;
  }
}
