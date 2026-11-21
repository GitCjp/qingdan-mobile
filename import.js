import {findPaper} from './paper.mjs';
import {photoRows, gridRows, pastedRows} from './rows.mjs';

const byId=id=>document.getElementById(id);
const dialog=byId('importer'), paper=byId('paper'), frame=byId('photo-frame');
const status=text=>{byId('import-status').textContent=text;};
let job=0, worker=null, photoUrl='', crop=null, start=null, timeout;
let running=false, ready=false, idleTimer;

// Keep a warm model for the next photo. Cancel active work immediately when
// the user changes input, and release unused WASM memory after a short break.
function releaseWorker() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker=null;
  ready=false;
}
function keepWarm() {
  clearTimeout(idleTimer);
  if(worker) idleTimer=setTimeout(releaseWorker, 180000);
}
function stop() {
  job++; clearTimeout(timeout);
  if(running) releaseWorker();
  running=false;
  keepWarm();
  byId('read-photo').disabled=false;
}
function reportAssets(message) {
  const label=byId('resource-state');
  if(message.stage==='assets'){
    label.textContent='正在准备识别文件 '+Math.floor(100*message.done/message.total)+'%';
    return true;
  }
  if(message.stage==='initializing'){label.textContent='文件已就绪，正在启动识别。';return true;}
  if(message.stage==='ready')label.textContent='识别组件已就绪';
  return false;
}
function prepareWorker() {
  if(worker) return worker;
  const instance=new Worker(new URL('./ocr/start.mjs',import.meta.url),{type:'module'});
  worker=instance;
  instance.onmessage=({data})=>{
    if(instance!==worker) return;
    if(reportAssets(data))return;
    if(data.error) {releaseWorker();byId("resource-state").textContent="识别文件准备失败，可重试或导入离线包。";return;}
    if(data.stage==='ready') ready=true;
  };
  instance.onerror=()=>{if(instance===worker) releaseWorker();};
  instance.postMessage({type:'warmup'});
  keepWarm();
  return instance;
}
function releasePhoto() {
  if(photoUrl) URL.revokeObjectURL(photoUrl);
  photoUrl='';paper.removeAttribute('src');crop=null;start=null;
  byId('photo-preview').hidden=true;byId('crop-box').hidden=true;
}
function clearDraft() {
  byId('review').hidden=true;byId('draft-list').replaceChildren();
}
function open(mode) {
  stop();releasePhoto();clearDraft();status('');
  byId('paste-grid').value='';
  byId('photo-mode').hidden=mode!=='photo';byId('sheet-mode').hidden=mode!=='sheet';
  byId('import-title').textContent=mode==='photo'?'拍照识别':'导入表格';
  dialog.showModal();dialog.scrollTop=0;
  byId('resource-state').textContent=ready?'识别组件已就绪':'';
}
byId('photo-open').onclick=()=>open('photo');
byId('sheet-open').onclick=()=>open('sheet');
byId('import-close').onclick=()=>dialog.close();
dialog.addEventListener('close',()=>{stop();releasePhoto();clearDraft();});
for(const [button,input] of [['take-photo','camera'],['choose-image','album'],['choose-sheet','sheet-file']]) {
  byId(button).onclick=()=>byId(input).click();
}
async function selectPhoto(event) {
  const file=event.target.files[0];event.target.value='';
  if(!file) return;
  stop();releasePhoto();clearDraft();const current=job;
  photoUrl=URL.createObjectURL(file);paper.src=photoUrl;
  try {
    await paper.decode();
    if(current!==job) return;
    byId('photo-preview').hidden=false;crop=findPaper(paper);drawCrop();
    status(crop?'已框选疑似纸条，可拖动重选后开始识别。':'');
    try{prepareWorker();}catch{releaseWorker();}
  } catch {
    if(current===job) status('这张图打不开，请选择 JPG、PNG 或照片截图。');
  }
}
byId('camera').onchange=selectPhoto;byId('album').onchange=selectPhoto;
function point(event) {
  const rect=frame.getBoundingClientRect(),clamp=v=>Math.max(0,Math.min(1,v));
  return {x:clamp((event.clientX-rect.left)/rect.width),y:clamp((event.clientY-rect.top)/rect.height)};
}
function drawCrop() {
  const box=byId('crop-box');box.hidden=!crop;
  if(crop) Object.assign(box.style,{left:crop.x*100+'%',top:crop.y*100+'%',width:crop.w*100+'%',height:crop.h*100+'%'});
}
frame.onpointerdown=e=>{if(running) return;start=point(e);frame.setPointerCapture(e.pointerId);};
frame.onpointermove=e=>{
  if(!start) return;
  const p=point(e);
  crop={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w:Math.abs(start.x-p.x),h:Math.abs(start.y-p.y)};
  drawCrop();
};
frame.onpointerup=frame.onpointercancel=()=>{start=null;if(crop && Math.min(crop.w,crop.h)<0.02) crop=null;drawCrop();};
byId('full-photo').onclick=()=>{if(!running){crop=null;drawCrop();}};
function imagePixels() {
  const r=crop || {x:0,y:0,w:1,h:1};
  const sw=paper.naturalWidth*r.w,sh=paper.naturalHeight*r.h;
  const scale=Math.min(1,1800/Math.max(sw,sh)),w=Math.max(1,Math.round(sw*scale)),h=Math.max(1,Math.round(sh*scale));
  const canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(paper,paper.naturalWidth*r.x,paper.naturalHeight*r.y,sw,sh,0,0,w,h);
  return ctx.getImageData(0,0,canvas.width,canvas.height);
}
byId('read-photo').onclick=()=>{
  stop();clearDraft();const current=job;
  byId('read-photo').disabled=true;status(ready?'正在识别文字和数字…':'正在准备识别模型，首次使用需要下载…');
  const fail=()=>{
    if(current!==job)return;
    stop();status('识别未完成。可重新框选纸条再试，或在「导入表格」中粘贴豆包整理的结果。');
  };
  try {
    const pixels=imagePixels();
    const activeWorker=prepareWorker();
    clearTimeout(idleTimer);running=true;
    timeout=setTimeout(fail,240000);
    activeWorker.onerror=fail;
    activeWorker.onmessage=({data:message})=>{
      if(current!==job)return;
      if(reportAssets(message))return;
      if(message.stage==='ready'){ready=true;return;}
      if(message.stage==='reading'){ready=true;status('正在识别文字和数字…');return;}
      if(message.stage==='rows'){status('正在整理商品行…');return;}
      if(!message.items){fail();return;}
      running=false;stop();showRows(photoRows(message.items,message.rows),'照片');
    };
    activeWorker.postMessage(pixels,[pixels.data.buffer]);
  } catch {fail();}
};
function addRow(row) {
  const line=document.createElement('div');line.className='draft-grid draft-line';
  const check=document.createElement('input');check.type='checkbox';check.checked=true;check.ariaLabel='导入此行';line.append(check);
  for(const [key,label] of [['name','名称'],['qty','数量'],['price','单价']]) {
    const input=document.createElement('input');
    input.dataset.key=key;input.ariaLabel=label;input.placeholder=label;input.value=row[key]||'';
    if(key!=='name')input.inputMode='decimal';
    line.append(input);
  }
  if(row.strip && paper.naturalWidth) {
    const r=crop || {x:0,y:0,w:1,h:1}, w=paper.naturalWidth*r.w,h=paper.naturalHeight*r.h;
    const scale=Math.min(1,1800/Math.max(w,h));
    const top=Math.max(0,row.strip[0]/scale),bottom=Math.min(h,row.strip[1]/scale);
    if(bottom>top){
      const strip=document.createElement('canvas');strip.className='line-photo';strip.ariaLabel='该行的原始笔迹';
      strip.width=Math.min(850,Math.ceil(w));strip.height=Math.max(1,Math.round((bottom-top)*strip.width/w));
      strip.getContext('2d').drawImage(paper,r.x*paper.naturalWidth,r.y*paper.naturalHeight+top,w,bottom-top,0,0,strip.width,strip.height);
      line.append(strip);
    }
  }
  if(row.raw){const note=document.createElement('small');note.textContent='原文 '+row.raw;line.append(note);}
  byId('draft-list').append(line);
}
function showRows(rows,source) {
  clearDraft();
  if(!rows.length){status('没有读到商品行。请重新选择或框选清单。');return;}
  rows.forEach(addRow);byId('review').hidden=false;
  status(source+'读到 '+rows.length+' 行，请核对名称、数量和单价。');
  byId('import-status').scrollIntoView({block:'start'});
}
byId('add-draft').onclick=()=>addRow({});
byId('read-text').onclick=()=>{stop();showRows(pastedRows(byId('paste-grid').value),'粘贴内容');};
byId('sheet-file').onchange=async e=>{
  const file=e.target.files[0];e.target.value='';if(!file)return;
  stop();clearDraft();const current=job;status('正在读取表格…');
  try {
    const rows=/\.xlsx$/i.test(file.name) ? gridRows(await (await import('./ocr/excel.mjs')).readSheet(file,1)) : pastedRows(await file.text());
    if(current===job)showRows(rows,'文件');
  } catch {if(current===job)status('读取失败，请选择 .xlsx、CSV 文件，或直接粘贴表格。');}
};
byId('apply-import').onclick=()=>{
  const rows=[];
  for(const line of byId('draft-list').children) {
    if(!line.querySelector('input[type=checkbox]').checked)continue;
    const row={};
    for(const input of line.querySelectorAll('[data-key]'))row[input.dataset.key]=input.value.trim();
    if(!Object.values(row).some(Boolean))continue;
    rows.push(row);
  }
  if(!rows.length){status('请勾选要导入的商品行。');return;}
  undo=structuredClone(data);
  data=[...data.filter(active),...rows];
  render();save();dialog.close();toast('已追加 '+rows.length+' 行，可在表中继续修改');
};

byId('choose-pack').onclick=()=>byId('pack-file').click();
byId('pack-file').onchange=async event=>{
  const file=event.target.files[0];event.target.value='';if(!file)return;
  stop();releaseWorker();
  const current=job;
  const info=text=>{if(current===job)byId('resource-state').textContent=text;};
  info('正在校验并保存识别包…');
  try {
    const {installPack}=await import('./ocr/install.mjs');
    await installPack(file);
    info('离线识别包已保存在此浏览器。现在可以拍照或选图。');
  } catch(error) {
    info('导入失败：'+(error.message || '请重新选择完整的 ZIP 包'));
  }
};
