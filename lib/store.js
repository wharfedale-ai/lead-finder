import { mkdir, readFile, writeFile, rename, copyFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const DATA_DIR = process.env.LEAD_FINDER_DATA_DIR || path.join(os.homedir(),'.wharfedale-lead-finder');
export async function loadState(dir=DATA_DIR) {
  await mkdir(dir,{recursive:true,mode:0o700});
  try { const value=JSON.parse(await readFile(path.join(dir,'state.json'),'utf8')); if(!Array.isArray(value.leads)||!Array.isArray(value.contacts)||!Array.isArray(value.dnc)) throw new Error('Invalid saved data'); return value; }
  catch(error) { if(error.code!=='ENOENT') throw new Error('Saved data could not be read. Restore state.json.bak before starting.'); }
  return {leads:[],contacts:[],dnc:[],settings:{sender:'Wharfedale AI',offer:'websites and useful automation'},geocache:{}};
}
export async function saveState(state,dir=DATA_DIR) {
  const target=path.join(dir,'state.json');
  try{await copyFile(target,target+'.bak');}catch(error){if(error.code!=='ENOENT')throw error;}
  await writeFile(target+'.tmp',JSON.stringify(state,null,2),{mode:0o600}); await rename(target+'.tmp',target);
}
export async function loadEnv(file) {
  try {for(const line of (await readFile(file,'utf8')).split(/\r?\n/)) {const match=line.match(/^\s*(?:export\s+)?(ANTHROPIC_API_KEY|COMPANIES_HOUSE_API_KEY|NOMINATIM_URL|PORT)\s*=\s*(.*?)\s*$/); if(match && !(match[1] in process.env))process.env[match[1]]=match[2].replace(/^(['"])(.*)\1$/,'$2');}}catch(error){if(error.code!=='ENOENT')throw error;}
}
