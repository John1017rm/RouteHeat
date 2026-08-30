/* RouteHeat 7.0 · Pace Orchestra
   Deterministic, local-only route sonification. No audio files or network access. */
(function paceOrchestraModule(global){
  'use strict';

  const VERSION = 1;
  const MIN_DURATION = 22;
  const MAX_DURATION = 42;
  const MAX_MELODY_EVENTS = 72;
  const BAR_COUNT = 24;
  const SCALE_NAMES = ['Dorian','Major pentatonic','Mixolydian','Minor pentatonic'];
  const SCALES = [
    [0,2,3,5,7,9,10,12],
    [0,2,4,7,9,12],
    [0,2,4,5,7,9,10,12],
    [0,3,5,7,10,12]
  ];
  const KEY_NAMES = ['C','D♭','D','E♭','E','F','G♭','G','A♭','A','B♭','B'];

  let playback = null;
  let generation = 0;

  const finite = value => Number.isFinite(Number(value)) ? Number(value) : null;
  const clamp = (value,min,max) => Math.min(max,Math.max(min,value));
  const escapeHtml = value => String(value == null ? '' : value)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function hashText(value){
    let hash=2166136261;
    const text=String(value == null ? '' : value);
    for(let index=0;index<text.length;index++){
      hash^=text.charCodeAt(index);
      hash=Math.imul(hash,16777619);
    }
    return hash>>>0;
  }

  function routeFingerprint(route){
    const stops=Array.isArray(route?.stops)?route.stops:[];
    const fingerprint=stops.map((stop,index)=>[
      finite(stop?.timestamp)||index,
      finite(stop?.segmentMs)||0,
      stopLocations(stop)
    ].join(':')).join('|');
    return `${route?.id||route?.startedAt||'route'}|${stops.length}|${fingerprint}`;
  }

  function stopLocations(stop){
    return Math.max(1,Math.round(finite(stop?.locationCount)||finite(stop?.locations)||1));
  }

  function routeStops(route){
    return (Array.isArray(route?.stops)?route.stops:[])
      .filter(stop=>stop&&typeof stop==='object')
      .slice()
      .sort((first,second)=>(finite(first?.timestamp)||0)-(finite(second?.timestamp)||0));
  }

  function median(values){
    const sorted=values.filter(value=>Number.isFinite(value)&&value>0).slice().sort((a,b)=>a-b);
    if(!sorted.length)return 120000;
    const middle=Math.floor(sorted.length/2);
    return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
  }

  function stopInterval(stops,index){
    const stop=stops[index];
    const stored=finite(stop?.segmentMs);
    if(stored&&stored>1000&&stored<3600000)return stored;
    const current=finite(stop?.timestamp),previous=index?finite(stops[index-1]?.timestamp):null;
    const difference=current!=null&&previous!=null?current-previous:null;
    return difference&&difference>1000&&difference<3600000?difference:null;
  }

  function routeDuration(route){
    const stopCount=routeStops(route).length;
    return +clamp(MIN_DURATION+stopCount*.1,MIN_DURATION,MAX_DURATION).toFixed(1);
  }

  function rescueStarts(route,stops){
    const phases=(Array.isArray(route?.phases)?route.phases:[])
      .filter(phase=>phase&&phase.type==='rescue');
    const starts=[];
    phases.forEach(phase=>{
      let index=finite(phase.startStopIndex);
      if(index==null){
        const startedAt=finite(phase.startedAt);
        index=startedAt==null?-1:stops.findIndex(stop=>(finite(stop?.timestamp)||Infinity)>=startedAt);
      }
      if(index>=0&&index<stops.length)starts.push(Math.round(index));
    });
    return Array.from(new Set(starts)).sort((a,b)=>a-b).slice(0,12);
  }

  function toteIndexes(route,stops){
    return (Array.isArray(route?.totes)?route.totes:[]).map(tote=>{
      const after=finite(tote?.afterStop);
      if(after!=null)return clamp(Math.round(after),0,Math.max(0,stops.length-1));
      const timestamp=finite(tote?.timestamp);
      if(timestamp==null)return null;
      const index=stops.findIndex(stop=>(finite(stop?.timestamp)||Infinity)>=timestamp);
      return index<0?stops.length-1:index;
    }).filter(index=>index!=null&&index>=0).slice(0,40);
  }

  function melodyEvents(route){
    const stops=routeStops(route);
    if(!stops.length)return {stops,events:[],baselineMs:120000,rescues:[],totes:[]};
    const rawIntervals=stops.map((stop,index)=>stopInterval(stops,index)).filter(Boolean);
    const baselineMs=clamp(median(rawIntervals),25000,420000);
    const eventCount=Math.min(MAX_MELODY_EVENTS,stops.length);
    const events=[];
    for(let eventIndex=0;eventIndex<eventCount;eventIndex++){
      const first=Math.floor(eventIndex*stops.length/eventCount);
      const end=Math.max(first+1,Math.floor((eventIndex+1)*stops.length/eventCount));
      const group=stops.slice(first,end);
      const groupIntervals=[];
      for(let index=first;index<end;index++){
        const interval=stopInterval(stops,index);
        if(interval)groupIntervals.push(interval);
      }
      const intervalMs=groupIntervals.length?median(groupIntervals):baselineMs;
      events.push({
        index:first,
        lastIndex:end-1,
        stop:group[Math.floor(group.length/2)],
        intervalMs,
        ratio:clamp(baselineMs/intervalMs,.38,2.8),
        multi:group.some(stop=>stopLocations(stop)>1),
        locations:group.reduce((total,stop)=>total+stopLocations(stop),0)
      });
    }
    return {stops,events,baselineMs,rescues:rescueStarts(route,stops),totes:toteIndexes(route,stops)};
  }

  function routeSummary(route){
    const plan=melodyEvents(route),fingerprint=routeFingerprint(route),hash=hashText(fingerprint);
    const scaleIndex=hash%SCALES.length;
    const baseMidi=46+(hash%8);
    const pace=plan.baselineMs?3600000/plan.baselineMs:0;
    const mood=pace>=28?'Electric sprint':pace>=21?'Bright momentum':pace>=15?'Steady pulse':'Wide-open cadence';
    const key=KEY_NAMES[(baseMidi%12+12)%12];
    return {
      version:VERSION,
      available:plan.stops.length>0,
      stopCount:plan.stops.length,
      toteCount:plan.totes.length,
      rescueCount:plan.rescues.length,
      durationSeconds:routeDuration(route),
      medianStopsPerHour:+pace.toFixed(1),
      mood,
      key,
      scale:SCALE_NAMES[scaleIndex],
      title:`${mood} in ${key}`,
      subtitle:`${plan.stops.length} stops · ${routeDuration(route).toFixed(0)} second route song`,
      fingerprint:hash.toString(16).padStart(8,'0'),
      hash,
      baseMidi,
      scaleIndex
    };
  }

  function midiFrequency(midi){
    return 440*Math.pow(2,(midi-69)/12);
  }

  function resolveElement(value){
    if(!value)return null;
    if(typeof value==='string')return document.querySelector(value);
    return value&&value.nodeType===1?value:null;
  }

  function findCard(options){
    const direct=resolveElement(options?.container);
    if(direct)return direct;
    const visualizer=resolveElement(options?.visualizer);
    return visualizer?.closest?.('[data-routeheat-orchestra]')||null;
  }

  function updateCard(state,progress=0,options={}){
    const card=findCard(options);
    if(!card)return;
    card.dataset.state=state;
    const button=card.querySelector('[data-orchestra-toggle]');
    const status=card.querySelector('[data-orchestra-status]');
    const progressBar=card.querySelector('[data-orchestra-progress]');
    if(button){
      const playing=state==='playing';
      button.setAttribute('aria-pressed',playing?'true':'false');
      button.textContent=playing?'Stop route song':'Play route song';
    }
    if(status)status.textContent=state==='playing'?'Your route is playing':state==='ended'?'Route song complete':state==='error'?'This route could not be played':'Ready when parked';
    if(progressBar){
      const percent=Math.round(clamp(progress,0,1)*100);
      progressBar.setAttribute('aria-valuenow',String(percent));
      const fill=progressBar.querySelector('i');
      if(fill)fill.style.width=`${percent}%`;
    }
  }

  function scheduleTone(state,frequency,start,duration,gainValue,type='triangle',pan=0){
    const context=state.context;
    const oscillator=context.createOscillator();
    const envelope=context.createGain();
    const panner=typeof context.createStereoPanner==='function'?context.createStereoPanner():null;
    oscillator.type=type;
    oscillator.frequency.setValueAtTime(Math.max(35,frequency),start);
    envelope.gain.setValueAtTime(.0001,start);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0002,gainValue),start+.025);
    envelope.gain.exponentialRampToValueAtTime(.0001,start+Math.max(.07,duration));
    if(panner){panner.pan.setValueAtTime(clamp(pan,-.75,.75),start);oscillator.connect(envelope).connect(panner).connect(state.master);}
    else oscillator.connect(envelope).connect(state.master);
    state.nodes.add(oscillator);state.nodes.add(envelope);if(panner)state.nodes.add(panner);
    oscillator.onended=()=>{
      [oscillator,envelope,panner].filter(Boolean).forEach(node=>{state.nodes.delete(node);try{node.disconnect();}catch(error){/* already disconnected */}});
    };
    oscillator.start(start);
    oscillator.stop(start+Math.max(.09,duration)+.04);
  }

  function scheduleBell(state,frequency,start,gainValue=.055){
    scheduleTone(state,frequency,start,.82,gainValue,'sine',.35);
    scheduleTone(state,frequency*2.01,start+.008,.46,gainValue*.34,'sine',-.2);
    scheduleTone(state,frequency*3.98,start+.014,.27,gainValue*.12,'sine',.1);
  }

  function scheduleRescueTransition(state,frequency,start){
    [0,7,12].forEach((semitones,index)=>scheduleTone(state,frequency*Math.pow(2,semitones/12),start+index*.09,.62,.035,'sawtooth',(index-1)*.24));
  }

  function scheduleFinishChord(state,baseFrequency,start){
    [0,4,7,12].forEach((semitones,index)=>{
      scheduleTone(state,baseFrequency*Math.pow(2,semitones/12),start+index*.025,2.05,.055,'triangle',(index-1.5)*.18);
    });
    scheduleBell(state,baseFrequency*2,start+.08,.042);
  }

  function setVisualizerBars(element,values){
    if(!element)return;
    const bars=element.querySelectorAll('i');
    if(!bars.length)return;
    bars.forEach((bar,index)=>{
      const source=Math.floor(index/Math.max(1,bars.length-1)*Math.max(0,values.length-1));
      const level=values.length?values[source]/255:0;
      bar.style.setProperty('--level',String(.1+level*.9));
    });
  }

  function runVisualizer(state){
    const reduced=typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
    const buffer=new Uint8Array(state.analyser.frequencyBinCount);
    const draw=()=>{
      if(playback!==state)return;
      state.analyser.getByteFrequencyData(buffer);
      const elapsed=Math.max(0,state.context.currentTime-state.audioStart);
      const progress=clamp(elapsed/state.summary.durationSeconds,0,1);
      if(!reduced||Math.floor(elapsed*2)!==state.lastReducedFrame){
        setVisualizerBars(state.visualizer,buffer);
        state.lastReducedFrame=Math.floor(elapsed*2);
      }
      updateCard('playing',progress,state.options);
      try{state.options.onProgress?.({progress,elapsed,duration:state.summary.durationSeconds,levels:buffer});}catch(error){/* app callback is isolated */}
      state.raf=requestAnimationFrame(draw);
    };
    state.raf=requestAnimationFrame(draw);
  }

  function stop(reason='manual'){
    const state=playback;
    if(!state)return false;
    playback=null;
    generation++;
    if(state.raf)cancelAnimationFrame(state.raf);
    if(state.endTimer)clearTimeout(state.endTimer);
    state.nodes.forEach(node=>{
      try{if(typeof node.stop==='function')node.stop();}catch(error){/* oscillator may already be stopped */}
      try{node.disconnect();}catch(error){/* already disconnected */}
    });
    state.nodes.clear();
    try{state.context.onstatechange=null;}catch(error){/* closed context */}
    try{const closing=state.context.close();if(closing?.catch)closing.catch(()=>{});}catch(error){/* already closed */}
    setVisualizerBars(state.visualizer,new Uint8Array(BAR_COUNT));
    updateCard(reason==='ended'?'ended':reason==='error'?'error':'ready',reason==='ended'?1:0,state.options);
    try{state.options.onStateChange?.({playing:false,reason,summary:state.summary});}catch(error){/* app callback is isolated */}
    return true;
  }

  async function play(route,options={}){
    const summary=routeSummary(route);
    if(!summary.available)throw new Error('A saved route with at least one stop is needed to create a route song.');
    const AudioContextClass=global.AudioContext||global.webkitAudioContext;
    if(!AudioContextClass)throw new Error('Web Audio is not supported on this device.');
    stop('replaced');

    const state={
      id:++generation,
      context:new AudioContextClass({latencyHint:'interactive'}),
      nodes:new Set(),
      summary,
      options:{...options},
      route,
      raf:0,
      endTimer:null,
      visualizer:resolveElement(options.visualizer)||findCard(options)?.querySelector('[data-orchestra-visualizer]')||null,
      lastReducedFrame:-1
    };
    playback=state;
    try{
      const context=state.context;
      const master=context.createGain();
      const compressor=context.createDynamicsCompressor();
      const analyser=context.createAnalyser();
      state.master=master;state.compressor=compressor;state.analyser=analyser;
      state.nodes.add(master);state.nodes.add(compressor);state.nodes.add(analyser);
      master.gain.value=clamp(finite(options.volume)??.72,.05,1)*.34;
      compressor.threshold.value=-18;compressor.knee.value=18;compressor.ratio.value=5;compressor.attack.value=.008;compressor.release.value=.22;
      analyser.fftSize=64;analyser.smoothingTimeConstant=.78;
      master.connect(compressor).connect(analyser).connect(context.destination);

      // Context creation and resume happen only inside this explicit play call, so it is
      // independent of RouteHeat's confirmation-sound preference and iOS audio recovery.
      if(context.state==='suspended')await context.resume();
      if(playback!==state)throw new Error('Playback was cancelled.');

      const plan=melodyEvents(route),scale=SCALES[summary.scaleIndex];
      const audioStart=context.currentTime+.075;
      const melodyStart=audioStart+.5;
      const finishStart=audioStart+summary.durationSeconds-2.35;
      const melodyWindow=Math.max(5,finishStart-melodyStart-.35);
      const weights=plan.events.map(event=>clamp(event.intervalMs/plan.baselineMs,.48,2.05));
      const weightTotal=weights.reduce((total,value)=>total+value,0)||1;
      let elapsedWeight=0;
      let rescueShift=0;
      let nextRescue=0;
      plan.events.forEach((event,index)=>{
        while(nextRescue<plan.rescues.length&&event.index>=plan.rescues[nextRescue]){
          rescueShift+=(nextRescue%2?2:5);
          const transitionAt=melodyStart+melodyWindow*(elapsedWeight/weightTotal);
          scheduleRescueTransition(state,midiFrequency(summary.baseMidi+rescueShift-12),transitionAt);
          nextRescue++;
        }
        const start=melodyStart+melodyWindow*(elapsedWeight/weightTotal);
        elapsedWeight+=weights[index];
        const paceIndex=clamp(Math.round((event.ratio-.38)/2.42*(scale.length-1)),0,scale.length-1);
        const octaveBoost=event.ratio>1.6?12:0;
        const midi=summary.baseMidi+scale[paceIndex]+octaveBoost+rescueShift;
        const noteDuration=clamp(.44/event.ratio,.16,.88);
        const pan=((index%7)-3)/7;
        scheduleTone(state,midiFrequency(midi),start,noteDuration,.052,'triangle',pan);
        if(index%4===0)scheduleTone(state,midiFrequency(summary.baseMidi-12+rescueShift),start,.24,.025,'sine',-.3);
        if(event.multi){
          scheduleTone(state,midiFrequency(midi+7),start+.018,noteDuration*.92,.036,'triangle',-.2*pan);
        }
      });

      plan.totes.forEach((stopIndex,index)=>{
        const progress=plan.stops.length<=1?0:stopIndex/(plan.stops.length-1);
        const start=melodyStart+melodyWindow*progress;
        scheduleBell(state,midiFrequency(summary.baseMidi+24+(index%3)*2),start,.052);
      });
      scheduleFinishChord(state,midiFrequency(summary.baseMidi+rescueShift),finishStart);
      master.gain.setValueAtTime(master.gain.value,audioStart);
      master.gain.setValueAtTime(master.gain.value,audioStart+summary.durationSeconds-1.05);
      master.gain.exponentialRampToValueAtTime(.0001,audioStart+summary.durationSeconds+.1);

      state.audioStart=audioStart;
      state.endTimer=setTimeout(()=>{
        if(playback!==state)return;
        const callback=state.options.onEnd;
        stop('ended');
        try{callback?.(summary);}catch(error){/* app callback is isolated */}
      },Math.ceil((summary.durationSeconds+.25)*1000));
      updateCard('playing',0,state.options);
      runVisualizer(state);
      try{state.options.onStateChange?.({playing:true,reason:'play',summary});}catch(error){/* app callback is isolated */}
      return summary;
    }catch(error){
      if(playback===state){updateCard('error',0,state.options);stop('error');}
      throw error;
    }
  }

  function renderCard(route,options={}){
    const summary=routeSummary(route);
    const heading=escapeHtml(options.heading||'PACE ORCHESTRA');
    const description=summary.available
      ?escapeHtml(options.description||'Hear your route as a one-of-a-kind composition. Fast sections rise and sparkle; slower stretches settle into lower, longer notes.')
      :'Complete at least one stop to unlock this route song.';
    const bars=Array.from({length:BAR_COUNT},(_,index)=>`<i style="--bar:${index};--level:.1"></i>`).join('');
    return `<section class="pace-orchestra-card${options.compact?' is-compact':''}" data-routeheat-orchestra data-state="ready"><div class="pace-orchestra-heading"><span class="pace-orchestra-mark" aria-hidden="true">♫</span><div><small>${heading}</small><h3>${escapeHtml(summary.title)}</h3><p>${description}</p></div></div><div class="pace-orchestra-meta"><span>${escapeHtml(summary.scale)} scale</span><span>${summary.durationSeconds.toFixed(0)} sec</span><span>${summary.rescueCount?`${summary.rescueCount} key change${summary.rescueCount===1?'':'s'}`:'Original route theme'}</span></div><div class="pace-orchestra-visualizer" data-orchestra-visualizer aria-hidden="true">${bars}</div><div class="pace-orchestra-progress" data-orchestra-progress role="progressbar" aria-label="Route song progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="pace-orchestra-actions"><button type="button" class="pace-orchestra-play" data-orchestra-toggle aria-pressed="false"${summary.available?'':' disabled'}>${summary.available?'Play route song':'Route song unavailable'}</button><span data-orchestra-status role="status">${summary.available?'Ready when parked':'No stops to compose yet'}</span></div><p class="pace-orchestra-safety"><strong>Park before listening.</strong> Never operate playback while driving.</p></section>`;
  }

  function isPlaying(){return !!playback;}

  // App-switching must end the session. Playback is intentionally never resumed
  // automatically; the driver must explicitly tap Play again while parked.
  if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden)stop('hidden');},{passive:true});
  if(typeof global.addEventListener==='function'){
    global.addEventListener('pagehide',()=>stop('pagehide'),{passive:true});
    global.addEventListener('blur',()=>stop('blur'),{passive:true});
  }

  global.RouteHeatOrchestra=Object.freeze({
    version:VERSION,
    play,
    stop,
    isPlaying,
    renderCard,
    duration:routeDuration,
    summary:routeSummary
  });
})(window);
