import { parsePhoneNumberFromString, getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js';
import { decodeHTML } from 'entities';
import { createHash } from 'node:crypto';

export const OPT_OUT = "If this isn't for you, just say and I won't message again.";
export const TEMPLATE = "Hi {name}, I'm {sender}. I help businesses with {offer}. I came across your {category} business in {location} and wondered if a quick chat would be useful. " + OPT_OUT;
export function countryCode(value = 'GB') {
  const aliases = {UK:'GB', 'UNITED KINGDOM':'GB', 'GREAT BRITAIN':'GB', USA:'US', 'UNITED STATES':'US', CANADA:'CA', AUSTRALIA:'AU', IRELAND:'IE', FRANCE:'FR', GERMANY:'DE', PAKISTAN:'PK', INDIA:'IN'};
  const code = aliases[value.trim().toUpperCase()] || value.trim().toUpperCase();
  if (!isSupportedCountry(code)) throw new Error('Use a supported two-letter country code, such as GB, US or PK.');
  return code;
}
export function normalisePhone(raw, country = 'GB') {
  try {
    let value = String(raw || '').trim().replace(/^00/, '+');
    const code = countryCode(country);
    if (!value.startsWith('+') && value.replace(/\D/g, '').startsWith(getCountryCallingCode(code)) && !value.startsWith('0')) value = '+' + value;
    const phone = parsePhoneNumberFromString(value, code);
    return phone?.isPossible() ? phone.number : '';
  } catch { return ''; }
}
export function whatsappLink(phone, message, country) {
  const number = normalisePhone(phone, country);
  return number ? `https://wa.me/${number.slice(1)}?text=${encodeURIComponent(message)}` : '';
}
export function emailLink(email, message) {
  return /^[\w.!#$%&'*+/=?^`{|}~-]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(email || '') ? `mailto:${encodeURIComponent(email)}?subject=Hello%20from%20Wharfedale&body=${encodeURIComponent(message)}` : '';
}
export function extractEmails(html) {
  const clean = decodeHTML(String(html).replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, ' '));
  const found = clean.match(/[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}/gi) || [];
  return [...new Set(found.map(x=>x.toLowerCase()).filter(x=> !/\.(png|jpe?g|gif|webp|svg|avif|ico|woff2?)$/i.test(x) && !/(^|@)(example\.|test\.|domain\.|yourdomain\.|email\.|sentry\.)|^(your|name|user|someone|test|noreply|no-reply)@/i.test(x)))].slice(0, 30);
}
export function contactPages(html, base) {
  const urls = [];
  for (const match of String(html).matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const url = new URL(decodeHTML(match[1]), base); url.hash = '';
      if (url.origin === new URL(base).origin && /contact|about|privacy/i.test(url.pathname + match[2]) && url.href !== base) urls.push(url.href);
    } catch {}
  }
  return [...new Set(urls)].slice(0, 3);
}
export function renderTemplate(template, lead, settings = {}) {
  const values = {name:lead.name, category:lead.category || 'local', location:lead.location || lead.address || 'your area', sender:settings.sender || 'Wharfedale AI', offer:settings.offer || 'websites and useful automation'};
  return template.replace(/\{(name|category|location|sender|offer)\}/g, (_,key)=>values[key] || '');
}
export function finalMessage(message, sales = true) {
  let clean = String(message).replace(/[\u2013\u2014]/g, ',').replace(/https?:\/\/\S+|www\.\S+/gi, '').trim();
  clean = clean.replace(OPT_OUT, '').trim();
  const available = 69 - (sales ? OPT_OUT.split(/\s+/).length : 0);
  return clean.split(/\s+/).slice(0,available).join(' ') + (sales ? ' ' + OPT_OUT : '');
}
export function toCSV(rows) {
  const fields = ['name','phone','website','rating','reviews','category','address','emails','message','status'];
  const cell = x => '"' + String(Array.isArray(x) ? x.join('; ') : x ?? '').replace(/^[\s]*([=+@-])/, "'$1").replace(/"/g, '""') + '"';
  return '\uFEFF' + [fields.map(cell).join(','), ...rows.map(r=>fields.map(k=>cell(r[k])).join(','))].join('\r\n');
}
export function leadId(lead) { return createHash('sha256').update(String(lead.placeId || `${lead.name}|${lead.address}`)).digest('hex').slice(0,24); }
export function identities(lead) {
  const emailKeys = (lead.emails || []).map(x=>'email:'+x.toLowerCase());
  return ['id:'+lead.id, ...(lead.phone ? ['phone:'+lead.phone] : []), ...emailKeys];
}
export function blocked(lead, state) { return state.dnc.some(entry=>entry.keys.some(k=>identities(lead).includes(k))); }
export function contacted(lead, state) { return state.contacts.some(entry=>entry.keys.some(k=>identities(lead).includes(k))); }
export function localDay(date = new Date()) { return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-'); }
