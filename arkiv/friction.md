# What got in our way

The biggest improvement for AXIS would be a supported way to scan a large result efficiently and consistently. We also lost time on address formatting and long identifiers. Here is what happened, including the parts that were our own query design.

## 1. Getting a full analytical result took much longer than getting a table

Our first implementation requested a count and a full entity projection on every 100-row page. That was wasteful: the charts needed transfer fields, not a repeated field schema and another total for each page.

On one live scope of **7,380 transfers**, analytics took **51,387 ms**, made **79 RPC calls**, and received **21,439,598 characters** of decoded response text. After reducing projections, moving verification to count-only reads and scanning four disjoint key ranges, one measured run took **20,870 ms** and received **9,482,471 characters**. The optimized scan made 81 calls: the gain came from less work per page and parallel reads, not fewer round trips. Another run took about 22 seconds. A separate sequential scan produced exactly the same aggregates.

We expected a dashboard-sized scope to feel interactive. We could make the table fast, but complete analytics still took noticeable time. The page limit itself is documented; the awkward part was building a safe iterator, concurrency control and a post-scan consistency check around it.

**How to reproduce our current read path:** configure `.env.local`, then run:

```powershell
npx.cmd tsx scripts/axis-read-benchmark.ts 0x0c190ee3773030e0ada7b23d11717ee99a86adc4e7c4478c23e87149a653b89b --verify
```

That runs real reads and compares the parallel result with a fresh sequential scan of the same predicate. It does not recreate the old implementation or promise the same timing; the source is live. To recreate the expensive request shape, fetch each cursor page with `select: { key: true, owner: true, creator: true, expiresAt: true, attributes: true, attributeSchema: true }` and `count: true`, instead of counting once where it is needed.

**What we would like:** a documented SDK scan helper with backpressure, count-free subsequent pages, clear progress and a way to pin reads to a block or detect changes across pages. Today each page reads the latest block. Our final count check catches count differences; it does not turn several pages into a database snapshot.

Code: [key-range scan](../src/lib/axis/key-scan.ts), [read coordination](../src/lib/axis/arkiv-read.ts), [benchmark](../scripts/axis-read-benchmark.ts). Relevant Arkiv docs: [pagination](https://docs.arkiv.network/querying/paginate/), [counts](https://docs.arkiv.network/querying/count/).

## 2. A valid address came back with different casing

Our publisher writes records, reads them back, reconstructs their content and compares it with the staged source. We expected equivalent addresses to compare consistently through that round trip. The SDK returned checksummed address strings while our canonical source used lowercase. The address was correct, but our content comparison disagreed.

We fixed the comparison by normalizing typed address fields, while leaving the original JSON payload alone. Existing records were reused rather than published a second time. This was a serialization mismatch in our integration, not evidence that Arkiv changed the address.

**Reproduce without spending testnet funds:**

```powershell
npx.cmd vitest run src/lib/axis/bulk/published-store.test.ts
```

The test named `normalizes checksummed SDK address attributes without changing raw JSON payloads` constructs a typed address and exercises our readback normalization.

**What we would like:** one short SDK example showing typed address serialization, checksum formatting and how to compare a record after reading it back. A canonical round-trip helper would make content-hash checks easier to get right.

Code: [storedRecord](../src/lib/axis/bulk/arkiv-publication.ts), [publication history](../docs/bulk-publication.md).

## 3. A useful source identifier did not fit in a string field

A Polymarket outcome identity combines a chain, condition ID and a large token ID. The complete identity can exceed **128 UTF-8 bytes**. We initially treated it as an ordinary source ID. Preflight rejected the longer value, and that import revision never committed a visible source block.

We expected to keep the source identity intact. Our fix was to index a compact hashed identity and keep the full original in the document. That preserves the source value without making the query field too long.

**Reproduce the shape:** `137:outcome:` + a 32-byte hex condition ID + `:` + the decimal representation of `2^255`. Check its UTF-8 byte length. The regression test constructs this exact kind of identity:

```powershell
npx.cmd vitest run src/lib/axis/bulk/enrichment.test.ts
```

**What we would like:** an early validation error that names the field, reports its byte length and suggests a `key` plus document pattern for long identities. A practical identifier-design example would have saved us a failed publication attempt.

Code: [enrichmentRecord](../src/lib/axis/bulk/enrichment.ts), [the regression test](../src/lib/axis/bulk/enrichment.test.ts).

## Our next request: make retention dependencies easier to see

A dashboard, dataset definition, coverage manifest and transfer record can all have different expiry blocks. Extending a report does not extend its sources. We handled this with explicit renewal and count checks, but a dependency/retention inspection tool would help builders explain why a previously working report has lost data. This is a tooling request, not a claim that we observed a live expiry event during this demo.
