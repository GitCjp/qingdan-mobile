import {assets} from './asset-list.mjs';
export {assets};
const cacheName='qingdan-reader-assets-v1';
const cacheKey=key=>new URL('./stored/'+assets[key].sha,import.meta.url).href;

export async function verify(key,bytes) {
  const entry=assets[key];
  if(!entry || entry.size!==bytes.byteLength)throw Error('识别文件大小不匹配');
  const hash=await crypto.subtle.digest('SHA-256',bytes);
  const hex=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  if(hex!==entry.sha)throw Error('识别文件校验失败');
}
export const openAssetCache=()=>caches.open(cacheName);
export function storeAsset(cache,key,bytes) {
  return cache.put(cacheKey(key),new Response(bytes));
}
async function download(key,url,onProgress) {
  const controller=new AbortController();
  let timer;
  const reset=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),12000);};
  reset();
  try {
    const response=await fetch(url,{signal:controller.signal,credentials:'omit'});
    if(!response.ok)throw Error('下载失败');
    const reader=response.body.getReader(), bytes=new Uint8Array(assets[key].size);
    let offset=0;
    for(;;){
      const {value,done}=await reader.read();if(done)break;
      reset();bytes.set(value,offset);offset+=value.length;onProgress(offset);
    }
    if(offset!==bytes.length)throw Error('下载不完整');
    await verify(key,bytes);
    return bytes;
  } finally {clearTimeout(timer);controller.abort();}
}
export async function loadAsset(key,cache,onProgress) {
  if(cache) {
    try {
      const hit=await cache.match(cacheKey(key));
      if(hit){
        const bytes=new Uint8Array(await hit.arrayBuffer());
        await verify(key,bytes);onProgress(bytes.length);return bytes;
      }
    }catch{/* A missing or damaged local copy can be downloaded again. */}
  }
  const entry=assets[key];
  const urls=[entry.mirror,new URL(key,import.meta.url).href].filter(Boolean);
  for(const url of urls){
    try{
      onProgress(0);
      const bytes=await download(key,url,onProgress);
      if(cache)await storeAsset(cache,key,bytes).catch(()=>{});
      return bytes;
    }catch(error){if(url===urls.at(-1))throw error;}
  }
}
