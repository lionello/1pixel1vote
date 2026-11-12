importScripts('aggregation.js');
let records, colors, ridings, parties, index, cachedKey='', cachedCells, lastResult, lastId, lastSelected=-1;
self.onmessage=event=>{
 const d=event.data;
 if(d.type==='init'){
  records=new Float32Array(d.votes);const ids=new Uint8Array(d.ridingIds);colors=d.colors;ridings=d.ridings;parties=d.parties;
  if(records.length!==ids.length*3)throw Error('Vote and riding data do not match');
  index=ridingIndex(ids,ridings.length);self.postMessage({type:'ready'});return
 }
 if(d.type==='inspect'){
  if(lastResult&&d.id===lastId){const x=Math.floor(d.x),y=Math.floor(d.y),all=cachedCells.get(y*lastResult.world+x)||[];
   const groups=all.filter(g=>lastSelected<0||g.p===lastSelected).map(g=>({name:ridings[g.r].name,party:parties[g.p],count:g.n}));
   self.postMessage({type:'inspected',id:d.id,groups})}return
 }
 if(d.type!=='render'||!records)return;
 const cacheKey=d.zoom+':'+(d.density||1);if(cachedKey!==cacheKey){let grouped=groupVotes(ridings,d.zoom,d.density||1);cachedCells=placeGroups(grouped.groups,records,index,d.view.world,d.zoom);cachedKey=cacheKey}
 const startX=Math.floor(d.view.x),startY=Math.floor(d.view.y),cols=Math.ceil(d.view.x+d.view.width-startX),rows=Math.ceil(d.view.y+d.view.height-startY),pixels=new Uint8ClampedArray(cols*rows*4);
 let stacks=0,visibleGroups=0;
 for(const [key,all] of cachedCells){const x=key%d.view.world,y=Math.floor(key/d.view.world),sx=x-startX,sy=y-startY;if(sx<0||sy<0||sx>=cols||sy>=rows)continue;
  const groups=d.selected<0?all:all.filter(g=>g.p===d.selected);if(!groups.length)continue;
  visibleGroups+=groups.length;if(groups.length>1)stacks++;
  const c=groups.length>1?[105,105,105]:colors[groups[0].p],j=(sy*cols+sx)*4;
  pixels[j]=c[0];pixels[j+1]=c[1];pixels[j+2]=c[2];pixels[j+3]=255;
 }
 lastResult={world:d.view.world};lastId=d.id;lastSelected=d.selected;
 self.postMessage({type:'rendered',id:d.id,cols,rows,startX,startY,stacks,visibleGroups,pixels:pixels.buffer},[pixels.buffer]);
};
