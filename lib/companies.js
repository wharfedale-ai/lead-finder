import { nameKey } from './research.js';
import { USER_AGENT } from './network.js';
export const HUB='https://developer.company-information.service.gov.uk/';
export function postcodeOf(address=''){return address.toUpperCase().match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)?.[0].replace(/\s/g,'')||'';}
const companyName=value=>nameKey(value).replace(/\b(limited|ltd|plc|llp)\b/g,'').replace(/\s+/g,' ').trim();
export function matchCompany(lead,items) {
  const postcode=postcodeOf(lead.address);
  if(!postcode)return null;
  const matches=items.filter(item=>companyName(item.title)===companyName(lead.name)&&postcodeOf(item.address?.postal_code)===postcode);
  return matches.length===1?matches[0]:null;
}
export function pecrFlag(company,purpose={}) {
  if(purpose.goal==='suppliers')return {applies:false,label:'Supplier enquiry: PECR sales flag not applied',allowed:true};
  const corporate=['ltd','private-limited-guarant-nsc','private-limited-guarant-nsc-limited-exemption','llp','plc'];
  if(company?.matched&&company.status==='active'&&corporate.includes(company.type))return {applies:true,label:'OK to approach with opt-out',allowed:true};
  return {applies:true,label:'Needs consent: phone or letter, not cold WhatsApp/email',allowed:false};
}
export function safeCompany(profile,officers) {
  const names=officers.map(o=>({name:String(o.name||''),role:String(o.officer_role||''),active:!o.resigned_on}));
  const directors=names.filter(o=>o.active&&o.role==='director');
  let directorFirstName='';
  if(directors.length===1){const name=directors[0].name;directorFirstName=(name.includes(',')?name.split(',')[1]:name).trim().split(/\s+/)[0]||'';}
  return {matched:true,number:profile.company_number,name:profile.company_name,type:profile.type,status:profile.company_status,incorporated:profile.date_of_creation,sic:profile.sic_codes||[],officers:names,directorFirstName,checkedAt:new Date().toISOString()};
}
export async function checkCompany(lead,key,fetcher=fetch) {
  if(!key)return {matched:false,note:'Add a free Companies House key',hub:HUB};
  if(lead.country!=='GB')return {matched:false,note:'Companies House covers UK registered companies only.'};
  const request=async endpoint=>{const res=await fetcher('https://api.company-information.service.gov.uk'+endpoint,{headers:{Authorization:'Basic '+Buffer.from(key+':').toString('base64'),'User-Agent':USER_AGENT},signal:AbortSignal.timeout(5000)});if(!res.ok)throw new Error('Companies House unavailable. Check the API key or try later.');return res.json();};
  const results=await request('/search/companies?q='+encodeURIComponent(lead.name)+'&items_per_page=50');
  const match=matchCompany(lead,results.items||[]);if(!match)return {matched:false,note:'No unambiguous name and postcode match. Business type unknown: may be a sole trader or partnership.'};
  const number=encodeURIComponent(match.company_number);const profile=await request('/company/'+number);const officers=[];
  for(let start=0;start<1000;start+=100){const page=await request('/company/'+number+'/officers?items_per_page=100&start_index='+start);officers.push(...(page.items||[]));if(start+100>=page.total_results)break;if(start===900)throw new Error('Officer list is too large to verify the director count.');}
  return safeCompany(profile,officers);
}
