import {assets,loadAsset,openAssetCache} from './assets.mjs';

let readerPromise;
async function initialize() {
  let cache;
  try{cache=await openAssetCache();}catch{/* Private browsing can restrict persistent storage. */}
  const names=Object.keys(assets),total=Object.values(assets).reduce((n,a)=>n+a.size,0);
  const progress={},urls={};
  let lastReport=0;
  await Promise.all(names.map(async name=>{
    const bytes=await loadAsset(name,cache,n=>{
      progress[name]=n;
      const now=performance.now();
      if(now-lastReport>180) {
        lastReport=now;
        self.postMessage({stage:'assets',done:Object.values(progress).reduce((sum,v)=>sum+v,0),total});
      }
    });
    let blob;
    if(name==='opencv.js'){
      blob=new Blob(['const module={exports:{}};const exports=module.exports;\n',bytes,'\nexport default module.exports;'],{type:'text/javascript'});
    }else{
      const type=name.endsWith('.mjs')?'text/javascript':name.endsWith('.wasm')?'application/wasm':'application/octet-stream';
      blob=new Blob([bytes],{type});
    }
    urls[name]=URL.createObjectURL(blob);
  }));
  self.postMessage({stage:'initializing'});
  self.ledgerCV=(await import(urls['opencv.js'])).default;
  const {createReader}=await import(urls['core.mjs']);
  return createReader(urls);
}
self.onmessage=async({data})=>{
  try {
    readerPromise??=initialize();
    const read=await readerPromise;
    if(data.type==='warmup'){self.postMessage({stage:'ready'});return;}
    self.postMessage({stage:'reading'});
    self.postMessage(await read(data));
  }catch(error){self.postMessage({error:String(error.message || error)});}
};
