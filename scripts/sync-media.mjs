import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const DB_BASE = 'https://cdn.jsdelivr.net/gh/enterxera/enterxera-db@main/data';
const SHARD_MIN = Number(process.env.SHARD_MIN || 1);
const SHARD_MAX = Number(process.env.SHARD_MAX || 10000);
const BATCH_LIMIT = Number(process.env.BATCH_LIMIT || 2500);
const CONCURRENCY = Number(process.env.CONCURRENCY || 25);

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
      signal: AbortSignal.timeout(6000),
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
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    await sharp(buf)
      .resize(width, height, { fit: 'cover', withoutEnlargement: true })
      .webp({ quality: 80 })
      .toFile(outPath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Fetching mappings from ${DB_BASE}/mappings.json...`);
  const res = await fetch(`${DB_BASE}/mappings.json`);
  if (!res.ok) {
    throw new Error(`Failed to fetch mappings: ${res.status} ${res.statusText}`);
  }
  const mappings = await res.json();

  const targets = [];
  for (const [exIdStr, map] of Object.entries(mappings)) {
    const exId = Number(exIdStr);
    if (exId < SHARD_MIN || exId > SHARD_MAX) continue;
    targets.push({ exId, map });
  }

  console.log(`Targets in range ${SHARD_MIN}-${SHARD_MAX}: ${targets.length}`);

  let processed = 0;
  async function handleItem(item) {
    if (processed >= BATCH_LIMIT) return;
    const posterPath = path.resolve('posters', `${item.exId}.webp`);
    if (await exists(posterPath)) return;

    if (!item.map.official_url) return;

    try {
      const ogImageUrl = await fetchOfficialOgImage(item.map.official_url);
      if (ogImageUrl) {
        const ok = await fetchAndSaveWebp(ogImageUrl, posterPath, 600, 900);
        if (ok) {
          processed++;
          if (processed % 50 === 0) {
            console.log(`[Media Progress] Processed ${processed} posters in range ${SHARD_MIN}-${SHARD_MAX}`);
          }
        }
      }
    } catch {
      // Ignore network timeout
    }
  }

  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    if (processed >= BATCH_LIMIT) break;
    const chunk = targets.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map(handleItem));
  }

  console.log(`Shard range ${SHARD_MIN}-${SHARD_MAX} finished. Saved: ${processed} posters.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
