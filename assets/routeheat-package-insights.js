/* Recorded package analytics. No route-plan totals, persistence, network or timers. */
(() => {
  'use strict';
  const HOUR=60*60*1000;
  const count=value=>window.RouteHeatPackages.count(value);
  const time=value=>value!==null&&value!==''&&typeof value!=='boolean'&&Number.isFinite(Number(value))&&Number(value)>0?Number(value):null;
  const number=value=>Math.max(0,Number(value)||0);
  const identity=(saved,index)=>saved?.id!=null&&String(saved.id)!==''?`id:${saved.id}`:time(saved?.startedAt)!==null?`start:${saved.startedAt}`:`anonymous:${index}`;
  function dedupeRoutes(all,active=null){
    const byId=new Map();
    for(const [index,saved] of (Array.isArray(all)?all:[]).entries()){
      if(!saved||typeof saved!=='object'||Array.isArray(saved))continue;
      const key=identity(saved,index),prior=byId.get(key);
      if(!prior||number(saved.revision)>number(prior.revision)||number(saved.revision)===number(prior.revision)&&number(saved.updatedAt)>=number(prior.updatedAt))byId.set(key,saved);
    }
    if(active&&typeof active==='object'&&!Array.isArray(active))byId.set(identity(active,byId.size),active);
    return[...byId.values()];
  }
  function stops(saved){
    const byId=new Map();
    for(const [index,stop] of (Array.isArray(saved?.stops)?saved.stops:[]).entries())if(stop&&typeof stop==='object'&&!Array.isArray(stop))byId.set(stop.id==null?`index:${index}`:`id:${stop.id}`,stop);
    return[...byId.values()];
  }
  function routeSummary(saved){
    const items=stops(saved);let packages=0,countedStops=0,largestStop=null;
    for(const stop of items){const value=count(stop.packageCount);if(value===null)continue;packages+=value;countedStops++;if(!largestStop||value>largestStop.packages)largestStop={routeId:String(saved.id??saved.startedAt??''),stopId:String(stop.id??''),stopNumber:stop.amazonStopNumber??stop.number??null,packages:value,locations:Math.max(1,Math.min(20,Math.round(Number(stop.locationCount)||1))),timestamp:time(stop.timestamp)};}
    return{delivered:countedStops?packages:null,countedStops,totalStops:items.length,unknownStops:items.length-countedStops,complete:items.length>0&&countedStops===items.length,coverage:items.length?Math.round(countedStops/items.length*100):0,largestStop};
  }
  function timedStops(saved,now){
    const start=time(saved?.startedAt),end=time(saved?.endedAt)??time(now),items=stops(saved),valid=[];let invalidTimestampStops=0;
    for(const stop of items){const timestamp=time(stop.timestamp);if(start===null||end===null||timestamp===null||timestamp<start||timestamp>end){invalidTimestampStops++;continue;}valid.push({timestamp,packages:count(stop.packageCount),stopId:String(stop.id??'')});}
    valid.sort((a,b)=>a.timestamp-b.timestamp);return{start,end,items:valid,invalidTimestampStops};
  }
  function hourFromWindow(saved,values,from,to,sum,known,end){
    const totalStops=to-from,unknownStops=totalStops-known;
    return{routeId:String(saved.id??saved.startedAt??''),delivered:known?sum:null,countedStops:known,totalStops,unknownStops,invalidTimestampStops:values.invalidTimestampStops,complete:known>0&&!unknownStops&&!values.invalidTimestampStops,startAt:end-HOUR,endAt:end,durationMs:HOUR,firstStopAt:totalStops?values.items[from].timestamp:null,lastStopAt:totalStops?values.items[to-1].timestamp:null,boundary:'(start, end]'};
  }
  function rollingHour(saved,now=Date.now(),at=null){
    const values=timedStops(saved,now),{start,end,items}=values;
    if(start===null||end===null||end-start<HOUR)return null;
    const firstEnd=start+HOUR,target=time(at);
    if(at!==null&&(target===null||target<firstEnd||target>end))return null;
    const candidates=at!==null?[target]:[firstEnd,...items.filter(item=>item.timestamp>firstEnd).map(item=>item.timestamp)];
    let left=0,right=0,sum=0,known=0,best=null;
    for(const checkpoint of candidates){
      while(right<items.length&&items[right].timestamp<=checkpoint){const n=items[right++].packages;if(n!==null){sum+=n;known++;}}
      while(left<right&&items[left].timestamp<=checkpoint-HOUR){const n=items[left++].packages;if(n!==null){sum-=n;known--;}}
      if(known&&(!best||sum>best.delivered))best=hourFromWindow(saved,values,left,right,sum,known,checkpoint);
    }
    return best;
  }
  function summarize(all,{active=null,now=Date.now(),includeHours=true}={}){
    const routes=dedupeRoutes(all,active);let delivered=0,countedStops=0,totalStops=0,routesWithCounts=0,largestStop=null,bestHour=null,largestRoute=null;
    for(const saved of routes){const value=routeSummary(saved),hour=includeHours?rollingHour(saved,now):null;delivered+=value.delivered??0;countedStops+=value.countedStops;totalStops+=value.totalStops;if(value.countedStops)routesWithCounts++;if(value.largestStop&&(!largestStop||value.largestStop.packages>largestStop.packages))largestStop=value.largestStop;if(hour&&(!bestHour||hour.delivered>bestHour.delivered))bestHour=hour;if(value.countedStops&&(!largestRoute||value.delivered>largestRoute.delivered))largestRoute={...value,routeId:String(saved.id??saved.startedAt??''),timestamp:time(saved.endedAt)??time(saved.startedAt)};}
    return{delivered:countedStops?delivered:null,countedStops,totalStops,unknownStops:totalStops-countedStops,complete:totalStops>0&&countedStops===totalStops,coverage:totalStops?Math.round(countedStops/totalStops*100):0,routes:routes.length,routesWithCounts,largestStop,bestHour,largestRoute};
  }
  function coverageLabel(value){return `${value.countedStops.toLocaleString()} / ${value.totalStops.toLocaleString()} stops counted${value.unknownStops?` · ${value.unknownStops.toLocaleString()} uncounted`:''}`;}
  function totalLabel(value){return value.delivered===null?'—':`${value.delivered.toLocaleString()}${value.complete?'':'+'}`;}
  function hourEvidence(hour,timeLabel=value=>new Date(value).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})){
    return`${timeLabel(hour.startAt)}–${timeLabel(hour.endAt)} · rolling 60 minutes · ${coverageLabel(hour)}${hour.invalidTimestampStops?` · ${hour.invalidTimestampStops} stop timestamp${hour.invalidTimestampStops===1?'':'s'} unavailable`:''}`;
  }
  function moment(saved,latest,history=[],state={},options={}){
    const latestCount=count(latest?.packageCount),timestamp=time(latest?.timestamp),shown=Array.isArray(state.shownKeys)?state.shownKeys:[];
    if(latestCount===null||timestamp===null||!saved||latest!==(saved.stops||[]).at(-1))return null;
    const previousRoutes=dedupeRoutes(history).filter(item=>identity(item,0)!==identity(saved,0)),earlier={...saved,stops:stops(saved).filter(stop=>stop!==latest)},prior=summarize(previousRoutes,{active:earlier,now:timestamp-1});
    const largestKey='packages:largest-stop';
    if(!shown.includes(largestKey)&&latestCount>=5&&prior.countedStops>0&&latestCount>(prior.largestStop?.packages||0))return{tone:'positive',icon:'▣',eyebrow:'PACKAGE RECORD',title:'Your largest counted stop',detail:`${latestCount} packages recorded at one completed stop${Number(latest.locationCount)>1?` with ${Number(latest.locationCount)} locations`:''}.`,metrics:[`${latestCount} packages`,`${prior.largestStop.packages} previous best`],evidence:`Compared with ${prior.countedStops.toLocaleString()} earlier counted stops · uncounted stops are unknown`,priority:3,key:largestKey};
    const hourKey='packages:rolling-hour';if(shown.includes(hourKey))return null;
    const hour=rollingHour(saved,timestamp,timestamp);
    if(!hour||hour.delivered<25||hour.countedStops<2||!prior.bestHour||hour.delivered<=prior.bestHour.delivered)return null;
    return{tone:'positive',icon:'▣',eyebrow:'PACKAGE RECORD',title:'Most counted in a rolling hour',detail:`${hour.delivered} packages counted in this 60-minute window. Your previous recorded best was ${prior.bestHour.delivered}.`,metrics:[`${hour.delivered}${hour.complete?'':'+'} packages`,`${hour.countedStops} counted stops`],evidence:hourEvidence(hour,options.timeLabel),priority:3,key:hourKey};
  }
  function achievementDefinitions(all,now=Date.now()){
    const routes=dedupeRoutes(all).sort((a,b)=>(time(a.startedAt)||0)-(time(b.startedAt)||0)),rows=routes.map(saved=>({saved,stats:routeSummary(saved),hour:rollingHour(saved,now)})),model=summarize(routes,{now});
    const first=predicate=>{const row=rows.find(predicate);return row?time(row.saved.endedAt)??time(row.saved.stops?.at(-1)?.timestamp)??time(row.saved.startedAt):null;};
    return[
      {id:'package-first-count',icon:'▣',title:'First Parcel',detail:'Save a package count on a completed stop.',tier:'bronze',value:model.countedStops,target:1,unit:'counted stops',unlockedAt:first(row=>row.stats.countedStops>=1)},
      {id:'package-big-drop',icon:'10',title:'The Big Drop',detail:'Record at least 10 packages at one completed stop. Multi-location stops still count once.',tier:'silver',value:model.largestStop?.packages||0,target:10,unit:'packages at one stop',unlockedAt:first(row=>(row.stats.largestStop?.packages||0)>=10)},
      {id:'package-route-200',icon:'200',title:'Parcel Power',detail:'Count at least 200 delivered packages at stops on one route. Entered load plans do not qualify.',tier:'gold',value:model.largestRoute?.delivered||0,target:200,unit:'counted packages in a route',unlockedAt:first(row=>row.stats.delivered>=200)},
      {id:'package-hour-50',icon:'50',title:'Parcel Flow',detail:'Count 50 delivered packages inside a full rolling 60-minute window. This records your workload, with no pace target to chase.',tier:'gold',value:model.bestHour?.delivered||0,target:50,unit:'counted packages in 60 min',unlockedAt:first(row=>row.hour?.delivered>=50)},
      {id:'package-hour-100',icon:'100',title:'Century of Parcels',detail:'Count 100 delivered packages inside a full rolling 60-minute window. Missing package counts never add to the total.',tier:'elite',value:model.bestHour?.delivered||0,target:100,unit:'counted packages in 60 min',unlockedAt:first(row=>row.hour?.delivered>=100)}
    ];
  }
  function mapSurface(all,{maxBins=800,cellMeters=80}={}){
    const routes=dedupeRoutes(all),samples=[];let mappedStops=0,knownPackages=0,countedStops=0,latestPoint=null;
    for(const [index,saved] of routes.entries())for(const stop of stops(saved)){
      const lat=typeof stop.lat==='number'?stop.lat:Number.NaN,lng=typeof stop.lng==='number'?stop.lng:Number.NaN,accuracy=stop.accuracy==null?null:Number(stop.accuracy);
      if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat===0&&lng===0||Math.abs(lat)>85.051129||Math.abs(lng)>180||accuracy!==null&&(!Number.isFinite(accuracy)||accuracy<0||accuracy>75))continue;
      const packages=count(stop.packageCount),timestamp=time(stop.timestamp);mappedStops++;if(packages!==null){knownPackages+=packages;countedStops++;if(timestamp!==null&&(!latestPoint||timestamp>latestPoint.timestamp))latestPoint={lat,lng,timestamp};}
      samples.push({lat,lng,packages,timestamp,routeId:identity(saved,index)});
    }
    const limit=Math.max(4,Math.min(1200,Math.floor(Number(maxBins)||800))),latitude=samples.length?samples.reduce((sum,item)=>sum+item.lat,0)/samples.length:0,cosine=Math.max(.08,Math.abs(Math.cos(latitude*Math.PI/180)));
    let size=Math.max(40,Math.min(1000,Number(cellMeters)||80)),bins=[];
    for(let attempt=0;attempt<24;attempt++){
      const groups=new Map();for(const sample of samples){const key=`${Math.floor(sample.lng*111320*cosine/size)}:${Math.floor(sample.lat*110574/size)}`,bin=groups.get(key)||{latTotal:0,lngTotal:0,packages:0,countedStops:0,totalStops:0,routeIds:new Set(),firstAt:null,lastAt:null};bin.latTotal+=sample.lat;bin.lngTotal+=sample.lng;bin.totalStops++;bin.routeIds.add(sample.routeId);if(sample.packages!==null){bin.packages+=sample.packages;bin.countedStops++;}if(sample.timestamp!==null){bin.firstAt=bin.firstAt===null?sample.timestamp:Math.min(bin.firstAt,sample.timestamp);bin.lastAt=bin.lastAt===null?sample.timestamp:Math.max(bin.lastAt,sample.timestamp);}groups.set(key,bin);}
      bins=[...groups.entries()].filter(([,bin])=>bin.countedStops>0).map(([key,bin])=>({key,lat:bin.latTotal/bin.totalStops,lng:bin.lngTotal/bin.totalStops,packages:bin.packages,countedStops:bin.countedStops,totalStops:bin.totalStops,unknownStops:bin.totalStops-bin.countedStops,routeCount:bin.routeIds.size,firstAt:bin.firstAt,lastAt:bin.lastAt}));
      if(bins.length<=limit)break;size*=2;
    }
    bins.sort((a,b)=>b.packages-a.packages||b.countedStops-a.countedStops||a.key.localeCompare(b.key));
    return{kind:'packages',bins,sourceCount:countedStops,mappedStops,delivered:countedStops?knownPackages:null,coverage:mappedStops?Math.round(countedStops/mappedStops*100):0,unknownMappedStops:mappedStops-countedStops,latestPoint,cellMeters:size,maxPackages:bins[0]?.packages||0};
  }
  window.RouteHeatPackageInsights=Object.freeze({dedupeRoutes,routeSummary,summarize,rollingHour,coverageLabel,totalLabel,hourEvidence,moment,achievementDefinitions,mapSurface});
})();
