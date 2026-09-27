import { Router } from "express";
import { openAIService } from "../services/openai.service";
import { supabaseService } from "../services/supabase.service";
import { twilioService } from "../services/twilio.service";
import { vapiService } from "../services/vapi.service";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.status(200).json({
    status: "ok",
    services: { openaiConfigured: openAIService.isConfigured(), twilioConfigured: twilioService.isConfigured(), supabaseConfigured: supabaseService.isConfigured(), vapiConfigured: vapiService.isConfigured() },
  });
});
