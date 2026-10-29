// Takes the README tutorial screenshots in Demo mode only: temporary data folder, no keys, every external request blocked.
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

const dir=await mkdtemp(path.join(os.tmpdir(),'lead-finder-shots-'));
const port=14395;const base='http://127.0.0.1:'+port;const out='docs/images';
const child=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:String(port),LEAD_FINDER_DATA_DIR:dir,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
let browser;
try {
 await once(child.stdout,'data');await mkdir(out,{recursive:true});
 browser=await chromium.launch({headless:true,channel:process.env.LEAD_FINDER_BROWSER_CHANNEL||(process.platform==='win32'?'chrome':undefined)});
 for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:1280,height:860},deviceScaleFactor:1,reducedMotion:'reduce',colorScheme:theme});
  await context.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
  const page=await context.newPage();const shot=async(name,target)=>(target||page).screenshot({path:`${out}/${name}-${theme}.png`});
  await page.goto(base);await page.getByText('Template drafting ready. No API key needed.').waitFor();await page.evaluate(()=>document.fonts.ready);
  await shot('01-start');
  await page.locator('#demo-toggle').check();await page.locator('#rows tr').first().waitFor();
  const form=page.locator('#search-form');
  await form.locator('select[name=goal]').selectOption('suppliers');
  await form.locator('input[name=lookingFor]').fill('UK manufacturers of corrugated cardboard boxes who can do small runs');
  await form.locator('input[name=type]').fill('Packaging manufacturers');await form.locator('input[name=town]').fill('Leeds');
  await form.locator('button[type=submit]').click();await page.locator('#rows tr').first().waitFor();await page.waitForTimeout(300);
  await shot('02-demo-search',page.locator('#find'));
  const leads=page.locator('#leads');await leads.scrollIntoViewIfNeeded();const box=await leads.evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:Math.min(r.height,820)};});await page.screenshot({path:`${out}/03-shortlist-${theme}.png`,fullPage:true,clip:box});
  await page.locator('#select-all').check();
  await page.locator('#find-emails').click();await page.waitForTimeout(500);
  const row=page.locator('#rows tr').filter({has:page.locator('input[type=checkbox]:checked')}).first();await row.scrollIntoViewIfNeeded();await shot('04-emails',row);
  await page.locator('#draft').click();await page.locator('#cost-dialog').waitFor({state:'visible'});await shot('05-cost');
  await page.locator('#confirm-draft').click();await page.getByText('Drafts ready. Review each one before use.').waitFor();
  await row.scrollIntoViewIfNeeded();await shot('06-draft',row);
  await page.locator('#view-pipeline').click();await page.locator('.pipeline-column').first().waitFor();await shot('07-pipeline',page.locator('#leads'));
  await page.locator('#settings-details').evaluate(d=>{d.open=true;});await page.locator('#settings-details').scrollIntoViewIfNeeded();await shot('08-settings',page.locator('#settings-details'));
  await context.close();
 }
 // Phone view of the shortlist, light only.
 const phone=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce',colorScheme:'light'});
 await phone.route('**/*',route=>route.request().url().startsWith(base)?route.continue():route.abort());
 const page=await phone.newPage();await page.goto(base);await page.locator('#demo-toggle').check();await page.locator('#rows tr').first().waitFor();
 await page.locator('#leads').scrollIntoViewIfNeeded();await page.screenshot({path:`${out}/09-phone-light.png`});
 await phone.close();
 process.stdout.write('Screenshots written to '+out+'\n');
}finally{await browser?.close();child.kill();await once(child,'exit');}
