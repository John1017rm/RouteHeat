/* Move the existing controls without replacing their elements or event handlers. */
(() => {
  'use strict';
  let initialized=false;
  function setExpanded(open,returnFocus=false){
    const group=document.getElementById('driveRouteControls'),toggle=document.getElementById('driveActionsToggle');
    if(!group||!toggle)return;
    group.dataset.expanded=String(open);toggle.setAttribute('aria-expanded',String(open));
    if(returnFocus)toggle.focus({preventScroll:true});
  }
  function init(){
    if(initialized||!document.addEventListener)return;
    initialized=true;
    document.addEventListener('click',event=>{
      if(event.target.closest?.('#driveActionsToggle')){const group=document.getElementById('driveRouteControls');setExpanded(group?.dataset.expanded!=='true');return;}
      if(event.target.closest?.('#drivePauseBtn')){setExpanded(false,!document.getElementById('driveActionsToggle')?.hidden);return;}
      if(event.target.closest?.('#driveFinishBtn')||!event.target.closest?.('#driveRouteControls'))setExpanded(false);
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.getElementById('driveRouteControls')?.dataset.expanded==='true'){setExpanded(false,true);event.stopPropagation();}});
  }
  function apply(appearance) {
    const byId=id=>document.getElementById(id),view=byId('driveView');
    if(!view)return;
    const a=window.RouteHeatCustomize.normalize(appearance);
    for(const key of ['multiLayout','totePosition','toteStyle','routeControlsPosition','routeControlsStyle','screenMode'])view.dataset[key]=a[key];
    init();
    const toggle=byId('driveActionsToggle'),group=byId('driveRouteControls');
    if(toggle){toggle.hidden=a.routeControlsStyle!=='minimized';toggle.disabled=byId('drivePauseBtn')?.disabled&&byId('driveFinishBtn')?.disabled;toggle.textContent=byId('drivePauseBtn')?.textContent.includes('Resume')?'Paused · Resume / Finish':'Route actions · Pause / Finish';}
    if(a.routeControlsStyle!=='minimized'&&group?.dataset.expanded==='true')setExpanded(false);
    const move=(id,parentId)=>{const node=byId(id),parent=byId(parentId);if(node&&parent&&node.parentElement!==parent)parent.appendChild(node);};
    const multi=byId('autoMultiArm'),status=byId('autoMultiArmStatus');
    const multiParents={dock:'driveMultiDock',corners:'packageDialShell',above:'driveMultiAbove',below:'driveMultiBelow'};
    move('autoMultiArm',multiParents[a.multiLayout]);
    move('autoMultiArmStatus',a.multiLayout==='dock'?'driveMultiDock':'driveMultiDialStatus');
    view.dataset.cornerLocations=String(a.multiLayout==='corners'&&!multi?.hidden);
    move(byId('driveToteTools')?'driveToteTools':'driveToteBtn',({dock:'driveDockActions',above:'driveToteAbove',below:'driveToteBelow'})[a.totePosition]);
    move('driveRouteControls',({dock:'driveActionDock',above:'driveRouteControlsAbove',below:'driveRouteControlsBelow'})[a.routeControlsPosition]);
    for(const id of ['driveMultiDock','driveMultiAbove','driveMultiBelow','driveMultiDialStatus','driveToteAbove','driveToteBelow','driveRouteControlsAbove','driveRouteControlsBelow','driveDockActions']) {
      const slot=byId(id);if(slot)slot.hidden=![...slot.children].some(child=>!child.hidden);
    }
    const dock=byId('driveActionDock');
    if(dock){dock.hidden=![...dock.children].some(child=>!child.hidden);if(dock.hidden)view.style.setProperty('--drive-dock-height','0px');}
    if(multi)multi.setAttribute('aria-describedby',status?.id||'');
  }
  window.RouteHeatDriveControls=Object.freeze({apply});
})();
