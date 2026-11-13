/* Aggregation is based on riding and party totals; placement follows afterwards. */
function targetGroupSize(zoom,density=1){return zoom===14?1:Math.max(2,2**(14-zoom)/density)}
function pixelCount(counts,unit){let whole=0,remainder=0;for(const n of counts){whole+=Math.floor(n/unit);remainder+=n%unit}return whole+Math.ceil(remainder/unit)}
function chooseUnit(ridings,capacities,zoom,density=1){
 let unit=targetGroupSize(zoom,density);
 while(ridings.some((r,i)=>pixelCount(r.counts,unit)>capacities[i])){
  if(unit>2**30)throw Error('Not enough eligible pixels for all ridings');unit*=2;
 }
 return unit;
}
function groupVotes(ridings,unit){
 const groups=[];
 ridings.forEach((riding,r)=>{
  const remainders=[];
  riding.counts.forEach((votes,p)=>{
   const full=Math.floor(votes/unit);for(let i=0;i<full;i++)groups.push({r,p,n:unit});
   if(votes%unit)remainders.push({p,n:votes%unit});
  });
  let parts=[],remaining=unit;
  for(const item of remainders){let n=item.n;while(n){const take=Math.min(n,remaining);parts.push({p:item.p,n:take});remaining-=take;n-=take;
   if(!remaining){groups.push({r,p:-1,n:unit,parts});parts=[];remaining=unit}
  }}
  if(parts.length)groups.push({r,p:-1,n:unit-remaining,parts});
 });
 return groups;
}
function randomSource(seed){let v=seed>>>0;return ()=>{v^=v<<13;v^=v>>>17;v^=v<<5;return(v>>>0)/4294967296}}
/* Candidates are a discrete projection of population positions, plus one
   verified interior anchor per riding. Each cell has one owner. */
function candidateCells(records,ids,eligible,world,zoom,anchors){
 const cells=anchors.map(()=>[]),owners=new Map(),pixelScale=4194304/world,bit=1<<(zoom-6);
 for(let r=0;r<anchors.length;r++){const [x,y]=anchors[r],key=y*world+x;if(owners.has(key))throw Error('Ridings share an interior pixel');owners.set(key,r);cells[r].push(key)}
 for(let i=0;i<ids.length;i++){
  if(!(eligible[i]&bit))continue;
  const x=Math.floor(Math.floor(Math.fround(records[i*3]+1)*2097152)/pixelScale),y=Math.floor(Math.floor(Math.fround(1-records[i*3+1])*2097152)/pixelScale),key=y*world+x,r=ids[i];
  if(!owners.has(key)){owners.set(key,r);cells[r].push(key)}
 }
 return cells;
}
function placeGroups(groups,candidates,zoom){
 const random=randomSource(0x862f57+zoom*7919),order=new Uint32Array(groups.length),offsets=new Uint32Array(candidates.length),cells=new Map();
 for(let i=0;i<order.length;i++)order[i]=i;
 for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1)),v=order[i];order[i]=order[j];order[j]=v}
 for(const i of order){const group=groups[i],positions=candidates[group.r],offset=offsets[group.r]++;if(offset>=positions.length)throw Error('Not enough eligible pixels');cells.set(positions[offset],group)}
 return cells;
}
if(typeof module!=='undefined')module.exports={targetGroupSize,pixelCount,chooseUnit,groupVotes,candidateCells,placeGroups};
