import { mkdir, rename, rm } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { DuckDBInstance } from "@duckdb/node-api";
import { atomicJson, atomicText, runLock, verifyStage } from "./staging";
import { canonical, STAGED_TABLES } from "./model";
import { PROTOCOL_TABLES } from "./protocols";
import { bulkPhysicalTables, type BulkTableId, type TableCoverage } from "./publication-model";

const sqlString = (value: string) => `'${value.replace(/'/g, "''")}'`;
async function fileDigest(path: string) {
  const hash = createHash("sha256"); let bytes = 0;
  for await (const chunk of createReadStream(path)) { bytes += chunk.length; hash.update(chunk); }
  return { sha256: hash.digest("hex"), bytes };
}
export async function exportParquet(directory: string) {
  return runLock(directory, async () => {
    const verified = await verifyStage(directory);
    return exportTables(directory, verified.manifest.parts.map(part => join(directory, "parts", part.file)), STAGED_TABLES, verified.counts, { sourceConfigHash: verified.manifest.configHash, fromBlock: verified.fromBlock, throughBlock: verified.throughBlock });
  });
}
export async function exportProtocolParquet(directory: string) {
  return runLock(directory, async () => {
    const { verifyProtocolStage } = await import("./protocol-stage");
    const verified = await verifyProtocolStage(directory);
    return exportTables(join(directory, "protocols"), verified.manifest.parts.filter(part => part.bytes > 0).map(part => join(directory, "protocols", "parts", part.file)), PROTOCOL_TABLES, verified.counts, { sourceConfigHash: verified.manifest.sourceConfigHash, sourceFingerprint: verified.manifest.sourceFingerprint, decoderHash: verified.manifest.decoderHash, fromBlock: verified.source.fromBlock, throughBlock: verified.source.throughBlock });
  });
}
export async function exportEnrichmentParquet(directory: string) {
  return runLock(directory, async () => {
    const { verifyEnrichment } = await import("./enrichment-stage");
    const verified = await verifyEnrichment(directory), stage = await verifyStage(directory), output = join(directory, "enrichment");
    const rows = join(output, "rows.ndjson");
    await atomicText(rows, verified.rows.map(canonical).join("\n") + (verified.rows.length ? "\n" : ""));
    const tables = [...new Set([...verified.rows.map(row => row.tableId), ...Object.keys(verified.tableCoverage).filter(table => bulkPhysicalTables(table as BulkTableId).length === 1 && bulkPhysicalTables(table as BulkTableId)[0] === table)])].sort();
    return exportTables(output, verified.rows.length ? [rows] : [], tables, verified.counts, { sourceConfigHash: stage.manifest.configHash, fromBlock: stage.fromBlock, throughBlock: stage.throughBlock, sourceFingerprint: verified.inputs.sourceFingerprint, decoderHash: verified.inputs.enrichmentDecoderHash, enrichmentHash: verified.fingerprint, tableCoverage: verified.tableCoverage });
  });
}
async function exportTables(directory: string, files: string[], tableIds: readonly string[], counts: Partial<Record<string, number>>, scope: { sourceConfigHash: string; fromBlock: string; throughBlock: string | null; sourceFingerprint?: string; decoderHash?: string; enrichmentHash?: string; tableCoverage?: Partial<Record<BulkTableId, TableCoverage>> }) {
    const paths = files.map(path => sqlString(path.replaceAll("\\", "/")));
    const output = join(directory, "parquet"); await mkdir(output, { recursive: true });
    // Rebuild a fresh derived database: a stale/older/newer DuckDB file is never an extraction dependency.
    const database = join(directory, `stage-${randomUUID()}.duckdb`);
    const instance = await DuckDBInstance.create(database, { threads: "2", memory_limit: "512MB" });
    const connection = await instance.connect();
    let closed = false;
    const exported: { tableId: string; rows: number; file: string; bytes: number; sha256: string }[] = [];
    try {
      // Explicit JSON type for payload prevents rounding uint256 strings or inferring incompatible per-block structs.
      if (paths.length) await connection.run(`CREATE OR REPLACE TABLE records AS SELECT * FROM read_json([${paths.join(",")}], format='newline_delimited', columns={version:'INTEGER',tableId:'VARCHAR',sourceId:'VARCHAR',blockNumber:'VARCHAR',blockHash:'VARCHAR',timestamp:'VARCHAR',contract:'VARCHAR',txHash:'VARCHAR',payload:'JSON',contentHash:'VARCHAR'})`);
      else await connection.run("CREATE TABLE records(version INTEGER,tableId VARCHAR,sourceId VARCHAR,blockNumber VARCHAR,blockHash VARCHAR,timestamp VARCHAR,contract VARCHAR,txHash VARCHAR,payload JSON,contentHash VARCHAR)");
      const check = await connection.runAndReadAll("SELECT count(*) AS rows, count(DISTINCT (tableId, sourceId)) AS identities FROM records");
      const [row] = check.getRowObjectsJson();
      const expected = Object.values(counts).reduce<number>((total, count) => total + (count ?? 0), 0);
      if (Number(row.rows) !== expected || Number(row.identities) !== expected) throw new Error("DuckDB import count or source-identity verification failed.");
      for (const tableId of tableIds) {
        const file = `${tableId}.parquet`, temporary = join(output, `${file}.partial`).replaceAll("\\", "/");
        await rm(temporary, { force: true });
        await connection.run(`COPY (SELECT * FROM records WHERE tableId=${sqlString(tableId)} ORDER BY blockNumber::UBIGINT, sourceId) TO ${sqlString(temporary)} (FORMAT PARQUET, COMPRESSION ZSTD)`);
        const count = await connection.runAndReadAll(`SELECT count(*) AS rows FROM read_parquet(${sqlString(temporary)})`);
        const actual = Number(count.getRowObjectsJson()[0].rows), expectedRows = counts[tableId] ?? 0;
        if (actual !== expectedRows) throw new Error(`Parquet readback count mismatch for ${tableId}.`);
        const differences = await connection.runAndReadAll(`SELECT count(*) AS rows FROM (SELECT * FROM records WHERE tableId=${sqlString(tableId)} EXCEPT ALL SELECT * FROM read_parquet(${sqlString(temporary)}))`);
        if (Number(differences.getRowObjectsJson()[0].rows) !== 0) throw new Error(`Parquet content readback mismatch for ${tableId}.`);
        const fingerprint = await fileDigest(temporary);
        await rename(temporary, join(output, file)); exported.push({ tableId, rows: actual, file, ...fingerprint });
      }
      connection.closeSync(); instance.closeSync(); closed = true;
      await rename(database, join(directory, "stage.duckdb"));
      const result = { version: 1, at: new Date().toISOString(), ...scope, tables: exported, publication: "local-only" };
      await atomicJson(join(output, "manifest.json"), result); return result;
    } finally { if (!closed) { connection.closeSync(); instance.closeSync(); } await rm(database, { force: true }); await rm(database + ".wal", { force: true }); }
}
