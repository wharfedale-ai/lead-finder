import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const dir=await mkdtemp(path.join(os.tmpdir(),'lead-finder-ui-'));
const port=14394;const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),LEAD_FINDER_DATA_DIR:dir,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;let checks=0;const errors=[];const external=[];
function check(value,message){assert.ok(value,message);checks++;}
try {
 await once(child.stdout,'data');browser=await chromium.launch({headless:true,channel:process.env.LEAD_FINDER_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined)});await mkdir('reports',{recursive:true});
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},deviceScaleFactor:1,reducedMotion:'reduce'});const page=await context.newPage();
  page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await context.route('**/*',route=>{if(!route.request().url().startsWith(base)){external.push(route.request().url());route.abort();}else route.continue();});
  await page.goto(base);await page.getByText('Template drafting ready. No API key needed.').waitFor();await page.evaluate(()=>document.fonts.ready);
  check(await page.title()==='Wharfedale Lead Finder','Title');check(await page.locator('#empty').isVisible(),'Empty workspace');
  await page.screenshot({path:`reports/core-empty-${width}.png`,fullPage:true});
  await page.locator('#demo-toggle').check();await page.locator('#demo-banner').waitFor({state:'visible'});await page.locator('#rows tr').first().waitFor();
  check(await page.locator('#rows tr').count()===5,'Chains hidden by default');check(await page.locator('#demo-badge').isVisible(),'Demo badge');
  check(await page.locator('#rows .fit-badge').count()===5,'Every lead has fit');
  const scores=await page.locator('#rows .fit-badge').allTextContents();check(scores.map(s=>Number(s.split(' ')[0])).every((s,i,a)=>i===0||s<=a[i-1]),'Fit descending');
  check(await page.locator('#rows button').filter({hasText:'Open in WhatsApp'}).first().isDisabled(),'Demo contact links disabled');
  await page.getByRole('link',{name:'Visit website'}).first().click();
  await page.screenshot({path:`reports/fit-list-${width}.png`,fullPage:true});
  await page.locator('#show-chains').check();check(await page.locator('#rows tr').count()===8,'Show chains');await page.locator('#show-chains').uncheck();
  await page.locator('#score').click();await page.locator('#cost-dialog').waitFor({state:'visible'});check((await page.locator('#cost-text').textContent()).includes('$0'),'No-key fit estimate');await page.locator('#confirm-draft').click();await page.getByText('Fit scores updated. Scores are judgements from available evidence.').waitFor();
  await page.locator('#draft').click();await page.locator('#cost-dialog').waitFor({state:'visible'});check((await page.locator('#cost-text').textContent()).includes('$0'),'Draft cost precedes generation');await page.locator('#confirm-draft').click();await page.getByText('Drafts ready. Review each one before use.').waitFor();
  const message=page.locator('#rows textarea.message').first();check((await message.inputValue()).includes('looking to buy'),'Supplier enquiry wording');check(!(await message.inputValue()).includes("I won't message again"),'No supplier sales opt-out');await message.fill('Edited synthetic message');await message.blur();
  await page.locator('#rows button').filter({hasText:'Call script'}).first().click();await page.locator('#cost-dialog').waitFor({state:'visible'});await page.locator('#confirm-draft').click();await page.locator('#rows .call-script').first().waitFor();check((await page.locator('#rows .call-script').first().inputValue()).includes('small runs'),'Call script uses purpose');
  await page.locator('#view-pipeline').click();check(await page.locator('.pipeline-column').count()===6,'Six pipeline stages');await page.screenshot({path:`reports/pipeline-${width}.png`,fullPage:true});
  await page.locator('#view-map').click();await page.locator('.leaflet-interactive').first().waitFor();check(await page.locator('.leaflet-interactive').count()===5,'Five demo pins');await page.screenshot({path:`reports/map-${width}.png`,fullPage:true});
  await page.locator('#map').scrollIntoViewIfNeeded();await page.locator('.leaflet-interactive').first().click({force:true});check(await page.locator('#table-wrap').isVisible(),'Pin opens business shortlist');
  await page.locator('#demo-banner').scrollIntoViewIfNeeded();await page.screenshot({path:`reports/demo-${width}.png`,fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);check(!overflow,'No page horizontal overflow at '+width);
  const targets=await page.locator('button:visible,input[type=checkbox]:visible,summary:visible').evaluateAll(nodes=>nodes.filter(n=>!n.disabled).map(n=>({tag:n.tagName,w:n.getBoundingClientRect().width,h:n.getBoundingClientRect().height})));check(targets.filter(n=>n.tag!=='INPUT').every(n=>n.h>=43),'Buttons and summaries have 44px targets');
  await page.locator('#demo-toggle').uncheck();await page.locator('#empty').waitFor({state:'visible'});check(await page.locator('#rows tr').count()===0,'Real empty data restored');
  await context.close();
 }
 check(external.length===0,'Demo made zero external requests');check(errors.length===0,'No browser errors: '+errors.join('; '));
 const receipt={checks,widths:[1440,390],externalRequests:external,browserErrors:errors,syntheticOnly:true,realMessagesSent:0};await writeFile('reports/ui-check.json',JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt)+'\n');
}finally{await browser?.close();child.kill();await once(child,'exit');}
