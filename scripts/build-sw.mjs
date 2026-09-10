import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
async function walk(dir) {
  const result = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await walk(p)));
    else if (entry.name !== 'sw.js') result.push(p);
  }
  return result;
}
const files = await walk('dist'),
  urls = files.map((p) => '/' + p.replace(/^dist\//, ''));
urls.push('/');
const hash = crypto.createHash('sha256');
for (const f of files) hash.update(await fs.readFile(f));
const key = 'crown-clan-' + hash.digest('hex').slice(0, 12);
await fs.writeFile(
  'dist/sw.js',
  `const CACHE=${JSON.stringify(key)};const ASSETS=${JSON.stringify(urls)};
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('crown-clan-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(fetch(event.request).catch(()=>caches.match('/index.html',{ignoreVary:true})));return;}event.respondWith(caches.match(event.request,{ignoreVary:true}).then(hit=>hit||fetch(event.request)));});\n`,
);
console.log(`Offline manifest: ${urls.length} files, cache ${key}`);
