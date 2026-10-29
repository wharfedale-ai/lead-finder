import http from 'node:http';
import https from 'node:https';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const USER_AGENT = 'WharfedaleLeadFinder/1.0 (+https://wharfedale.ai; local business research)';
export function isPublicIP(ip) {
  if (isIP(ip) === 4) {
    const [a,b] = ip.split('.').map(Number);
    return !(a===0 || a===10 || a===127 || a>=224 || (a===169&&b===254) || (a===172&&b>=16&&b<=31) || (a===192&&(b===168||b===0||b===2)) || (a===100&&b>=64&&b<=127) || (a===198&&(b===18||b===19||b===51)) || (a===203&&b===0));
  }
  // Only global unicast IPv6. Excludes mapped IPv4, local, multicast and documentation ranges.
  return isIP(ip) === 6 && /^[23]/i.test(ip) && !/^2001:db8:/i.test(ip);
}
export async function publicText(input, options = {}) {
  const deadline = options.deadline || Date.now()+5000;
  const redirects = options.redirects || 0;
  const url = new URL(input);
  if (options.beforeRequest) await options.beforeRequest(url);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port))) throw new Error('Only public HTTP websites on standard ports are supported.');
  const hostname = url.hostname.replace(/^\[|\]$/g,'');
  const addresses = await Promise.race([lookup(hostname,{all:true}), new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('Website timed out.')),Math.max(1,deadline-Date.now())); t.unref();})]);
  if (!addresses.length || addresses.some(x=>!isPublicIP(x.address))) throw new Error('Private or local website address blocked.');
  if (Date.now()>=deadline) throw new Error('Website timed out.');
  return new Promise((resolve,reject)=>{
    const transport = url.protocol === 'https:' ? https : http;
    const req = transport.get(url,{headers:{'User-Agent':USER_AGENT,Accept:'text/html,text/plain;q=0.9','Accept-Encoding':'identity'}, lookup:(_host,opts,cb)=> {const address=addresses[0]; cb(null,opts?.all ? [address] : address.address,address.family);}}, res=>{
      if (res.statusCode>=300 && res.statusCode<400 && res.headers.location) {
        res.resume();
        if (redirects>=4) return reject(new Error('Too many website redirects.'));
        const next = new URL(res.headers.location,url);
        if (options.sameOrigin && next.origin!==options.sameOrigin) return reject(new Error('Cross-origin redirect skipped.'));
        return publicText(next,{...options,deadline,redirects:redirects+1}).then(resolve,reject);
      }
      const chunks=[]; let size=0;
      res.on('data',chunk=>{size+=chunk.length; if(size>2_000_000) req.destroy(new Error('Website page exceeds 2 MB.')); else chunks.push(chunk);});
      res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,text:Buffer.concat(chunks).toString('utf8'),url:url.href,type:res.headers['content-type'] || ''}));
    });
    const timer=setTimeout(()=>req.destroy(new Error('Website timed out.')),Math.max(1,deadline-Date.now()));
    req.on('close',()=>clearTimeout(timer)); req.on('error',reject);
  });
}
