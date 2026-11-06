import { defineSchema, str, addr, u64, u256, key, bool, bytes } from "@arkiv-network/sdk/schema";

export const DatasetSchema = defineSchema("axis.dataset.v1", {
  name: str().indexed(), chainId: u64().indexed(), contract: addr().indexed(), writer: addr().indexed(),
  startBlock: u64().indexed(), endBlock: u64(), enabled: bool().indexed(), continuous: bool().indexed(),
  sourceTime: u64(), document: bytes(),
});
export const ContractSchema = defineSchema("axis.contract.v1", {
  chainId: u64().indexed(), contract: addr().indexed(), symbol: str(), decimals: u64(), abiVersion: str(),
});
export const TransferSchema = defineSchema("axis.transfer.v1", {
  datasetKey: key().indexed(), sourceId: str().indexed(), chainId: u64().indexed(), contract: addr().indexed(),
  blockNumber: u64().indexed(), blockHash: key(), sourceTime: u64().indexed(), txHash: key().indexed(),
  txIndex: u64().optional(), logIndex: u64(), sender: addr().indexed(), recipient: addr().indexed(),
  amountRaw: u256().indexed(), amount: str(), decimals: u64(), contentHash: key(), rpcHost: str(),
  ingestedAt: u64(), abiVersion: str(), eventSignature: str(),
});
export const BlockSchema = defineSchema("axis.block.v1", {
  datasetKey: key().indexed(), sourceId: str().indexed(), blockNumber: u64().indexed(),
  blockHash: key(), sourceTime: u64().indexed(), chainId: u64().indexed(),
});
export const CoverageSchema = defineSchema("axis.coverage.v1", {
  datasetKey: key().indexed(), fromBlock: u64().indexed(), toBlock: u64().indexed(), rows: u64(),
  contentHash: key(), verified: bool().indexed(), document: bytes(),
});
export const CoverageAlertSchema = defineSchema("axis.coverage_alert.v1", {
  datasetKey: key().indexed(), sourceTime: u64(), document: bytes(),
});
export const MetricSchema = defineSchema("axis.daily_metric.v1", {
  datasetKey: key().indexed(), fromBlock: u64().indexed(), toBlock: u64().indexed(), sourceTime: u64().indexed(),
  transfers: u64(), amountRaw: u256(), document: bytes(),
});
export const StatusSchema = defineSchema("axis.ingestion_status.v1", {
  datasetKey: key().indexed(), jobId: str().indexed(), stage: str().indexed(), updatedTime: u64(), document: bytes(),
});
export const SavedQuerySchema = defineSchema("axis.saved_query.v1", {
  title: str().indexed(), datasetKey: key().indexed(), sourceTime: u64(), document: bytes(),
});
export const DashboardSchema = defineSchema("axis.dashboard.v1", {
  title: str().indexed(), published: bool().indexed(), sourceTime: u64().indexed(), document: bytes(),
});
