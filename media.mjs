import {randomBytes} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {Readable} from 'node:stream';
const tickets=new Map();
const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36';
export function isPublicAddress(address){
  const ip=address.toLowerCase().replace(/^\[|\]$/g,'');
  if(isIP(ip)===4){const [a,b]=ip.split('.').map(Number);return !(a===0||a===10||a===127||a>=224||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168)||(a===100&&b>=64&&b<=127)||(a===198&&(b===18||b===19)));}
  if(isIP(ip)===6)return !(/^(::|fc|fd|fe[89ab]|ff)/.test(ip));
  return false;
}
export async function validateTarget(value){
  const u=new URL(value);
  if(u.protocol!=='https:'||u.username||u.password||!['','443'].includes(u.port))throw new Error('Only public HTTPS media sources are supported.');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host}]:await lookup(host,{all:true});
  if(!addresses.length||addresses.some(a=>!isPublicAddress(a.address)))throw new Error('Private media targets are blocked.');
  return u;
}
export function mediaHeaders(headers={}){const out={'User-Agent':UA};for(const [k,v] of Object.entries(headers)){if(['referer','origin','user-agent'].includes(k.toLowerCase())&&typeof v==='string'&&!/[\r\n]/.test(v))out[k]=v;}return out;}
export async function fetchPublic(value,headers={},signal=AbortSignal.timeout(15000)){
  let u=await validateTarget(value);
  for(let i=0;i<4;i++){
    const response=await fetch(u,{headers:mediaHeaders(headers),signal,redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)){
      const next=response.headers.get('location');await response.body?.cancel();
      if(!next)throw new Error('Media redirect has no location.');u=await validateTarget(new URL(next,u).href);continue;
    }
    return response;
  }
  throw new Error('Too many media redirects.');
}
export async function readLimited(response,limit=1024*1024){
  const chunks=[];let count=0;const reader=response.body.getReader();
  try{while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>limit)throw new Error('Provider response exceeds the size limit.');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});}
  return Buffer.concat(chunks);
}
export function issueMedia(url,headers={}){
  const u=new URL(url);if(u.protocol!=='https:')throw new Error('Media must use HTTPS.');
  for(const [key,value] of tickets)if(value.expires<Date.now())tickets.delete(key);
  if(tickets.size>=8000)tickets.delete(tickets.keys().next().value);
  const token=randomBytes(24).toString('hex');tickets.set(token,{url:u.href,headers:mediaHeaders(headers),expires:Date.now()+60*60*1000});return `/api/media/${token}`;
}
export function rewriteManifest(text,base,wrap){
  return text.split(/\r?\n/).map(line=>{
    const t=line.trim();if(!t)return line;
    if(t.startsWith('#'))return line.replace(/URI="([^"]+)"/g,(_,uri)=>`URI="${wrap(new URL(uri,base).href)}"`);
    return wrap(new URL(t,base).href);
  }).join('\n');
}
export function looksLikeHtml(bytes){return /^\s*(?:<!doctype\s+html|<html\b|<head\b|<body\b|<script\b|<\?xml|<Error\b|<!--)/i.test(Buffer.from(bytes).subarray(0,512).toString('utf8'));}
export function mediaContentType(bytes,declared){
  // Native mobile HLS can reject TS segments mislabeled as JPEG or HTML.
  // Require repeated 188-byte packet syncs so keys/images are not relabeled.
  if(bytes.length>=189&&bytes[0]===0x47&&bytes[188]===0x47&&(bytes.length<377||bytes[376]===0x47))return 'video/mp2t';
  return declared.includes('text/html')?'application/octet-stream':declared;
}
export function byteRange(value,length){
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match||(!match[1]&&!match[2])||length<=0)return null;
  const suffix=!match[1],first=suffix?Math.max(0,length-Number(match[2])):Number(match[1]),last=suffix||!match[2]?length-1:Math.min(length-1,Number(match[2]));
  if(!Number.isSafeInteger(first)||!Number.isSafeInteger(last)||first>last||first>=length||(suffix&&Number(match[2])===0))return null;
  return {first,last};
}
export async function relayMedia(req,res,token){
  const entry=tickets.get(token);
  if(!entry||entry.expires<Date.now()){res.writeHead(410);res.end('Media link expired. Test this provider again.');return;}
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  res.on('close',()=>controller.abort());
  try{
    const headers={...entry.headers};if(req.method!=='HEAD'&&req.headers.range&&/^bytes=(?:\d+-\d*|-\d+)$/.test(req.headers.range))headers.Range=req.headers.range;
    // Range is the only viewer-supplied upstream header.
    const u=await validateTarget(entry.url);
    const upstream=headers.Range?await fetchPublicRange(u.href,headers,controller.signal):await fetchPublic(u.href,entry.headers,controller.signal);
    if(!upstream.ok){res.writeHead(upstream.status===403?403:502);await upstream.body?.cancel();res.end(`Media provider returned HTTP ${upstream.status}.`);return;}
    let ct=upstream.headers.get('content-type')||'application/octet-stream';
    if(/mpegurl/i.test(ct)||/\.m3u8(?:\?|$)/i.test(upstream.url)){
      const text=(await readLimited(upstream)).toString('utf8');if(!text.trimStart().startsWith('#EXTM3U'))throw new Error('Provider did not return an HLS playlist.');
      const body=Buffer.from(rewriteManifest(text,upstream.url,url=>issueMedia(url,entry.headers))),range=headers.Range?byteRange(headers.Range,body.length):null;
      if(headers.Range&&!range){res.writeHead(416,{'Content-Range':`bytes */${body.length}`});res.end();return;}
      res.writeHead(range?206:200,{'Content-Type':'application/vnd.apple.mpegurl','Cache-Control':'no-store','Accept-Ranges':'bytes','Content-Length':range?range.last-range.first+1:body.length,...(range?{'Content-Range':`bytes ${range.first}-${range.last}/${body.length}`}:{})});res.end(req.method==='HEAD'?undefined:range?body.subarray(range.first,range.last+1):body);return;
    }
    if(headers.Range&&upstream.status===200){
      // Some segment hosts ignore Range. Native iPhone playback probes bytes=0-1
      // and needs a real 206 response. Bound buffering to avoid unbounded files.
      const bytes=await readLimited(upstream,32*1024*1024),range=byteRange(headers.Range,bytes.length);
      if(!bytes.length||looksLikeHtml(bytes))throw new Error('Provider returned an empty response or HTML page instead of media.');
      if(!range){res.writeHead(416,{'Content-Range':`bytes */${bytes.length}`});res.end();return;}
      res.writeHead(206,{'Content-Type':mediaContentType(bytes,ct),'Content-Range':`bytes ${range.first}-${range.last}/${bytes.length}`,'Content-Length':range.last-range.first+1,'Accept-Ranges':'bytes','Cache-Control':'no-store'});
      res.end(bytes.subarray(range.first,range.last+1));return;
    }
    const reader=upstream.body.getReader(),first=await reader.read();
    if(first.done||looksLikeHtml(first.value)){await reader.cancel();res.writeHead(502);res.end('Provider returned an empty response or HTML page instead of media.');return;}
    ct=mediaContentType(first.value,ct);
    const out={'Content-Type':ct,'Cache-Control':'no-store'};for(const name of ['content-length','content-range','accept-ranges']){const value=upstream.headers.get(name);if(value&&!(name==='content-length'&&upstream.headers.get('content-encoding')))out[name]=value;}
    if(req.method==='HEAD'){await reader.cancel();res.writeHead(200,out);res.end();return;}
    async function* chunks(){try{yield first.value;while(true){const part=await reader.read();if(part.done)break;yield part.value;}}finally{await reader.cancel().catch(()=>{});}}
    res.writeHead(upstream.status,out);await new Promise((done,fail)=>{const body=Readable.from(chunks());body.on('error',fail);body.on('end',done);res.on('close',done);body.pipe(res);});
  }catch(error){if(!res.headersSent){res.writeHead(502);res.end(error.message);}else res.destroy();}finally{clearTimeout(timer);}
}
async function fetchPublicRange(url,headers,signal){
  let u=await validateTarget(url);
  for(let i=0;i<4;i++){
    const response=await fetch(u,{headers,signal,redirect:'manual'});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('Invalid redirect.');u=await validateTarget(new URL(location,u).href);continue;}return response;
  }throw new Error('Too many redirects.');
}
export async function probeMedia(source,signal){
  let target=source.url;
  for(let depth=0;depth<4;depth++){
    const response=await fetchPublic(target,source.headers,signal);
    if(!response.ok){await response.body?.cancel();throw new Error(`Media provider returned HTTP ${response.status}.`);}
    const ct=response.headers.get('content-type')||'';
    if(source.kind==='hls'&&depth===0||/mpegurl/i.test(ct)||/\.m3u8(?:\?|$)/i.test(target)){
      const text=(await readLimited(response)).toString('utf8');if(!text.trimStart().startsWith('#EXTM3U'))throw new Error('Invalid HLS playlist.');
      const next=text.split(/\r?\n/).find(line=>line.trim()&&!line.startsWith('#'));
      if(!next)throw new Error('Playlist contains no variants or media segments.');target=new URL(next.trim(),response.url||target).href;continue;
    }
    const reader=response.body.getReader();const {value}=await reader.read();await reader.cancel();
    if(!value||value.byteLength<188)throw new Error('Media returned too few bytes.');
    const prefix=Buffer.from(value).subarray(0,200).toString('utf8').trimStart();if(looksLikeHtml(value)||/^\{\s*"error/i.test(prefix))throw new Error('Media URL returned an error document.');
    return {detail:`${source.kind==='hls'?'Playlist and first segment':'Video bytes'} accessible (${ct||'unknown type'}). Browser decoding still needs confirmation.`,bytes:value.byteLength};
  }throw new Error('Playlist nesting exceeds the test limit.');
}
