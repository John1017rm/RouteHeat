/* On-route space without removing access to navigation, Layout, or save warnings. */
(() => {
  'use strict';
  let initialized=false,expanded=false,context='',wasSteady=false,frame=0,lastAppearance={},lastRoute={},lastHeight=0;
  const byId=id=>document.getElementById(id);
  function measure(){
    frame=0;
    const compact=document.body.classList.contains('drive-bars-minimized'),header=byId(compact?'driveCompactBar':'routeHeatHeader'),height=header?.getBoundingClientRect().height;
    if(Number.isFinite(height)&&height>0&&Math.ceil(height)!==lastHeight){lastHeight=Math.ceil(height);document.body.style.setProperty('--drive-top-height',`${lastHeight}px`);}
  }
  function scheduleMeasure(){if(!frame)frame=requestAnimationFrame(measure);}
  function status(){
    const cloud=byId('cloudText')?.textContent||'Cloud off',gps=byId('gpsStatus')?.textContent||'GPS unavailable';
    for(const [id,text] of [['driveCompactCloud',cloud],['driveCompactGps',gps]]){const item=byId(id);if(item&&item.textContent!==text)item.textContent=text;}
    const button=byId('driveCompactStatus');if(button){button.setAttribute('aria-label',`${cloud}. ${gps}. Open cloud backup`);button.dataset.warning=String(/error|fail|blocked|weak|unavailable|reconnect/i.test(`${cloud} ${gps}`));}
  }
  function setExpanded(value){
    expanded=value;sync(lastAppearance,lastRoute);
    byId(value?'driveMinimizeBtn':'driveMenuBtn')?.focus({preventScroll:true});
  }
  function init(){
    if(initialized)return;initialized=true;
    byId('driveMenuBtn')?.addEventListener('click',()=>setExpanded(true));
    byId('driveMinimizeBtn')?.addEventListener('click',()=>setExpanded(false));
    byId('driveCompactStatus')?.addEventListener('click',()=>{setExpanded(true);byId('cloudBtn')?.click();});
    document.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&document.body.classList.contains('drive-bars-minimized')&&!document.querySelector('.modal.open')){setExpanded(true);event.preventDefault();}
    });
    const update=()=>sync(lastAppearance,lastRoute);
    window.addEventListener('resize',update);window.visualViewport?.addEventListener('resize',update);
    if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(scheduleMeasure);for(const id of ['routeHeatHeader','driveCompactBar']){const item=byId(id);if(item)observer.observe(item);}}
    if(typeof MutationObserver==='function'){const observer=new MutationObserver(status);for(const id of ['cloudText','gpsStatus']){const item=byId(id);if(item)observer.observe(item,{childList:true,characterData:true,subtree:true});}}
  }
  function sync(appearance={},routeState={}){
    init();lastAppearance=appearance;lastRoute=routeState;
    const onDrive=byId('driveView')?.classList.contains('active')===true;
    const eligible=onDrive&&!!routeState.routeId&&!routeState.paused&&appearance.routeBars==='minimize';
    const nextContext=eligible?String(routeState.routeId):'';
    if(context!==nextContext){context=nextContext;expanded=false;}
    const minimized=eligible&&!expanded;
    document.body.classList.toggle('drive-bars-available',eligible);
    document.body.classList.toggle('drive-bars-minimized',minimized);
    const compact=byId('driveCompactBar'),hide=byId('driveMinimizeBtn');if(compact)compact.hidden=!minimized;if(hide)hide.hidden=!eligible||minimized;
    byId('driveMenuBtn')?.setAttribute('aria-expanded',String(!minimized));
    const steady=onDrive&&appearance.screenMode==='steady'&&window.matchMedia('(min-height:700px) and (min-width:350px)').matches;
    if(steady&&!wasSteady){window.scrollTo({top:0,left:0,behavior:'instant'});requestAnimationFrame(()=>{if(wasSteady)window.scrollTo({top:0,left:0,behavior:'instant'});});}
    wasSteady=steady;status();scheduleMeasure();
  }
  window.RouteHeatDriveViewport=Object.freeze({sync});
})();
