/* RouteHeat chronological route timeline. Derived only from existing saved records. */
(function(global){
  'use strict';
  const KINDS=Object.freeze([
    {kind:'drive',label:'Recorded movement',color:'#fb7185'},
    {kind:'service',label:'Estimated service',color:'#34d399'},
    {kind:'break',label:'Saved breaks',color:'#a78bfa'},
    {kind:'transition',label:'Rescue transfer',color:'#60a5fa'},
    {kind:'unclassified',label:'Unclassified',color:'#687b8b'}
  ]);
  const PRIORITY=['break','service','transition','drive','unclassified'];
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>value==null||typeof value==='boolean'||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
  const stamp=value=>{const n=number(value);return n!=null&&n>=0&&n<=8640000000000000?n:null;};
  function durationWords(value){
    const raw=number(value);if(raw==null)return 'Unknown duration';
    const ms=Math.abs(raw);if(ms>0&&ms<1000)return 'less than 1 second';
    let seconds=Math.round(ms/1000);const hours=Math.floor(seconds/3600);seconds%=3600;const minutes=Math.floor(seconds/60);seconds%=60;
    return [hours?`${hours} hour${hours===1?'':'s'}`:'',minutes?`${minutes} minute${minutes===1?'':'s'}`:'',seconds||(!hours&&!minutes)?`${seconds} second${seconds===1?'':'s'}`:''].filter(Boolean).join(' ');
  }
  function errorDescription(snapshot){
    const error=number(snapshot?.errorMs);if(error==null)return 'Finish comparison unavailable';
    if(Math.abs(error)<1000)return 'Finished within 1 second of the estimate';
    return `Finished ${durationWords(error)} ${error>0?'earlier':'later'} than estimated`;
  }
  function forecastText(data){
    if(!data?.available)return null;
    const count=Array.isArray(data.snapshots)?data.snapshots.length:0;
    return {
      result:`First estimate: ${errorDescription(data.first)}${data.first?.within?' · inside its forecast window':''}`,
      accuracy:`${Math.max(0,Number(data.withinCount)||0)} of ${count} saved forecast window${count===1?'':'s'} included the actual finish`,
      factors:`Closest saved estimate: ${errorDescription(data.best)} · ${String(data.best?.confidence||'low')} confidence`
    };
  }
  function model(saved,breakdown={},now=Date.now()){
    const start=stamp(saved?.startedAt),end=stamp(saved?.endedAt)??stamp(now);
    if(start==null||end==null||end<=start)return {available:false,start,end,wall:0,spans:[],events:[],totals:[]};
    const wall=end-start,changes=new Map(),add=(at,kind,delta)=>{const row=changes.get(at)||[];row.push({kind,delta});changes.set(at,row);};
    add(start,'unclassified',1);add(end,'unclassified',-1);
    PRIORITY.forEach(kind=>(Array.isArray(breakdown?.intervals?.[kind])?breakdown.intervals[kind]:[]).forEach(interval=>{
      const rawStart=stamp(interval?.[0]),rawEnd=stamp(interval?.[1]);if(rawStart==null||rawEnd==null)return;
      const from=Math.max(start,rawStart),to=Math.min(end,rawEnd);if(to<=from)return;add(from,kind,1);add(to,kind,-1);
    }));
    const points=[...changes.keys()].sort((a,b)=>a-b),counts=Object.fromEntries(PRIORITY.map(kind=>[kind,0])),spans=[];
    points.forEach((at,index)=>{
      changes.get(at).forEach(change=>counts[change.kind]+=change.delta);const to=points[index+1];if(!(to>at))return;
      const kind=PRIORITY.find(key=>counts[key]>0)||'unclassified',last=spans.at(-1);
      if(last?.kind===kind&&last.to===at)last.to=to;else spans.push({kind,from:at,to});
    });
    spans.forEach(span=>{span.ms=span.to-span.from;span.left=(span.from-start)/wall*100;span.width=span.ms/wall*100;});
    const events=[],addEvent=(kind,timestamp,label,detail='')=>{const at=stamp(timestamp);if(at==null||at<start||at>end)return;events.push({kind,at,label,detail,position:(at-start)/wall*100});};
    (saved?.stops||[]).forEach((stop,index)=>{
      const count=Math.max(1,Math.round(number(stop.locationCount)||1)),packages=number(stop.packageCount),label=`Stop ${number(stop.amazonStopNumber)??number(stop.number)??index+1}`;
      addEvent('stop',stop.timestamp,label,[count>1?`${count} locations`:'1 location',packages!=null&&packages>=0?`${packages} package${packages===1?'':'s'}`:''].filter(Boolean).join(' · '));
      if(stop.delayReason?.code){const reason=global.RouteHeatDelays?.reasons?.[stop.delayReason.code]||({overflow:'Overflow',tote:'New tote',customer:'Customer',walk:'Long walk',access:'Access / gate',packages:'Finding packages',other:'Other'})[stop.delayReason.code];if(reason)addEvent('delay',stop.timestamp,`${reason} · ${label}`,'Recorded reason; its separate delay duration is unknown');}
    });
    (saved?.totes||[]).forEach((tote,index)=>addEvent('tote',tote.timestamp,`Opened Tote ${number(tote.number)??index+1}`));
    (saved?.phases||[]).filter(phase=>phase.type==='rescue').forEach((phase,index)=>addEvent('rescue',phase.startedAt,phase.label||`Rescue ${index+1} started`));
    const order={rescue:0,tote:1,stop:2,delay:3};events.sort((a,b)=>a.at-b.at||order[a.kind]-order[b.kind]);
    const totals=KINDS.map(item=>({...item,ms:spans.filter(span=>span.kind===item.kind).reduce((total,span)=>total+span.ms,0)}));
    return {available:true,start,end,wall,spans,events,totals,serviceCoverage:Number(breakdown.serviceCoverage)||0,totalStops:saved?.stops?.length||0,gpsPoints:Number(breakdown.gpsPoints)||0};
  }
  function render(saved,breakdown,options={}){
    const data=model(saved,breakdown,options.now),clock=options.timeLabel||((at)=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'}));
    if(!data.available)return '<h3>Where time went</h3><p>A timeline will appear when the route has a valid start and finish time.</p>';
    const position=at=>((at-data.start)/data.wall*1000).toFixed(3),color=kind=>KINDS.find(item=>item.kind===kind)?.color||'#687b8b';
    const spans=data.spans.map(span=>`<rect x="${position(span.from)}" y="24" width="${(span.ms/data.wall*1000).toFixed(3)}" height="24" fill="${color(span.kind)}" class="route-timeline-span timeline-${span.kind}"><title>${escape(KINDS.find(item=>item.kind===span.kind)?.label)} · ${escape(clock(span.from))} to ${escape(clock(span.to))} · ${escape(durationWords(span.ms))}</title></rect>`).join('');
    const eventMarkup=data.events.map(event=>{const x=Number(position(event.at)),title=`<title>${escape(clock(event.at))} · ${escape(event.label)}${event.detail?` · ${escape(event.detail)}`:''}</title>`;if(event.kind==='stop')return `<line class="route-timeline-stop" x1="${x}" x2="${x}" y1="19" y2="29">${title}</line>`;if(event.kind==='tote'){const dot=Math.max(12,Math.min(988,x));return `<line class="route-timeline-tote" x1="${dot}" x2="${dot+.01}" y1="12" y2="12">${title}</line>`;}if(event.kind==='delay')return `<path class="route-timeline-delay" d="M${x} 55 l4 5 -4 5 -4 -5 Z">${title}</path>`;return `<path class="route-timeline-rescue" d="M${x} 5 v17 m0 -17 h9 l-3 5 3 5 h-9">${title}</path>`;}).join('');
    const axis=Array.from({length:5},(_,index)=>`<span>${escape(clock(data.start+data.wall*index/4))}</span>`).join('');
    const counts={stop:0,tote:0,delay:0,rescue:0};data.events.forEach(event=>counts[event.kind]++);
    const rows=[...data.spans.filter(span=>span.kind==='break'||span.kind==='transition').map(span=>({at:span.from,kind:span.kind,label:KINDS.find(item=>item.kind===span.kind).label,detail:`Until ${clock(span.to)} · ${durationWords(span.ms)}`})),...data.events].sort((a,b)=>a.at-b.at);
    return `<div class="route-timeline-head"><h3>Where time went</h3><span>${escape(durationWords(data.wall))} total</span></div><p>Your full workday, from left to right. Each pale line is a completed stop.</p><div class="route-timeline" role="img" aria-label="Chronological route from ${escape(clock(data.start))} to ${escape(clock(data.end))}, ${counts.stop} stops, ${counts.tote} tote openings, ${counts.delay} reason notes and ${counts.rescue} rescues. Expand timeline details for every event."><svg viewBox="0 0 1000 70" preserveAspectRatio="none" aria-hidden="true">${spans}${eventMarkup}</svg><div class="route-timeline-axis" aria-hidden="true">${axis}</div></div><div class="route-timeline-marker-key"><span><i class="timeline-key-stop"></i>Stop</span><span><i class="timeline-key-tote"></i>Opened tote</span><span><i class="timeline-key-delay"></i>Reason note</span><span><i class="timeline-key-rescue"></i>Rescue</span></div><div class="route-timeline-totals">${data.totals.map(item=>`<div data-time-kind="${item.kind}"><span><i style="background:${item.color}"></i>${item.label}</span><b>${escape(durationWords(item.ms))}</b></div>`).join('')}</div><p class="route-timeline-explainer">Red shows recorded GPS movement, which can include walking. Green service spans are estimates. Gray time is unclassified, including recording gaps. Tote dots and reason notes mark events, not measured delay durations.</p><details class="route-timeline-details"><summary>Timeline details · ${rows.length} events and time spans</summary><ol>${rows.map(row=>`<li data-event-kind="${row.kind}"><time>${escape(clock(row.at))}</time><span><b>${escape(row.label)}</b>${row.detail?`<small>${escape(row.detail)}</small>`:''}</span></li>`).join('')}</ol></details><p class="route-timeline-coverage">Service estimates at ${data.serviceCoverage} of ${data.totalStops} stops · ${data.gpsPoints.toLocaleString()} trusted GPS points. The categories cover the entire workday without overlapping.</p>`;
  }
  global.RouteHeatTimeline=Object.freeze({durationWords,errorDescription,forecastText,model,render});
})(typeof window!=='undefined'?window:globalThis);
