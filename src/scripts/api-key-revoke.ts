import { apiKeyService } from "../services/api-key.service";
const id=process.argv[2];if(!id)throw new Error("Usage: npm run api-key:revoke -- <key-id>");apiKeyService.revoke(id).then(result=>console.log(`Revoked API key ${result.id}.`)).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
