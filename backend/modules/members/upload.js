/** Multipart somente nas rotas de familiares autenticadas; nenhum arquivo bruto vai ao disco. */
import multer from 'multer';
import { HttpError } from '../../shared/errors.js';
const parser = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12_000_000, files: 1, fields: 8, fieldSize: 16_384, parts: 10 },
}).single('photo');
let active = 0;
export function memberUpload(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  if (active >= 2) return next(new HttpError(503, 'Envio de fotos ocupado. Tente novamente.'));
  active++;
  let released = false;
  const release = () => {
    if (!released) {
      released = true;
      active--;
    }
  };
  res.once('close', release);
  parser(req, res, (error) => {
    if (error) {
      release();
      return next(
        new HttpError(
          error.code === 'LIMIT_FILE_SIZE' ? 413 : 422,
          'Envio inválido. Escolha uma única foto JPG, PNG ou WEBP de até 12 MB.',
        ),
      );
    }
    // A vaga é liberada ao finalizar a resposta, incluindo validação e recodificação.
    next();
  });
}
export function uploadedPhoto(req) {
  if (req.body.removePhoto !== undefined && req.body.removePhoto !== 'yes')
    throw new HttpError(422, 'Opção de foto inválida.');
  if (req.file && req.body.removePhoto)
    throw new HttpError(422, 'Escolha enviar ou remover a foto.');
  if (req.body.removePhoto) return null;
  return req.file
    ? `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`
    : undefined;
}
