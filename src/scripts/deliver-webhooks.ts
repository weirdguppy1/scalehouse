import { webhookService } from "../services/webhook.service";
const batch=Number(process.argv[2]??25);webhookService.deliverDue(batch).then(result=>{console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;}).catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
