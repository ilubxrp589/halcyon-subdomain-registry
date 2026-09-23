import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../.cache/images');

const SIZES = {
  small: 400,
  medium: 800,
  large: 1200,
};

async function initCache() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
}

function getCacheKey(fqdn, size) {
  const hash = crypto.createHash('md5').update(fqdn).digest('hex').slice(0, 8);
  return `${hash}-${size}.png`;
}

async function getCached(fqdn, size) {
  const cachePath = path.join(CACHE_DIR, getCacheKey(fqdn, size));
  try {
    const stat = await fs.stat(cachePath);
    if (Date.now() - stat.mtimeMs < 24 * 60 * 60 * 1000) {
      return await fs.readFile(cachePath);
    }
  } catch {}
  return null;
}

async function saveToCache(fqdn, size, buffer) {
  const cachePath = path.join(CACHE_DIR, getCacheKey(fqdn, size));
  await fs.writeFile(cachePath, buffer).catch(() => {});
}

async function resizeImage(inputBuffer, size) {
  const dimension = SIZES[size] || SIZES.large;
  return await sharp(inputBuffer)
    .resize(dimension, dimension, { fit: 'cover', position: 'center' })
    .png({ quality: 90, compressionLevel: 9 })
    .toBuffer();
}

async function processImage(fqdn, originalBuffer, size) {
  const cached = await getCached(fqdn, size);
  if (cached) return cached;

  const resized = await resizeImage(originalBuffer, size);
  saveToCache(fqdn, size, resized);
  return resized;
}

export default { initCache, processImage, SIZES };
