const KEY_SPACE_END = 1n << 256n;
const hexKey = (key: bigint) => "0x" + key.toString(16).padStart(64, "0");
const keyNumber = (key: unknown) => {
  if (typeof key !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("Arkiv returned an invalid entity key during a scan.");
  return BigInt(key);
};

// Disjoint key ranges let large analytics scans advance in parallel without offset drift.
export async function scanKeyRanges<T extends { key?: unknown }>(predicate: string, read: (predicate: string) => Promise<{ entities: T[] }>, cap: number, concurrency = 1): Promise<T[]> {
  if (!Number.isSafeInteger(cap) || cap < 1 || ![1, 4].includes(concurrency)) throw new Error("Invalid Arkiv scan limits.");
  let total = 0, stopped = false;
  const append = (target: T[], rows: T[]) => {
    total += rows.length;
    if (total > cap) throw new Error(`This query exceeds the local limit of ${cap} rows. Narrow the dataset scope; no partial total was calculated.`);
    target.push(...rows);
  };
  const first = await read(predicate), result: T[] = [];
  append(result, first.entities);
  if (first.entities.length < 100) return result;
  const cursor = first.entities.at(-1)?.key;
  if (typeof cursor !== "string") throw new Error("Arkiv pagination did not advance.");
  if (concurrency === 1) {
    let previous = cursor;
    while (true) {
      const page = await read(`(${predicate}) AND $key > key(${previous})`);
      append(result, page.entities);
      if (page.entities.length < 100) return result;
      const next = page.entities.at(-1)?.key;
      if (typeof next !== "string" || next === previous) throw new Error("Arkiv pagination did not advance.");
      previous = next;
    }
  }
  const start = keyNumber(cursor) + 1n;
  if (start >= KEY_SPACE_END) return result;
  let last = -1n;
  for (const row of first.entities) {
    const key = keyNumber(row.key);
    if (key <= last) throw new Error("Arkiv scan keys are not strictly ordered.");
    last = key;
  }
  const ranges = Array.from({ length: concurrency }, (_, index) => {
    const lower = start + (KEY_SPACE_END - start) * BigInt(index) / BigInt(concurrency);
    const upper = start + (KEY_SPACE_END - start) * BigInt(index + 1) / BigInt(concurrency);
    return { lower, upper };
  }).filter(range => range.lower < range.upper);
  const settled = await Promise.allSettled(ranges.map(async ({ lower, upper }) => {
    const rows: T[] = [];
    let previous = lower - 1n;
    try {
      while (!stopped) {
        const range = `(${predicate}) AND $key > key(${hexKey(previous)})${upper < KEY_SPACE_END ? ` AND $key < key(${hexKey(upper)})` : ""}`;
        const page = await read(range);
        if (stopped) return rows;
        for (const row of page.entities) {
          const key = keyNumber(row.key);
          if (key <= previous || key < lower || key >= upper) throw new Error("Arkiv returned an unordered or out-of-range scan page.");
          previous = key;
        }
        append(rows, page.entities);
        if (page.entities.length < 100) return rows;
      }
      return rows;
    } catch (error) { stopped = true; throw error; }
  }));
  const failure = settled.find(result => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return result.concat(...settled.map(result => result.status === "fulfilled" ? result.value : []));
}
