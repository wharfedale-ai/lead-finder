import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { demoState } from '../lib/demo.js';
import { localDay } from '../lib/core.js';
import { findEmails } from '../lib/emails.js';

test('daily soft cap covers contact button and pipeline, with explicit override',async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'lead-finder-cap-'));const state=demoState();state.contacts=Array.from({length:20},(_,i)=>({id:'prior-'+i,keys:['id:prior-'+i],day:localDay()}));await writeFile(path.join(dir,'state.json'),JSON.stringify(state));
 const port=14395;const base='http://127.0.0.1:'+port;const child=spawn(process.execPath,['server.js'],{cwd:process.cwd(),env:{...process.env,PORT:String(port),LEAD_FINDER_DATA_DIR:dir,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:''},windowsHide:true,stdio:['ignore','pipe','pipe']});
 try{await once(child.stdout,'data');const {csrf}=await(await fetch(base+'/api/state')).json();const post=async(action,data)=>{const response=await fetch(base+'/api/'+action,{method:'POST',headers:{'content-type':'application/json','x-csrf-token':csrf},body:JSON.stringify(data)});return {status:response.status,data:await response.json()};};
 const blocked=await post('contact',{id:'demo-0'});assert.equal(blocked.status,409);assert.equal(blocked.data.softCap,true);assert.equal((await post('stage',{id:'demo-0',stage:'Contacted'})).status,409);
 const allowed=await post('contact',{id:'demo-0',overrideCap:true});assert.equal(allowed.status,200);assert.equal(allowed.data.today,21);assert.equal(allowed.data.leads.find(l=>l.id==='demo-0').stage,'Contacted');
 await post('settings',{sender:'Example',offer:'Boxes',chains:''});const saved=await(await fetch(base+'/api/state')).json();assert.equal(saved.settings.chains,'');
 }finally{child.kill();await once(child,'exit');}
});
test('fast website check does not follow contact pages and passes a shared deadline',async()=>{
 const calls=[];const result=await findEmails('https://example.com/',async(url,opts)=>{calls.push({url,deadline:opts?.deadline});return {url,status:200,type:'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nAllow: /':'Published site <a href="/contact">Contact</a>'};},{homeOnly:true});assert.equal(calls.length,2);assert.ok(calls.every(c=>Number.isFinite(c.deadline)));assert.equal(result.home.status,200);
});
