(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const STORE = 'routeheat.routes.v2';
  let route = null, watchId = null, map = null, userMarker = null, routeLayer = null, timerId = null, historyMap = null, zoneMap = null, undoTimer = null;
  let autoEnabled = localStorage.getItem('routeheat.autoDetect') === 'true', followMap = true;
  let detector = {phase:'moving',anchor:null,stoppedAt:null,last:null,moveHits:0};
  const defaultCenter = [39.7392, -104.9903];

  function initMap() {
    if (!window.L) { $('#gpsStatus').textContent = 'Map offline'; return; }
    map = L.map('map', { zoomControl:false, attributionControl:true }).setView(defaultCenter, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    map.on('dragstart',()=>{followMap=false;$('#gpsStatus').textContent='Map follow paused';});
    setTimeout(() => map.invalidateSize(), 100);
  }

  const routes = () => { try { return JSON.parse(localStorage.getItem(STORE)) || []; } catch { return []; } };
  const saveRoutes = data => localStorage.setItem(STORE, JSON.stringify(data));
  const formatDuration = ms => { const t=Math.max(0,Math.floor(ms/1000)), h=String(Math.floor(t/3600)).padStart(2,'0'), m=String(Math.floor(t%3600/60)).padStart(2,'0'), s=String(t%60).padStart(2,'0'); return `${h}:${m}:${s}`; };
  const pace = ms => ms > 0 ? 3600000/ms : 0;
  const paceClass = p => p >= 22 ? 'fast' : p >= 15 ? 'steady' : 'slow';
  const paceColor = p => p >= 22 ? '#22e38d' : p >= 15 ? '#ffc857' : '#ff6b68';
  const timeLabel = ts => new Intl.DateTimeFormat([], {hour:'numeric',minute:'2-digit'}).format(ts);
  const dateLabel = ts => new Intl.DateTimeFormat([], {month:'short',day:'numeric',year:'numeric'}).format(ts);
  const toast = msg => { const el=$('#toast'); el.textContent=msg; el.classList.add('show'); setTimeout(()=>el.classList.remove('show'),2200); };
  const pausedMs = (r, now=Date.now()) => (r.pauses||[]).reduce((n,p)=>n+(p.endedAt-p.startedAt),0)+(r.pausedAt?now-r.pausedAt:0);
  const activeMs = (r, now=Date.now()) => Math.max(0,now-r.startedAt-pausedMs(r,now));
  const distanceM = (a,b) => {const R=6371000,toRad=n=>n*Math.PI/180,dLat=toRad(b.lat-a.lat),dLng=toRad(b.lng-a.lng),x=Math.sin(dLat/2)**2+Math.cos(toRad(a.lat))*Math.cos(toRad(b.lat))*Math.sin(dLng/2)**2;return 2*R*Math.asin(Math.sqrt(x));};
  function resetDetector(){detector={phase:'moving',anchor:null,stoppedAt:null,last:null,moveHits:0};updateAutoStatus();}
  function updateAutoStatus(text){const el=$('#autoStatus');if(!el)return;if(text){el.textContent=text;return;}el.textContent=!autoEnabled?'Off · manual button still available':!route?'On · ready when route starts':route.pausedAt?'Paused with route':detector.phase==='candidate'?'Possible stop · checking dwell time':detector.phase==='armed'?'Stop detected · waiting for departure':'On · monitoring movement';}

  function getPosition(center=false) {
    if (!navigator.geolocation) { $('#gpsStatus').textContent='GPS unavailable'; return; }
    $('#gpsStatus').textContent='Locating…';
    navigator.geolocation.getCurrentPosition(pos => updatePosition(pos, center), () => { $('#gpsStatus').textContent='Location blocked'; toast('Enable location access for GPS logging'); }, {enableHighAccuracy:true,timeout:10000,maximumAge:5000});
  }
  function updatePosition(pos, center=false) {
    const ll=[pos.coords.latitude,pos.coords.longitude];
    $('#gpsStatus').textContent=`GPS ±${Math.round(pos.coords.accuracy)}m`; $('#gpsDot').classList.add('live');
    if(map){ if(!userMarker) userMarker=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#22e38d',fillOpacity:1}).addTo(map); else userMarker.setLatLng(ll); if(center){followMap=true;map.setView(ll,16);}else if(route&&followMap)map.panTo(ll,{animate:true,duration:.45}); }
    if(route) route.lastPosition={lat:ll[0],lng:ll[1],accuracy:pos.coords.accuracy};
    processAutoDetection(pos);
  }
  function processAutoDetection(pos){
    if(!autoEnabled||!route||route.pausedAt||pos.coords.accuracy>55)return;const now=pos.timestamp||Date.now(),point={lat:pos.coords.latitude,lng:pos.coords.longitude,time:now};let speed=pos.coords.speed;
    if((speed==null||speed<0)&&detector.last){const seconds=(now-detector.last.time)/1000;if(seconds>0)speed=distanceM(detector.last,point)/seconds;}detector.last=point;if(speed==null)return;
    const stopped=speed<1.15,moving=speed>2.2;
    if(detector.phase==='moving'&&stopped){detector.phase='candidate';detector.anchor=point;detector.stoppedAt=now;updateAutoStatus();return;}
    if(detector.phase==='candidate'){const drift=distanceM(detector.anchor,point);if(moving||drift>45){resetDetector();detector.last=point;return;}if(stopped&&now-detector.stoppedAt>=35000){detector.phase='armed';detector.moveHits=0;updateAutoStatus();return;}}
    if(detector.phase==='armed'){const away=distanceM(detector.anchor,point);if(moving||away>45)detector.moveHits++;else detector.moveHits=0;if(detector.moveHits>=2||away>80){const stopPoint={lat:detector.anchor.lat,lng:detector.anchor.lng,accuracy:pos.coords.accuracy};logStop('auto',stopPoint);resetDetector();detector.last=point;}}
  }

  function openGoalSetup(){ const saved=JSON.parse(localStorage.getItem('routeheat.goals')||'null'); if(saved){$('#paceGoalInput').value=saved.pace;$('#plannedStopsInput').value=saved.stops;} $('#goalModal').classList.add('open');$('#goalModal').setAttribute('aria-hidden','false'); }
  function startRoute() {
    const paceGoal=Math.max(1,Number($('#paceGoalInput').value)||20),plannedStops=Math.max(1,Math.round(Number($('#plannedStopsInput').value)||100)); localStorage.setItem('routeheat.goals',JSON.stringify({pace:paceGoal,stops:plannedStops}));
    const now=Date.now(); route={id:`rh-${now}`,startedAt:now,endedAt:null,stops:[],totes:[],lastPosition:null,paceGoal,plannedStops,pauses:[],pausedAt:null}; $('#goalModal').classList.remove('open'); followMap=true; resetDetector();
    $('#routeToggle').classList.add('running'); $('#routeToggle').innerHTML='<span class="play">■</span><span>Finish</span>';
    $('#pauseBtn').hidden=false; $('#routeTitle').textContent='Route in progress'; $('#stopBtn').disabled=false; $('#toteBtn').disabled=false; $('#stopButtonHint').textContent='Stop 1 • tap once when parked'; $('#toteButtonHint').textContent='Marks this location on the map';
    timerId=setInterval(renderLive,1000); getPosition(true);
    if(navigator.geolocation) watchId=navigator.geolocation.watchPosition(p=>updatePosition(p),()=>{}, {enableHighAccuracy:true,maximumAge:3000});
    renderLive(); toast('Route started — drive safe');
  }
  function togglePause(){ if(!route)return; if(route.pausedAt){const now=Date.now();route.pauses.push({startedAt:route.pausedAt,endedAt:now});route.pausedAt=null;$('#pauseBtn').innerHTML='<span>Ⅱ</span><span>Pause</span>';$('#routeTitle').textContent='Route in progress';$('#stopBtn').disabled=false;$('#toteBtn').disabled=false;resetDetector();toast('Route resumed');}else{route.pausedAt=Date.now();$('#pauseBtn').innerHTML='<span>▶</span><span>Resume</span>';$('#routeTitle').textContent='On break';$('#stopBtn').disabled=true;$('#toteBtn').disabled=true;resetDetector();toast('Pace timer paused');}renderLive();}
  function askFinish(){ $('#confirmModal').classList.add('open'); $('#confirmModal').setAttribute('aria-hidden','false'); }
  function finishRoute(){
    if(route.pausedAt){route.pauses.push({startedAt:route.pausedAt,endedAt:Date.now()});route.pausedAt=null;}
    route.endedAt=Date.now(); const all=routes(); all.unshift(route); saveRoutes(all);
    if(watchId!==null) navigator.geolocation.clearWatch(watchId); clearInterval(timerId); watchId=null; timerId=null;
    route=null; $('#autoUndo').hidden=true; resetDetector(); if(routeLayer) routeLayer.clearLayers();
    $('#confirmModal').classList.remove('open'); $('#pauseBtn').hidden=true; $('#routeToggle').classList.remove('running'); $('#routeToggle').innerHTML='<span class="play">▶</span><span>Start route</span>';
    $('#routeTitle').textContent='Ready when you are'; $('#stopBtn').disabled=true; $('#toteBtn').disabled=true; $('#stopButtonHint').textContent='Start your route first'; renderLive(); renderHistory(); toast('Route saved to history');
  }
  function logStop(source='manual',overridePos=null){
    if(!route||route.pausedAt) return; const now=Date.now(), currentActive=activeMs(route,now), prev=route.stops.at(-1), segmentMs=currentActive-(prev?.activeElapsed||0), pos=overridePos||route.lastPosition;
    const stop={number:route.stops.length+1,timestamp:now,segmentMs,activeElapsed:currentActive,source,lat:pos?.lat??null,lng:pos?.lng??null,accuracy:pos?.accuracy??null}; route.stops.push(stop);
    if(navigator.vibrate) navigator.vibrate(80); drawRoute(); if(map&&pos?.lat!=null){followMap=true;map.panTo([pos.lat,pos.lng],{animate:true,duration:.5});} renderLive(); toast(`Stop ${stop.number} complete • ${pace(segmentMs).toFixed(1)}/hr`);
    if(source==='auto'){clearTimeout(undoTimer);$('#autoUndo').hidden=false;undoTimer=setTimeout(()=>$('#autoUndo').hidden=true,15000);}else resetDetector();
  }
  function undoAutoStop(){if(!route||route.stops.at(-1)?.source!=='auto')return;route.stops.pop();$('#autoUndo').hidden=true;clearTimeout(undoTimer);drawRoute();renderLive();toast('Automatic stop removed');}
  function openNewTote(){if(!route||route.pausedAt)return;const pos=route.lastPosition,number=(route.totes||[]).length+1,tote={number,timestamp:Date.now(),afterStop:route.stops.length,lat:pos?.lat??null,lng:pos?.lng??null,accuracy:pos?.accuracy??null};(route.totes??=[]).push(tote);if(navigator.vibrate)navigator.vibrate([60,40,60]);drawRoute();if(map&&tote.lat!=null){followMap=true;map.panTo([tote.lat,tote.lng],{animate:true,duration:.5});}$('#toteButtonHint').textContent=`Tote ${number} opened · tap for next tote`;toast(`New Tote ${number} marked on map`);}
  function drawRoute(){
    if(!routeLayer||!route) return; routeLayer.clearLayers();
    route.stops.forEach((s,i)=>{ if(s.lat===null)return; L.circleMarker([s.lat,s.lng],{radius:7,color:'#07110f',weight:3,fillColor:paceColor(pace(s.segmentMs)),fillOpacity:1}).bindTooltip(`Stop ${s.number}`).addTo(routeLayer); const prev=route.stops[i-1]; if(prev?.lat!=null)L.polyline([[prev.lat,prev.lng],[s.lat,s.lng]],{color:paceColor(pace(s.segmentMs)),weight:5,opacity:.9}).addTo(routeLayer); });
    (route.totes||[]).forEach(t=>{if(t.lat==null)return;const icon=L.divIcon({className:'',html:`<div class="tote-marker"><span>T${t.number}</span></div>`,iconSize:[30,30]});L.marker([t.lat,t.lng],{icon,zIndexOffset:500}).bindTooltip(`New Tote ${t.number} · after stop ${t.afterStop}`).addTo(routeLayer);});
  }
  function renderLive(){
    const count=route?.stops.length||0, elapsed=route?activeMs(route):0, last=route?.stops.at(-1);
    $('#stopCount').textContent=count; $('#routeTime').textContent=`${formatDuration(elapsed)} active time`; $('#overallPace').textContent=route&&count?pace(elapsed/count).toFixed(1):'—';
    $('#segmentPace').textContent=last?pace(last.segmentMs).toFixed(1):'—'; $('#segmentTime').textContent=last?`${formatDuration(last.segmentMs).slice(3)} segment`:'Complete a stop';
    $('#stopBadge').textContent=`${count} logged`; if(route) $('#stopButtonHint').textContent=`Stop ${count+1} • tap once when parked`;
    const strip=$('#goalStrip');strip.classList.remove('ahead','behind');if(route){const actual=count&&elapsed?pace(elapsed/count):0,delta=actual-route.paceGoal,remaining=Math.max(0,route.plannedStops-count),basis=actual||route.paceGoal,finish=new Date(Date.now()+remaining/basis*3600000);$('#goalStatus').textContent=count?`${Math.abs(delta).toFixed(1)}/hr ${delta>=0?'ahead':'behind'} · goal ${route.paceGoal}/hr`:`Goal ${route.paceGoal}/hr · ${route.plannedStops} stops`;strip.classList.add(delta>=0?'ahead':'behind');$('#finishProjection').textContent=remaining?timeLabel(finish):'Route goal reached';}else{$('#goalStatus').textContent='Set a goal before starting';$('#finishProjection').textContent='—';}
    const box=$('#recentStops'); if(!count){box.className='empty-state';box.innerHTML='<div class="empty-icon">◎</div><p>Your completed stops will appear here.</p>';return;}
    box.className='stop-list'; box.innerHTML=route.stops.slice(-4).reverse().map(s=>{const p=pace(s.segmentMs);return `<div class="stop-row"><span class="stop-number">${s.number}</span><div class="stop-info"><b>Stop ${s.number}${s.source==='auto'?' · Auto':''}</b><span>${timeLabel(s.timestamp)} · ${formatDuration(s.segmentMs).slice(3)} segment</span></div><span class="pace-pill ${paceClass(p)}">${p.toFixed(1)}/hr</span></div>`}).join('');
  }

  function renderHistory(){
    const all=routes(), totalStops=all.reduce((n,r)=>n+r.stops.length,0), totalMs=all.reduce((n,r)=>n+activeMs(r,r.endedAt||Date.now()),0), avg=totalStops&&totalMs?pace(totalMs/totalStops):0;
    $('#historySummary').innerHTML=`<div class="summary-tile"><span>ROUTES</span><strong>${all.length}</strong></div><div class="summary-tile"><span>STOPS</span><strong>${totalStops}</strong></div><div class="summary-tile"><span>AVG /HR</span><strong>${avg?avg.toFixed(1):'—'}</strong></div>`;
    renderZones(all); const list=$('#historyList'); if(!all.length){list.innerHTML='<div class="recent-card empty-state"><div class="empty-icon">▥</div><p>Finished routes will be saved here on this device.</p></div>';return;}
    list.innerHTML=all.map(r=>{const ms=activeMs(r,r.endedAt||Date.now()),p=r.stops.length?pace(ms/r.stops.length):0,breaks=(r.pauses||[]).length;return `<article class="history-card"><div class="history-card-top"><div><h3>${dateLabel(r.startedAt)}</h3><p>${timeLabel(r.startedAt)} – ${timeLabel(r.endedAt||Date.now())}${breaks?` · ${breaks} break${breaks===1?'':'s'}`:''}</p></div><div class="history-actions"><button class="text-btn view-route" data-id="${r.id}">View map</button><button class="text-btn export-one" data-id="${r.id}">CSV</button><button class="text-btn delete-one" data-id="${r.id}">Delete</button></div></div><div class="history-metrics"><div><span>STOPS</span><b>${r.stops.length}</b></div><div><span>PACE</span><b>${p?p.toFixed(1):'—'} /hr</b></div><div><span>ACTIVE TIME</span><b>${formatDuration(ms).slice(0,5)}</b></div></div></article>`}).join('');
  }
  function buildZones(all){const grouped={};all.flatMap(r=>r.stops).filter(s=>s.lat!=null).forEach(s=>{const key=`${Math.round(s.lat/.012)}:${Math.round(s.lng/.012)}`;(grouped[key]??={lat:0,lng:0,count:0,totalSegment:0}).lat+=s.lat;(grouped[key]).lng+=s.lng;grouped[key].count++;grouped[key].totalSegment+=s.segmentMs;});return Object.values(grouped).map((z,i)=>({...z,lat:z.lat/z.count,lng:z.lng/z.count,avgPace:pace(z.totalSegment/z.count)})).sort((a,b)=>b.count-a.count).map((z,i)=>({...z,name:`Zone ${String.fromCharCode(65+i)}`}));}
  function renderZones(all){const zones=buildZones(all),list=$('#zoneList');list.innerHTML=zones.length?zones.slice(0,6).map(z=>`<div class="zone-row"><span class="zone-letter" style="background:${paceColor(z.avgPace)}">${z.name.slice(-1)}</span><div><b>${z.name}</b><small>${z.count} stop${z.count===1?'':'s'} in this area</small></div><div class="zone-score"><strong>${z.avgPace.toFixed(1)}/hr</strong><span>${paceClass(z.avgPace)}</span></div></div>`).join(''):'<div class="empty-state"><p>Complete GPS-tracked stops to build your neighborhood heat map.</p></div>';if(!window.L)return;setTimeout(()=>{if(zoneMap){zoneMap.remove();zoneMap=null;}zoneMap=L.map('zoneMap',{zoomControl:true,attributionControl:true});L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(zoneMap);if(!zones.length){zoneMap.setView(defaultCenter,10);return;}const bounds=[];zones.forEach(z=>{bounds.push([z.lat,z.lng]);L.circle([z.lat,z.lng],{radius:Math.max(350,Math.min(1100,z.count*140)),color:paceColor(z.avgPace),fillColor:paceColor(z.avgPace),fillOpacity:.28,weight:3}).bindTooltip(`${z.name} · ${z.avgPace.toFixed(1)}/hr`).addTo(zoneMap);const icon=L.divIcon({className:'',html:`<span class="zone-bubble" style="width:30px;height:30px;background:${paceColor(z.avgPace)}">${z.name.slice(-1)}</span>`,iconSize:[30,30]});L.marker([z.lat,z.lng],{icon}).addTo(zoneMap);});if(bounds.length>1)zoneMap.fitBounds(bounds,{padding:[25,25]});else zoneMap.setView(bounds[0],14);},60);}
  function showRouteDetail(id){
    const saved=routes().find(r=>r.id===id); if(!saved)return; const ms=activeMs(saved,saved.endedAt||Date.now()), overall=saved.stops.length?pace(ms/saved.stops.length):0;
    $('#detailTitle').textContent=dateLabel(saved.startedAt); $('#detailSubtitle').textContent=`${timeLabel(saved.startedAt)} – ${timeLabel(saved.endedAt||Date.now())}`;
    $('#detailMetrics').innerHTML=`<div class="detail-metric"><span>STOPS</span><b>${saved.stops.length}</b></div><div class="detail-metric"><span>OVERALL PACE</span><b>${overall?overall.toFixed(1):'—'} /hr</b></div><div class="detail-metric"><span>DURATION</span><b>${formatDuration(ms).slice(0,5)}</b></div>`;
    $('#detailStops').innerHTML=(saved.stops.length?`<div class="stop-list">${saved.stops.slice().reverse().map(s=>{const p=pace(s.segmentMs);return `<div class="stop-row"><span class="stop-number">${s.number}</span><div class="stop-info"><b>Stop ${s.number}${s.source==='auto'?' · Auto-detected':''}</b><span>${timeLabel(s.timestamp)} · ${formatDuration(s.segmentMs).slice(3)} segment</span></div><span class="pace-pill ${paceClass(p)}">${p.toFixed(1)}/hr</span></div>`}).join('')}</div>`:'<div class="empty-state"><p>No stops were logged on this route.</p></div>')+((saved.totes||[]).length?`<h3 class="tote-event-title">TOTE CHANGES</h3><div class="stop-list">${saved.totes.slice().reverse().map(t=>`<div class="stop-row tote-row"><span class="stop-number">T${t.number}</span><div class="stop-info"><b>New Tote ${t.number}</b><span>${timeLabel(t.timestamp)} · after stop ${t.afterStop}</span></div></div>`).join('')}</div>`:'');
    $('#routeModal').classList.add('open'); $('#routeModal').setAttribute('aria-hidden','false');
    setTimeout(()=>{ if(historyMap){historyMap.remove();historyMap=null;} historyMap=L.map('historyMap',{zoomControl:true,attributionControl:true}); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(historyMap); const located=saved.stops.filter(s=>s.lat!=null),bounds=[]; located.forEach((s,i)=>{const ll=[s.lat,s.lng],p=pace(s.segmentMs);bounds.push(ll);const icon=L.divIcon({className:'',html:`<span class="numbered-marker" style="background:${paceColor(p)}">${s.number}</span>`,iconSize:[28,28]});L.marker(ll,{icon}).bindTooltip(`Stop ${s.number} · ${p.toFixed(1)}/hr`).addTo(historyMap);const prev=located[i-1];if(prev)L.polyline([[prev.lat,prev.lng],ll],{color:paceColor(p),weight:6,opacity:.92}).addTo(historyMap);});(saved.totes||[]).filter(t=>t.lat!=null).forEach(t=>{bounds.push([t.lat,t.lng]);const icon=L.divIcon({className:'',html:`<div class="tote-marker"><span>T${t.number}</span></div>`,iconSize:[30,30]});L.marker([t.lat,t.lng],{icon,zIndexOffset:500}).bindTooltip(`New Tote ${t.number} · after stop ${t.afterStop}`).addTo(historyMap);});if(bounds.length>1)historyMap.fitBounds(bounds,{padding:[35,35]});else if(bounds.length===1)historyMap.setView(bounds[0],16);else historyMap.setView(defaultCenter,11);},60);
  }
  function closeRouteDetail(){ $('#routeModal').classList.remove('open'); $('#routeModal').setAttribute('aria-hidden','true'); if(historyMap){historyMap.remove();historyMap=null;} }
  function exportCsv(items){
    const rows=[['route_id','route_date','route_started','route_ended','event_type','event_number','stop_source','event_time','segment_seconds','segment_stops_per_hour','latitude','longitude','gps_accuracy_m','after_stop']];
    items.forEach(r=>{r.stops.forEach(s=>rows.push([r.id,new Date(r.startedAt).toLocaleDateString(),new Date(r.startedAt).toISOString(),new Date(r.endedAt).toISOString(),'stop',s.number,s.source||'manual',new Date(s.timestamp).toISOString(),Math.round(s.segmentMs/1000),pace(s.segmentMs).toFixed(2),s.lat??'',s.lng??'',s.accuracy?Math.round(s.accuracy):'','']));(r.totes||[]).forEach(t=>rows.push([r.id,new Date(r.startedAt).toLocaleDateString(),new Date(r.startedAt).toISOString(),new Date(r.endedAt).toISOString(),'new_tote',t.number,'',new Date(t.timestamp).toISOString(),'','',t.lat??'',t.lng??'',t.accuracy?Math.round(t.accuracy):'',t.afterStop]));});
    const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n'), blob=new Blob([csv],{type:'text/csv'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download=`routeheat-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);toast('CSV export ready');
  }

  $('#routeToggle').addEventListener('click',()=>route?askFinish():openGoalSetup()); $('#pauseBtn').addEventListener('click',togglePause); $('#stopBtn').addEventListener('click',()=>logStop('manual')); $('#toteBtn').addEventListener('click',openNewTote); $('#locateBtn').addEventListener('click',()=>{followMap=true;getPosition(true);});
  $('#autoToggle').checked=autoEnabled; updateAutoStatus(); $('#autoToggle').addEventListener('change',e=>{autoEnabled=e.target.checked;localStorage.setItem('routeheat.autoDetect',String(autoEnabled));resetDetector();toast(autoEnabled?'Automatic stop detection on':'Automatic stop detection off');}); $('#undoAuto').addEventListener('click',undoAutoStop);
  $('#cancelGoal').addEventListener('click',()=>$('#goalModal').classList.remove('open')); $('#confirmGoal').addEventListener('click',startRoute);
  $('#cancelFinish').addEventListener('click',()=>$('#confirmModal').classList.remove('open')); $('#confirmFinish').addEventListener('click',finishRoute);
  $('.bottom-nav').addEventListener('click',e=>{const b=e.target.closest('.nav-item');if(!b)return;document.querySelectorAll('.nav-item,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`#${b.dataset.view}`).classList.add('active');if(b.dataset.view==='liveView'&&map)setTimeout(()=>map.invalidateSize(),50);renderHistory();});
  $('#exportAll').addEventListener('click',()=>routes().length?exportCsv(routes()):toast('No routes to export yet'));
  $('#historyList').addEventListener('click',e=>{const view=e.target.closest('.view-route'),ex=e.target.closest('.export-one'),del=e.target.closest('.delete-one');if(view)showRouteDetail(view.dataset.id);if(ex){const r=routes().find(x=>x.id===ex.dataset.id);if(r)exportCsv([r]);}if(del){saveRoutes(routes().filter(x=>x.id!==del.dataset.id));renderHistory();toast('Route deleted');}});
  $('#closeRouteDetail').addEventListener('click',closeRouteDetail); $('#routeModal').addEventListener('click',e=>{if(e.target.id==='routeModal')closeRouteDetail();});
  window.addEventListener('beforeunload',()=>{if(route)localStorage.setItem('routeheat.active',JSON.stringify(route));});
  initMap(); renderLive(); renderHistory(); getPosition(false);
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
