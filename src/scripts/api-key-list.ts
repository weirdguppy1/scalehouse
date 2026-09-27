import { apiKeyService } from "../services/api-key.service";
const business=process.argv[2];if(!business)throw new Error("Usage: npm run api-key:list -- <business-identifier>");apiKeyService.list(business).then(keys=>console.table(keys)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
