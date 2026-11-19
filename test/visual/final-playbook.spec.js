"use strict";
const {test,expect}=require("@playwright/test");
const {fixture}=require("../helpers/controlled-clock-server");
const settings={rotationSeconds:240,breakSeconds:0,oneShot:true,finalRoundFormat:"new",finalRestRotations:3};
const makeList=(n,dns=[])=>({headers:["#","Athlete"],rows:Array.from({length:n},(_,i)=>[String(i+1),"Athlete "+(i+1)]),routeCount:4,excludedParticipants:dns});

async function withPages(browser,n,dns,run){
  const cleanups=[],contexts=[],pages=[],errors=[];
  try {
    const server=await fixture({after:fn=>cleanups.push(fn)},"darwin",{liveClocks:true,requestTimeoutMs:3000});
    await server.action({type:"primary",primaryClientId:"clock-test"});
    await server.action({type:"settings",activePreset:"final",settings:{rotationMinutes:4,breakSeconds:0,oneShot:true,finalRoundFormat:"new"}});
    await server.action({type:"startLists",startLists:[makeList(n,dns)]});
    await server.action({type:"startListEnabled",enabled:true});
    for(const [id,url] of [["clock-test","/"],["playbook-legacy","/legacy.html?clientId=playbook-legacy"]]){
      const ctx=await browser.newContext();contexts.push(ctx);
      await ctx.addInitScript(c=>{sessionStorage.setItem("boulderingTimerClientId",c.clientId);sessionStorage.setItem("fdvBrowserSecret",c.secret);},await server.credentials(id));
      const page=await ctx.newPage();pages.push(page);page.on("pageerror",e=>errors.push(e.message));
      await page.goto(server.baseUrl+url,{waitUntil:"domcontentloaded"});
      if(id === "playbook-legacy") await expect(pages[0].locator('[data-legacy-mode-client="playbook-legacy"]')).toBeAttached();
      await server.action({type:"startListDisplay",targetClientId:id,listIndex:0,enabled:true});
      await expect(page.locator(".start-list-table, .protocol-table")).toBeVisible();
    }
    await run(server,pages);expect(errors).toEqual([]);
  } finally {for(const c of contexts)await c.close();for(const cleanup of cleanups.reverse())await cleanup();}
}
function marker(page,p,r,status){
  return page.locator(".start-list-table tbody tr, .protocol-table tbody tr").nth(p)
    .locator("td.route-cell, td.protocol-route-cell").nth(r).locator(".route-marker."+status);
}

for(const [dns,cycle,p,r] of [[[2],3,3,0],[[4],17,5,3]]){
  test(`Playbook DNS ${dns[0]+1}: next athlete occupies actual rotation ${cycle} in Modern and Legacy`,async({browser})=>{
    await withPages(browser,8,dns,async(server,pages)=>{
      await server.action({type:"seekCycle",cycle});
      for(const page of pages){
        await expect(marker(page,p,r,"active")).toBeVisible();
        await expect(marker(page,dns[0],0,"dns")).toHaveText("DNS");
        if(dns[0]===2)await expect(marker(page,dns[0],0,"dns")).toBeHidden();
        else await expect(marker(page,dns[0],0,"dns")).toBeVisible();
        if(dns[0]===2) await page.screenshot({path:test.info().outputPath(page===pages[0]?"modern-dns.png":"legacy-dns.png"),fullPage:true});
      }
      await server.start({activePreset:"final",settings});
      for(const page of pages)await expect(marker(page,p,r,"active")).toBeVisible();
      expect((await server.state()).startListFinalCycle).toBe(cycle-1);
    });
  });
}
test("exclusion strikes all route cells in Classic/Old Final and only skipped cells in New Final",async({browser})=>{
 await withPages(browser,8,[2],async(server,pages)=>{
  for(const [preset,format] of [["classic","old"],["final","old"],["final","new"]]){
   await server.action({type:"settings",activePreset:preset,settings:{rotationMinutes:4,breakSeconds:preset==="classic"?15:0,oneShot:preset==="final",finalRoundFormat:format}});
   for(const page of pages){const row=page.locator('.start-list-table tbody tr,.protocol-table tbody tr').nth(2);const cells=row.locator('td.route-cell,td.protocol-route-cell');
    await expect.poll(async()=>cells.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n,'::after').display))).toEqual(format==="new"?["block","none","none","none"]:["block","block","block","block"]);
    if(format==="new"){await expect(cells.nth(0).locator('.route-marker.dns')).toBeHidden();await expect(cells.nth(1).locator('.route-marker.dns')).toBeVisible();}
    await row.screenshot({path:test.info().outputPath(`exclusion-${preset}-${format}-${pages.indexOf(page)}.png`)});
   }
  }
 });
});

test("nine starters keep two active boulders at rotation 9 and finish at 22",async({browser})=>{
  await withPages(browser,9,[],async(server,pages)=>{
    await server.action({type:"seekCycle",cycle:9});
    for(const page of pages){
      await expect(marker(page,8,0,"active")).toBeVisible();await expect(marker(page,4,1,"active")).toBeVisible();
      await expect(marker(page,0,2,"active")).toHaveCount(0);
      await expect(page.locator(".route-marker.active")).toHaveCount(2);
      await page.screenshot({path:test.info().outputPath(page===pages[0]?"modern-nine.png":"legacy-nine.png"),fullPage:true});
    }
    await server.action({type:"seekCycle",cycle:22});
    for(const page of pages)await expect(marker(page,8,3,"active")).toBeVisible();
  });
});

test("DNS removal and restoration refresh both schedules without changing the running clock",async({browser})=>{
  await withPages(browser,8,[],async(server,pages)=>{
    await server.action({type:"seekCycle",cycle:3});await server.start({activePreset:"final",settings});
    const anchor=(await server.state()).timerClock.startedAt;
    await server.action({type:"startLists",startLists:[makeList(8,[2])]});
    for(const page of pages)await expect(marker(page,3,0,"active")).toBeVisible();
    expect((await server.state()).timerClock.startedAt).toBe(anchor);
    await server.action({type:"startLists",startLists:[makeList(8)]});
    for(const page of pages){await expect(marker(page,2,0,"active")).toBeVisible();await expect(page.locator(".route-marker.dns")).toHaveCount(0);}
    expect((await server.state()).timerClock.startedAt).toBe(anchor);
  });
});

test("a client receiving only one list uses the shared mapping when another list occupies a DNS slot",async({browser})=>{
  await withPages(browser,8,[2],async(server,pages)=>{
    await server.action({type:"startLists",startLists:[makeList(8,[2]),makeList(8)]});
    await server.action({type:"seekCycle",cycle:3});
    await expect(pages[1].locator(".protocol-table")).toHaveCount(1);
    for(const page of pages){
      await expect(marker(page,3,0,"ready")).toBeVisible();
      await expect(marker(page,3,0,"active")).toHaveCount(0);
    }
    // The viewed first list is unchanged; only the other list gains a DNS.
    await server.action({type:"startLists",startLists:[makeList(8,[2]),makeList(8,[2])]});
    for(const page of pages)await expect(marker(page,3,0,"active")).toBeVisible();
  });
});

test("standalone uses the same physical DNS rotations and persists them across reload",async({browser})=>{
  const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
  const root=path.resolve(__dirname,"../.."),directory=fs.mkdtempSync(path.join(os.tmpdir(),"fdv-playbook-")),file=path.join(directory,"timer.html");
  const result=require("node:child_process").spawnSync(process.execPath,[path.join(root,"scripts/build-standalone-html.js"),file],{cwd:root,encoding:"utf8"});
  expect(result.status,result.stderr).toBe(0);let ctx;
  try {
    ctx=await browser.newContext({offline:true});const page=await ctx.newPage();
    await page.goto(require("node:url").pathToFileURL(file).href,{waitUntil:"domcontentloaded"});
    await page.waitForFunction(()=>standaloneMode);
    await page.evaluate(()=>setPreset("final"));
    await page.evaluate(()=>setPreset("final",{finalRoundFormat:"new"}));
    await expect(page.locator('input[name="finalRoundFormat"][value="new"]')).toBeChecked();
    await page.locator("#startListToggle").check();
    await page.evaluate(async l=>{
      state.activePreset=state.runtimePreset="final";
      state.activeSettings={rotationSeconds:240,breakSeconds:0,oneShot:true,finalRoundFormat:"new",finalRestRotations:3};
      state.draftSettings={rotationMinutes:4,breakSeconds:0,oneShot:true,finalRoundFormat:"new",finalRestRotations:3};
      setInputsFromDraft(state.draftSettings);
      state.startListEnabled=true;state.startListFinalCycle=2;state.elapsedBeforePause=0.001;
      await commitStartLists([l]);render("playbook-test");saveOfflineSnapshot();
    },makeList(8,[2]));
    await expect(marker(page,3,0,"active")).toBeVisible();
    await page.reload({waitUntil:"domcontentloaded"});
    await expect(marker(page,3,0,"active")).toBeVisible();
    await expect(marker(page,2,0,"dns")).toHaveText("DNS");
  } finally {if(ctx)await ctx.close();fs.rmSync(directory,{recursive:true,force:true});}
});
