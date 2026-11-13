const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const zlib=require('node:zlib');
const vm=require('node:vm');
const path=require('node:path');
const root=path.join(__dirname,'..','dist');
const {targetGroupSize,pixelCount,chooseUnit,groupVotes,candidateCells,placeGroups}=require(path.join(root,'aggregation.js'));

test('remainders are packed after whole party pixels',()=>{
 const groups=groupVotes([{counts:[7,5]}],2);
 assert.equal(groups.filter(g=>g.p===0).length,3);
 assert.equal(groups.filter(g=>g.p===1).length,2);
 assert.deepEqual(groups.filter(g=>g.p===-1).map(g=>g.parts),[[{p:0,n:1},{p:1,n:1}]]);
 assert.equal(pixelCount([7,5],2),6);
});
test('multiple remainders retain exact party counts and mark partial pixels',()=>{
 const groups=groupVotes([{counts:[7,5,3]}],4);
 assert.deepEqual(groups.map(g=>g.n),[4,4,4,3]);
 assert.ok(groups.filter(g=>g.n<4).every(g=>g.p===-1));
 const totals=[0,0,0];for(const g of groups)for(const p of g.parts||[{p:g.p,n:g.n}])totals[p.p]+=p.n;
 assert.deepEqual(totals,[7,5,3]);
});
test('unit rises uniformly when any riding has insufficient space',()=>{
 const ridings=[{counts:[7,5]},{counts:[100]}];
 assert.equal(targetGroupSize(13,1),2);
 assert.equal(chooseUnit(ridings,[2,100],13),8);
 assert.ok(ridings.every((r,i)=>pixelCount(r.counts,8)<=[2,100][i]));
});
test('pixels are unique and owned by one riding even with colliding candidates',()=>{
 const records=new Float32Array([-.5,.5,0,-.5,.5,1,-.4,.5,0]);
 const ids=new Uint8Array([0,1,0]),eligible=new Uint8Array([255,255,255]);
 const candidates=candidateCells(records,ids,eligible,256,6,[[64,64],[65,64]]);
 const groups=groupVotes([{counts:[2]},{counts:[2]}],2);
 const cells=placeGroups(groups,candidates,6);
 assert.equal(cells.size,2);
 assert.equal(new Set([...cells.values()].map(g=>g.r)).size,2);
 assert.throws(()=>candidateCells(records,ids,eligible,256,6,[[64,64],[64,64]]),/share/);
});
test('worker shows mixed and partial pixels as grey and reports exact counts',()=>{
 const messages=[],context={Uint8ClampedArray,Uint32Array,Uint8Array,Float32Array,Math,Number,Map,Error,self:{postMessage:m=>messages.push(m)}};
 vm.createContext(context);context.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(root,'aggregation.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'aggregate-worker.js'),'utf8'),context);
 const send=data=>context.self.onmessage({data});
 const votes=new Float32Array([-.5,.5,0,-.4,.5,1,-.3,.5,0]);
 send({type:'init',votes:votes.buffer,ridingIds:new Uint8Array([0,0,0]).buffer,eligible:new Uint8Array([255,255,255]).buffer,colors:[[20,30,40],[80,90,100]],parties:['A','B'],ridings:[{name:'One',counts:[3,3]}],anchors:{13:[[64,64]]}});
 send({type:'render',id:1,view:{x:0,y:0,width:256,height:256,world:256},zoom:13,selected:-1});
 assert.equal(messages.at(-1).unit,2);
 const rgba=new Uint8ClampedArray(messages.at(-1).pixels);let grey=0;
 for(let i=0;i<rgba.length;i+=4)if(rgba[i]===105&&rgba[i+3]===255)grey++;
 assert.equal(grey,1);
});
const meta=JSON.parse(fs.readFileSync(path.join(root,'meta.json')));
const features=JSON.parse(fs.readFileSync(path.join(root,'ridings.json'))).features;
const ridings=features.map(f=>({counts:meta.parties.map(p=>f.properties.votes[p]||0)}));
const raw=zlib.gunzipSync(Buffer.concat(Array.from({length:8},(_,i)=>fs.readFileSync(path.join(root,`votes-${String(i).padStart(2,'0')}.gz`)))));
const records=new Float32Array(raw.buffer,raw.byteOffset,raw.byteLength/4);
const ids=new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(root,'riding-ids.gz'))));
const eligible=new Uint8Array(zlib.gunzipSync(fs.readFileSync(path.join(root,'eligible-pixels.gz'))));
const anchors=JSON.parse(fs.readFileSync(path.join(root,'riding-anchors.json')));
test('real data preserves all votes with one riding per pixel at every zoom and density',()=>{
 assert.equal(ids.length,meta.total);assert.equal(eligible.length,meta.total);assert.equal(records.length/3,meta.total);
 for(let z=6;z<14;z++){
  const pools=candidateCells(records,ids,eligible,256*2**z,z,anchors[z]);
  for(const density of [1,2,4]){
   const unit=chooseUnit(ridings,pools.map(p=>p.length),z,density),groups=groupVotes(ridings,unit),cells=placeGroups(groups,pools,z);
   assert.equal(cells.size,groups.length);
   const totals=ridings.map(()=>Array(meta.parties.length).fill(0));
   for(const g of cells.values()){
    assert.ok(g.n<=unit);if(g.p>=0)assert.equal(g.n,unit);
    for(const p of g.parts||[{p:g.p,n:g.n}])totals[g.r][p.p]+=p.n;
   }
   assert.deepEqual(totals,ridings.map(r=>r.counts));
  }
 }
});
test('closest zoom positions use unique projected pixels',()=>{
 const occupied=new Set(),scale=256*2**14/2;
 for(let i=0;i<records.length;i+=3){const x=Math.floor(Math.fround(Math.fround(records[i]+1)*scale)),y=Math.floor(Math.fround(Math.fround(1-records[i+1])*scale)),key=y*scale*2+x;assert.ok(!occupied.has(key));occupied.add(key)}
});

test('reserved anchors and sampled eligible cells have centres inside their riding',()=>{
 function inRing(ring,x,y){let inside=false,j=ring.length-1;for(let i=0;i<ring.length;j=i++){
  const [xi,yi]=ring[i],[xj,yj]=ring[j];if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
 }return inside}
 function contains(geometry,x,y){const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.coordinates;
  return polygons.some(p=>inRing(p[0],x,y)&&!p.slice(1).some(r=>inRing(r,x,y)))}
 function lonlat(x,y,world){return [(x+.5)/world*360-180,Math.atan(Math.sinh(Math.PI*(1-2*(y+.5)/world)))*180/Math.PI]}
 for(let z=6;z<14;z++){
  const world=256*2**z;
  for(let r=0;r<features.length;r++){
   const [x,y]=anchors[z][r],point=lonlat(x,y,world);
   assert.ok(contains(features[r].geometry,...point),`anchor outside riding ${r} at ${z}`);
  }
  for(let i=0;i<ids.length;i+=7919){if(!(eligible[i]&(1<<(z-6))))continue;
   const x=Math.floor(Math.floor(Math.fround(records[i*3]+1)*2097152)/2**(14-z)),y=Math.floor(Math.floor(Math.fround(1-records[i*3+1])*2097152)/2**(14-z)),point=lonlat(x,y,world);
   assert.ok(contains(features[ids[i]].geometry,...point),`candidate outside riding ${ids[i]} at ${z}`);
  }
 }
});

test('remainder colour follows the selected rule, with ties grey and exact counts intact',()=>{
 const messages=[],context={Uint8ClampedArray,Uint32Array,Uint8Array,Float32Array,Math,Number,Map,Error,self:{postMessage:m=>messages.push(m)}};
 vm.createContext(context);context.importScripts=()=>vm.runInContext(fs.readFileSync(path.join(root,'aggregation.js'),'utf8'),context);
 vm.runInContext(fs.readFileSync(path.join(root,'aggregate-worker.js'),'utf8'),context);
 const send=data=>context.self.onmessage({data});
 const votes=new Float32Array([-.5,.5,0,-.4,.5,1,-.3,.5,0]);
 send({type:'init',votes:votes.buffer,ridingIds:new Uint8Array([0,0,0]).buffer,eligible:new Uint8Array([255,255,255]).buffer,colors:[[20,30,40],[80,90,100]],parties:['A','B'],ridings:[{name:'One',counts:[7,5]}],anchors:{12:[[64,64]]}});
 const view={x:0,y:0,width:256,height:256,world:256};
 function render(id,rounding,selected=-1){send({type:'render',id,view,zoom:12,selected,rounding});return new Uint8ClampedArray(messages.at(-1).pixels)}
 function count(rgba,color){let n=0;for(let i=0;i<rgba.length;i+=4)if(rgba[i]===color[0]&&rgba[i+1]===color[1]&&rgba[i+2]===color[2]&&rgba[i+3]===255)n++;return n}
 let pixels=render(1,'grey');assert.equal(count(pixels,[105,105,105]),1);
 pixels=render(2,'largest');assert.equal(count(pixels,[105,105,105]),0);assert.equal(count(pixels,[20,30,40]),2);
 const key=vm.runInContext('[...cachedCells].find(([,g])=>g.p<0)[0]',context);send({type:'inspect',id:2,x:key%256,y:Math.floor(key/256)});
 const breakdown=JSON.parse(JSON.stringify(messages.at(-1).groups)).sort((a,b)=>a.party.localeCompare(b.party));
 assert.deepEqual(breakdown,[{name:'One',party:'A',count:3},{name:'One',party:'B',count:1}]);
 pixels=render(3,'largest',1);assert.equal(count(pixels,[20,30,40]),0);assert.equal(count(pixels,[80,90,100]),1);
 const mixed=groupVotes([{counts:[7,5]}],4).find(g=>g.p<0);
 assert.deepEqual(mixed.parts,[{p:0,n:3},{p:1,n:1}]);
 assert.equal(vm.runInContext('dominantParty({p:-1,parts:[{p:0,n:1},{p:1,n:1}]})',context),-1);
 assert.equal(vm.runInContext('dominantParty({p:-1,parts:[{p:0,n:1}]})',context),0);
});

test('every reserved anchor originates from an eligible populated position',()=>{
 for(let z=6;z<14;z++){
  const world=256*2**z,wanted=new Set(anchors[z].map(([x,y],r)=>`${r}:${y*world+x}`));
  for(let i=0;i<ids.length&&wanted.size;i++){
   if(!(eligible[i]&(1<<(z-6))))continue;
   const x=Math.floor(Math.floor(Math.fround(records[i*3]+1)*2097152)/2**(14-z));
   const y=Math.floor(Math.floor(Math.fround(1-records[i*3+1])*2097152)/2**(14-z));
   wanted.delete(`${ids[i]}:${y*world+x}`);
  }
  assert.equal(wanted.size,0,`unpopulated anchors at zoom ${z}`);
 }
});
test('individual vote data retains the exact riding and party totals',()=>{
 const totals=ridings.map(()=>Array(meta.parties.length).fill(0));
 for(let i=0;i<ids.length;i++)totals[ids[i]][records[i*3+2]]++;
 assert.deepEqual(totals,ridings.map(r=>r.counts));
});

test('spatially sorted positions are sampled across their extent, not cut off at one edge',()=>{
 const n=100,world=256,records=new Float32Array(n*3),ids=new Uint8Array(n),eligible=new Uint8Array(n).fill(255);
 for(let i=0;i<n;i++){records[i*3]=((i+50+.25)/world)*2-1;records[i*3+1]=.5}
 const anchors=[[50,64]],a=candidateCells(records,ids,eligible,world,6,anchors),b=candidateCells(records,ids,eligible,world,6,anchors);
 assert.deepEqual(a,b,'the same zoom should use stable positions');
 const selected=placeGroups(groupVotes([{counts:[20]}],2),a,6);
 const xs=[...selected.keys()].map(k=>k%world);
 assert.ok(Math.min(...xs)<75,`missing western positions: ${xs}`);
 assert.ok(Math.max(...xs)>125,`missing eastern positions: ${xs}`);
});
