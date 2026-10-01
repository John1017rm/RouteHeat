/* Per-stop delivered counts are separate from the loaded route plan. */
(() => {
  'use strict';
  function count(value) {
    if (typeof value !== 'number' && typeof value !== 'string') return null;
    if (typeof value === 'string' && !/^\d{1,3}$/.test(value.trim())) return null;
    const n=Number(value);
    return Number.isInteger(n)&&n>=1&&n<=999?n:null;
  }
  function summary(saved) {
    const stops=Array.isArray(saved?.stops)?saved.stops:[];
    let delivered=0,countedStops=0;
    for(const stop of stops){const n=count(stop?.packageCount);if(n!==null){delivered+=n;countedStops++;}}
    const loaded=Number.isInteger(saved?.totalPackages)&&saved.totalPackages>=0?saved.totalPackages:null;
    const complete=stops.length>0&&countedStops===stops.length;
    return {delivered:countedStops?delivered:null,countedStops,totalStops:stops.length,unknownStops:stops.length-countedStops,complete,loaded,remaining:complete&&saved?.packageCountComplete===true&&loaded!==null?Math.max(0,loaded-delivered):null,overPlan:loaded!==null&&delivered>loaded};
  }
  function normalizeStop(stop){const n=count(stop.packageCount);if(n===null)delete stop.packageCount;else stop.packageCount=n;return stop;}
  function prepared(saved){
    const value=saved?.preparedStop,phase=(saved?.phases||[]).slice().reverse().find(item=>!item.endedAt)||(saved?.phases||[]).at(-1),packages=count(value?.packageCount),locations=Number(value?.locationCount);
    if(!saved||saved.endedAt||!value||packages===null||!Number.isInteger(locations)||locations<1||locations>20||String(value.routeId)!==String(saved.id)||String(value.phaseId)!==String(phase?.id||'phase-main')||Number(value.amazonStopNumber)!==Number(saved.amazon?.nextStopNumber)||String(value.afterStopId||'')!==String(saved.stops?.at(-1)?.id||''))return null;
    return{version:1,routeId:String(saved.id),phaseId:String(phase?.id||'phase-main'),amazonStopNumber:Number(saved.amazon.nextStopNumber),afterStopId:String(saved.stops?.at(-1)?.id||''),packageCount:packages,locationCount:locations,updatedAt:Math.max(0,Number(value.updatedAt)||0)};
  }
  function prepare(saved,changes={},now=Date.now()){
    if(!saved||saved.endedAt||!saved.id||!Number.isInteger(Number(saved.amazon?.nextStopNumber)))return null;
    const current=prepared(saved),packages=count(changes.packageCount??current?.packageCount??1),locations=Number(changes.locationCount??current?.locationCount??1),phase=(saved.phases||[]).slice().reverse().find(item=>!item.endedAt)||(saved.phases||[]).at(-1);
    if(packages===null||!Number.isInteger(locations)||locations<1||locations>20)return null;
    saved.preparedStop={version:1,routeId:String(saved.id),phaseId:String(phase?.id||'phase-main'),amazonStopNumber:Number(saved.amazon.nextStopNumber),afterStopId:String(saved.stops?.at(-1)?.id||''),packageCount:packages,locationCount:locations,updatedAt:Math.max(0,Number(now)||0)};
    return saved.preparedStop;
  }
  window.RouteHeatPackages=Object.freeze({count,summary,normalizeStop,prepared,prepare});
})();
