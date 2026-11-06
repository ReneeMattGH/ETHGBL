import "server-only";

import { runQuery } from "@arkiv-network/sdk/query";
import type { RpcSelect } from "@arkiv-network/sdk";
import type { CreationFlagsDto, EntityDto, QueryResultDto } from "../types";
import { NETWORKS, type NetworkId } from "../networks";
import {
  arkivAccessKeyConfigured,
  arkivRpcHost,
  arkivRpcUrlOverridden,
  createArkivClient,
  queryTimeoutMs,
} from "./client";
import { toQueryError } from "./errors";
import type { ArkivStatusDto } from "../types";

const FULL_SELECT = {
  key: true,
  owner: true,
  creator: true,
  createdAt: true,
  updatedAt: true,
  expiresAt: true,
  creationFlags: true,
  attributeSchema: true,
  attributes: true,
} as const satisfies RpcSelect;

export type ExecuteQueryInput = {
  network: NetworkId;
  query: string;
  limit: number;
  offset: number;
  count: boolean;
};

function normalizeValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function normalizeCreationFlags(flags: CreationFlagsDto | undefined): CreationFlagsDto | null {
  if (!flags) return null;
  return {
    readonly: Boolean(flags.readonly),
    permissionlessExtension: Boolean(flags.permissionlessExtension),
    raw: Number(flags.raw ?? 0),
  };
}

export async function executeArkivQuery(
  input: ExecuteQueryInput,
  signal?: AbortSignal,
): Promise<QueryResultDto> {
  const client = createArkivClient(signal);
  const startedAt = Date.now();

  const response = await runQuery(client, {
    query: input.query,
    select: FULL_SELECT,
    limit: input.limit,
    offset: input.offset,
    count: input.count,
  });

  const entities: EntityDto[] = response.entities.map((entity) => {
    const attributes: EntityDto["attributes"] = {};
    for (const [name, value] of Object.entries(entity.attributes ?? {})) {
      attributes[name] = {
        type: value?.type ?? "unknown",
        value: normalizeValue(value?.value),
      };
    }

    const attributeSchema: EntityDto["attributeSchema"] = {};
    for (const [name, entry] of Object.entries(entity.attributeSchema ?? {})) {
      attributeSchema[name] = {
        type: entry?.type ?? attributes[name]?.type ?? "unknown",
        indexed: entry?.indexed === undefined ? null : Boolean(entry.indexed),
      };
    }

    return {
      key: String(entity.key ?? ""),
      owner: entity.owner ?? null,
      creator: entity.creator ?? null,
      createdAt: entity.createdAt?.toString() ?? null,
      updatedAt: entity.updatedAt?.toString() ?? null,
      expiresAt: entity.expiresAt?.toString() ?? null,
      creationFlags: normalizeCreationFlags(entity.creationFlags as CreationFlagsDto | undefined),
      attributes,
      attributeSchema,
    };
  });

  return {
    entities,
    count: response.count === undefined ? null : response.count.toString(),
    blockNumber: response.blockNumber.toString(),
    executedQuery: input.query,
    durationMs: Date.now() - startedAt,
    fetchedAt: new Date().toISOString(),
    request: { limit: input.limit, offset: input.offset, count: input.count },
    network: NETWORKS[input.network],
    rpcHost: arkivRpcHost,
  };
}

export async function getArkivStatus(signal?: AbortSignal): Promise<ArkivStatusDto> {
  const startedAt = Date.now();
  const base = {
    network: NETWORKS.rabdi,
    accessKeyConfigured: arkivAccessKeyConfigured,
    rpcHost: arkivRpcHost,
    rpcUrlOverridden: arkivRpcUrlOverridden,
    queryTimeoutMs,
    checkedAt: new Date().toISOString(),
  };

  try {
    const client = createArkivClient(signal);
    const timing = await client.getBlockTiming();
    return {
      ...base,
      connected: true,
      blockNumber: timing.currentBlock.toString(),
      blockTime: new Date(Number(timing.currentBlockTime) * 1000).toISOString(),
      blockDurationMs: Number(timing.blockDuration) * 1000,
      latencyMs: Date.now() - startedAt,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      connected: false,
      blockNumber: null,
      blockTime: null,
      blockDurationMs: null,
      latencyMs: null,
      error: toQueryError(error),
    };
  }
}

export { queryTimeoutMs };
