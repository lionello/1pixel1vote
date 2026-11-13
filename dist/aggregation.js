/* Group exact riding/party totals before any screen coordinates are used. */
function targetGroupSize(zoom, density=1) { return zoom===14?1:Math.max(2,2**(14-zoom)/density) }
function groupVotes(ridings, zoom, density=1) {
 const scale=targetGroupSize(zoom,density),groups=[];
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
/* Reserve one interior cell per riding before placing any votes. */
function placeGroups(groups,records,index,world,zoom,anchors){
 const random=randomSource(0x862f57+zoom*7919),order=new Uint32Array(groups.length);
 for(let i=0;i<order.length;i++)order[i]=i;
 for(let i=order.length-1;i>0;i--){let j=Math.floor(random()*(i+1)),v=order[i];order[i]=order[j];order[j]=v}
 const cells=new Map(),owners=new Map(),anchorKeys=anchors.map(([x,y],r)=>{
  const key=y*world+x;if(owners.has(key))throw Error('Ridings share a reserved pixel');owners.set(key,r);cells.set(key,[]);return key
 }),seeded=new Uint8Array(anchors.length),scale=world/2;
 for(const g of order){const group=groups[g],start=index.starts[group.r],length=index.starts[group.r+1]-start;
  if(!length)throw Error('Riding has votes but no population positions');
  if(!seeded[group.r]){cells.get(anchorKeys[group.r]).push(group);seeded[group.r]=1;continue}
  let key=anchorKeys[group.r],sameRiding=null,sameParty=null;
  for(let attempt=0;attempt<16;attempt++){
   const k=index.indices[start+Math.floor(random()*length)]*3;
   const x=Math.floor((records[k]+1)*scale),y=Math.floor((1-records[k+1])*scale),candidate=y*world+x;
   if(!owners.has(candidate)){key=candidate;owners.set(key,group.r);cells.set(key,[]);sameRiding=null;sameParty=null;break}
   if(owners.get(candidate)===group.r){sameRiding=candidate;if(cells.get(candidate).some(item=>item.p===group.p))sameParty=candidate}
  }
  if(sameParty!==null)key=sameParty;else if(sameRiding!==null)key=sameRiding;
  cells.get(key).push(group);
 }
 return cells;
}
if(typeof module!=='undefined')module.exports={targetGroupSize,groupVotes,ridingIndex,placeGroups};
