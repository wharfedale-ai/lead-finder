import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { demoState } from '../lib/demo.js';

test('local HTTP workflow, CSRF, duplicate contacts, pipeline, demo isolation and restart',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lead-finder-test-'));const initial=demoState();initial.leads=initial.leads.slice(0,4);initial.leads[0].company=null;initial.leads[3].stage='Contacted';initial.leads[3].contactedAt=new Date(Date.now()-4*86400000).toISOString();initial.purpose.goal='customers';for(const lead of initial.leads)lead.purpose={goal:'customers',lookingFor:'packaging customers'};
 await writeFile(path.join(dir,'state.json'),JSON.stringify(initial));
 const port=14393;let child;const start=async()=>{child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),LEAD_FINDER_DATA_DIR:dir,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:''},stdio:['ignore','pipe','pipe'],windowsHide:true});await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server did not start')),5000).unref())]);};
 await start();
 try{
  const base='http://127.0.0.1:'+port;let state=await(await fetch(base+'/api/state')).json();const token=state.csrf;
  const post=async(action,data,headers={})=>{const res=await fetch(base+'/api/'+action,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':token,...headers},body:JSON.stringify(data)});return {status:res.status,value:await res.json()};};
  assert.equal((await post('settings',{}, {'x-csrf-token':'wrong'})).status,403);assert.equal((await post('settings',{}, {origin:'https://foreign.invalid'})).status,403);
  assert.equal((await post('draft',{quote:'missing'})).status,400);
  const estimate=await post('estimate',{ids:['demo-0']});assert.equal(estimate.status,200);const drafted=await post('draft',{quote:estimate.value.quote});assert.equal(drafted.status,200);assert.equal(drafted.value.busy,false);assert.ok(drafted.value.leads.find(l=>l.id==='demo-0').message);
  assert.equal((await post('open',{id:'demo-0',channel:'whatsapp'})).status,400);await post('lead',{id:'demo-0',consentConfirmed:true});const blocked=await post('open',{id:'demo-0',channel:'whatsapp'});assert.equal(blocked.status,200);assert.match(blocked.value.url,/^https:\/\/wa.me\//);
  await post('lead',{id:'demo-0',notes:'A useful private note'});assert.equal((await post('contact',{id:'demo-0'})).status,200);assert.equal((await post('contact',{id:'demo-0'})).status,400);assert.equal((await post('open',{id:'demo-0',channel:'whatsapp'})).status,400);
  await post('dnc',{id:'demo-1'});assert.equal((await post('stage',{id:'demo-1',stage:'Meeting'})).status,400);assert.equal((await post('contact',{id:'demo-1',followup:true})).status,400);
  assert.equal((await post('contact',{id:'demo-3',followup:true})).status,200);assert.equal((await post('contact',{id:'demo-3',followup:true})).status,400);
  const before=await readFile(path.join(dir,'state.json'),'utf8');await post('demo',{enabled:true});const demo=await post('lead',{id:'demo-0',notes:'Demo note'});assert.equal(demo.value.demo,true);assert.equal((await post('open',{id:'demo-0',channel:'whatsapp'})).status,400);assert.equal((await post('emails',{ids:['demo-0']})).status,200);assert.equal(await readFile(path.join(dir,'state.json'),'utf8'),before);
  const restored=await post('demo',{enabled:false});assert.equal(restored.value.leads.find(l=>l.id==='demo-0').notes,'A useful private note');
  child.kill();await once(child,'exit');await start();state=await(await fetch(base+'/api/state')).json();assert.equal(state.leads.find(l=>l.id==='demo-0').contacted,true);assert.equal(state.leads.find(l=>l.id==='demo-1').blocked,true);assert.equal(state.demo,false);
 }finally{child.kill();await once(child,'exit');}
});
