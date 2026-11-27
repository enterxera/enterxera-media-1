import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DB_BASE = 'https://cdn.jsdelivr.net/gh/enterxera/enterxera-db@main/data';
const SHARD_MIN = 1;
const SHARD_MAX = 10000;
const BATCH_LIMIT = Number(process.env.BATCH_LIMIT || 500);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fetchOfficialOgImage(officialUrl) {
  try {
    const res = await fetch(officialUrl, {
      headers: { 'User-Agent': 'EnterXeraBot/1.0' },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const match =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    if (!match?.[1]) return null;
    return new URL(match[1], officialUrl).toString();
  } catch {
    return null;
  }
}

async function fetchAndSaveWebp(url, outPath, width, height) {
  const res = await fetch(url);
  if (!res.ok) return false;
  const buf = Buffer.from(await res.arrayBuffer());
  await sharp(buf)
    .resize(width, height, { fit: 'cover', withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(outPath);
  return true;
}

async function main() {
  console.log(`Fetching mappings from ${DB_BASE}/mappings.json...`);
  const res = await fetch(`${DB_BASE}/mappings.json`);
  if (!res.ok) {
    throw new Error(`Failed to fetch mappings: ${res.status} ${res.statusText}`);
  }
  const mappings = await res.json();

  let processed = 0;
  let missingCount = 0;

  for (const [exIdStr, map] of Object.entries(mappings)) {
    const exId = Number(exIdStr);
    if (exId < SHARD_MIN || exId > SHARD_MAX) continue;

    const posterPath = path.resolve('posters', `${exId}.webp`);
    if (await exists(posterPath)) continue;

    missingCount++;
    if (processed >= BATCH_LIMIT || !map.official_url) continue;

    try {
      const ogImageUrl = await fetchOfficialOgImage(map.official_url);
      if (ogImageUrl) {
        const ok = await fetchAndSaveWebp(ogImageUrl, posterPath, 600, 900);
        if (ok) {
          processed++;
          console.log(`Saved official poster for ex_id ${exId}`);
        }
      }
    } catch (err) {
      console.warn(`Failed ex_id ${exId}:`, err.message);
    }
  }

  console.log(
    `Shard ${SHARD_MIN}-${SHARD_MAX}: processed ${processed}, remaining missing: ${Math.max(0, missingCount - processed)}`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
