importScripts('aggregation.js');
let records,ids,eligible,colors,ridings,parties,anchors,cachedKey='',cachedCells,lastResult,lastId,lastSelected=-1;
function parts(group){return group.parts||[{p:group.p,n:group.n}]}
self.onmessage=event=>{
 const d=event.data;
 if(d.type==='init'){
  records=new Float32Array(d.votes);ids=new Uint8Array(d.ridingIds);eligible=new Uint8Array(d.eligible);colors=d.colors;ridings=d.ridings;parties=d.parties;anchors=d.anchors;
  if(records.length!==ids.length*3||eligible.length!==ids.length)throw Error('Vote and riding data do not match');
  self.postMessage({type:'ready'});return
 }
 if(d.type==='inspect'){
  if(lastResult&&d.id===lastId){const x=Math.floor(d.x),y=Math.floor(d.y),group=cachedCells.get(y*lastResult.world+x);
   const entries=group&&parts(group).some(g=>lastSelected<0||g.p===lastSelected)?parts(group).map(g=>({name:ridings[group.r].name,party:parties[g.p],count:g.n})):[];
   self.postMessage({type:'inspected',id:d.id,groups:entries,unit:lastResult.unit})}return
 }
 if(d.type!=='render'||!records)return;
 const cacheKey=d.zoom+':'+(d.density||1);let unit;
 if(cachedKey!==cacheKey){
  const candidates=candidateCells(records,ids,eligible,d.view.world,d.zoom,anchors[d.zoom]);
  unit=chooseUnit(ridings,candidates.map(c=>c.length),d.zoom,d.density||1);
  cachedCells=placeGroups(groupVotes(ridings,unit),candidates,d.zoom);cachedKey=cacheKey;
 }else unit=lastResult.unit;
 const startX=Math.floor(d.view.x),startY=Math.floor(d.view.y),cols=Math.ceil(d.view.x+d.view.width-startX),rows=Math.ceil(d.view.y+d.view.height-startY),pixels=new Uint8ClampedArray(cols*rows*4);
 let visibleGroups=0;
 for(const [key,group] of cachedCells){const x=key%d.view.world,y=Math.floor(key/d.view.world),sx=x-startX,sy=y-startY;if(sx<0||sy<0||sx>=cols||sy>=rows)continue;
  if(d.selected>=0&&!parts(group).some(g=>g.p===d.selected))continue;
  visibleGroups++;const c=group.p<0?[105,105,105]:colors[group.p],j=(sy*cols+sx)*4;
  pixels[j]=c[0];pixels[j+1]=c[1];pixels[j+2]=c[2];pixels[j+3]=255;
 }
 lastResult={world:d.view.world,unit};lastId=d.id;lastSelected=d.selected;
 self.postMessage({type:'rendered',id:d.id,cols,rows,startX,startY,visibleGroups,unit,pixels:pixels.buffer},[pixels.buffer]);
};
