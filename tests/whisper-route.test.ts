// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
const mocks=vi.hoisted(()=>({backend:vi.fn(),rate:vi.fn()}));
vi.mock("../lib/server",async original=>({...await original<typeof import("../lib/server")>(), backend:mocks.backend,rate:mocks.rate,clientHash:()=>"visitor"}));
import { HttpError } from "../lib/server";
import { POST } from "../app/api/whisper/route";
const modules=import.meta.glob("../convex/**/*.ts");
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date("2026-09-14T12:00:00Z"));});
afterEach(()=>vi.useRealTimers());
function request(id:string,text:string,origin="http://localhost:4000") {return new Request("http://localhost:4000/api/whisper",{method:"POST",headers:{origin,"Content-Type":"application/json"},body:JSON.stringify({takeoverId:id,text,company:""})});}
it("allows three messages through the real backend, limits the fourth, and recovers after a minute",async()=>{
  const t=convexTest(schema,modules);
  const logo=await t.run(ctx=>ctx.storage.store(new Blob(["logo"])));
  await t.mutation(internal.wall.seed,{logoStorageId:logo});
  const id=(await t.query(api.wall.current,{}))!.owner.id;
  mocks.rate.mockImplementation(async(_req,scope,max)=>t.mutation(internal.analytics.rate,{key:scope+":visitor",max,windowMs:60000}));
  mocks.backend.mockImplementation(async(op,args)=>{
    expect(op).toBe("whisperPost");
    try{return await t.mutation(internal.whispers.post,args);}catch(error){if(error instanceof Error&&error.message.includes("Too many requests"))throw new HttpError("Too many requests",429);throw error;}
  });
  for(const text of ["First","Second","Third"]) expect((await POST(request(id,text))).status).toBe(200);
  const blocked=await POST(request(id,"Fourth"));
  expect(blocked.status).toBe(429);
  expect(blocked.headers.get("Retry-After")).toBe("60");
  expect((await blocked.json()).error).toContain("message has been kept");
  expect(mocks.rate).not.toHaveBeenCalled();
  expect(await t.query(api.whispers.messages,{takeoverId:id})).toHaveLength(3);
  vi.setSystemTime(Date.now()+61000);
  expect((await POST(request(id,"Fourth"))).status).toBe(200);
  expect(await t.query(api.whispers.messages,{takeoverId:id})).toHaveLength(4);
});
it("still rejects requests from another origin",async()=>{
  expect((await POST(request("owner","Hello","https://evil.example"))).status).toBe(403);
  expect(mocks.backend).not.toHaveBeenCalled();
});
