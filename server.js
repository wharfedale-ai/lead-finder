import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { loadState, saveState, loadEnv, DATA_DIR } from './lib/store.js';
import { blocked, contacted, identities, localDay, toCSV, TEMPLATE, whatsappLink, emailLink, normalisePhone } from './lib/core.js';
import { searchBusinesses } from './lib/search.js';
import { findEmails, mapTwo } from './lib/emails.js';
import { estimate, draftMessages, callScripts } from './lib/drafts.js';
import { purposeOf, DEFAULT_CHAINS, flagChains, plainFit, websiteSignals, fitEstimate, judgeFit, moveStage, followUp } from './lib/research.js';
import { checkCompany, pecrFlag, HUB } from './lib/companies.js';
import { demoState } from './lib/demo.js';

const ROOT=path.dirname(fileURLToPath(import.meta.url)); await loadEnv(path.join(ROOT,'.env'));
let state=await loadState();const realState=state;let demo=false; const csrf=randomUUID(); const apiKey=process.env.ANTHROPIC_API_KEY;const companyKey=process.env.COMPANIES_HOUSE_API_KEY;
let busy=false; let job=null; let quote=null;
const port=Number(process.env.PORT || 4310); const origin=`http://127.0.0.1:${port}`;
function allLeads(){return [...new Map([...Object.values(state.library||{}),...state.leads].map(l=>[l.id,l])).values()];}
function findLead(id){return allLeads().find(l=>l.id===id);}
async function persist(){state.library||={};for(const lead of state.leads)state.library[lead.id]=lead;if(!demo)await saveState(state);}
function decorate(lead){return {...lead,stage:lead.stage||'New',fit:lead.fit||plainFit(lead,lead.purpose),blocked:blocked(lead,state),contacted:contacted(lead,state),pecr:pecrFlag(lead.company,lead.purpose),followup:!blocked(lead,state)?followUp(lead):null};}
function view() {return {leads:state.leads.map(decorate).sort((a,b)=>b.fit.score-a.fit.score),pipeline:allLeads().map(decorate),purpose:state.purpose||purposeOf(),query:state.query||null,settings:{...state.settings,template:state.settings.template||TEMPLATE,chains:state.settings.chains??DEFAULT_CHAINS.join('\n')},dnc:state.dnc,contacts:state.contacts,today:state.contacts.filter(c=>c.day===localDay()).length,hasKey:!demo&&Boolean(apiKey),hasCompanyKey:!demo&&Boolean(companyKey),demo,job,busy};}
function selected(ids,{allowContacted=false}={}) {if(!Array.isArray(ids)||ids.length>100)throw new Error('Select up to 100 businesses.');return allLeads().filter(l=>ids.includes(l.id)&&!blocked(l,state)&&(allowContacted||!contacted(l,state)));}
async function body(req) {let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>250000)throw new Error('Request too large.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString()||'{}');}
function json(res,status,value) {res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(value));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  if(req.headers.host!==`127.0.0.1:${port}`)return json(res,403,{error:'Use the local 127.0.0.1 address.'});
  try {
    const url=new URL(req.url,origin);
    if(req.method==='GET') {
      if(url.pathname==='/api/state')return json(res,200,{...view(),csrf});
      if(url.pathname==='/api/export') {const rows=selected(url.searchParams.getAll('id'),{allowContacted:true}).map(l=>({...l,status:contacted(l,state)?'Contacted':'Not contacted'}));res.writeHead(200,{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="wharfedale-leads.csv"'});return res.end(toCSV(rows));}
      if(['/vendor/leaflet.js','/vendor/leaflet.css'].includes(url.pathname)){res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':'text/css');return res.end(await readFile(path.join(ROOT,'node_modules/leaflet/dist',path.basename(url.pathname))));}
      const files={'/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/fonts/inter.woff2':'fonts/inter.woff2','/fonts/dm-serif.woff2':'fonts/dm-serif.woff2','/demo-map.svg':'demo-map.svg','/icons.svg':'icons.svg','/theme.js':'theme.js'};
      if(files[url.pathname]){const data=await readFile(path.join(ROOT,'public',files[url.pathname]));res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':url.pathname.endsWith('.woff2')?'font/woff2':'text/html; charset=utf-8');return res.end(data);}
      return json(res,404,{error:'Page not found.'});
    }
    if(req.method!=='POST')return json(res,405,{error:'Method not allowed.'});
    if(req.headers.origin && req.headers.origin!==origin)return json(res,403,{error:'Foreign origin blocked.'});
    const token=Buffer.from(req.headers['x-csrf-token']||'');const expected=Buffer.from(csrf);
    if(token.length!==expected.length||!timingSafeEqual(token,expected))return json(res,403,{error:'Reload the page and try again.'});
    if(busy)return json(res,409,{error:'Another job is running. Please wait.'});
    const data=await body(req);
    if(busy)return json(res,409,{error:'Another job is running. Please wait.'});
    if(url.pathname==='/api/demo'){demo=Boolean(data.enabled);state=demo?demoState():realState;job=null;quote=null;return json(res,200,view());}
    if(url.pathname==='/api/search') {
      const purpose=purposeOf(data.purpose);if(!purpose.lookingFor)throw new Error('Tell us what you are looking for.');
      if(demo){state.purpose=purpose;for(const lead of state.leads){lead.purpose=purpose;lead.fit=plainFit(lead,purpose);lead.message='';lead.callScript='';}return json(res,200,view());}
      busy=true;job={kind:'search',status:'running',message:'Starting your search'};quote=null;
      json(res,202,view());
      searchBusinesses(data,state,message=>{job.message=message;}).then(async leads=>{
        const old=new Map(allLeads().map(l=>[l.id,l]));state.purpose=purpose;state.query={type:data.type,town:data.town,country:data.country,limit:data.limit};
        state.leads=leads.map(l=>{const previous=old.get(l.id);const changed=previous&&JSON.stringify(purposeOf(previous.purpose))!==JSON.stringify(purpose);return {...l,...(previous||{}),purpose,selected:true,...(changed?{message:'',callScript:''}:{})};});flagChains(state.leads,state.settings.chains?.split('\n').filter(Boolean)||DEFAULT_CHAINS);for(const lead of state.leads)lead.fit=plainFit(lead,purpose);
        state.searches||=[];state.searches.push({at:new Date().toISOString(),type:data.type,town:data.town,country:data.country,purpose,ids:leads.map(l=>l.id)});await persist();job={kind:'search',status:'done',message:`Found ${leads.length} businesses. Maps may return fewer than requested.`};
      }).catch(error=>{job={kind:'search',status:'error',message:error.message};}).finally(()=>{busy=false;});return;
    }
    busy=true;
    try {
      if(url.pathname==='/api/settings') {
        const sender=String(data.sender||'').trim();const offer=String(data.offer||'').trim();
        if(!sender||sender.length>100||!offer||offer.length>250)throw new Error('Add your name or business and a short offer.');
        state.settings={sender,offer,template:String(data.template||TEMPLATE).slice(0,2000),chains:String(data.chains??DEFAULT_CHAINS.join('\n')).slice(0,10000)};flagChains(state.leads,state.settings.chains.split('\n').filter(Boolean));quote=null;
      } else if(url.pathname==='/api/lead') {
        const lead=findLead(data.id);if(!lead)throw new Error('Business not found.');
        if(typeof data.message==='string')lead.message=data.message.slice(0,4000);
        if(typeof data.selected==='boolean')lead.selected=data.selected;
        if(typeof data.notes==='string')lead.notes=data.notes.slice(0,5000);
        if(typeof data.consentConfirmed==='boolean'){lead.consentConfirmed=data.consentConfirmed;lead.consentAt=new Date().toISOString();}
      } else if(url.pathname==='/api/emails'||url.pathname==='/api/websites') {
        const leads=selected(data.ids).filter(l=>l.website);
        if(demo){busy=false;job={status:'done',message:'Demo website signals and emails are fictional. No network calls made.'};return json(res,200,view());}
        job={kind:'emails',status:'running',message:'Finding emails from public website pages'};
        // Return immediately so the UI can poll progress during network requests.
        json(res,202,view());
        mapTwo(leads,async lead=>{try{const {home,...result}=await findEmails(lead.website,undefined,{homeOnly:url.pathname==='/api/websites'});if(url.pathname==='/api/websites'){result.emails=[...new Set([...(lead.emails||[]),...result.emails])];result.evidence=[...new Map([...(lead.evidence||[]),...result.evidence].map(e=>[e.email+'|'+e.source,e])).values()];}Object.assign(lead,result);lead.site=websiteSignals(home.text,home.url);lead.fit=plainFit(lead,lead.purpose);}catch(error){lead.note=error.message;}job.message=`Checking websites: ${leads.filter(l=>l.note).length} of ${leads.length}`;}).then(async()=>{await persist();job={kind:'emails',status:'done',message:`Checked ${leads.length} websites. Emails are never guessed.`};}).catch(()=>{job={kind:'emails',status:'error',message:'Email check could not be saved.'};}).finally(()=>{busy=false;});return;
      } else if(url.pathname==='/api/companies') {
        const leads=selected(data.ids);
        if(!demo)for(const lead of leads){try{lead.company=await checkCompany(lead,companyKey);}catch(error){lead.company={matched:false,note:error.message,hub:HUB};}if(companyKey)await new Promise(r=>setTimeout(r,600));}
      } else if(url.pathname==='/api/stage') {
        const lead=findLead(data.id);if(!lead||blocked(lead,state))throw new Error('Business is blocked or missing.');
        if(data.stage==='Contacted'&&!contacted(lead,state)&&state.contacts.filter(c=>c.day===localDay()).length>=20&&!data.overrideCap)return json(res,409,{error:'You have marked 20 contacts today. Continue only if you want to exceed your soft cap.',softCap:true});
        moveStage(lead,data.stage);
        if(data.stage==='Contacted'&&!contacted(lead,state))state.contacts.push({id:randomUUID(),name:lead.name,keys:identities(lead),day:localDay(),at:new Date().toISOString()});
      } else if(url.pathname==='/api/fit-estimate') {
        const leads=selected(data.ids,{allowContacted:true});if(!leads.length)throw new Error('Select a business first.');
        const cost=fitEstimate(leads,state.purpose,!demo&&Boolean(apiKey),state.fitCache||{});quote={kind:'fit',id:randomUUID(),ids:leads.map(l=>l.id),expires:Date.now()+600000};return json(res,200,{...cost,quote:quote.id});
      } else if(url.pathname==='/api/fit') {
        if(!quote||quote.kind!=='fit'||quote.id!==data.quote||quote.expires<Date.now())throw new Error('Get a fresh fit estimate first.');
        const leads=selected(quote.ids,{allowContacted:true});quote=null;state.fitCache||={};await judgeFit(leads,state.purpose,state.fitCache,demo||data.templateOnly?null:apiKey);
      } else if(url.pathname==='/api/estimate') {
        const leads=selected(data.ids);if(!leads.length)throw new Error('Select at least one new business.');
        const cost=estimate(leads,state.settings,!demo&&Boolean(apiKey));quote={kind:data.kind==='call'?'call':'draft',id:randomUUID(),ids:leads.map(l=>l.id),expires:Date.now()+600000};
        return json(res,200,{...cost,quote:quote.id});
      } else if(url.pathname==='/api/draft'||url.pathname==='/api/call') {
        const kind=url.pathname==='/api/call'?'call':'draft';
        if(!quote ||quote.kind!==kind|| quote.id!==data.quote || quote.expires<Date.now())throw new Error('Get a fresh cost estimate first.');
        const leads=selected(quote.ids);quote=null;const key=demo||data.templateOnly?null:apiKey;
        const results=kind==='call'?await callScripts(leads,state.settings,key):await draftMessages(leads,state.settings,key);
        for(const result of results){const lead=findLead(result.id);if(result.message){lead.message=result.message;lead.draftSource=result.source;}if(result.script){lead.callScript=result.script;lead.callScriptSource=result.source;lead.callScriptNote=result.note||'';}lead.draftError=result.error||'';}
      } else if(url.pathname==='/api/contact') {
        const lead=findLead(data.id);if(!lead||blocked(lead,state)||contacted(lead,state)&&!(data.followup&&followUp(lead)==='due'))throw new Error('Already contacted or on the do not contact list.');
        if(state.contacts.filter(c=>c.day===localDay()).length>=20 && !data.overrideCap)return json(res,409,{error:'You have marked 20 contacts today. Continue only if you want to exceed your soft cap.',softCap:true});
        if(data.followup){lead.followupCount=1;lead.lastFollowupAt=new Date().toISOString();}else moveStage(lead,'Contacted');
        state.contacts.push({id:randomUUID(),name:lead.name,keys:identities(lead),day:localDay(),at:new Date().toISOString(),followup:Boolean(data.followup)});
      } else if(url.pathname==='/api/dnc') {
        const lead=findLead(data.id);
        if(lead){if(!blocked(lead,state))state.dnc.push({id:randomUUID(),name:lead.name,keys:identities(lead),at:new Date().toISOString()});}
        else {
          const value=String(data.value||'').trim();const phone=normalisePhone(value,data.country||'GB');
          const email=/^[\w.+-]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(value)?value.toLowerCase():'';
          if(!phone&&!email)throw new Error('Enter a valid international phone number or email.');
          const key=phone?'phone:'+phone:'email:'+email;
          if(!state.dnc.some(d=>d.keys.includes(key)))state.dnc.push({id:randomUUID(),name:value,keys:[key],at:new Date().toISOString()});
        }
      } else if(url.pathname==='/api/open') {
        if(demo)throw new Error('Demo mode never opens real contact links.');
        const lead=findLead(data.id);if(!lead||blocked(lead,state)||contacted(lead,state)&&!(data.followup&&followUp(lead)==='due'))throw new Error('Already contacted or on the do not contact list.');
        if(!pecrFlag(lead.company,lead.purpose).allowed&&!lead.consentConfirmed)throw new Error('Confirm consent before electronic sales outreach, or use phone or letter after checking the applicable calling rules.');
        if(!lead.message.trim())throw new Error('Write a message before opening it.');
        const link=data.channel==='email'?emailLink(lead.emails[0],lead.message):whatsappLink(lead.phone,lead.message,lead.country);
        if(!link)throw new Error('No valid contact details for this channel.');
        return json(res,200,{url:link});
      } else return json(res,404,{error:'Action not found.'});
      await persist();busy=false;json(res,200,view());
    } finally {if(!['/api/emails','/api/websites'].includes(url.pathname)||demo)busy=false;}
  } catch(error){json(res,400,{error:error instanceof SyntaxError?'Invalid request.':error.message});}
});
server.requestTimeout=15000;
server.listen(port,'127.0.0.1',()=>process.stdout.write(`Wharfedale Lead Finder: ${origin}\n`));
server.on('error',error=>{console.error(error.code==='EADDRINUSE'?`Port ${port} is in use. Set PORT in .env to another port.`:'The local server could not start.');process.exitCode=1;});
