import { ExpirationTime, type Entity } from "@arkiv-network/sdk";
import { key, u64, addr } from "@arkiv-network/sdk/schema";
import { stringToBytes, type Hex } from "viem";
import { arkivReader, workerWriter, writerAddress, retryRead } from "../runtime";
import { baseQuery, documentOf, pageEntities, unpack } from "../store";
import { withLock } from "../queue";
import { BULK_IMPORT_SCHEMA, BULK_RECORD_SCHEMA, type PublishedImportDocument } from "./publication-model";
import { BulkImportSchema, BulkRecordSchema } from "./publication-schemas";
import { canonical } from "./model";
import type { PublicationBackend, PublishRecord, WriteResult } from "./publisher";

export function storedRecord(entity: Entity) {
  const a = unpack(entity);
  const record: PublishRecord = { version: 1, tableId: String(a.tableId) as PublishRecord["tableId"], sourceId: String(a.sourceId), blockNumber: String(a.blockNumber), blockHash: String(a.blockHash).toLowerCase(), timestamp: String(a.sourceTime), contract: a.contract ? String(a.contract).toLowerCase() : null, txHash: a.txHash ? String(a.txHash).toLowerCase() : null, contentHash: String(a.contentHash).slice(2).toLowerCase(), payload: documentOf(entity) };
  return { ordinal: Number(a.ordinal), record };
}
export function arkivPublicationBackend(): PublicationBackend {
  const reader = arkivReader(), writer = workerWriter(), owner = writerAddress();
  const result = async (txHash: Hex): Promise<WriteResult> => {
    const receipt = await retryRead(() => reader.getTransactionReceipt({ hash: txHash }));
    return { txHash, gasCostWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString() };
  };
  return {
    exclusive: action => withLock("signer", action, 600),
    identity: async () => ({ owner, chainId: await reader.getChainId() }),
    nonces: async () => ({ latest: await reader.getTransactionCount({ address: writer.account.address, blockTag: "latest" }), pending: await reader.getTransactionCount({ address: writer.account.address, blockTag: "pending" }) }),
    balance: () => reader.getBalance({ address: writer.account.address }),
    findImport: async hash => {
      const found = await pageEntities(`${baseQuery(BULK_IMPORT_SCHEMA, owner)} AND importHash = key(0x${hash})`, 2);
      if (found.entities.length > 1) throw new Error("Duplicate bulk import definitions require reconciliation.");
      const entity = found.entities[0]; return entity ? { key: String(entity.key), status: String(unpack(entity).status), document: documentOf<PublishedImportDocument>(entity) } : null;
    },
    createImport: async (hash, document) => {
      const created = await writer.createEntity(BulkImportSchema, { importHash: key(`0x${hash}`), name: `Polygon bulk · ${document.runId}`, chainId: u64(137), fromBlock: u64(document.fromBlock), toBlock: u64(document.toBlock), status: "publishing", sourceTime: u64(Math.floor(Date.now() / 1000)), document: stringToBytes(canonical(document)) }, { expiration: ExpirationTime.fromDays(30) });
      return { key: created.entityKey, status: "publishing", document };
    },
    patchImport: async (importKey, status, document) => {
      const patched = await writer.patchEntity(BulkImportSchema, importKey as Hex, { set: { status, document: stringToBytes(canonical(document)) } });
      await retryRead(async () => { const read = await pageEntities(`${baseQuery(BULK_IMPORT_SCHEMA, owner)} AND $key = key(${importKey})`, 1); if (!read.entities[0] || canonical(documentOf(read.entities[0])) !== canonical(document) || unpack(read.entities[0]).status !== status) throw new Error("Import manifest content readback failed."); });
      return result(patched.txHash);
    },
    readRange: async (importKey, from, to) => {
      const rows: { ordinal: number; record: PublishRecord }[] = [];
      let cursor: string | undefined;
      for (;;) {
        const found = await pageEntities(`${baseQuery(BULK_RECORD_SCHEMA, owner)} AND importKey = key(${importKey}) AND ordinal >= u64(${from}) AND ordinal <= u64(${to})${cursor ? ` AND $key > key(${cursor})` : ""}`, 100);
        rows.push(...found.entities.map(storedRecord));
        if (rows.length > (to - from + 1) * 2) throw new Error("Unexpected duplicate publication records.");
        if (found.entities.length < 100) return rows;
        const next = String(found.entities.at(-1)!.key); if (next === cursor) throw new Error("Publication readback pagination did not advance."); cursor = next;
      }
    },
    writeRecords: async (importKey, rows, nonce) => {
      const sent = await writer.executeBatch({ creates: rows.map(({ ordinal, record }) => ({ schema: BulkRecordSchema, values: { importKey: key(importKey as Hex), tableId: record.tableId, sourceId: record.sourceId, blockNumber: u64(record.blockNumber), blockHash: key(record.blockHash as Hex), sourceTime: u64(record.timestamp), ordinal: u64(ordinal), ...(record.contract ? { contract: addr(record.contract) } : {}), ...(record.txHash ? { txHash: key(record.txHash as Hex) } : {}), ...(record.tableId === "token-transfers" ? { stablecoin: Boolean((record.payload as { stablecoin?: boolean }).stablecoin) } : {}), contentHash: key(`0x${record.contentHash}`), document: stringToBytes(canonical(record.payload)) }, expiration: ExpirationTime.fromDays(30), flags: { readonly: true, permissionlessExtension: true } })) }, { nonce });
      return result(sent.txHash);
    },
  };
}
