/** Erros previstos da API; detalhes de SQL e credenciais nunca entram na resposta. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export function errorResponse(error, _req, res, _next) {
  if (res.headersSent) return;
  const status =
    error instanceof HttpError
      ? error.status
      : error.type === 'entity.too.large'
        ? 413
        : error.type === 'entity.parse.failed'
          ? 400
          : 500;
  res.status(status).json({
    error:
      error instanceof HttpError
        ? error.message
        : status === 413
          ? 'Requisição acima do limite.'
          : status === 400
            ? 'JSON inválido.'
            : 'Não foi possível concluir a operação.',
  });
}
