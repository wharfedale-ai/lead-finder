import { mkdir, readFile, writeFile, chmod, rename, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { DATA_DIR } from './store.js';
import { USER_AGENT } from './network.js';
import { countryCode, normalisePhone, leadId } from './core.js';
import { distanceKm, purposeOf } from './research.js';

export const RELEASE='v1.18.1';
export const ASSETS={
  win32:{name:'google_maps_scraper-1.18.1-windows-amd64.exe',size:61168128,sha:'c124fab30f12e4aae25ef52f38eb2bea5422ece708b3171ca0f34be56cf7848f'},
  linux:{name:'google_maps_scraper-1.18.1-linux-amd64',size:76455544,sha:'af573eeab19b174e8a70a5c804b80f191681b2c9d01c96706691af6567926062'},
  darwin:{name:'google_maps_scraper-1.18.1-darwin-amd64',size:62792512,sha:'9793889f88df54944c8faaf8ed90363c60b324d15444dd7bb692662f9aa50a75'}
};
let installing;
async function install() {
  const asset=ASSETS[process.platform];
  if(!asset || !['x64','arm64'].includes(process.arch)) throw new Error('This platform has no pinned scraper binary. See README.');
  if(process.arch==='arm64' && process.platform!=='darwin') throw new Error('The pinned scraper requires an x64 machine.');
  const dir=path.join(DATA_DIR,'bin'); await mkdir(dir,{recursive:true}); const target=path.join(dir,asset.name);
  async function valid(file) {try {return (await stat(file)).size===asset.size && createHash('sha256').update(await readFile(file)).digest('hex')===asset.sha;}catch{return false;}}
  if(await valid(target))return target;
  const res=await fetch(`https://github.com/gosom/google-maps-scraper/releases/download/${RELEASE}/${asset.name}`,{signal:AbortSignal.timeout(120000),headers:{'User-Agent':USER_AGENT}});
  if(!res.ok)throw new Error('Could not download the pinned scraper. Try again when online.');
  const bytes=Buffer.from(await res.arrayBuffer());
  if(bytes.length!==asset.size || createHash('sha256').update(bytes).digest('hex')!==asset.sha)throw new Error('Scraper integrity check failed. Download was not installed.');
  await writeFile(target+'.part',bytes,{mode:0o700}); await rename(target+'.part',target); await chmod(target,0o700); return target;
}
export async function ensureBinary() { if(!installing)installing=install().finally(()=>{installing=null;}); return installing; }
let lastGeocode=0;
export async function geocode(town,country,state) {
  const key=`${town.toLowerCase()}|${country}`;
  if(state.geocache?.[key]) return state.geocache[key];
  const wait=Math.max(0,1100-(Date.now()-lastGeocode)); if(wait)await new Promise(r=>setTimeout(r,wait)); lastGeocode=Date.now();
  const url=new URL(process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/search');
  url.search=new URLSearchParams({q:town,countrycodes:country.toLowerCase(),format:'json',limit:'1'}).toString();
  const response=await fetch(url,{headers:{'User-Agent':USER_AGENT},signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error('Town lookup is unavailable. Please try later.');
  const [place]=await response.json(); if(!place)throw new Error('Town not found in that country. Try a nearby larger town.');
  state.geocache ||= {}; state.geocache[key]={lat:Number(place.lat),lon:Number(place.lon)};
  return state.geocache[key];
}
export function scraperArgs(input,output,geo,limit) {
  return ['-fast-mode','-input',input,'-results',output,'-json','-geo',`${geo.lat},${geo.lon}`,'-radius','10000','-zoom','14','-depth',String(Math.ceil(limit/20)),'-c','1','-exit-on-inactivity','30s'];
}
export function parseResults(text,{country,town,type,limit,geo,purpose}) {
  let raw;
  try{raw=JSON.parse(text);if(!Array.isArray(raw))raw=[raw];}catch{raw=text.split(/\r?\n/).filter(Boolean).map(line=>JSON.parse(line));}
  const unique=new Map();
  for(const entry of raw) {
    const lead={name:String(entry.title || entry.name || ''),phone:normalisePhone(entry.phone,country),website:String(entry.web_site||entry.website||''),rating:entry.review_rating ?? entry.rating ?? '',reviews:entry.review_count ?? '',category:String(entry.category||type),address:String(entry.address||''),placeId:entry.place_id||entry.cid||entry.link,location:town,country,emails:[],message:'',selected:true};
    if(!lead.name)continue;
    lead.lat=typeof entry.latitude==='number'?entry.latitude:null;lead.lon=typeof entry.longitude==='number'?entry.longitude:typeof entry.longtitude==='number'?entry.longtitude:null;
    lead.distanceKm=distanceKm(lead.lat,lead.lon,geo);lead.openNow=typeof entry.is_open==='boolean'?entry.is_open:null;lead.purpose=purposeOf(purpose);lead.stage='New';lead.stageAt=new Date().toISOString();
    lead.id=leadId(lead); unique.set(lead.id,lead);
  }
  return [...unique.values()].slice(0,limit);
}
export async function searchBusinesses(query,state,progress=()=>{}) {
  const country=countryCode(query.country);
  const town=String(query.town||'').trim(); const type=String(query.type||'').trim(); const limit=Number(query.limit);
  if(!town || !type || town.length>100 || type.length>100 || /[\r\n\x00]/.test(town+type) || !Number.isInteger(limit)||limit<20||limit>100)throw new Error('Enter a business type, town and 20 to 100 results.');
  progress('Locating your town'); const geo=await geocode(town,country,state);
  progress('Checking the pinned search tool. First download is about 60 to 77 MB'); const binary=await ensureBinary();
  const run=path.join(DATA_DIR,'searches',randomUUID()); await mkdir(run,{recursive:true});
  const input=path.join(run,'query.txt'); const output=path.join(run,'results.jsonl');
  await writeFile(input,`${type} in ${town}, ${country}\n`);
  progress('Searching Maps in FAST mode. This can take a minute');
  await new Promise((resolve,reject)=>{
    const child=spawn(binary,scraperArgs(input,output,geo,limit),{windowsHide:true,stdio:['ignore','ignore','pipe'],env:{...process.env,ANTHROPIC_API_KEY:'',COMPANIES_HOUSE_API_KEY:'',DISABLE_TELEMETRY:'1'}});
    child.stderr.resume();
    const timer=setTimeout(()=>{child.kill();reject(new Error('Search timed out after 2 minutes. Try a more specific business type.'));},120000);
    child.on('error',()=>{clearTimeout(timer);reject(new Error('Search tool could not start. On Apple Silicon install Rosetta 2.'));});
    child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Maps search failed. Try again later. No browser mode was used.'));});
  });
  let text; try{text=await readFile(output,'utf8');}catch{throw new Error('Search finished without a result file.');}
  return parseResults(text,{country,town,type,limit,geo,purpose:query.purpose});
}
