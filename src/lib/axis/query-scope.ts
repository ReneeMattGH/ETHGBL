import type { Dataset, ResultDatasetScope } from "./model";
import { validateFilters } from "./core";

export function datasetScopes(dataset: Dataset, throughBlock: string): ResultDatasetScope[] {
  return dataset.resultSource?.scopes ?? [{ datasetKey: dataset.resultSource?.datasetKey ?? dataset.key, fromBlock: dataset.startBlock, throughBlock, filters: dataset.resultSource?.filters ?? [] }];
}

export function validateResultScopes(input: unknown): ResultDatasetScope[] {
  if (!Array.isArray(input) || !input.length || input.length > 20) throw new Error("A saved dataset supports 1–20 source scopes.");
  return input.map(scope => {
    if (!scope || !/^0x[0-9a-fA-F]{64}$/.test(scope.datasetKey) || !/^\d{1,20}$/.test(scope.fromBlock) || !/^\d{1,20}$/.test(scope.throughBlock) || BigInt(scope.fromBlock) > BigInt(scope.throughBlock) || BigInt(scope.throughBlock) >= 2n ** 64n || !Array.isArray(scope.filters) || scope.filters.length > 20) throw new Error("Invalid saved dataset scope.");
    return { datasetKey: scope.datasetKey.toLowerCase(), fromBlock: scope.fromBlock, throughBlock: scope.throughBlock, filters: scope.filters.map(validateFilters) };
  });
}
