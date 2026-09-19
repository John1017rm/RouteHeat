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
  window.RouteHeatPackages=Object.freeze({count,summary,normalizeStop});
})();
