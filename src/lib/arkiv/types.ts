import type { NetworkId, NetworkSummary } from "./networks";

export type ArkivValueDto = {
  type: string;
  value: string | number | boolean | null;
};

export type AttributeSchemaDto = {
  type: string;
  indexed: boolean | null;
};

export type CreationFlagsDto = {
  readonly: boolean;
  permissionlessExtension: boolean;
  raw: number;
};

export type EntityDto = {
  key: string;
  owner: string | null;
  creator: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  creationFlags: CreationFlagsDto | null;
  attributes: Record<string, ArkivValueDto>;
  attributeSchema: Record<string, AttributeSchemaDto>;
};

export type QueryErrorCode =
  | "INVALID_REQUEST"
  | "QUERY_REJECTED"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "ACCESS_DENIED"
  | "NETWORK"
  | "CONFIG"
  | "CANCELLED"
  | "INTERNAL";

export type QueryErrorDto = {
  code: QueryErrorCode;
  message: string;
  detail?: string;
  kind?: string;
  retryable: boolean;
};

export type QueryResultDto = {
  entities: EntityDto[];
  count: string | null;
  blockNumber: string;
  executedQuery: string;
  durationMs: number;
  fetchedAt: string;
  request: {
    limit: number;
    offset: number;
    count: boolean;
  };
  network: NetworkSummary;
  /** Host of the RPC endpoint the server used, without the access key. */
  rpcHost: string;
};

export type ArkivStatusDto = {
  network: NetworkSummary;
  connected: boolean;
  blockNumber: string | null;
  blockTime: string | null;
  blockDurationMs: number | null;
  latencyMs: number | null;
  accessKeyConfigured: boolean;
  /** Host of the RPC endpoint the server actually used, without the access key. */
  rpcHost: string;
  /** True when ARKIV_RPC_URL overrides the SDK's default Rabdi endpoint. */
  rpcUrlOverridden: boolean;
  queryTimeoutMs: number;
  checkedAt: string;
  error: QueryErrorDto | null;
};

export type QueryRequestInput = {
  network: NetworkId;
  query: string;
  limit: number;
  offset: number;
  count: boolean;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: QueryErrorDto };
