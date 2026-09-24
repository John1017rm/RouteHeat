/* A tote-opened cue, played only by an explicit action through the shared audio context. */
(() => {
  'use strict';
  const motifs = {
    bloom: { type: 'sine', partial: .12, notes: [[587.33, 0, .19], [739.99, .105, .2], [880, .21, .22], [1174.66, .34, .36]] },
    sparkle: { type: 'sine', partial: .08, notes: [[783.99, 0, .15], [987.77, .065, .17], [1174.66, .13, .2], [1318.51, .23, .2], [1567.98, .31, .25]] },
    arcade: { type: 'triangle', partial: 0, notes: [[440, 0, .07], [554.37, .075, .075], [659.25, .15, .1], [880, .29, .2]] }
  };
  const recent = new WeakMap();
  const active = new WeakMap();

  function play(context, options = {}) {
    let playback;
    try {
      if (!context || !options || typeof options !== 'object') return false;
      const style = options.style === undefined ? 'bloom' : options.style;
      if (typeof style !== 'string' || !Object.hasOwn(motifs, style)) return false;
      const volume = options.volume === undefined ? 70 : options.volume;
      if (typeof volume !== 'number' || !Number.isFinite(volume) || volume <= 0) return false;
      if (context.state !== 'running' || !Number.isFinite(context.currentTime) || context.currentTime < 0 || !context.destination || typeof context.createGain !== 'function' || typeof context.createOscillator !== 'function') return false;
      const now = context.currentTime;
      const previous = recent.get(context);
      if (previous !== undefined && now >= previous && now - previous < .35) return false;

      // Repeated previews replace only our own cue; route and stop audio stay untouched.
      active.get(context)?.dispose();
      const nodes = new Set(), oscillators = new Set();
      playback = {
        disposed: false,
        dispose() {
          if (this.disposed) return;
          this.disposed = true;
          for (const oscillator of oscillators) {
            try { oscillator.onended = null; } catch {}
            try { oscillator.stop(); } catch {}
          }
          for (const node of nodes) { try { node.disconnect(); } catch {} }
          if (active.get(context) === this) active.delete(context);
        }
      };
      const track = node => { nodes.add(node); return node; };
      const master = track(context.createGain());
      const start = now + .015, motif = motifs[style];
      master.gain.setValueAtTime(Math.min(100, volume) / 100 * .4, start);
      master.connect(context.destination);
      const voices = [];
      for (const [frequency, offset, length] of motif.notes) {
        const when = start + offset;
        for (const [multiplier, level, type] of [[1, .36, motif.type], ...(motif.partial ? [[2, .36 * motif.partial, 'sine']] : [])]) {
          const oscillator = track(context.createOscillator());
          oscillators.add(oscillator);
          const envelope = track(context.createGain());
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency * multiplier, when);
          envelope.gain.setValueAtTime(.0001, when);
          envelope.gain.exponentialRampToValueAtTime(level, when + .008);
          envelope.gain.exponentialRampToValueAtTime(.0001, when + length);
          oscillator.connect(envelope);
          envelope.connect(master);
          voices.push({ oscillator, envelope, when, end: when + length + .01 });
        }
      }
      let remaining = voices.length;
      active.set(context, playback);
      for (const { oscillator, envelope, when, end } of voices) {
        oscillator.onended = () => {
          if (playback.disposed) return;
          try { oscillator.disconnect(); } catch {}
          try { envelope.disconnect(); } catch {}
          oscillator.onended = null;
          nodes.delete(oscillator);
          nodes.delete(envelope);
          oscillators.delete(oscillator);
          if (--remaining === 0) playback.dispose();
        };
        oscillator.start(when);
        oscillator.stop(end);
      }
      recent.set(context, now);
      return true;
    } catch {
      playback?.dispose();
      return false;
    }
  }

  window.RouteHeatToteSound = Object.freeze({ play });
})();
