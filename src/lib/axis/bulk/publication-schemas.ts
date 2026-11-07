import { defineSchema, str, key, u64, addr, bool, bytes } from "@arkiv-network/sdk/schema";
import { BULK_IMPORT_SCHEMA, BULK_RECORD_SCHEMA } from "./publication-model";

export const BulkImportSchema = defineSchema(BULK_IMPORT_SCHEMA, {
  importHash: key().indexed(), name: str(), chainId: u64().indexed(), fromBlock: u64(), toBlock: u64(),
  status: str().indexed(), sourceTime: u64(), document: bytes(),
});
export const BulkRecordSchema = defineSchema(BULK_RECORD_SCHEMA, {
  importKey: key().indexed(), tableId: str().indexed(), sourceId: str().indexed(),
  blockNumber: u64().indexed(), blockHash: key(), sourceTime: u64(), ordinal: u64().indexed(),
  contract: addr().optional().indexed(), txHash: key().optional().indexed(), stablecoin: bool().optional().indexed(),
  contentHash: key(), document: bytes(),
});
