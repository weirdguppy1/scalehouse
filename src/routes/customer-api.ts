import { Router, type NextFunction, type Response } from "express";
import { ZodError } from "zod";
import { requireApiAuth, requireScope, type ApiRequest } from "../middleware/api-auth";
import { createRateLimiter } from "../middleware/rate-limit";
import { callQuerySchema, configUpdateSchema, customerApiService, monthSchema } from "../services/customer-api.service";

export const customerApiRouter = Router();
customerApiRouter.use(requireApiAuth, createRateLimiter());
const tenant = (request: ApiRequest) => request.tenant!;
customerApiRouter.get("/me", async (request: ApiRequest,response,next)=>{try{const t=tenant(request);response.json(await customerApiService.me(t.businessId,{id:t.apiKeyId,name:t.keyName,scopes:t.scopes}));}catch(e){next(e);}});
customerApiRouter.get("/readiness",requireScope("readiness:read"),async(request:ApiRequest,response,next)=>{try{response.json(await customerApiService.readiness(tenant(request).businessId));}catch(e){next(e);}});
customerApiRouter.get("/usage",requireScope("usage:read"),async(request:ApiRequest,response,next)=>{try{const month=monthSchema.parse(request.query.month??new Date().toISOString().slice(0,7));response.json(await customerApiService.usage(tenant(request).businessId,month));}catch(e){next(e);}});
customerApiRouter.get("/calls",requireScope("calls:read"),async(request:ApiRequest,response,next)=>{try{response.json(await customerApiService.calls(tenant(request).businessId,callQuerySchema.parse(request.query)));}catch(e){next(e);}});
customerApiRouter.get("/calls/:id",requireScope("calls:read"),async(request:ApiRequest,response,next)=>{try{const call=await customerApiService.call(tenant(request).businessId,String(request.params.id));if(!call)return response.status(404).json({error:{code:"not_found",message:"Call not found"}});response.json(call);}catch(e){next(e);}});
customerApiRouter.get("/config",requireScope("config:read"),async(request:ApiRequest,response,next)=>{try{response.json(await customerApiService.config(tenant(request).businessId));}catch(e){next(e);}});
customerApiRouter.patch("/config",requireScope("config:write"),async(request:ApiRequest,response,next)=>{try{const t=tenant(request);response.json(await customerApiService.updateConfig(t.businessId,t.apiKeyId,configUpdateSchema.parse(request.body)));}catch(e){next(e);}});
customerApiRouter.use((error:unknown,_request:ApiRequest,response:Response,_next:NextFunction)=>{if(error instanceof ZodError)return response.status(400).json({error:{code:"invalid_request",message:"Request validation failed",issues:error.issues.map(i=>({path:i.path.join("."),message:i.message}))}});response.status(500).json({error:{code:"internal_error",message:"Request failed"}});});
