import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import request from "supertest";
import { createApiAuth, requireScope, type ApiKeyLookup } from "./api-auth";
import { API_KEY_PATTERN, generateApiKey, hashApiKey } from "../services/api-key.service";

const appFor = (lookup: ApiKeyLookup, scope?: "calls:read") => { const app=express(); app.get("/",createApiAuth(lookup),...(scope?[requireScope(scope)]:[]),(req,res)=>res.json((req as any).tenant)); return app; };
const fixture = (overrides: Record<string,unknown>={}) => { const key=generateApiKey(); const row={id:"key-a",business_id:"business-a",name:"Primary",key_hash:key.hash,scopes:["calls:read"],revoked_at:null,expires_at:null,...overrides}; const lookup:ApiKeyLookup={find:async()=>[row as any],touch:async()=>undefined};return{key,lookup};};
test("API auth rejects a missing key",async()=>{const {lookup}=fixture();assert.equal((await request(appFor(lookup)).get("/")).status,401);});
test("API auth rejects a malformed key without database lookup",async()=>{let calls=0;const lookup:ApiKeyLookup={find:async()=>{calls++;return[]},touch:async()=>undefined};assert.equal((await request(appFor(lookup)).get("/").set("authorization","Bearer nope")).status,401);assert.equal(calls,0);});
test("API auth rejects an invalid key",async()=>{const {lookup}=fixture();const wrong=generateApiKey().secret;assert.equal((await request(appFor(lookup)).get("/").set("authorization",`Bearer ${wrong}`)).status,401);});
test("API auth rejects revoked and expired keys with the same safe error",async()=>{for(const overrides of [{revoked_at:new Date().toISOString()},{expires_at:new Date(Date.now()-1000).toISOString()}]){const {key,lookup}=fixture(overrides);const response=await request(appFor(lookup)).get("/").set("authorization",`Bearer ${key.secret}`);assert.equal(response.status,401);assert.equal(response.body.error.message,"Invalid API credential");}});
test("API auth accepts a valid key and derives its tenant",async()=>{const {key,lookup}=fixture();const response=await request(appFor(lookup)).get("/").set("authorization",`Bearer ${key.secret}`);assert.equal(response.status,200);assert.equal(response.body.businessId,"business-a");assert.equal(response.body.apiKeyId,"key-a");});
test("scope middleware rejects a valid key without the required scope",async()=>{const {key,lookup}=fixture({scopes:["config:read"]});const response=await request(appFor(lookup,"calls:read")).get("/").set("authorization",`Bearer ${key.secret}`);assert.equal(response.status,403);assert.equal(response.body.error.code,"insufficient_scope");});
test("generated API credentials are random, correctly formatted, and represented by a one-way hash",()=>{const first=generateApiKey();const second=generateApiKey();assert.match(first.secret,API_KEY_PATTERN);assert.notEqual(first.secret,second.secret);assert.equal(first.hash,hashApiKey(first.secret));assert.equal(first.hash.length,64);assert.equal(first.hash.includes(first.secret),false);});
