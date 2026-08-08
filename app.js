(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const STORE = 'routeheat.routes.v2';
  let route = null, watchId = null, map = null, userMarker = null, routeLayer = null, timerId = null;
  const defaultCenter = [39.7392, -104.9903];

  function initMap() {
    if (!window.L) { $('#gpsStatus').textContent = 'Map offline'; return; }
    map = L.map('map', { zoomControl:false, attributionControl:true }).setView(defaultCenter, 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom:19, attribution:'© OpenStreetMap' }).addTo(map);
    routeLayer = L.layerGroup().addTo(map);
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

  function getPosition(center=false) {
    if (!navigator.geolocation) { $('#gpsStatus').textContent='GPS unavailable'; return; }
    $('#gpsStatus').textContent='Locating…';
    navigator.geolocation.getCurrentPosition(pos => updatePosition(pos, center), () => { $('#gpsStatus').textContent='Location blocked'; toast('Enable location access for GPS logging'); }, {enableHighAccuracy:true,timeout:10000,maximumAge:5000});
  }
  function updatePosition(pos, center=false) {
    const ll=[pos.coords.latitude,pos.coords.longitude];
    $('#gpsStatus').textContent=`GPS ±${Math.round(pos.coords.accuracy)}m`; $('#gpsDot').classList.add('live');
    if(map){ if(!userMarker) userMarker=L.circleMarker(ll,{radius:8,color:'#fff',weight:3,fillColor:'#22e38d',fillOpacity:1}).addTo(map); else userMarker.setLatLng(ll); if(center) map.setView(ll,16); }
    if(route) route.lastPosition={lat:ll[0],lng:ll[1],accuracy:pos.coords.accuracy};
  }

  function startRoute() {
    const now=Date.now(); route={id:`rh-${now}`,startedAt:now,endedAt:null,stops:[],lastPosition:null};
    $('#routeToggle').classList.add('running'); $('#routeToggle').innerHTML='<span class="play">■</span><span>Finish</span>';
    $('#routeTitle').textContent='Route in progress'; $('#stopBtn').disabled=false; $('#stopButtonHint').textContent='Stop 1 • tap once when parked';
    timerId=setInterval(renderLive,1000); getPosition(true);
    if(navigator.geolocation) watchId=navigator.geolocation.watchPosition(p=>updatePosition(p),()=>{}, {enableHighAccuracy:true,maximumAge:3000});
    renderLive(); toast('Route started — drive safe');
  }
  function askFinish(){ $('#confirmModal').classList.add('open'); $('#confirmModal').setAttribute('aria-hidden','false'); }
  function finishRoute(){
    route.endedAt=Date.now(); const all=routes(); all.unshift(route); saveRoutes(all);
    if(watchId!==null) navigator.geolocation.clearWatch(watchId); clearInterval(timerId); watchId=null; timerId=null;
    route=null; if(routeLayer) routeLayer.clearLayers();
    $('#confirmModal').classList.remove('open'); $('#routeToggle').classList.remove('running'); $('#routeToggle').innerHTML='<span class="play">▶</span><span>Start route</span>';
    $('#routeTitle').textContent='Ready when you are'; $('#stopBtn').disabled=true; $('#stopButtonHint').textContent='Start your route first'; renderLive(); renderHistory(); toast('Route saved to history');
  }
  function logStop(){
    if(!route) return; const now=Date.now(), prev=route.stops.at(-1), segmentMs=now-(prev?.timestamp||route.startedAt), pos=route.lastPosition;
    const stop={number:route.stops.length+1,timestamp:now,segmentMs,lat:pos?.lat??null,lng:pos?.lng??null,accuracy:pos?.accuracy??null}; route.stops.push(stop);
    if(navigator.vibrate) navigator.vibrate(80); drawRoute(); renderLive(); toast(`Stop ${stop.number} complete • ${pace(segmentMs).toFixed(1)}/hr`);
  }
  function drawRoute(){
    if(!routeLayer||!route) return; routeLayer.clearLayers();
    route.stops.forEach((s,i)=>{ if(s.lat===null)return; L.circleMarker([s.lat,s.lng],{radius:7,color:'#07110f',weight:3,fillColor:paceColor(pace(s.segmentMs)),fillOpacity:1}).bindTooltip(`Stop ${s.number}`).addTo(routeLayer); const prev=route.stops[i-1]; if(prev?.lat!=null)L.polyline([[prev.lat,prev.lng],[s.lat,s.lng]],{color:paceColor(pace(s.segmentMs)),weight:5,opacity:.9}).addTo(routeLayer); });
  }
  function renderLive(){
    const count=route?.stops.length||0, elapsed=route?Date.now()-route.startedAt:0, last=route?.stops.at(-1);
    $('#stopCount').textContent=count; $('#routeTime').textContent=`${formatDuration(elapsed)} route time`; $('#overallPace').textContent=route&&count?pace(elapsed/count).toFixed(1):'—';
    $('#segmentPace').textContent=last?pace(last.segmentMs).toFixed(1):'—'; $('#segmentTime').textContent=last?`${formatDuration(last.segmentMs).slice(3)} segment`:'Complete a stop';
    $('#stopBadge').textContent=`${count} logged`; if(route) $('#stopButtonHint').textContent=`Stop ${count+1} • tap once when parked`;
    const box=$('#recentStops'); if(!count){box.className='empty-state';box.innerHTML='<div class="empty-icon">◎</div><p>Your completed stops will appear here.</p>';return;}
    box.className='stop-list'; box.innerHTML=route.stops.slice(-4).reverse().map(s=>{const p=pace(s.segmentMs);return `<div class="stop-row"><span class="stop-number">${s.number}</span><div class="stop-info"><b>Stop ${s.number}</b><span>${timeLabel(s.timestamp)} · ${formatDuration(s.segmentMs).slice(3)} segment</span></div><span class="pace-pill ${paceClass(p)}">${p.toFixed(1)}/hr</span></div>`}).join('');
  }

  function renderHistory(){
    const all=routes(), totalStops=all.reduce((n,r)=>n+r.stops.length,0), totalMs=all.reduce((n,r)=>n+((r.endedAt||Date.now())-r.startedAt),0), avg=totalStops&&totalMs?pace(totalMs/totalStops):0;
    $('#historySummary').innerHTML=`<div class="summary-tile"><span>ROUTES</span><strong>${all.length}</strong></div><div class="summary-tile"><span>STOPS</span><strong>${totalStops}</strong></div><div class="summary-tile"><span>AVG /HR</span><strong>${avg?avg.toFixed(1):'—'}</strong></div>`;
    const list=$('#historyList'); if(!all.length){list.innerHTML='<div class="recent-card empty-state"><div class="empty-icon">▥</div><p>Finished routes will be saved here on this device.</p></div>';return;}
    list.innerHTML=all.map(r=>{const ms=(r.endedAt||Date.now())-r.startedAt,p=r.stops.length?pace(ms/r.stops.length):0;return `<article class="history-card"><div class="history-card-top"><div><h3>${dateLabel(r.startedAt)}</h3><p>${timeLabel(r.startedAt)} – ${timeLabel(r.endedAt||Date.now())}</p></div><div class="history-actions"><button class="text-btn export-one" data-id="${r.id}">CSV</button><button class="text-btn delete-one" data-id="${r.id}">Delete</button></div></div><div class="history-metrics"><div><span>STOPS</span><b>${r.stops.length}</b></div><div><span>PACE</span><b>${p?p.toFixed(1):'—'} /hr</b></div><div><span>DURATION</span><b>${formatDuration(ms).slice(0,5)}</b></div></div></article>`}).join('');
  }
  function exportCsv(items){
    const rows=[['route_id','route_date','route_started','route_ended','stop_number','stop_time','segment_seconds','segment_stops_per_hour','latitude','longitude','gps_accuracy_m']];
    items.forEach(r=>r.stops.forEach(s=>rows.push([r.id,new Date(r.startedAt).toLocaleDateString(),new Date(r.startedAt).toISOString(),new Date(r.endedAt).toISOString(),s.number,new Date(s.timestamp).toISOString(),Math.round(s.segmentMs/1000),pace(s.segmentMs).toFixed(2),s.lat??'',s.lng??'',s.accuracy?Math.round(s.accuracy):''])));
    const csv=rows.map(row=>row.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\r\n'), blob=new Blob([csv],{type:'text/csv'}), a=document.createElement('a'); a.href=URL.createObjectURL(blob);a.download=`routeheat-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);toast('CSV export ready');
  }

  $('#routeToggle').addEventListener('click',()=>route?askFinish():startRoute()); $('#stopBtn').addEventListener('click',logStop); $('#locateBtn').addEventListener('click',()=>getPosition(true));
  $('#cancelFinish').addEventListener('click',()=>$('#confirmModal').classList.remove('open')); $('#confirmFinish').addEventListener('click',finishRoute);
  $('.bottom-nav').addEventListener('click',e=>{const b=e.target.closest('.nav-item');if(!b)return;document.querySelectorAll('.nav-item,.view').forEach(x=>x.classList.remove('active'));b.classList.add('active');$(`#${b.dataset.view}`).classList.add('active');if(b.dataset.view==='liveView'&&map)setTimeout(()=>map.invalidateSize(),50);renderHistory();});
  $('#exportAll').addEventListener('click',()=>routes().length?exportCsv(routes()):toast('No routes to export yet'));
  $('#historyList').addEventListener('click',e=>{const ex=e.target.closest('.export-one'),del=e.target.closest('.delete-one');if(ex){const r=routes().find(x=>x.id===ex.dataset.id);if(r)exportCsv([r]);}if(del){saveRoutes(routes().filter(x=>x.id!==del.dataset.id));renderHistory();toast('Route deleted');}});
  window.addEventListener('beforeunload',()=>{if(route)localStorage.setItem('routeheat.active',JSON.stringify(route));});
  initMap(); renderLive(); renderHistory(); getPosition(false);
  if('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
})();
