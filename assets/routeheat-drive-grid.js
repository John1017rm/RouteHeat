/* Compact readings retain full detail on demand. No timers or stored route data. */
(() => {
  'use strict';
  let initialized=false,returnFocus=null;
  const byId=id=>document.getElementById(id);
  function close(){const modal=byId('driveReadingModal');if(!modal)return;const target=returnFocus;modal.classList.remove('open');modal.setAttribute('aria-hidden','true');document.body.classList.remove('modal-scroll-locked');setTimeout(()=>target?.focus?.({preventScroll:true}),0);}
  function open(card){
    const modal=byId('driveReadingModal'),body=byId('driveReadingContent');if(!modal||!body)return;
    returnFocus=card;const copy=card.cloneNode(true);copy.removeAttribute('id');copy.removeAttribute('role');copy.removeAttribute('tabindex');copy.removeAttribute('aria-haspopup');copy.className='drive-reading-detail';copy.removeAttribute('style');copy.removeAttribute('title');
    copy.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));
    copy.querySelectorAll('details').forEach(node=>node.open=true);
    byId('driveReadingTitle').textContent=window.RouteHeatCustomize.cards.find(item=>item.id===card.dataset.driveCard)?.label||'Drive detail';
    body.replaceChildren(copy);modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.classList.add('modal-scroll-locked');byId('closeDriveReading').focus();
  }
  function apply(appearance){
    const view=byId('driveView');if(!view)return;
    view.querySelectorAll('.drive-stat[data-drive-card]').forEach(card=>{
      const compact=appearance.cardColumns==='three';
      if(compact){card.setAttribute('role','button');card.tabIndex=0;card.title='Open full reading';card.setAttribute('aria-haspopup','dialog');}
      else{card.removeAttribute('role');card.removeAttribute('tabindex');card.removeAttribute('title');card.removeAttribute('aria-haspopup');}
    });
    if(initialized)return;initialized=true;
    view.addEventListener('click',event=>{const card=event.target.closest('.drive-stat[role="button"]');if(card&&!card.hidden)open(card);});
    view.addEventListener('keydown',event=>{const card=event.target.closest('.drive-stat[role="button"]');if(card&&!card.hidden&&(event.key==='Enter'||event.key===' ')){event.preventDefault();open(card);}});
    byId('closeDriveReading')?.addEventListener('click',close);
    byId('driveReadingModal')?.addEventListener('click',event=>{if(event.target===byId('driveReadingModal'))close();});
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&byId('driveReadingModal')?.classList.contains('open')){event.preventDefault();event.stopPropagation();close();}});
  }
  window.RouteHeatDriveGrid=Object.freeze({apply});
})();
