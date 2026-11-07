import { defineSchema, str, u64, bytes } from "@arkiv-network/sdk/schema";
import { SNAPSHOT_SCHEMA } from "./swarm-model";

export const SnapshotSchema = defineSchema(SNAPSHOT_SCHEMA, {
  title: str().indexed(), swarmReference: str().indexed(), manifestSha256: str(),
  chainId: u64().indexed(), rows: u64(), fromBlock: u64(), throughBlock: u64(),
  sourceTime: u64().indexed(), document: bytes(),
});
