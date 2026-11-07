import { bulkTableAvailable, type BulkTableId, type PublishedImport } from "./bulk/publication-model";

// Platform-owned Polygon source. User query datasets are a separate catalog.
export const POLYGON_ACTIVITY_DATASET_KEY = "0xbc728eaf7a68decb59d54056d4aacc15b8bf2e66e00bb813f7157d5bd3dae872";

export function importContainsTable(imported: PublishedImport, table: BulkTableId) {
  if (!imported.document.throughBlock || imported.document.recordCount <= 0) return false;
  return bulkTableAvailable(imported.document, table);
}
export function newestTableImport(imports: PublishedImport[], table: BulkTableId, requestedKey?: string | null) {
  const candidates = imports.filter(item => (!requestedKey || item.key === requestedKey) && importContainsTable(item, table));
  return candidates.toSorted((a, b) => {
    const left = BigInt(a.document.throughBlock!), right = BigInt(b.document.throughBlock!);
    return left === right ? b.document.recordCount - a.document.recordCount || a.key.localeCompare(b.key) : left > right ? -1 : 1;
  })[0];
}
