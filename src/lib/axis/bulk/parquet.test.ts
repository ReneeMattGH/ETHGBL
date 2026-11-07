import { describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DuckDBInstance } from "@duckdb/node-api";
import { extractStage } from "./staging";
import { exportParquet } from "./parquet";
import { config, fixtureSource, maxUint256 } from "./fixtures.test-helper";

describe("DuckDB and Parquet readback", () => {
  it("exports verified tables with lossless integer payloads and correct counts, including empty tables", async () => {
    const dir = await mkdtemp(join(tmpdir(), "axis-parquet-test-"));
    try {
      await extractStage(dir, config, fixtureSource().source);
      const report = await exportParquet(dir);
      expect(report.tables.find(table => table.tableId === "token-transfers")?.rows).toBe(4);
      const instance = await DuckDBInstance.create(), connection = await instance.connect();
      try {
        const path = join(dir, "parquet", "token-transfers.parquet").replaceAll("\\", "/").replace(/'/g, "''");
        const result = await connection.runAndReadAll(`SELECT json_extract_string(payload,'$.amountRaw') AS amount FROM read_parquet('${path}') WHERE json_extract_string(payload,'$.decimals')='6'`);
        expect(result.getRowObjectsJson().map(row => row.amount)).toEqual([maxUint256, maxUint256]);
      } finally { connection.closeSync(); instance.closeSync(); }
      expect(JSON.parse(await readFile(join(dir, "parquet", "manifest.json"), "utf8")).publication).toBe("local-only");
      await writeFile(join(dir, "stage.duckdb"), "Obsolete derived database, incompatible format");
      await expect(exportParquet(dir)).resolves.toMatchObject({ tables: report.tables });
      const emptyDir = join(dir, "empty"); await extractStage(emptyDir, { ...config, tokens: [] }, fixtureSource().source);
      const empty = await exportParquet(emptyDir);
      expect(empty.tables.find(table => table.tableId === "token-transfers")?.rows).toBe(0);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }, 30_000);
});
