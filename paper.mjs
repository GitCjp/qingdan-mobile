// Suggest a crop only for a tall, light sheet surrounded by a darker scene.
export function findPaper(img) {
  const c=document.createElement('canvas'),scale=360/Math.max(img.naturalWidth,img.naturalHeight);
  c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,c.width,c.height);
  const {data}=ctx.getImageData(0,0,c.width,c.height),w=c.width,h=c.height;
  const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let i=0;i<seen.length;i++){
    const rgb=[data[i*4],data[i*4+1],data[i*4+2]];
    seen[i]=Math.min(...rgb)<137 || Math.max(...rgb)-Math.min(...rgb)>43;
  }
  let best=null,area=0;
  for(let seed=0;seed<seen.length;seed++){
    if(seen[seed])continue;
    let n=1;queue[0]=seed;seen[seed]=1;
    let top=h,bottom=0;
    const left=new Int32Array(h).fill(w),right=new Int32Array(h);
    for(let j=0;j<n;j++){
      const p=queue[j],x=p%w,y=Math.floor(p/w);left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);top=Math.min(top,y);bottom=Math.max(bottom,y);
      for(const next of [x>0?p-1:-1,x<w-1?p+1:-1,p-w,p+w])if(next>=0&&next<w*h&&!seen[next]){queue[n++]=next;seen[next]=1;}
    }
    if(n<Math.max(area,.08*w*h)||bottom-top<h*.32)continue;
    const quantile=(array,q)=>{const a=Array.from(array.slice(top,bottom+1)).sort((a,b)=>a-b);return a[Math.floor(a.length*q)];};
    const x1=quantile(left,.65),x2=quantile(right,.30);
    if(x2-x1<w*.14||bottom-top<(x2-x1)*1.5||x2-x1>w*.85)continue;
    area=n;best={x:x1/w,y:top/h,w:(x2-x1+1)/w,h:(bottom-top+1)/h};
  }
  return best;
}
