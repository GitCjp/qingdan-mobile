function median(a) {
  return [...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
}
function numberBox(item) {
  const xs=item.poly.map(p=>p[0]), ys=item.poly.map(p=>p[1]);
  return {x:median(xs.slice().sort((a,b)=>a-b).slice(1,3)),y:(Math.min(...ys)+Math.max(...ys))/2,
    left:Math.min(...xs),right:Math.max(...xs),height:Math.max(...ys)-Math.min(...ys),text:item.text};
}
function inkBounds(pixels,left,top,right,bottom) {
  const w=pixels.width,h=pixels.height;
  left=Math.max(0,Math.floor(left));right=Math.min(w,Math.ceil(right));top=Math.max(0,Math.floor(top));bottom=Math.min(h,Math.ceil(bottom));
  const shades=[];const grey=(x,y)=>{const i=(y*w+x)*4;return (pixels.data[i]+2*pixels.data[i+1]+pixels.data[i+2])/4;};
  for(let y=top;y<bottom;y+=3)for(let x=left;x<right;x+=3)shades.push(grey(x,y));
  if(!shades.length)return;
  const limit=median(shades)*0.75;
  let x1=right,x2=left,y1=bottom,y2=top,count=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if(grey(x,y)<limit){
    count++;x1=Math.min(x1,x);x2=Math.max(x2,x);y1=Math.min(y1,y);y2=Math.max(y2,y);
  }
  if(count<6 || y2-y1<3)return;
  return [Math.max(left,x1-2),Math.max(top,y1-2),Math.min(right,x2+3),Math.min(bottom,y2+3)];
}
export async function readSlip(items,pixels,cv,mat,recognizer) {
  if(pixels.height<1.45*pixels.width || items.some(i=>/^(名称|序号|数量|单价)/.test(i.text)))return;
  const nums=items.filter(i=>/^\d+(?:\.\d+)?$/.test(i.text)).map(numberBox);
  if(nums.length<9)return;
  let xs=nums.map(b=>(b.left+b.right)/2),a=Math.min(...xs),b=Math.max(...xs);
  for(let k=0;k<8;k++){const mid=(a+b)/2;a=median(xs.filter(x=>x<=mid));b=median(xs.filter(x=>x>mid));}
  const mid=(a+b)/2;
  if(!Number.isFinite(mid)||a<pixels.width*.18||b-a<pixels.width*.055)return;
  const q=nums.filter(n=>(n.left+n.right)/2<mid),p=nums.filter(n=>(n.left+n.right)/2>=mid);
  if(Math.min(q.length,p.length)<4)return;
  const h=median(nums.map(n=>n.height));
  const ordered=p.filter(n=>n.height<h*1.85).sort((l,r)=>l.y-r.y);
  const pitch=median(ordered.slice(1).map((n,i)=>n.y-ordered[i].y).filter(g=>g>h*.55));
  if(!pitch || ordered.length<5)return;
  const lines=[];
  for(const n of [...nums].sort((u,v)=>u.y-v.y)){
    if(n.height>h*1.85)continue;
    const near=lines.at(-1);
    if(!near||n.y-median(near.map(v=>v.y))>pitch*.46)lines.push([n]);
    else near.push(n);
  }
  const centers=lines.map(row=>median(row.map(v=>v.y))),step=pitch;
  const nameRight=median(q.map(n=>n.left))-h*.20;
  const priceLeft=(median(q.map(n=>n.right))+median(p.map(n=>n.left)))/2;
  const rows=[];
  for(let i=0;i<lines.length;i++){
    const y=centers[i],top=(y+(centers[i-1]??y-step))/2,bottom=(y+(centers[i+1]??y+step))/2;
    const read=async(left,right)=>{
      const r=inkBounds(pixels,left,top,right,bottom);if(!r)return '';
      const crop=mat.roi(new cv.Rect(r[0],r[1],r[2]-r[0],r[3]-r[1]));
      try {const [v]=await recognizer.predict(cv,[crop]);return v.score>=.18?v.text.trim():'';}finally{crop.delete();}
    };
    const detected=items.filter(item=>{
      const box=numberBox(item);
      return box.right<nameRight && box.y>=top && box.y<bottom && box.height<step*1.35 && /[\p{L}]/u.test(item.text);
    }).sort((a,b)=>b.score-a.score)[0];
    const isolated=await read(2,nameRight);
    const name=(detected && detected.score>=.76 ? detected.text : isolated) || detected?.text || '';
    const value=async(left,right,boxes)=>{
      const known=lines[i].filter(n=>boxes.includes(n));
      if(known.length===1)return known[0].text;
      const v=await read(left,right);return /^\d+(?:\.\d+)?$/.test(v)?v:'';
    };
    const qty=await value(nameRight,priceLeft,q),price=await value(priceLeft,pixels.width,p);
    rows.push({name,qty,price,y,matchedName:Boolean(detected && detected.score>=.76)});
  }

  return rows;
}
