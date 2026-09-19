/* RouteHeat Drive appearance: bounded preferences, no route data or dependencies. */
(() => {
  'use strict';
  const cards = Object.freeze([
    {id:'stops',label:'Stops & locations',description:'Completed stops and delivery locations.'},
    {id:'time',label:'Active time',description:'Working route time, excluding saved pauses.'},
    {id:'last',label:'Last-stop pace',description:'The delivery pace of your most recent interval.'},
    {id:'finish',label:'Finish estimate',description:'Your predicted finish window and confidence.'},
    {id:'projections',label:'Stops by 3 PM & hourly outlook',description:'Estimated completed stops at 3 PM and the next four hours.'},
    {id:'remaining',label:'Stops remaining',description:'Stops left in your current route plan.'},
    {id:'goal',label:'Pace vs goal',description:'Your route pace compared with your selected goal.'},
    {id:'packages',label:'Package totals',description:'Counted delivered packages and the entered route plan.'},
    {id:'packageCounter',label:'Package buttons',description:'One-tap stop completion when package counting is on.'},
    {id:'distance',label:'Route distance',description:'Distance from your recorded GPS trail.'},
    {id:'ghost',label:'Ghost comparison',description:'Your progress against the selected Ghost Run.'},
    {id:'moment',label:'Route facts',description:'The latest Route Moment or hourly comparison.'},
    {id:'interval',label:'Stop interval',description:'Latest completed interval against your recent rhythm.'},
    {id:'area',label:'Delivery Area',description:'Your current saved area and local delivery context.'},
    {id:'tote',label:'Tote assistant',description:'Current tote details and the next tote action.'},
    {id:'coach',label:'Route coach',description:'Live delivery guidance based on your route.'}
  ].map(Object.freeze));
  const core = ['stops','time','last','finish','remaining','goal'];
  const makeLayout = (id,label,description,position,size,selected) => Object.freeze({id,label,description,position,size,cards:Object.freeze(selected)});
  const layouts = Object.freeze({
    balanced:makeLayout('balanced','Balanced','A clear dial with your essential readings beside it.','right','medium',[...core]),
    mirror:makeLayout('mirror','Left focus','Essential readings on the left, with the dial on the right.','left','medium',[...core]),
    cockpit:makeLayout('cockpit','Cockpit','A large dial with route readings underneath.','bottom','large',[...core]),
    top:makeLayout('top','Top deck','Your route readings above a large dial.','top','large',[...core]),
    focus:makeLayout('focus','Focus','A large dial and your essential delivery controls.','bottom','large',[]),
    ghost:makeLayout('ghost','Ghost Run','A large dial with your Ghost comparison in view.','bottom','large',['ghost','stops','finish','remaining']),
    insights:makeLayout('insights','Insights','A smaller dial with facts and a fuller route picture.','right','small',['stops','time','finish','remaining','goal','packages','distance','ghost','moment','interval','area','tote']),
    parcels:makeLayout('parcels','Packages','A large dial with one-tap package counts and essential readings.','bottom','large',['stops','packages','remaining','finish']),
    custom:makeLayout('custom','Custom','Choose your dial position, size and information cards.','right','medium',[...core])
  });
  const defaults = Object.freeze({version:1,layout:'balanced',position:'right',size:'medium',dial:'arc',progress:'rail',showProgress:true,countPackages:false,packagePosition:'dial',cards:Object.freeze([...core])});
  const positions = Object.freeze(['right','left','bottom','top']);
  const sizes = Object.freeze(['small','medium','large']);
  const dials = Object.freeze(['arc','orbit','panel']);
  const progressStyles = Object.freeze(['rail','segments','beacon']);
  const cardIds = new Set(cards.map(card=>card.id));
  const owns = (object,key) => Object.prototype.hasOwnProperty.call(object,key);
  function normalize(raw) {
    let input=raw;
    if(typeof input==='string') {
      if(input.length>4096)input=null;
      else try{input=JSON.parse(input);}catch{input=null;}
    }
    if(!input||typeof input!=='object'||Array.isArray(input))input={};
    // Future schemas must explicitly migrate; inherited properties are not preferences.
    if(owns(input,'version')&&input.version!==1)input={};
    const value=key=>owns(input,key)?input[key]:undefined;
    const requested=value('layout'),layout=typeof requested==='string'&&owns(layouts,requested)?requested:defaults.layout,seed=layouts[layout];
    const selected=value('cards');
    const result={
      version:1,layout,
      position:positions.includes(value('position'))?value('position'):seed.position,
      size:sizes.includes(value('size'))?value('size'):seed.size,
      dial:dials.includes(value('dial'))?value('dial'):defaults.dial,
      progress:progressStyles.includes(value('progress'))?value('progress'):defaults.progress,
      countPackages:typeof value('countPackages')==='boolean'?value('countPackages'):layout==='parcels',
      packagePosition:['dial','below','card'].includes(value('packagePosition'))?value('packagePosition'):'dial',
      showProgress:typeof value('showProgress')==='boolean'?value('showProgress'):defaults.showProgress,
      cards:Array.isArray(selected)?[...new Set(selected.slice(0,128).filter(id=>typeof id==='string'&&cardIds.has(id)))]:[...seed.cards]
    };
    if(result.countPackages&&result.packagePosition==='card'&&!result.cards.includes('packageCounter'))result.cards.push('packageCounter');
    if(!result.countPackages||result.packagePosition!=='card')result.cards=result.cards.filter(id=>id!=='packageCounter');
    return result;
  }
  function preset(layoutId,current) {
    const prior=normalize(current),id=typeof layoutId==='string'&&owns(layouts,layoutId)?layoutId:defaults.layout,seed=layouts[id];
    return normalize({...prior,layout:id,position:seed.position,size:seed.size,cards:[...seed.cards],...(id==='parcels'?{countPackages:true,packagePosition:'dial'}:{})});
  }
  window.RouteHeatCustomize=Object.freeze({normalize,preset,defaults,layouts,cards,positions,sizes,dials,progressStyles});
})();
