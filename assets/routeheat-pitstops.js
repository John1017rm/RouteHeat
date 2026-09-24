(function (root) {
  'use strict';
  const STORAGE_KEY = 'routeheat.pitStops.v1';
  const MAX_PLACES = 500, MAX_DELETIONS = 2000, NEARBY_METERS = 450;
  const GLOBAL_COOLDOWN = 60 * 60 * 1000, PLACE_COOLDOWN = 24 * GLOBAL_COOLDOWN;
  const TYPES = Object.freeze({gas:'Gas station',store:'Store',park:'Park / public',rest:'Rest area',portable:'Portable',other:'Other'});
  const RATINGS = Object.freeze({great:'Great',okay:'Okay',avoid:'Avoid'});
  const ACCESS = Object.freeze({unknown:'Access not checked',public:'Public access',customer:'Customers only',code:'Code / key needed'});
  const record = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const text = (value, max) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0,max) : '';
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
  const timestamp = (value, now) => numeric(value) !== null && value > 0 ? Math.min(Math.round(value),now) : 0;
  const validId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
  function point(value) {
    if (!record(value)) return null;
    const lat = numeric(value.lat), lng = numeric(value.lng);
    return lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? {lat,lng} : null;
  }
  function normalizePlace(value, now = Date.now()) {
    const position = point(value);
    if (!position || !validId(value.id)) return null;
    const updatedAt = timestamp(value.updatedAt,now), createdAt = timestamp(value.createdAt,now) || updatedAt;
    return {id:value.id, ...position, name:text(value.name,60) || 'Saved bathroom', type:Object.hasOwn(TYPES,value.type)?value.type:'other', rating:Object.hasOwn(RATINGS,value.rating)?value.rating:'okay', favorite:value.favorite === true, access:Object.hasOwn(ACCESS,value.access)?value.access:'unknown', hours:text(value.hours,100), parking:text(value.parking,100), note:text(value.note,240), createdAt, updatedAt, lastVisitedAt:timestamp(value.lastVisitedAt,now)};
  }
  function normalizeState(value, now = Date.now()) {
    const source = record(value) ? value : {}, deletedById = new Map(), placesById = new Map();
    for (const entry of Array.isArray(source.deleted) ? source.deleted.slice(0,10000) : []) {
      if (!record(entry) || !validId(entry.id)) continue;
      const deletedAt = timestamp(entry.deletedAt,now);
      if (deletedAt > (deletedById.get(entry.id)?.deletedAt || 0)) deletedById.set(entry.id,{id:entry.id,deletedAt});
    }
    for (const value of Array.isArray(source.places) ? source.places.slice(0,5000) : []) {
      const place = normalizePlace(value,now);
      if (place && (!deletedById.has(place.id) || deletedById.get(place.id).deletedAt < place.updatedAt) && (!placesById.has(place.id) || placesById.get(place.id).updatedAt < place.updatedAt)) placesById.set(place.id,place);
    }
    const places = [...placesById.values()].sort((a,b)=>b.updatedAt-a.updatedAt || a.id.localeCompare(b.id)).slice(0,MAX_PLACES);
    const placeIds = new Set(places.map(place=>place.id)), alerts = [];
    for (const entry of Array.isArray(source.alerts) ? source.alerts.slice(0,MAX_PLACES) : []) {
      if (!record(entry) || !placeIds.has(entry.id) || alerts.some(item=>item.id===entry.id)) continue;
      const at = timestamp(entry.at,now); if (at) alerts.push({id:entry.id,at});
    }
    return {version:1, places, deleted:[...deletedById.values()].sort((a,b)=>b.deletedAt-a.deletedAt).slice(0,MAX_DELETIONS), alertsEnabled:source.alertsEnabled === true, showOnMap:source.showOnMap !== false, preferencesUpdatedAt:timestamp(source.preferencesUpdatedAt,now), alerts:alerts.sort((a,b)=>b.at-a.at).slice(0,64), lastAlertAt:timestamp(source.lastAlertAt,now)};
  }
  function mergeWithReport(current, incoming, now = Date.now()) {
    const a = normalizeState(current,now), b = normalizeState(incoming,now), preferences = b.preferencesUpdatedAt > a.preferencesUpdatedAt ? b : a;
    const byId = new Map();
    [...a.places,...b.places].forEach(place=>{if(!byId.has(place.id)||byId.get(place.id).updatedAt<place.updatedAt)byId.set(place.id,place);});
    const deletions = new Map();
    [...a.deleted,...b.deleted].forEach(item=>{if(!deletions.has(item.id)||deletions.get(item.id).deletedAt<item.deletedAt)deletions.set(item.id,item);});
    const all = [...byId.values()].filter(place=>!deletions.has(place.id)||deletions.get(place.id).deletedAt<place.updatedAt);
    const state = normalizeState({...preferences,places:all,deleted:[...deletions.values()],alerts:[...a.alerts,...b.alerts].sort((x,y)=>y.at-x.at),lastAlertAt:Math.max(a.lastAlertAt,b.lastAlertAt)},now);
    const oldIds = new Map(a.places.map(place=>[place.id,place])), newIds = new Set(state.places.map(place=>place.id));
    return {state, added:state.places.filter(place=>!oldIds.has(place.id)).length, updated:state.places.filter(place=>oldIds.has(place.id)&&place.updatedAt>oldIds.get(place.id).updatedAt).length, removed:a.places.filter(place=>!newIds.has(place.id)).length, skipped:Math.max(0,all.length-MAX_PLACES)};
  }
  const mergeStates = (current,incoming,now) => mergeWithReport(current,incoming,now).state;
  function distanceMeters(a,b) {
    if (!point(a)||!point(b)) return null;
    const radians = Math.PI/180, x = Math.sin((b.lat-a.lat)*radians/2), y = Math.sin((b.lng-a.lng)*radians/2);
    const h = x*x+Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*y*y;
    return 6371000*2*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
  }
  function freshPosition(value, now = Date.now()) {
    const location = point(value), accuracy = numeric(value?.accuracy), at = numeric(value?.timestamp);
    return location && accuracy !== null && accuracy >= 0 && accuracy <= 60 && at !== null && at <= now+5000 && now-at <= 60000 ? {...location,accuracy,timestamp:at} : null;
  }
  function nearestPlaces(state, location, {favoritesOnly=false,query=''}={}) {
    const normalizedQuery = text(query,80).toLocaleLowerCase();
    return state.places.filter(place=>(!favoritesOnly||place.favorite)&&(!normalizedQuery||`${place.name} ${TYPES[place.type]} ${RATINGS[place.rating]} ${ACCESS[place.access]} ${place.hours} ${place.parking} ${place.note}`.toLocaleLowerCase().includes(normalizedQuery))).map(place=>({...place,distance:distanceMeters(location,place)})).sort((a,b)=>(a.distance??Infinity)-(b.distance??Infinity)||Number(b.favorite)-Number(a.favorite)||a.name.localeCompare(b.name));
  }
  function nearbyCandidate(state, fix, {now=Date.now(),activeRoute=false,hidden=false}={}) {
    if (!activeRoute || hidden || !state.alertsEnabled || !freshPosition(fix,now) || state.lastAlertAt && now-state.lastAlertAt < GLOBAL_COOLDOWN) return null;
    const alerted = new Map(state.alerts.map(entry=>[entry.id,entry.at]));
    return nearestPlaces(state,fix).find(place=>place.rating!=='avoid'&&(place.favorite||place.rating==='great')&&place.distance<=NEARBY_METERS&&(!alerted.has(place.id)||now-alerted.get(place.id)>=PLACE_COOLDOWN)) || null;
  }
  function markAlert(state, id, now=Date.now()) {
    return normalizeState({...state,lastAlertAt:now,alerts:[{id,at:now},...state.alerts.filter(item=>item.id!==id)]},now);
  }
  const icon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8a2 2 0 0 1 2 2v16H6V5a2 2 0 0 1 2-2Z"/><path d="M10 21v-7h4v7M10 7h4M12 5v4"/></svg>';
  const markup = `<section class="modal pit-stops-modal" id="pitStopsModal" role="dialog" aria-modal="true" aria-labelledby="pitStopsTitle" aria-hidden="true">
    <div class="pit-sheet"><header class="pit-header"><span class="pit-emblem">${icon}</span><div><p class="eyebrow">YOUR PLACES · PRIVATE</p><h2 id="pitStopsTitle">Bathrooms</h2><p>Find, save, and rate your reliable places.</p></div><button type="button" class="pit-close" data-pit-action="close" aria-label="Close Bathrooms">×</button></header>
    <div class="pit-body"><section id="pitBrowse"><p class="pit-intro">Your private bathroom map. Add places you know, then find them here or on your route maps.</p><div class="pit-toolbar"><button class="pit-primary" type="button" data-pit-action="save-here">${icon}<span>Save bathroom here</span></button><button class="pit-secondary" type="button" data-pit-action="pick-map">Choose on map</button></div>
    <div class="pit-list-heading"><div><span class="eyebrow">YOUR BATHROOMS</span><h3 id="pitListTitle">Saved places</h3></div><button type="button" class="pit-filter" id="pitFavorites" aria-pressed="false" data-pit-action="favorites">☆ Favorites</button></div>
    <label class="pit-search"><span class="sr-only">Search saved bathrooms</span><input id="pitSearch" type="search" placeholder="Search places, access, or notes" maxlength="80" autocomplete="off"></label><p class="pit-location-status" id="pitLocationStatus" role="status"></p>
    <div class="pit-view-switch" role="group" aria-label="Bathroom view"><button type="button" data-pit-view="map" aria-pressed="true" aria-controls="pitMapPanel">Map</button><button type="button" data-pit-view="list" aria-pressed="false" aria-controls="pitListPanel">List</button></div>
    <section id="pitMapPanel" aria-label="Bathroom map"><div class="pit-map-tools"><span id="pitMapCount" role="status"></span><button type="button" data-pit-action="nearby-map">Near me</button><button type="button" data-pit-action="fit-map">Fit saved</button></div><div class="pit-map-wrap"><div id="pitStopsMap" role="region" aria-label="Your saved bathrooms map"></div><div class="pit-map-prompt" id="pitMapPrompt" hidden><span>Tap the bathroom’s location on the map.</span><button type="button" data-pit-action="cancel-pick">Cancel</button></div></div><div class="pit-map-legend" aria-label="Bathroom ratings"><span class="quality-great">Great</span><span class="quality-okay">Okay</span><span class="quality-avoid">Avoid</span><span>★ Favorite</span></div><p class="pit-map-empty" id="pitMapEmpty" role="status" hidden></p>
    <p class="pit-map-status" id="pitMapStatus">Only bathrooms you save appear here. Street tiles need a connection; your places remain available offline.</p></section>
    <section id="pitListPanel" aria-label="Saved bathroom list" hidden><div id="pitStopsList" class="pit-list"></div></section>
    <details class="pit-settings"><summary>Map & nearby reminders</summary><label><span><b>Show on route maps</b><small>Keep your saved bathrooms visible on the map.</small></span><input id="pitMapEnabled" type="checkbox" role="switch"></label><label><span><b>Quiet nearby reminders</b><small>During a route, a favorite or Great bathroom within about 450 m can appear once a day. At least an hour between reminders.</small></span><input id="pitAlertsEnabled" type="checkbox" role="switch"></label><p>Uses RouteHeat’s existing GPS. No additional location tracking.</p></details></section>
    <form id="pitEditor" class="pit-editor" hidden><div class="pit-editor-heading"><button class="pit-secondary" type="button" data-pit-action="back">‹ Your places</button><span id="pitEditorMode">NEW BATHROOM</span></div><h3 id="pitEditorTitle">Save a reliable place</h3><p id="pitEditorPosition"></p><label>Name<input id="pitName" type="text" maxlength="60" required placeholder="e.g. Oak Street gas station" autocomplete="off"></label><div class="pit-fields"><label>Type<select id="pitType">${Object.entries(TYPES).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label hidden>Quality<select id="pitRating">${Object.entries(RATINGS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label></div><fieldset class="pit-rating-picker"><legend>How was the bathroom?</legend><p>Your own rating, based on your visit.</p><div role="group" aria-label="Bathroom quality">${Object.entries(RATINGS).map(([value,label])=>`<button type="button" data-pit-rating="${value}" aria-pressed="false"><b>${label}</b><small>${value==='great'?'Clean & reliable':value==='okay'?'Usable':'Would skip it'}</small></button>`).join('')}</div></fieldset><label class="pit-check"><input id="pitFavorite" type="checkbox"><span>☆ Keep as a favorite</span></label><details class="pit-extra"><summary>Access, hours & notes <span>Optional</span></summary><label>Access<select id="pitAccess">${Object.entries(ACCESS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('')}</select></label><label>Hours you know<input id="pitHours" type="text" maxlength="100" placeholder="e.g. 6 AM–10 PM; Sunday hours differ"></label><label>Parking<input id="pitParking" type="text" maxlength="100" placeholder="e.g. Van parking behind the store"></label><label>Notes<textarea id="pitNote" rows="3" maxlength="240" placeholder="Anything useful for your next visit"></textarea></label></details><p class="pit-visited" id="pitVisited"></p><div class="pit-editor-actions"><button type="button" class="pit-secondary" data-pit-action="visited" id="pitMarkVisited">Visited today</button><button type="submit" class="pit-primary">Save bathroom</button></div><div class="pit-delete-row" id="pitDeleteRow"><button type="button" class="pit-delete" data-pit-action="delete" id="pitDelete">Delete saved place</button><span id="pitDeleteHint" role="status"></span></div></form>
    <footer class="pit-footer">Only places you save · Included in your RouteHeat device backup<br>Hours and access are your notes, not live availability.</footer></div></div></section>
    <aside id="pitStopsNearby" class="pit-nearby" hidden aria-live="polite"><span class="pit-emblem">${icon}</span><button type="button" id="pitNearbyOpen"><small>A GOOD PLACE NEARBY</small><b id="pitNearbyName"></b><span id="pitNearbyDistance"></span></button><button type="button" class="pit-close" id="pitNearbyDismiss" aria-label="Dismiss nearby bathroom reminder">×</button></aside>`;
  let singleton = null;
  function init(host = {}) {
    if (singleton) return singleton;
    const doc = root.document;
    if (!doc?.body) return null;
    const storage = host.storage || root.localStorage, now = () => host.now ? host.now() : Date.now();
    const read = () => {try{return normalizeState(JSON.parse(storage.getItem(STORAGE_KEY)||'null'),now());}catch{return normalizeState(null,now());}};
    let state = read(), lastFix = null, ownMap = null, userMarker = null, ownLayer = null, ownLayerRevision = -1, picking = false, draft = null, returnFocus = null, favoritesOnly = false, deleteArmedUntil = 0, nearbyId = null, nearbyTimer = null, revision = 0, renderLocationAt = 0, mapTimer = null, browseView = 'map', ownFilterKey = '';
    const layers = new Map();
    doc.body.insertAdjacentHTML('beforeend',markup);
    const $ = selector => doc.querySelector(selector), modal = $('#pitStopsModal');
    const notify = message => {if(host.notify)host.notify(message);else $('#pitMapStatus').textContent=message;};
    const getFix = () => freshPosition(lastFix,now()) || freshPosition(host.getPosition?.(),now());
    const formatDistance = meters => host.formatDistance ? host.formatDistance(meters) : meters<1000?`${Math.round(meters)} m`:`${(meters/1000).toFixed(1)} km`;
    const date = at => at ? new Date(at).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'Not recorded';
    function persist(next) {
      const normalized = normalizeState(next,now()), raw = JSON.stringify(normalized);
      try {storage.setItem(STORAGE_KEY,raw);} catch {notify('Could not save this change. Free device storage, then try again.');return false;}
      state = normalized; revision++;host.onChange?.({raw,state});refreshMaps();renderList();renderPreferences();return true;
    }
    function popup(place) {
      return `<div class="pit-popup"><strong>${escapeHtml(place.name)}</strong><span>${place.favorite?'★ Favorite · ':''}${escapeHtml(RATINGS[place.rating])} · ${escapeHtml(TYPES[place.type])}</span><small>${escapeHtml(ACCESS[place.access])}${place.hours?`<br>${escapeHtml(place.hours)}`:''}<br>Last visited: ${escapeHtml(date(place.lastVisitedAt))}</small><button type="button" data-pit-edit="${escapeHtml(place.id)}">View / rate bathroom</button></div>`;
    }
    const filteredPlaces = () => nearestPlaces(state,getFix(),{favoritesOnly,query:$('#pitSearch').value});
    function fillLayer(layer, places = state.places) {
      layer.clearLayers();
      places.forEach(place=>{const symbol=place.favorite?'★':'WC';root.L.marker([place.lat,place.lng],{icon:root.L.divIcon({className:`pit-map-marker quality-${place.rating}${place.favorite?' is-favorite':''}`,html:`<span>${symbol}</span>`,iconSize:[34,34],iconAnchor:[17,32]}),title:place.name,keyboard:true}).bindPopup(popup(place),{className:'pit-map-popup',maxWidth:280}).addTo(layer);});
    }
    function refreshMaps() {
      if (!root.L) return;
      const maps = new Set((host.getMaps?.() || []).filter(Boolean));
      for (const [map,entry] of layers) if (!maps.has(map)||!state.showOnMap) {try{map.removeLayer(entry.layer);}catch{}layers.delete(map);}
      if(state.showOnMap)for(const map of maps){let entry=layers.get(map);try{if(!entry){entry={layer:root.L.layerGroup().addTo(map),revision:-1};layers.set(map,entry);}if(entry.revision!==revision){fillLayer(entry.layer);entry.revision=revision;}}catch{layers.delete(map);}}
      renderOwnPins();
    }
    function renderOwnPins() {
      if(!ownLayer)return;const places=filteredPlaces(),key=revision+':'+places.map(place=>place.id).sort().join(',');
      if(key!==ownFilterKey){fillLayer(ownLayer,places);ownFilterKey=key;ownLayerRevision=revision;}
    }
    function renderPreferences() {$('#pitMapEnabled').checked=state.showOnMap;$('#pitAlertsEnabled').checked=state.alertsEnabled;}
    function renderList() {
      const fix = getFix(), places = filteredPlaces();
      $('#pitListTitle').textContent=`${state.places.length} saved ${state.places.length===1?'place':'places'}`;
      $('#pitLocationStatus').textContent=fix?'Nearest first · straight-line distance':'Nearby distances need a fresh GPS fix. Your saved bathrooms are still available.';
      $('#pitMapCount').textContent=`${places.length} ${places.length===1?'bathroom':'bathrooms'}${places.length!==state.places.length?' matching':''}`;
      $('#pitMapEmpty').hidden=places.length>0;$('#pitMapEmpty').textContent=state.places.length?'No bathrooms match these filters. Clear the search or show all places.':'Your bathroom map starts here. Save a place at your current location, or choose its spot on the map.';
      renderOwnPins();
      $('#pitStopsList').innerHTML=places.length?places.map(place=>`<article class="pit-place quality-${place.rating}"><button class="pit-place-main" type="button" data-pit-edit="${escapeHtml(place.id)}"><span class="pit-place-symbol" aria-hidden="true">${place.favorite?'★':'WC'}</span><span class="pit-place-copy"><strong>${escapeHtml(place.name)}</strong><span>${escapeHtml(TYPES[place.type])} · <b>${escapeHtml(RATINGS[place.rating])}</b>${place.favorite?' · Favorite':''}</span><small>${escapeHtml(ACCESS[place.access])} · Visited ${escapeHtml(date(place.lastVisitedAt))}</small></span><span class="pit-place-distance">${place.distance===null?'View':escapeHtml(formatDistance(place.distance))}<i>›</i></span></button><div class="pit-place-actions"><button type="button" data-pit-focus="${escapeHtml(place.id)}">Show on map</button><a href="https://www.google.com/maps/dir/?api=1&amp;destination=${place.lat},${place.lng}" target="_blank" rel="noopener noreferrer" aria-label="Open directions to ${escapeHtml(place.name)}">Directions ↗</a></div></article>`).join(''):`<div class="pit-empty"><span>${icon}</span><b>${state.places.length?'No matching bathrooms':'Your bathroom list starts here'}</b><p>${state.places.length?'Try a different search or show all places.':'Save a bathroom here, or choose a place on the map. Add a favorite to find it quickly next time.'}</p></div>`;
    }
    function setBrowseView(view) {
      browseView=view==='list'?'list':'map';$('#pitMapPanel').hidden=browseView!=='map';$('#pitListPanel').hidden=browseView!=='list';
      modal.querySelectorAll('[data-pit-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pitView===browseView)));
      if(browseView==='list')setPicking(false);else{initMap();setTimeout(()=>{if(modal.classList.contains('open')&&browseView==='map')ownMap?.invalidateSize({pan:false});},0);}
    }
    function fitSaved() {const places=filteredPlaces();if(!places.length){notify('Save a bathroom or clear your filters to see saved places.');return;}setBrowseView('map');if(!ownMap){notify('Map unavailable. Switch to List to see your saved bathrooms.');return;}ownMap.fitBounds(places.map(place=>[place.lat,place.lng]),{padding:[28,28],maxZoom:16});}
    function focusPlace(id) {const place=state.places.find(item=>item.id===id);if(!place)return;setBrowseView('map');if(!ownMap){notify('Map unavailable. Your saved bathroom is still in List.');return;}ownMap.setView([place.lat,place.lng],17);$('#pitStopsMap').scrollIntoView({block:'nearest',behavior:'smooth'});ownLayer?.eachLayer(marker=>{const at=marker.getLatLng();if(at.lat===place.lat&&at.lng===place.lng)marker.openPopup();});}
    function renderRating() {modal.querySelectorAll('[data-pit-rating]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.pitRating===$('#pitRating').value)));}
    function setPicking(enabled) {picking=enabled;$('#pitMapPrompt').hidden=!enabled;$('#pitStopsMap').classList.toggle('is-picking',enabled);}
    function initMap() {
      if(!modal.classList.contains('open')||browseView!=='map'||!$('#pitEditor').hidden||ownMap)return;
      if(!root.L){$('#pitMapStatus').textContent='Map unavailable. Switch to List for saved bathrooms and directions.';return;}
      try {
        const fix=getFix(), center=fix||state.places[0]||{lat:39.5,lng:-98.35};
        ownMap=root.L.map('pitStopsMap',{zoomControl:true,attributionControl:true,preferCanvas:true}).setView([center.lat,center.lng],fix?14:state.places.length?12:4);
        if(host.addTiles)host.addTiles(ownMap);else $('#pitMapStatus').textContent='Street background unavailable. Saved pins remain visible.';
        ownLayer=root.L.layerGroup().addTo(ownMap);ownLayerRevision=-1;ownFilterKey='';refreshMaps();
        if(!fix&&state.places.length>1)ownMap.fitBounds(state.places.map(place=>[place.lat,place.lng]),{padding:[26,26],maxZoom:15});
        ownMap.on('click',event=>{if(picking){setPicking(false);beginDraft({lat:event.latlng.lat,lng:event.latlng.lng},false);}});
        updateOwnLocation(fix);ownMap.invalidateSize({pan:false});
      }catch{ownMap?.remove();ownMap=null;ownLayer=null;$('#pitMapStatus').textContent='Map could not open. Switch to List for saved bathrooms.';}
    }
    function updateOwnLocation(fix) {if(!ownMap)return;if(!fix){if(userMarker)ownMap.removeLayer(userMarker);userMarker=null;return;}if(userMarker)userMarker.setLatLng([fix.lat,fix.lng]);else userMarker=root.L.circleMarker([fix.lat,fix.lng],{radius:6,color:'#ffffff',weight:2,fillColor:'#448dff',fillOpacity:1}).bindTooltip('Your latest location').addTo(ownMap);}
    function open(opener) {
      if(!modal.classList.contains('open'))returnFocus=opener?.nodeType?opener:doc.activeElement;
      state=read();revision++;$('#pitBrowse').hidden=false;$('#pitEditor').hidden=true;draft=null;renderList();renderPreferences();modal.classList.add('open');modal.setAttribute('aria-hidden','false');setPicking(false);hideNearby();setBrowseView('map');if(!getFix())host.requestPosition?.();
      clearTimeout(mapTimer);mapTimer=setTimeout(()=>{initMap();ownMap?.invalidateSize({pan:false});modal.querySelector('[data-pit-action="close"]').focus();},40);
    }
    function close() {
      clearTimeout(mapTimer);setPicking(false);modal.classList.remove('open');modal.setAttribute('aria-hidden','true');ownMap?.remove();ownMap=null;ownLayer=null;ownLayerRevision=-1;ownFilterKey='';userMarker=null;draft=null;
      const focus=returnFocus;returnFocus=null;if(focus?.isConnected)setTimeout(()=>focus.focus(),0);
    }
    function showBrowse() {draft=null;deleteArmedUntil=0;$('#pitEditor').hidden=true;$('#pitBrowse').hidden=false;setPicking(false);renderList();setBrowseView(browseView);setTimeout(()=>{initMap();ownMap?.invalidateSize({pan:false});modal.querySelector(`[data-pit-view="${browseView}"]`)?.focus();},0);}
    function beginDraft(location, visitedHere=false, saved=null) {
      if(!saved&&state.places.length>=MAX_PLACES){notify(`You have ${MAX_PLACES} saved places. Remove a place before adding another.`);return;}
      setPicking(false);const at=now();draft=saved?{...saved}:{...location,id:`pit-${root.crypto?.randomUUID?.()||`${at}-${Math.random().toString(36).slice(2,12)}`}`,name:'',type:'gas',rating:'okay',favorite:false,access:'unknown',hours:'',parking:'',note:'',createdAt:at,updatedAt:at,lastVisitedAt:visitedHere?at:0};
      $('#pitBrowse').hidden=true;$('#pitEditor').hidden=false;$('#pitEditorMode').textContent=saved?'SAVED BATHROOM':'NEW BATHROOM';$('#pitEditorTitle').textContent=saved?'Make the next visit easier':'Save a reliable place';$('#pitEditorPosition').textContent=`${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)} · ${visitedHere?'Current GPS location':'Saved map location'}`;
      for(const [id,key] of [['pitName','name'],['pitType','type'],['pitRating','rating'],['pitAccess','access'],['pitHours','hours'],['pitParking','parking'],['pitNote','note']])$('#'+id).value=draft[key];
      renderRating();$('#pitFavorite').checked=draft.favorite;$('#pitVisited').textContent=`Last visited: ${date(draft.lastVisitedAt)}`;$('#pitDeleteRow').hidden=!saved;$('#pitDeleteHint').textContent='';$('#pitDelete').textContent='Delete saved place';deleteArmedUntil=0;$('#pitEditor .pit-extra').open=false;setTimeout(()=>$('#pitName').focus(),0);
    }
    function edit(id,opener) {const saved=state.places.find(place=>place.id===id);if(!saved)return;if(!modal.classList.contains('open')){open(opener);clearTimeout(mapTimer);}beginDraft(saved,false,saved);}
    function save(event) {
      event.preventDefault();if(!draft)return;
      const name=text($('#pitName').value,60);if(!name){$('#pitName').focus();notify('Add a name to find this place again.');return;}
      const saved=normalizePlace({...draft,name,type:$('#pitType').value,rating:$('#pitRating').value,favorite:$('#pitFavorite').checked,access:$('#pitAccess').value,hours:$('#pitHours').value,parking:$('#pitParking').value,note:$('#pitNote').value,updatedAt:now()},now());
      if(persist({...state,places:[saved,...state.places.filter(place=>place.id!==saved.id)]})){showBrowse();if(browseView==='map')focusPlace(saved.id);notify('Bathroom saved · find it in Map or List');}
    }
    function hideNearby() {clearTimeout(nearbyTimer);$('#pitStopsNearby').hidden=true;nearbyId=null;}
    function updatePosition(value,{activeRoute=false}={}) {
      const fix=freshPosition(value,now());if(fix)lastFix=fix;refreshMaps();
      if(modal.classList.contains('open')&&now()-renderLocationAt>5000){renderLocationAt=now();renderList();updateOwnLocation(fix);}
      if(!activeRoute){hideNearby();return;}
      const candidate=nearbyCandidate(state,value,{activeRoute,now:now(),hidden:doc.hidden||!!doc.querySelector('.modal.open')});
      if(!candidate)return;
      if(!persist(markAlert(state,candidate.id,now())))return;
      nearbyId=candidate.id;$('#pitNearbyName').textContent=candidate.name;$('#pitNearbyDistance').textContent=`${formatDistance(candidate.distance)} away · ${candidate.favorite?'Favorite':RATINGS[candidate.rating]}`;$('#pitStopsNearby').hidden=false;clearTimeout(nearbyTimer);nearbyTimer=setTimeout(hideNearby,20000);
    }
    function refresh() {state=read();revision++;renderList();renderPreferences();refreshMaps();if(!state.alertsEnabled)hideNearby();}
    modal.addEventListener('click',event=>{
      if(event.target===modal){close();return;}
      const view=event.target.closest('[data-pit-view]');if(view){setBrowseView(view.dataset.pitView);return;}
      const rating=event.target.closest('[data-pit-rating]');if(rating&&Object.hasOwn(RATINGS,rating.dataset.pitRating)){$('#pitRating').value=rating.dataset.pitRating;renderRating();return;}
      const button=event.target.closest('[data-pit-action]');if(!button)return;
      switch(button.dataset.pitAction){
        case 'close':close();break;
        case 'save-here':{const fix=getFix();if(fix)beginDraft(fix,true);else{host.requestPosition?.();notify('Getting your current location. Try Save here again, or choose on the map.');}break;}
        case 'pick-map':setBrowseView('map');if(!ownMap)notify('The map is unavailable. Save here when GPS is ready.');else{setPicking(true);$('#pitStopsMap').scrollIntoView({block:'nearest',behavior:'smooth'});}break;
        case 'nearby-map':{const fix=getFix();if(!fix){host.requestPosition?.();notify('Getting your current location. Try Near me again when GPS is ready.');break;}setBrowseView('map');if(ownMap){updateOwnLocation(fix);ownMap.setView([fix.lat,fix.lng],14);}break;}
        case 'fit-map':fitSaved();break;
        case 'cancel-pick':setPicking(false);break;
        case 'back':showBrowse();break;
        case 'favorites':favoritesOnly=!favoritesOnly;$('#pitFavorites').setAttribute('aria-pressed',String(favoritesOnly));$('#pitFavorites').textContent=favoritesOnly?'★ Favorites':'☆ Favorites';renderList();break;
        case 'visited':if(draft){draft.lastVisitedAt=now();$('#pitVisited').textContent=`Last visited: ${date(draft.lastVisitedAt)} · save to keep this update`;}break;
        case 'delete':if(draft){if(deleteArmedUntil<now()){deleteArmedUntil=now()+10000;$('#pitDelete').textContent='Confirm delete';$('#pitDeleteHint').textContent='Tap again to remove this place.';}else{const id=draft.id;if(persist({...state,places:state.places.filter(place=>place.id!==id),deleted:[{id,deletedAt:now()},...state.deleted.filter(entry=>entry.id!==id)]})){showBrowse();notify('Saved bathroom removed');}}}break;
      }
    });
    doc.addEventListener('click',event=>{const opener=event.target.closest('[data-open-pit-stops]');if(opener){event.preventDefault();open(opener);return;}const editButton=event.target.closest('[data-pit-edit]');if(editButton){event.preventDefault();edit(editButton.dataset.pitEdit,editButton);return;}const focusButton=event.target.closest('[data-pit-focus]');if(focusButton){event.preventDefault();focusPlace(focusButton.dataset.pitFocus);}});
    doc.addEventListener('keydown',event=>{if(event.key!=='Escape'||!modal.classList.contains('open'))return;const top=[...doc.querySelectorAll('.modal.open')].sort((a,b)=>(parseInt(root.getComputedStyle(a).zIndex)||0)-(parseInt(root.getComputedStyle(b).zIndex)||0)).at(-1);if(top!==modal)return;event.preventDefault();event.stopImmediatePropagation();if(picking)setPicking(false);else if(!$('#pitEditor').hidden)showBrowse();else close();});
    $('#pitEditor').addEventListener('submit',save);$('#pitSearch').addEventListener('input',renderList);$('#pitRating').addEventListener('change',renderRating);
    for(const [id,key] of [['pitMapEnabled','showOnMap'],['pitAlertsEnabled','alertsEnabled']])$('#'+id).addEventListener('change',()=>{persist({...state,[key]:$('#'+id).checked,preferencesUpdatedAt:now()});if(!state.alertsEnabled)hideNearby();});
    $('#pitNearbyOpen').addEventListener('click',()=>{const id=nearbyId;hideNearby();if(id)edit(id,$('[data-open-pit-stops]'));});$('#pitNearbyDismiss').addEventListener('click',hideNearby);
    root.addEventListener('storage',event=>{if(event.key===STORAGE_KEY)refresh();});root.addEventListener('routeheat:backup-imported',refresh);root.addEventListener('routeheat:maps-changed',refreshMaps);doc.addEventListener('visibilitychange',()=>{if(doc.hidden)hideNearby();});
    renderPreferences();renderList();
    singleton={open,close,refresh,refreshMaps,updatePosition,getState:()=>normalizeState(state,now())};return singleton;
  }
  root.RouteHeatPitStops=Object.freeze({STORAGE_KEY,MAX_PLACES,MAX_DELETIONS,NEARBY_METERS,GLOBAL_COOLDOWN,PLACE_COOLDOWN,TYPES,RATINGS,ACCESS,normalizePlace,normalizeState,mergeStates,mergeWithReport,distanceMeters,freshPosition,nearestPlaces,nearbyCandidate,markAlert,escapeHtml,init});
})(typeof window!=='undefined'?window:globalThis);
