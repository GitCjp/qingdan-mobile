import {unzipSync} from './unzip.mjs';
import {assets,verify,openAssetCache,storeAsset} from './assets.mjs';
export async function installPack(file) {
  if(file.size>60*1024*1024)throw Error('请选择本工具的识别包');
  const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{
    filter:e=>Object.hasOwn(assets,e.name) && e.originalSize===assets[e.name].size
  });
  for(const key of Object.keys(assets)){
    if(!files[key])throw Error('识别包不完整或版本不符');
    await verify(key,files[key]);
  }
  const cache=await openAssetCache();
  for(const key of Object.keys(assets))await storeAsset(cache,key,files[key]);
}
