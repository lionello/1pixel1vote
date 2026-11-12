/* Group exact riding/party totals before any screen coordinates are used. */
function groupVotes(ridings, zoom) {
 const scale=4**(14-zoom),groups=[];
 ridings.forEach((riding,r)=>riding.counts.forEach((votes,p)=>{
  for(let remaining=votes;remaining>0;remaining-=scale)groups.push({r,p,n:Math.min(scale,remaining)});
 }));
 return {scale,groups};
}
function ridingIndex(ridingIds,ridingCount){
 const starts=new Uint32Array(ridingCount+1);
 for(const r of ridingIds){if(r>=ridingCount)throw Error('Invalid riding in vote data');starts[r+1]++}
 for(let i=1;i<starts.length;i++)starts[i]+=starts[i-1];
 const next=starts.slice(),indices=new Uint32Array(ridingIds.length);
 for(let i=0;i<ridingIds.length;i++)indices[next[ridingIds[i]]++]=i;
 return {starts,indices};
}
function randomSource(seed){let v=seed>>>0;return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return (v>>>0)/4294967296}}
/* Place groups after aggregation, sampling riding-local population positions.
   If no free candidate is found, keep all colliding groups in a marked stack. */
function placeGroups(groups,records,index,world,zoom){
 const random=randomSource(0x862f57+zoom*7919),order=new Uint32Array(groups.length);
 for(let i=0;i<order.length;i++)order[i]=i;
 for(let i=order.length-1;i>0;i--){let j=Math.floor(random()*(i+1)),v=order[i];order[i]=order[j];order[j]=v}
 const cells=new Map(),scale=world/2;
 for(const g of order){const group=groups[g],start=index.starts[group.r],length=index.starts[group.r+1]-start;
  if(!length)throw Error('Riding has votes but no population positions');
  let key=0,first=0;
  for(let attempt=0;attempt<16;attempt++){
   const k=index.indices[start+Math.floor(random()*length)]*3;
   const x=Math.floor((records[k]+1)*scale),y=Math.floor((1-records[k+1])*scale);
   key=y*world+x;if(attempt===0)first=key;if(!cells.has(key))break;
   if(attempt===15)key=first;
  }
  let cell=cells.get(key);if(!cell){cell=[];cells.set(key,cell)}cell.push(group);
 }
 return cells;
}
if(typeof module!=='undefined')module.exports={groupVotes,ridingIndex,placeGroups};
