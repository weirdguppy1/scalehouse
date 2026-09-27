import { recoverCallProcessing } from "../services/recovery.service";

const staleMinutes = Number(process.argv[2] ?? 15);
if (!Number.isFinite(staleMinutes) || staleMinutes < 1) throw new Error("Usage: npm run recover:calls -- [stale-minutes]");
recoverCallProcessing(staleMinutes).then(result => { console.log(JSON.stringify(result)); if (result.failed) process.exitCode = 1; }).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
