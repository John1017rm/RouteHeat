/* Optional clock-time stop projections using the same pace as the finish estimate. */
(function(global){
  'use strict';
  const HOUR=3600000,escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const number=value=>value==null||typeof value==='boolean'||String(value).trim()===''?null:Number.isFinite(Number(value))?Number(value):null;
  const clock=at=>new Date(at).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
  function model(saved,eta,now=Date.now()){
    const at=number(now),startedAt=number(saved?.startedAt);
    if(!saved||at==null||startedAt==null||startedAt>at)return {state:'idle',headline:'STOPS BY 3 PM',value:'—',note:'Start a route to see your outlook.',hours:[]};
    const stops=Array.isArray(saved.stops)?saved.stops:[],completed=stops.length,planned=Math.max(completed,Math.round(number(saved.plannedStops)||0)),basisPace=number(eta?.basisPace),paused=!!saved.pausedAt,ended=number(saved.endedAt),target=new Date(at);target.setHours(15,0,0,0);
    const targetAt=target.getTime(),past=targetAt<=at,actualAt=time=>stops.filter(stop=>{const stamp=number(stop.timestamp);return stamp!=null&&stamp>=startedAt&&stamp<=time;}).length;
    const estimate=time=>Math.min(planned,completed+Math.max(0,Math.floor((time-at)/HOUR*Math.max(0,basisPace||0))));
    const ready=basisPace!=null&&basisPace>0&&!paused&&!ended,limited=completed<3||eta?.confidence==='low',state=ended?'finished':paused?'paused':ready?'active':'learning';
    const value=past?String(actualAt(targetAt)):ended?String(completed):ready?`≈${estimate(targetAt)}`:'—',headline=past?'STOPS AT 3 PM':'STOPS BY 3 PM';
    let note;
    if(ended)note='Route finished · recorded stops shown.';
    else if(paused)note=past?'Recorded at 3 PM · future estimates resume with your route.':'Paused · estimates resume when you do.';
    else if(!ready)note=past?'Recorded at 3 PM · waiting for a usable pace.':'Waiting for a usable pace.';
    else note=`${past?(startedAt>targetAt?'Route began after 3 PM':'Recorded at 3 PM')+' · ':''}${completed?'Finish-estimate pace':Number(eta?.historyCount)>0?'History-based pace':'Goal-based pace'} ${basisPace.toFixed(1)} stops/hr${limited?' · early estimate':''}`;
    const next=new Date(at);next.setMinutes(0,0,0);next.setHours(next.getHours()+1);const hours=[];
    if(!ended)for(let index=0;index<4;index++){const time=next.getTime()+index*HOUR;hours.push({at:time,label:clock(time),count:ready?estimate(time):null,capped:ready&&estimate(time)===planned});}
    return {state,headline,value,note,hours,targetAt,targetCount:past?actualAt(targetAt):ended?completed:ready?estimate(targetAt):null,actual:past||!!ended,completed,planned,basisPace,limited,footnote:ended?'Counts completed stops, including rescue stops.':'Same pace model as your finish estimate; capped at your current plan. Future breaks or changes in pace will move these estimates.'};
  }
  function render(data){return `<span class="drive-projection-title">${escape(data.headline)}</span><b class="drive-projection-value">${escape(data.value)}</b><small class="drive-projection-note">${escape(data.note)}</small>${data.hours.length?`<details class="drive-projection-hours"><summary>Next hours</summary><div>${data.hours.map(hour=>`<span><time>${escape(hour.label)}</time><strong>${hour.count==null?'—':`≈${hour.count}`}</strong></span>`).join('')}</div><p>${escape(data.footnote)}</p></details>`:''}`;}
  function renderInto(element,saved,eta,now=Date.now()){
    const data=model(saved,eta,now);if(!element)return data;const html=render(data);if(element.__routeProjectionHtml!==html){const open=element.querySelector('details')?.open===true;element.innerHTML=html;if(open&&element.querySelector('details'))element.querySelector('details').open=true;element.__routeProjectionHtml=html;}return data;
  }
  global.RouteHeatProjections=Object.freeze({model,render,renderInto});
})(typeof window!=='undefined'?window:globalThis);
