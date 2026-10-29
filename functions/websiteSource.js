const dns = require('node:dns/promises');
const { Agent } = require('undici');
const net = require('node:net');

function isPublicAddress(address) {
  if (net.isIP(address) === 6) return /^[23]/i.test(address) && !/^2001:db8:/i.test(address);
  if (net.isIP(address) !== 4) return false;
  const [a,b,c] = address.split('.').map(Number);
  return !(a===0 || a===10 || a===127 || a>=224 || (a===100 && b>=64 && b<=127) ||
    (a===169 && b===254) || (a===172 && b>=16 && b<=31) ||
    (a===192 && (b===168 || (b===0 && (c===0 || c===2)))) ||
    (a===198 && (b===18 || b===19 || (b===51 && c===100))) || (a===203 && b===0 && c===113));
}

function htmlToText(html) {
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',rsquo:'’',lsquo:'‘',rdquo:'”',ldquo:'“',ndash:'–',mdash:'—',hellip:'…',copy:'©'};
  const decode = text => text.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw,key) => {
    if (key[0] !== '#') return entities[key.toLowerCase()] ?? raw;
    const n = key[1].toLowerCase()==='x' ? parseInt(key.slice(2),16) : Number(key.slice(1));
    return n>0 && n<=0x10ffff && !(n>=0xd800 && n<=0xdfff) ? String.fromCodePoint(n) : ' ';
  });
  const title = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
  const article = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i)?.[1] || html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || html;
  const text = decode(article.replace(/<!--[\s\S]*?-->/g,' ')
    .replace(/<(script|style|nav|footer|header|aside|form|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ')
    .replace(/<\/(p|div|h[1-6]|section|li|tr)>|<br\b[^>]*>/gi,'\n')
    .replace(/<[^>]*>/g,' ')).replace(/[^\S\n]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
  return [title,text].filter(Boolean).join('\n\n').slice(0,50000);
}

async function readWebsiteText(rawUrl, { lookup = dns.lookup, fetchImpl = fetch } = {}) {
  const signal = AbortSignal.timeout(15000);
  let current = new URL(rawUrl);
  for (let hop=0;hop<4;hop++) {
    if (!['http:','https:'].includes(current.protocol) || current.username || current.password ||
      (current.port && current.port !== (current.protocol==='https:' ? '443' : '80'))) throw new Error('SOURCE_INVALID_URL');
    const hostname = current.hostname.replace(/^\[|\]$/g,'');
    const addresses = await Promise.race([lookup(hostname,{all:true}),new Promise((_,reject)=>{
      if(signal.aborted)reject(new Error('SOURCE_TIMEOUT'));
      else signal.addEventListener('abort',()=>reject(new Error('SOURCE_TIMEOUT')),{once:true});
    })]);
    if (!addresses.length || addresses.some(item=>!isPublicAddress(item.address))) throw new Error('SOURCE_INVALID_URL');
    const dispatcher = new Agent({connect:{
      lookup:(_host,options,callback)=>options.all ? callback(null,addresses) : callback(null,addresses[0].address,addresses[0].family),
    }});
    let result;
    try {
      // Pin the vetted DNS result; do not follow redirects until their address
      // has also been checked. Read decoded bytes with a strict size limit.
      const response = await fetchImpl(current.href, {signal,dispatcher,redirect:'manual',
        headers:{'User-Agent':'Noviq-Notebook/1.0','Accept':'text/html,application/xhtml+xml,text/plain'}});
      if ([301,302,303,307,308].includes(response.status) && response.headers.get('location')) {
        result={redirect:response.headers.get('location')};await response.body?.cancel();
      } else {
        const type=response.headers.get('content-type') || '';
        if(response.status!==200 || !/^(text\/(html|plain)|application\/xhtml\+xml)\b/i.test(type)) {
          await response.body?.cancel();throw new Error('SOURCE_UNAVAILABLE');
        }
        let size=0;const chunks=[];
        for await(const chunk of response.body || []) {
          size+=chunk.length;if(size>2*1024*1024)throw new Error('SOURCE_TOO_LARGE');chunks.push(chunk);
        }
        result={body:Buffer.concat(chunks).toString('utf8'),plain:/^text\/plain/i.test(type)};
      }
    } finally { await dispatcher.destroy(); }
    if (result.redirect) {current=new URL(result.redirect,current);continue;}
    const text = result.plain ? result.body.trim().slice(0,50000) : htmlToText(result.body);
    if (text.length<40) throw new Error('SOURCE_UNAVAILABLE');
    return text;
  }
  throw new Error('SOURCE_REDIRECT_LIMIT');
}

module.exports = {readWebsiteText,htmlToText,isPublicAddress};
