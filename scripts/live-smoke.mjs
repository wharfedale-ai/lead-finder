// Explicit external smoke check. Never contacts a lead or opens a messaging link.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const dir=await mkdtemp(path.join(os.tmpdir(),'lead-finder-live-'));const port=14396;const base='http://127.0.0.1:'+port;
const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),LEAD_FINDER_DATA_DIR:dir,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
try{
 await once(child.stdout,'data');let state=await(await fetch(base+'/api/state')).json();const csrf=state.csrf;
 const response=await fetch(base+'/api/search',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify({type:'barbers',town:'Leeds',country:'GB',limit:20,purpose:{goal:'customers',lookingFor:'Local barbers who might benefit from booking and admin automation'}})});assert.equal(response.status,202);
 const start=Date.now();do{await new Promise(r=>setTimeout(r,500));state=await(await fetch(base+'/api/state')).json();if(Date.now()-start>150000)throw new Error('Search smoke timed out');}while(state.busy);
 assert.equal(state.job.status,'done',state.job.message);assert.ok(state.leads.length>0&&state.leads.length<=20);assert.ok(state.leads.every(l=>l.fit&&l.purpose.lookingFor&&l.stage==='New'));assert.equal(state.pipeline.length,state.leads.length);
 const receipt={date:new Date().toISOString(),search:'barbers, Leeds, GB',mode:'FAST only',count:state.leads.length,withPhone:state.leads.filter(l=>l.phone).length,withWebsite:state.leads.filter(l=>l.website).length,purposeSaved:true,fitOnEveryLead:true,pipelinePopulated:true,realContactLinksOpened:0,realMessagesSent:0,rawResults:'Only in an isolated local temporary data folder, never in the repo'};
 await writeFile('reports/live-smoke.json',JSON.stringify(receipt,null,2));process.stdout.write(JSON.stringify(receipt)+'\n');
}finally{child.kill();await once(child,'exit');}
