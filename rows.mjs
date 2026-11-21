const amountPattern = /^[-+]?\d+(?:\.\d+)?$/;
function normalize(text) {
  return String(text ?? '').normalize('NFKC').trim();
}
function numeric(text) {
  return normalize(text).replace(/^[¥￥]\s*/, '').replace(/元$/, '').replace(/(?<=\d),(?=\d{3}(?:\D|$))/g, '').trim();
}
function header(text) {
  const key = normalize(text).replace(/[\s(（].*$/, '');
  if (/^(商品名(?:称)?|名称|品名|商品)$/.test(key)) return 'name';
  if (/^(数量|件数)$/.test(key)) return 'qty';
  if (/^(单价|价格)$/.test(key)) return 'price';
  if (/^(金额|小计|总价)$/.test(key)) return 'amount';
  if (/^(序号|编号)$/.test(key)) return 'index';
}
function draft(name='', qty='', price='', raw='') {
  return {name:normalize(name), qty:numeric(qty), price:numeric(price), raw};
}
function isSummary(cells) {
  return cells.some(x => /^(总计|合计|小计)(?:$|[\s:：\d])/.test(x));
}
export function gridRows(grid) {
  let columns;
  const result=[];
  for(const row of grid) {
    const cells=row.map(normalize);
    if(!cells.some(Boolean) || isSummary(cells) || cells.every(v=>/^[:\s-]*$/.test(v))) continue;
    const keys=cells.map(header);
    if(keys.includes('qty') && keys.includes('price')) { columns=keys;continue; }
    if(columns) {
      const at=key=>cells[columns.indexOf(key)] || '';
      if(at('name') || at('qty') || at('price')) result.push(draft(at('name'),at('qty'),at('price')));
      continue;
    }
    if(cells.length >= 4 && /^\d+$/.test(cells[0]) && !amountPattern.test(cells[1])) cells.shift();
    result.push(draft(...cells.slice(0,3)));
  }
  return result;
}
export function pastedRows(input) {
  const text=input.trim().replace(/^\uFEFF/,'');
  if(!text) return [];
  let grid;
  if(text.includes('\t')) grid=text.split(/\r?\n/).map(line=>line.split('\t'));
  else if(text.includes('|')) grid=text.split(/\r?\n/).map(line=>line.trim().replace(/^\||\|$/g,'').split('|'));
  else if(text.includes(',')) {
    grid=[];let row=[],value='',quoted=false;
    for(let i=0;i<text.length;i++) {
      const c=text[i];
      if(c==='"' && quoted && text[i+1]==='"') {value+='"';i++;}
      else if(c==='"') quoted=!quoted;
      else if(!quoted && c===',') {row.push(value);value='';}
      else if(!quoted && c==='\n') {row.push(value);grid.push(row);row=[];value='';}
      else value+=c;
    }
    row.push(value);grid.push(row);
  } else grid=text.split(/\r?\n/).map(line=>line.trim().split(/\s+/));
  return gridRows(grid);
}
function median(values) {
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)] || 0;
}
export function photoRows(items, cellRows=[]) {
  const boxes=items.filter(b=>b.text.trim()).map(b=>{
    const xs=b.poly.map(p=>p[0]),ys=b.poly.map(p=>p[1]);
    return {x:(Math.min(...xs)+Math.max(...xs))/2,y:(Math.min(...ys)+Math.max(...ys))/2,
      h:Math.max(...ys)-Math.min(...ys),text:normalize(b.text)};
  }).sort((a,b)=>a.y-b.y);
  const typical=median(boxes.map(b=>b.h));
  const lines=[];
  for(const box of boxes) {
    let row=lines.at(-1);
    if(!row || Math.abs(box.y-median(row.map(b=>b.y)))>typical*0.72) lines.push(row=[]);
    row.push(box);
  }
  for(const row of lines) row.sort((a,b)=>a.x-b.x);
  const head=lines.findIndex(row=>row.some(b=>header(b.text)==='qty') && row.some(b=>header(b.text)==='price'));
  const result=[];
  // Learn the quantity/price columns from rows with two separate numeric cells.
  const pairs=lines.map(row=>row.filter(b=>amountPattern.test(numeric(b.text)))).filter(r=>r.length===2);
  const split=pairs.length ? median(pairs.map(r=>(r[0].x+r[1].x)/2)) : null;
  for(const row of lines.slice(head+1)) {
    const yCenter=median(row.map(box=>box.y));
    const strip=[yCenter-typical*.85,yCenter+typical*.85];
    const raw=row.map(b=>b.text).join('　');
    if(isSummary(row.map(b=>b.text))) continue;
    if(head>=0) {
      const fields={};
      const anchors=lines[head].filter(b=>header(b.text));
      for(const box of row) {
        const nearest=anchors.reduce((a,b)=>Math.abs(a.x-box.x)<=Math.abs(b.x-box.x)?a:b);
        const key=header(nearest.text);
        fields[key]=((fields[key]||'')+' '+box.text).trim();
      }
      if(fields.name||fields.qty||fields.price) result.push({...draft(fields.name,fields.qty,fields.price,raw),strip});
      continue;
    }
    const tokens=row.flatMap(b=>b.text.split(/[\s×@]+/).filter(Boolean).map(text=>({...b,text})));
    const numbers=tokens.filter(b=>amountPattern.test(numeric(b.text)));
    const names=tokens.filter(b=>!numbers.includes(b));
    if(numbers.length>=3 && tokens[0]===numbers[0] && names.length) numbers.shift();
    let qty=numbers[0]?.text,price=numbers[1]?.text;
    if(numbers.length===1 && (split===null || numbers[0].x>split)) { price=qty;qty=''; }
    const y=median(row.map(box=>box.y));
    const closest=cellRows.reduce((best,r)=>Math.abs(r.y-y)<Math.abs((best?.y??Infinity)-y)?r:best,null);
    const match=closest && Math.abs(closest.y-y)<typical*.72 ? closest:null;
    const sameRow=match && (!qty || !match.qty || qty===match.qty) && (!price || !match.price || price===match.price);
    const initialName=names.map(b=>b.text).join(' ');
    result.push({...draft((sameRow && match.name) || initialName,qty || match?.qty,price || match?.price,raw),strip});
  }
  return result;
}
