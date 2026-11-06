import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
process.loadEnvFile(".env.worker.local");
const { withLock } = await import("../src/lib/axis/queue");
const { renewWorkerEntities } = await import("../src/lib/axis/renew");
const { safeError } = await import("../src/lib/axis/runtime");
try { console.log(JSON.stringify(await withLock("worker", renewWorkerEntities, 1))); } catch (error) { console.log(JSON.stringify({ error: safeError(error) })); process.exitCode = 1; }
