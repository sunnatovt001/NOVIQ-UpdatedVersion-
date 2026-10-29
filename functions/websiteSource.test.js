const test = require('node:test');
const assert = require('node:assert/strict');
const {readWebsiteText,htmlToText,isPublicAddress} = require('./websiteSource');
const publicLookup = async()=>[{address:'93.184.216.34',family:4}];

test('article extraction preserves text and entities while excluding executable and navigation content',()=>{
  const text=htmlToText('<title>Study &amp; learn</title><nav>Menu</nav><article><h1>Lesson</h1><p>First &rsquo; &#x41; &#66;.</p><script>malicious()</script><style>hidden</style><footer>Footer</footer><p>Second paragraph.</p></article>');
  assert.match(text,/Study & learn/);assert.match(text,/First ’ A B/);assert.match(text,/Second paragraph/);
  assert.doesNotMatch(text,/Menu|malicious|hidden|Footer/);
});

test('source fetch pins checked DNS and bounds redirects, content type and decoded size',async()=>{
  const calls=[];
  const text=await readWebsiteText('https://example.org/article',{lookup:publicLookup,fetchImpl:async(url,options)=>{
    calls.push({url,options});return new Response('<article><p>A sufficiently detailed source article with actual evidence for the notebook.</p></article>',{headers:{'Content-Type':'text/html'}});
  }});
  assert.match(text,/actual evidence/);assert.equal(calls[0].options.redirect,'manual');assert.ok(calls[0].options.dispatcher);
  for(const type of ['application/pdf','application/octet-stream']) await assert.rejects(readWebsiteText('https://example.org',{lookup:publicLookup,fetchImpl:async()=>new Response('Unsupported',{headers:{'Content-Type':type}})}),/SOURCE_UNAVAILABLE/);
  await assert.rejects(readWebsiteText('https://example.org',{lookup:publicLookup,fetchImpl:async()=>new Response('x'.repeat(2*1024*1024+1),{headers:{'Content-Type':'text/plain'}})}),/SOURCE_TOO_LARGE/);
});

test('private IPs, mixed DNS answers, unsafe schemes and redirect targets cannot reach internal services',async()=>{
  for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1']) assert.equal(isPublicAddress(address),false,address);
  assert.equal(isPublicAddress('8.8.8.8'),true);assert.equal(isPublicAddress('2606:4700:4700::1111'),true);
  let calls=0;
  const fetchImpl=async()=>{calls++;return new Response('',{status:302,headers:{Location:'http://127.0.0.1/private'}});};
  for(const url of ['file:///etc/passwd','https://user:pass@example.org','https://example.org:8080']) await assert.rejects(readWebsiteText(url,{lookup:publicLookup,fetchImpl}),/SOURCE_INVALID_URL/);
  await assert.rejects(readWebsiteText('https://example.org',{lookup:async()=>[...(await publicLookup()),{address:'10.0.0.1',family:4}],fetchImpl}),/SOURCE_INVALID_URL/);
  assert.equal(calls,0);
  await assert.rejects(readWebsiteText('https://example.org',{lookup:async host=>host==='127.0.0.1'?[{address:host,family:4}]:publicLookup(),fetchImpl}),/SOURCE_INVALID_URL/);
  assert.equal(calls,1);
});
