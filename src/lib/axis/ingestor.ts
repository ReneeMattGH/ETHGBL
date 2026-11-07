import { ExpirationTime } from "@arkiv-network/sdk";
import { addr, u64, u256, key } from "@arkiv-network/sdk/schema";
import { stringToBytes, type Hex } from "viem";
import { BlockSchema, ContractSchema, CoverageSchema, CoverageAlertSchema, MetricSchema, StatusSchema, TransferSchema } from "./schemas";
import { aggregateTransfers, hashDocument, nowSeconds, validateBlockRange, SourceConsistencyError } from "./core";
import { USDC, type Job, type Transfer } from "./model";
import { arkivReader, writerAddress, retryRead, safeError } from "./runtime";
import { serialWorkerWriter as workerWriter } from "./signing";
import { baseQuery, coverageSummary, getDataset, getEntity, listCoverage, pageEntities, scanEntities, transferBase, transferOf, unpack } from "./store";
import { extractRange, verifyBlockHashes } from "./polygon";
import { saveJob, writeState } from "./queue";

const expiration = () => ExpirationTime.fromDays(30);
const immutable = { readonly: true, permissionlessExtension: true };
async function publishStatus(job: Job) {
  const writer = workerWriter();
  const values = { datasetKey: key(job.datasetKey as Hex), jobId: job.id, stage: job.stage, updatedTime: u64(nowSeconds()), document: stringToBytes(JSON.stringify(job)) };
  if (job.statusKey) await writer.patchEntity(StatusSchema, job.statusKey as Hex, { set: values });
  else { const result = await writer.createEntity(StatusSchema, values, { expiration: ExpirationTime.fromDays(7) }); job.statusKey = result.entityKey; job.txHashes.push(result.txHash); }
  await saveJob(job);
}
async function verifyTransfers(datasetKey: string, rows: Transfer[], from: string, to: string) {
  const query = `${transferBase(datasetKey)} AND blockNumber >= u64(${from}) AND blockNumber <= u64(${to})`;
  await retryRead(async () => {
    const stored = (await scanEntities(query)).map(transferOf);
    if (stored.length !== rows.length) throw new Error(`Readback count mismatch: expected ${rows.length}, got ${stored.length}.`);
    const byId = new Map(stored.map(row => [row.sourceId, row]));
    if (byId.size !== stored.length) throw new Error("Duplicate source identifiers found in Arkiv.");
    for (const row of rows) {
      const actual = byId.get(row.sourceId);
      if (!actual || Object.entries(row).some(([field, value]) => actual[field as keyof Transfer] !== value)) throw new Error(`Source-to-Arkiv verification failed for log ${row.logIndex}.`);
    }
  });
}
async function ensureContract() {
  const existing = await pageEntities(`${baseQuery("axis.contract.v1", writerAddress())} AND chainId = u64(137) AND contract = addr(${USDC})`, 1);
  if (!existing.entities.length) await workerWriter().createEntity(ContractSchema, { chainId: u64(137), contract: addr(USDC), symbol: "USDC", decimals: u64(6), abiVersion: "ERC20.Transfer.v1" }, { expiration: expiration(), flags: immutable });
}
export async function runJob(job: Job) {
  const writer = workerWriter();
  try {
    const dataset = await getDataset(job.datasetKey);
    if (dataset.resultSource) throw new Error("Saved result datasets cannot run new imports.");
    if (!dataset.enabled || dataset.owner !== job.owner.toLowerCase()) throw new Error("Dataset was paused or its owner changed.");
    const [from, to] = validateBlockRange(job.fromBlock, job.toBlock);
    if (from < BigInt(dataset.startBlock) || dataset.endBlock !== "0" && to > BigInt(dataset.endBlock)) throw new Error("Job exceeds the owner-defined dataset range.");
    const latestNonce = await arkivReader().getTransactionCount({ address: writer.account.address, blockTag: "latest" });
    const pendingNonce = await arkivReader().getTransactionCount({ address: writer.account.address, blockTag: "pending" });
    if (latestNonce !== pendingNonce) throw new Error("Writer has an unresolved transaction. Wait for reconciliation before retrying.");
    const prior = await listCoverage(dataset.key);
    // The most recent canonical block hash commits to its full ancestry. Do not re-download every old header per job.
    const boundary = prior.at(-1);
    if (boundary) await verifyBlockHashes({ [boundary.toBlock]: boundary.blockHashes[boundary.toBlock] });
    await ensureContract();
    job.stage = "extracting"; job.error = null; await publishStatus(job);
    for (let start = from; start <= to; start += 10n) {
      const end = start + 9n > to ? to : start + 9n;
      const current = await getDataset(dataset.key);
      if (!current.enabled || current.owner !== dataset.owner) throw new Error("Owner paused the dataset during ingestion.");
      const covered = prior.find(item => BigInt(item.fromBlock) <= start && BigInt(item.toBlock) >= end);
      if (covered) { const source = await extractRange(start.toString(), end.toString()); await verifyTransfers(dataset.key, source.rows, start.toString(), end.toString()); job.total += source.rows.length; job.duplicates += source.rows.length; await saveJob(job); continue; }
      if (prior.some(item => BigInt(item.fromBlock) <= end && BigInt(item.toBlock) >= start)) throw new Error("Partial overlap with existing coverage. Resume from the verified checkpoint.");
      const summary = await coverageSummary(dataset);
      if (summary.gaps.length) throw new Error(summary.gaps.join(" "));
      if (start !== (summary.throughBlock ? BigInt(summary.throughBlock) + 1n : BigInt(dataset.startBlock))) throw new Error("New imports must continue directly after verified coverage.");
      const source = await extractRange(start.toString(), end.toString(), summary.throughBlock ? summary.manifests.at(-1)!.blockHashes[summary.throughBlock] : undefined);
      job.total += source.rows.length; job.stage = "publishing"; await publishStatus(job);
      const existing = (await scanEntities(`${transferBase(dataset.key)} AND blockNumber >= u64(${start}) AND blockNumber <= u64(${end})`)).map(transferOf);
      const identities = new Map(existing.map(row => [row.sourceId, row]));
      if (identities.size !== existing.length) throw new Error("Existing records contain duplicate identities.");
      const missing = source.rows.filter(row => {
        const previous = identities.get(row.sourceId);
        if (!previous) return true;
        if (previous.contentHash !== row.contentHash) throw new Error("Conflicting source identity requires reconciliation.");
        job.duplicates++; return false;
      });
      for (let index = 0; index < missing.length; index += 12) {
        const creates = missing.slice(index, index + 12).map(row => ({ schema: TransferSchema, values: {
          datasetKey: key(dataset.key as Hex), sourceId: row.sourceId, chainId: u64(row.chainId), contract: addr(row.contract), blockNumber: u64(row.blockNumber), blockHash: key(row.blockHash as Hex), sourceTime: u64(row.timestamp), txHash: key(row.txHash as Hex), ...(row.txIndex === null ? {} : { txIndex: u64(row.txIndex) }), logIndex: u64(row.logIndex), sender: addr(row.sender), recipient: addr(row.recipient), amountRaw: u256(row.amountRaw), amount: row.amount, decimals: u64(6), contentHash: key(row.contentHash as Hex), rpcHost: source.rpcHost, ingestedAt: u64(nowSeconds()), abiVersion: "ERC20.Transfer.v1", eventSignature: "Transfer(address,address,uint256)",
        }, expiration: expiration(), flags: immutable }));
        // A failed send is reconciled from Arkiv on the next run; never retry a write blindly.
        const result = await writer.executeBatch({ creates });
        job.txHashes.push(result.txHash); job.processed += creates.length; await saveJob(job);
        await writeState("heartbeat", { at: new Date().toISOString(), pid: process.pid });
      }
      const blockQuery = `${baseQuery("axis.block.v1", writerAddress())} AND datasetKey = key(${dataset.key}) AND blockNumber >= u64(${start}) AND blockNumber <= u64(${end})`;
      const oldBlocks = await scanEntities(blockQuery);
      const byNumber = new Map(oldBlocks.map(entity => [String(unpack(entity).blockNumber), unpack(entity)]));
      const blocks = source.blocks.filter(block => {
        const old = byNumber.get(block.number);
        if (old && old.blockHash !== block.hash) throw new Error("Stored block hash differs from the source.");
        return !old;
      });
      if (blocks.length) {
        const result = await writer.executeBatch({ creates: blocks.map(block => ({ schema: BlockSchema, values: { datasetKey: key(dataset.key as Hex), sourceId: `137:${block.hash}`, chainId: u64(137), blockNumber: u64(block.number), blockHash: key(block.hash as Hex), sourceTime: u64(block.timestamp) }, expiration: expiration(), flags: immutable })) }); job.txHashes.push(result.txHash);
      }
      job.stage = "verifying"; await publishStatus(job);
      await verifyTransfers(dataset.key, source.rows, start.toString(), end.toString());
      const readBlocks = await scanEntities(blockQuery);
      if (readBlocks.length !== source.blocks.length || source.blocks.some(block => !readBlocks.some(entity => { const a = unpack(entity); return a.blockNumber === block.number && a.blockHash === block.hash && a.sourceTime === block.timestamp; }))) throw new Error("Block metadata readback verification failed.");
      await verifyBlockHashes(Object.fromEntries(source.blocks.map(block => [block.number, block.hash])));
      const metrics = aggregateTransfers(source.rows), rangeHash = hashDocument(source.rows.map(row => row.contentHash));
      const coverageDoc = { blockHashes: Object.fromEntries(source.blocks.map(block => [block.number, block.hash])), transactionHashes: [...job.txHashes], verifiedAt: new Date().toISOString(), sourceRpcHost: source.rpcHost, abiVersion: "ERC20.Transfer.v1", importerVersion: 1 };
      const result = await writer.createEntity(CoverageSchema, { datasetKey: key(dataset.key as Hex), fromBlock: u64(start), toBlock: u64(end), rows: u64(source.rows.length), contentHash: key(rangeHash), verified: true, document: stringToBytes(JSON.stringify(coverageDoc)) }, { expiration: expiration(), flags: immutable });
      job.txHashes.push(result.txHash);
      const storedManifest = await getEntity("axis.coverage.v1", result.entityKey, writerAddress());
      if (unpack(storedManifest).contentHash !== rangeHash) throw new Error("Coverage manifest verification failed.");
      for (const day of metrics.series) {
        const metric = await writer.createEntity(MetricSchema, { datasetKey: key(dataset.key as Hex), fromBlock: u64(start), toBlock: u64(end), sourceTime: u64(Math.floor(Date.parse(day.bucket) / 1000)), transfers: u64(day.transfers), amountRaw: u256(day.amountRaw), document: stringToBytes(JSON.stringify({ ...day, scope: "observed block interval; not a complete calendar day", coverageKey: result.entityKey })) }, { expiration: expiration(), flags: immutable });
        job.txHashes.push(metric.txHash);
      }
      await saveJob(job);
    }
    job.stage = "complete"; await publishStatus(job);
    return job;
  } catch (error) {
    job.stage = "failed"; job.error = safeError(error); await saveJob(job);
    if (error instanceof SourceConsistencyError) {
      try { await writer.createEntity(CoverageAlertSchema, { datasetKey: key(job.datasetKey as Hex), sourceTime: u64(nowSeconds()), document: stringToBytes(JSON.stringify({ reason: job.error, resolution: "Pause this dataset and publish a new dataset revision after validating the source RPC." })) }, { expiration: expiration(), flags: immutable }); }
      catch { await writeState("source-alert-" + job.datasetKey, { reason: job.error }); }
    }
    try { await publishStatus(job); } catch { /* The local failure remains visible if Arkiv itself is unavailable. */ }
    throw new Error(job.error);
  }
}
