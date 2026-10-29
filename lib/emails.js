import robotsParser from 'robots-parser';
import { publicText, USER_AGENT } from './network.js';
import { extractEmails, contactPages } from './core.js';

export function robotsAllowed(text, url) {
  return robotsParser(new URL('/robots.txt',url).href,text).isAllowed(url,USER_AGENT) !== false;
}
export async function findEmails(website, fetchPage = publicText, options = {}) {
  const deadline=options.homeOnly?Date.now()+5000:undefined;
  const rules=new Map();const lastRequest=new Map();
  async function beforeRequest(url) {
    if(!rules.has(url.origin)) {
      const robots=await fetchPage(new URL('/robots.txt',url).href,{deadline});
      if(![200,404,410].includes(robots.status))throw new Error('robots.txt unavailable; website skipped.');
      rules.set(url.origin,robotsParser(new URL('/robots.txt',url).href,robots.status===200?robots.text:''));
      lastRequest.set(url.origin,Date.now());
    }
    const parser=rules.get(url.origin);
    if(parser.isAllowed(url.href,USER_AGENT)===false)throw new Error('Website blocked by robots.txt.');
    const delay=(parser.getCrawlDelay(USER_AGENT)||0)*1000;
    if(delay>5000)throw new Error('Website skipped: robots crawl delay exceeds 5 seconds.');
    const wait=Math.max(0,delay-(Date.now()-(lastRequest.get(url.origin)||0)));
    if(wait)await new Promise(resolve=>setTimeout(resolve,wait));
    lastRequest.set(url.origin,Date.now());
  }
  const url=new URL(website);await beforeRequest(url);
  const home=await fetchPage(url.href,{beforeRequest,deadline});
  if(home.status!==200)throw new Error('Website did not return a page.');
  if(home.type&&!/text\/html|application\/xhtml/i.test(home.type))throw new Error('Website is not an HTML page.');
  const evidence=extractEmails(home.text).map(email=>({email,source:home.url}));
  for(const page of options.homeOnly?[]:contactPages(home.text,home.url)) {
    try {
      await beforeRequest(new URL(page));
      const response=await fetchPage(page,{beforeRequest,sameOrigin:new URL(home.url).origin});
      if(response.status===200&&(!response.type||/text\/html|application\/xhtml/i.test(response.type)))for(const email of extractEmails(response.text))evidence.push({email,source:response.url});
    }catch{/* Failed contact pages do not discard verified evidence. */}
  }
  return {emails:[...new Set(evidence.map(e=>e.email))],evidence,note:evidence.length?'Found on public website pages.':'No email found. Nothing guessed.',home};
}
export async function mapTwo(items, callback) {
  let index=0; const output=new Array(items.length);
  await Promise.all([0,1].map(async()=>{while(index<items.length){const i=index++; output[i]=await callback(items[i],i);}}));
  return output;
}
