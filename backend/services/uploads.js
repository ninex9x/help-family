/** Valida bytes no servidor. Nome, MIME e tamanho enviados pelo cliente não são prova de conteúdo. */
import sharp from 'sharp';
import { AppError } from './family.js';

export function decodeDataUrl(value, limit = 1_000_000) {
  if (typeof value !== 'string' || value.length > Math.ceil((limit * 4) / 3) + 100)
    throw new AppError(422, 'Arquivo excede o tamanho permitido.');
  const match = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  if (!match) throw new AppError(422, 'Arquivo deve usar base64 válido.');
  const bytes = Buffer.from(match[2], 'base64');
  if (!bytes.length || bytes.length > limit || bytes.toString('base64') !== match[2])
    throw new AppError(422, 'Arquivo vazio, inválido ou maior que o limite permitido.');
  return { mimeType: match[1], bytes };
}

function imageType(bytes) {
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
    return 'image/png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg';
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

/** Verificação estrutural básica; não equivale a análise antivírus do documento. */
export function documentBytes(dataUrl, declaredType) {
  const { bytes, mimeType } = decodeDataUrl(dataUrl);
  if (mimeType !== declaredType)
    throw new AppError(422, 'O tipo informado não corresponde ao arquivo.');
  let valid = false;
  if (mimeType === 'application/pdf')
    valid =
      bytes.subarray(0, 5).toString() === '%PDF-' &&
      bytes.subarray(-1024).includes(Buffer.from('%%EOF'));
  else if (mimeType === 'text/plain') {
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      valid = !bytes.includes(0);
    } catch {}
  } else valid = imageType(bytes) === mimeType;
  if (!valid) throw new AppError(422, 'Conteúdo do arquivo incompatível com o formato informado.');
  return bytes;
}

let active = 0;
/** Fotos são decodificadas, recortadas e recodificadas; metadados não são preservados. */
export async function preparePhoto(dataUrl) {
  const { bytes, mimeType } = decodeDataUrl(dataUrl, 12_000_000);
  if (!imageType(bytes) || imageType(bytes) !== mimeType)
    throw new AppError(422, 'Escolha uma imagem JPG, PNG ou WEBP válida.');
  if (active >= 2) throw new AppError(503, 'Processamento de fotos ocupado. Tente novamente.');
  active++;
  try {
    const result = await sharp(bytes, { limitInputPixels: 40_000_000, failOn: 'warning' })
      .rotate()
      .resize(640, 640, { fit: 'cover' })
      .jpeg({ quality: 82 })
      .toBuffer();
    return `data:image/jpeg;base64,${result.toString('base64')}`;
  } catch {
    throw new AppError(422, 'Não foi possível abrir esta imagem. Escolha outro arquivo.');
  } finally {
    active--;
  }
}

/** Mesmas proteções para formulário e para clientes que chamam diretamente a API REST. */
export async function prepareResource(resource, body) {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new AppError(400, 'Corpo inválido.');
  const result = { ...body };
  if (resource === 'members' && result.photo) result.photo = await preparePhoto(result.photo);
  if (resource === 'documents' && result.dataUrl)
    result.fileSize = documentBytes(result.dataUrl, result.mimeType).length;
  return result;
}
