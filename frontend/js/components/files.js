/** Leitura de arquivos e redução de fotos antes do envio ao servidor local. */
export async function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}
export async function memberPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12_000_000)
    throw new Error('Escolha uma imagem JPG, PNG ou WEBP de até 12 MB.');
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('Não foi possível abrir esta imagem. Escolha outro arquivo.');
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 640;
    const crop = Math.min(bitmap.width, bitmap.height);
    canvas
      .getContext('2d')
      .drawImage(
        bitmap,
        (bitmap.width - crop) / 2,
        (bitmap.height - crop) / 2,
        crop,
        crop,
        0,
        0,
        640,
        640,
      );
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    bitmap.close();
  }
}
