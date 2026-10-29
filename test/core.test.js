import test from 'node:test';
import assert from 'node:assert/strict';
import { normalisePhone, whatsappLink, extractEmails, contactPages, toCSV, renderTemplate, finalMessage, OPT_OUT, contacted, blocked } from '../lib/core.js';
import { robotsAllowed, findEmails, mapTwo } from '../lib/emails.js';
import { isPublicIP, publicText } from '../lib/network.js';
import { scraperArgs, parseResults } from '../lib/search.js';
import { estimate, draftMessages, MODEL } from '../lib/drafts.js';

test('normalises UK local, country prefixes and international phones',()=>{
 for(const raw of ['07700 900123','+44 7700 900123','0044 7700 900123','447700900123'])assert.equal(normalisePhone(raw),'+447700900123');
 assert.equal(normalisePhone('(415) 555-2671','US'),'+14155552671');assert.equal(normalisePhone('030 901820','DE'),'+4930901820');assert.equal(normalisePhone('not a number'),'');assert.equal(normalisePhone('123'),'');
});
test('wa.me encodes message and excludes invalid numbers',()=>{assert.equal(whatsappLink('07700900123','Hello & thanks?'), 'https://wa.me/447700900123?text=Hello%20%26%20thanks%3F');assert.equal(whatsappLink('bad','Hi'),'');});
test('extracts mailto, visible and HTML entities, ignoring scripts, images and placeholders',()=>{
 const html='<a href="mailto:Hello@fixture-shop.test?subject=Hi">Email</a> team&#64;fixture-shop.test <script>secret@hidden.test</script> icon@2x.png user@example.com your@domain.com';
 assert.deepEqual(extractEmails(html),['hello@fixture-shop.test','team@fixture-shop.test']);
});
test('finds at most three distinct same-origin relevant pages',()=>{assert.deepEqual(contactPages('<a href="/contact">Contact</a><a href="https://other.com/about">About</a><a href="/contact">Again</a><a href="/about">About</a><a href="/privacy">Privacy</a><a href="/contact-us">More</a>','https://fixture-shop.test/'),['https://fixture-shop.test/contact','https://fixture-shop.test/about','https://fixture-shop.test/privacy']);});
test('CSV quotes multiline and formula values safely',()=>{const csv=toCSV([{name:'=HYPERLINK("x")',address:'One, two\nthree',phone:'+447700900123'}]);assert.ok(csv.startsWith('\uFEFF'));assert.ok(csv.includes('"\'=HYPERLINK(""x"")"'));assert.ok(csv.includes('"One, two\nthree"'));assert.ok(csv.includes("' +44".replace(' ','')));});
test('template replacement leaves unknown placeholders and output is under 70 words',()=>{
 assert.equal(renderTemplate('Hi {name}, {category}, {location}, {sender}, {unknown}',{name:'A',category:'B',location:'C'},{sender:'D'}),'Hi A, B, C, D, {unknown}');
 const result=finalMessage('Hello '.repeat(100)+'https://bad.com');assert.ok(result.split(/\s+/).length<70);assert.ok(result.endsWith(OPT_OUT));assert.ok(!result.includes('https://'));
});
test('robots honours allow specificity, user agent and wildcard rules',()=>{
 const rules='User-agent: *\nDisallow: /private\nAllow: /private/contact\nDisallow: /*?secret=\nUser-agent: WharfedaleLeadFinder\nDisallow: /hidden';
 assert.equal(robotsAllowed(rules,'https://a.com/hidden'),false);assert.equal(robotsAllowed('User-agent: *\nDisallow: /private','https://a.com/private'),false);assert.equal(robotsAllowed('User-agent: *\nDisallow: /private\nAllow: /private/contact','https://a.com/private/contact'),true);
});
test('email crawl checks robots first, skips disallowed pages, keeps sources',async()=>{
 const fetched=[];const mock=async url=>{fetched.push(url);return {status:200,url,type:'text/html',text:url.endsWith('robots.txt')?'User-agent: *\nDisallow: /about':url.endsWith('/contact')?'sales@fixture-shop.test':'hello@fixture-shop.test <a href="/contact">Contact</a><a href="/about">About</a>'};};
 const result=await findEmails('https://fixture-shop.test/',mock);assert.deepEqual(result.emails,['hello@fixture-shop.test','sales@fixture-shop.test']);assert.equal(fetched[0],'https://fixture-shop.test/robots.txt');assert.ok(!fetched.includes('https://fixture-shop.test/about'));assert.equal(result.evidence[1].source,'https://fixture-shop.test/contact');
});
test('email crawl fails closed for unavailable robots',async()=>{await assert.rejects(findEmails('https://fixture-shop.test/',async()=>({status:503})),/robots/);});
test('two workers maximum',async()=>{let active=0,max=0;await mapTwo([1,2,3,4,5],async()=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,3));active--;});assert.equal(max,2);});
test('private IPs blocked, DNS pinned fetch rejects local URLs',async()=>{
 for(const ip of ['127.0.0.1','10.2.3.4','169.254.169.254','192.168.0.1','172.16.0.1','::1','::ffff:127.0.0.1','fd00::1'])assert.equal(isPublicIP(ip),false);
 assert.equal(isPublicIP('8.8.8.8'),true);await assert.rejects(publicText('http://127.0.0.1/'),/Private/);await assert.rejects(publicText('file:///etc/passwd'),/HTTP/);
});
test('FAST mode only and scraper actual web_site field',()=>{
 const args=scraperArgs('in','out',{lat:53,lon:-1},20);assert.ok(args.includes('-fast-mode'));assert.ok(!args.includes('-email'));const results=parseResults('{"title":"A","web_site":"https://fixture-shop.test","phone":"07700900123","cid":"1"}\n',{country:'GB',town:'Leeds',type:'Barber',limit:20});assert.equal(results[0].website,'https://fixture-shop.test');assert.equal(results[0].phone,'+447700900123');
});
test('contact and suppression identity matches phone/email across listing ids',()=>{
 const lead={id:'new',phone:'+447700900123',emails:['hello@fixture-shop.test']};assert.ok(contacted(lead,{contacts:[{keys:['phone:+447700900123']}]}));assert.ok(blocked(lead,{dnc:[{keys:['email:hello@fixture-shop.test']}]}));
});
test('draft cost and real API contract through mock, no-key fallback',async()=>{
 const leads=[{id:'1',name:'Sample',category:'Barber',rating:4.9,location:'Leeds'}];const settings={sender:'Wharfedale AI',offer:'websites'};
 assert.equal(estimate(leads,settings,false).usd,0);assert.ok(estimate(leads,settings,true).usd>0);
 const drafts=await draftMessages(leads,settings,'synthetic-key',async(url,request)=>{const body=JSON.parse(request.body);assert.equal(body.model,MODEL);assert.equal(request.headers['x-api-key'],'synthetic-key');assert.ok(!body.messages[0].content.includes('phone'));return {ok:true,json:async()=>({content:[{type:'text',text:'Hi Sample, I am Wharfedale AI. May we chat?'}]})};});
 assert.ok(drafts[0].message.endsWith(OPT_OUT));assert.equal((await draftMessages(leads,settings,null))[0].source,'template');
});
