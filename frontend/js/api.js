/** Transporte HTTP e revisão confirmada. Não calcula nem valida regras de negócio. */
let revision = 0;
let pending = false;
export function acceptRevision(value) {
  revision = value;
}
export async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    cache: 'no-store',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(result?.error || 'Não foi possível concluir a operação.');
  return result;
}
export async function command(path, body, method = 'POST') {
  if (pending) throw new Error('Aguarde a gravação atual.');
  pending = true;
  try {
    const result = await request(path, {
      method,
      headers: { 'If-Match': String(revision) },
      body: JSON.stringify(body),
    });
    revision = result.revision;
    return result;
  } finally {
    pending = false;
  }
}
