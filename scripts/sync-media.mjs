import fs from 'node:fs/promises';
import path from 'node:path';

const MAPPINGS_URL =
  'https://cdn.jsdelivr.net/gh/enterxera/enterxera-db@main/data/mappings.json';

const SHARD_MIN = 1;
const SHARD_MAX = 10000;
const BATCH_LIMIT = Number(process.env.BATCH_LIMIT || 50);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log(`Fetching mappings from ${MAPPINGS_URL}...`);
  const res = await fetch(MAPPINGS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch mappings: ${res.status} ${res.statusText}`);
  }
  const mappings = await res.json();

  let missingCount = 0;
  for (const [exIdStr] of Object.entries(mappings)) {
    const exId = Number(exIdStr);
    if (exId < SHARD_MIN || exId > SHARD_MAX) continue;

    const posterPath = path.resolve('posters', `${exId}.webp`);
    if (!(await exists(posterPath))) {
      missingCount++;
      if (missingCount <= BATCH_LIMIT) {
        // Placeholder: hook primary/official source fetcher here
      }
    }
  }

  console.log(
    `Shard ${SHARD_MIN}-${SHARD_MAX}: ${missingCount} entries missing posters (batch limit: ${BATCH_LIMIT}).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
