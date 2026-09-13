import { test, expect } from "@playwright/test";
test("admin separates payment and placement status and checks a checkout timeline", async ({page}, info) => {
  const token = [{alg:"RS256",typ:"JWT"},{sub:"admin-fixture",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600},"fixture"].map(x=>Buffer.from(typeof x === "string"?x:JSON.stringify(x)).toString("base64url")).join(".");
  await page.route("**/api/auth/**", route => route.fulfill({json: route.request().url().includes("token") ? {token} : {session:{id:"session",token:"session-token",userId:"admin-fixture",expiresAt:new Date(Date.now()+86400000).toISOString()},user:{id:"admin-fixture",email:"admin@example.com",emailVerified:true,name:"Admin",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}}}));
  await page.route("**/api/admin/health",route=>route.fulfill({status:503,json:{}}));
  const listArgs: Array<Record<string,unknown>> = [];
  await page.routeWebSocket(/convex.*\/sync/, socket => {
    let tick=0;const timestamp=()=>{const b=Buffer.alloc(8);b.writeBigUInt64LE(BigInt(tick));return b.toString("base64")};let version={querySet:0,identity:0,ts:timestamp()};
    const value=(path:string):unknown => path === "admin:identity" ? "admin@example.com" : path === "admin:overview" ? ({milestones:[]}) : path === "admin:list" ? ({rows:[{_id:"owner-fixture",displayName:"Pending project",kind:"paid",status:"pending",paymentStatus:"Awaiting payment",placementType:"Checkout purchase",paymentEnvironment:"test",checkoutSessionId:"cs_test_fixture",createdAt:1789255000000}],next:null}) : path === "deliveryAdmin:timeline" ? {events:[{at:1789255000000,label:"Checkout draft created"},{at:1789255001000,label:"Stripe checkout attached"},{at:1789255002000,label:"Resume email queued"},{at:1789255003000,label:"Resume email accepted by Resend"}],notes:[]} : null;
    function transition(modifications:unknown[],patch:Partial<typeof version>){tick++;const end={...version,...patch,ts:timestamp()};socket.send(JSON.stringify({type:"Transition",startVersion:version,endVersion:end,modifications}));version=end;}
    socket.onMessage(raw=>{const msg=JSON.parse(String(raw));if(msg.type==="Authenticate")transition([],{identity:msg.baseVersion+1});if(msg.type==="ModifyQuerySet") { for(const q of msg.modifications) if(q.udfPath === "admin:list") listArgs.push(q.args[0]); } if(msg.type==="ModifyQuerySet")transition(msg.modifications.map((q:{type:string,queryId:number,udfPath:string})=>q.type==="Remove"?{type:"QueryRemoved",queryId:q.queryId}:{type:"QueryUpdated",queryId:q.queryId,value:value(q.udfPath),logLines:[],journal:null}),{querySet:msg.newVersion});});
  });
  let checks=0;
  await page.route("**/api/admin/recover", route=>{expect(route.request().postDataJSON()).toEqual({takeoverId:"owner-fixture"});checks++;return route.fulfill({json:{status:"unpaid",message:"Stripe has not confirmed payment. Nothing was published."}})});
  await page.goto("/admin");
  await page.getByRole("button",{name:"takeovers",exact:true}).click();
  await expect(page.locator("td strong").filter({hasText:"Awaiting payment"})).toBeVisible();
  await expect(page.getByText("Placement: pending · Checkout purchase")).toBeVisible();
  await page.getByText("Inspect",{exact:true}).click();
  await page.getByRole("button",{name:"Check Stripe status",exact:true}).click();
  await expect(page.getByRole("status")).toContainText("Nothing was published");
  await expect(page.getByText("Resume email accepted by Resend",{exact:true})).toBeVisible();
  expect(checks).toBe(1);
  await page.getByLabel("Payment status",{exact:false}).selectOption("Paid");
  await page.getByLabel("Payment environment",{exact:false}).selectOption("production");
  await expect.poll(()=>listArgs.at(-1)).toMatchObject({section:"takeovers",paymentStatus:"Paid",environment:"production"});
  await expect(page).toHaveURL(/\/admin$/);
  await page.screenshot({path:`/tmp/admin-payment-${info.project.name}.png`});
});
