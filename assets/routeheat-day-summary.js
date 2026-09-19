/* RouteHeat calendar summaries. Derived from visible saved routes; never persisted. */
((root) => {
  'use strict';

  const finite = value => value == null || typeof value === 'boolean' || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const count = (value, minimum = 0, maximum = 999999) => {
    const parsed = finite(value);
    return parsed != null && Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
  };
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const plural = (number, word) => `${number.toLocaleString()} ${word}${number === 1 ? '' : 's'}`;
  const compactCount = number => number > 9999 ? new Intl.NumberFormat([], {notation:'compact',maximumFractionDigits:1}).format(number) : number.toLocaleString();
  const durationText = milliseconds => {
    const minutes = Math.max(0, Math.round(milliseconds / 60000)), hours = Math.floor(minutes / 60);
    return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
  };
  const temperatureText = (minimum, maximum, units) => {
    if (minimum == null || maximum == null) return 'Temperature unavailable';
    const convert = value => Math.round(units === 'kilometers' ? value : value * 9 / 5 + 32);
    const low = convert(minimum), high = convert(maximum);
    return `${low === high ? low : `${low}–${high}`}°${units === 'kilometers' ? 'C' : 'F'}`;
  };

  function plannedPackages(saved) {
    const direct = count(saved.totalPackages), phases = Array.isArray(saved.phases) ? saved.phases : [];
    const values = phases.map(phase => count(phase?.packagesAdded)).filter(value => value != null);
    const total = direct ?? (values.length ? values.reduce((sum, value) => sum + value, 0) : null);
    return {total, complete: total != null && (saved.packageCountComplete === true || direct == null && phases.length > 0 && values.length === phases.length)};
  }

  function fallbackActiveMs(saved) {
    const start = finite(saved.startedAt), end = finite(saved.endedAt);
    if (start == null || end == null || end < start) return 0;
    const pauses = (saved.pauses || []).map(pause => [Math.max(start, finite(pause?.startedAt) ?? end), Math.min(end, finite(pause?.endedAt) ?? end)])
      .filter(([from, to]) => to > from).sort((first, second) => first[0] - second[0]);
    let paused = 0, until = start;
    for (const [from, to] of pauses) { paused += Math.max(0, to - Math.max(from, until)); until = Math.max(until, to); }
    return Math.max(0, end - start - paused);
  }

  function fallbackRescues(saved) {
    if (!(finite(saved.endedAt) > finite(saved.startedAt))) return [];
    const seen = new Set();
    return (saved.phases || []).filter(phase => {
      if (phase?.type !== 'rescue' || phase.id == null || seen.has(String(phase.id))) return false;
      seen.add(String(phase.id));
      return (saved.stops || []).some(stop => String(stop?.phaseId) === String(phase.id));
    }).map(phase => ({stops: saved.stops.filter(stop => String(stop?.phaseId) === String(phase.id)).length}));
  }

  function weatherForRoutes(routes, atmosphereModule) {
    const records = [];
    for (const saved of routes) {
      const atmosphere = atmosphereModule?.normalize?.(saved.atmosphere);
      if (!atmosphere) continue;
      const current = typeof atmosphereModule.isCurrent !== 'function' || atmosphereModule.isCurrent(saved, atmosphere);
      const summary = atmosphereModule.calendarSummary?.(atmosphere) || {
        icon: atmosphereModule.summaryIcon?.(atmosphere) || atmosphereModule.conditionIcon?.(atmosphere.conditionCode) || '◒',
        label: atmosphereModule.weatherSummary?.(atmosphere) || 'Saved conditions',
        minC: atmosphere.temperature?.minC, maxC: atmosphere.temperature?.maxC,
        partial: atmosphere.version < 2 || atmosphere.coverage?.conditionPercent < 95 || atmosphere.coverage?.precipitationPercent < 95,
        observation: atmosphere.observation || null
      };
      records.push({
        routeId: String(saved.id ?? ''), startedAt: finite(saved.startedAt), endedAt: finite(saved.endedAt),
        icon: summary.icon || '◒', label: String(summary.label || 'Saved conditions'),
        minC: finite(summary.minC), maxC: finite(summary.maxC), partial: !!summary.partial, stale: !current,
        observation: summary.observation || null, timezone: atmosphere.timezone,
        families: [...new Set([...(atmosphere.periods || []), ...(atmosphere.events || [])].map(item => item.family).filter(Boolean))],
        precipitationMm: finite(atmosphere.precipitationMm), snowfallCm: finite(atmosphere.snowfallCm)
      });
    }
    const families = new Set(records.flatMap(record => record.families));
    if (records.some(record => record.snowfallCm > 0.05)) families.add('snow');
    if (records.some(record => record.precipitationMm > 0.05 && !(record.snowfallCm > 0.05))) families.add('rain');
    const mixedRain = families.has('rain') && (families.has('clear') || families.has('cloud'));
    const icon = families.has('storm') ? '⛈' : families.has('snow') ? '❄' : mixedRain ? '🌦' : families.has('rain') ? '☂' : records[0]?.icon || '';
    const minima = records.map(record => record.minC).filter(value => value != null), maxima = records.map(record => record.maxC).filter(value => value != null);
    return {
      records, icon, minC: minima.length ? Math.min(...minima) : null, maxC: maxima.length ? Math.max(...maxima) : null,
      partial: records.length < routes.length || records.some(record => record.partial || record.stale),
      label: [...new Set(records.map(record => record.label))].join(' · '), missingRoutes: routes.length - records.length
    };
  }

  function summarize(input, options = {}) {
    // The caller supplies routes(), which already hides merged/deleted source routes.
    // Deduplicate identical IDs defensively without reading any raw storage collections.
    const seen = new Set(), routes = (Array.isArray(input) ? input : []).filter(saved => {
      if (!saved || typeof saved !== 'object' || !Array.isArray(saved.stops)) return false;
      const id = saved.id == null ? null : String(saved.id);
      if (id != null && seen.has(id)) return false;
      if (id != null) seen.add(id);
      return true;
    }).slice().sort((first, second) => Number(first.startedAt) - Number(second.startedAt));
    let stops = 0, locations = 0, activeMs = 0, rescueCount = 0, rescueStops = 0;
    let counted = 0, countedStops = 0, planned = 0, plannedRoutes = 0, plannedCompleteRoutes = 0;
    for (const saved of routes) {
      const routeStops = saved.stops;
      stops += routeStops.length;
      for (const stop of routeStops) {
        locations += Math.max(1, Math.round(finite(stop?.locationCount) || 1));
        const packages = count(stop?.packageCount, 1, 999);
        if (packages != null) { counted += packages; countedStops++; }
      }
      const packageStats = (options.packageStats || plannedPackages)(saved);
      if (packageStats?.total != null && count(packageStats.total) != null) {
        planned += Number(packageStats.total); plannedRoutes++;
        if (packageStats.complete) plannedCompleteRoutes++;
      }
      const elapsed = options.activeMs ? options.activeMs(saved, saved.endedAt) : fallbackActiveMs(saved);
      activeMs += Math.max(0, finite(elapsed) || 0);
      const rescues = (options.rescueEntries || fallbackRescues)(saved) || [];
      rescueCount += rescues.length;
      rescueStops += rescues.reduce((sum, rescue) => sum + Math.max(0, finite(rescue.stops) || 0), 0);
    }
    const delaySummary = options.delaySummary?.(routes) || null;
    const delayRows = (delaySummary?.rows || []).slice().sort((first, second) => (finite(second.observedStationaryMs) || 0) - (finite(first.observedStationaryMs) || 0) || (finite(second.stops) || 0) - (finite(first.stops) || 0));
    const timedDelay = delayRows.find(row => row.observedStops > 0 && row.observedStationaryMs > 0);
    const weather = weatherForRoutes(routes, options.atmosphereModule || root.RouteHeatAtmosphere);
    return {
      routes, routeCount: routes.length, stops, locations, activeMs, rescueCount, rescueStops,
      packages: {counted: countedStops ? counted : null, countedStops, unknownStops: stops - countedStops, complete: stops > 0 && countedStops === stops,
        planned: plannedRoutes ? planned : null, plannedRoutes, plannedComplete: routes.length > 0 && plannedCompleteRoutes === routes.length},
      weather, delay: timedDelay ? {...timedDelay, timed: true} : delayRows[0] ? {...delayRows[0], timed: false} : null,
      taggedStops: Math.max(0, finite(delaySummary?.taggedStops) || 0)
    };
  }

  function packageDisplay(model) {
    const packages = model.packages;
    if (packages.counted != null) return {value: `${compactCount(packages.counted)}${packages.complete ? '' : '+'}`, kind: 'counted', label: `${plural(packages.counted, 'package')} counted at ${packages.countedStops} of ${model.stops} stops${packages.unknownStops ? `; ${plural(packages.unknownStops, 'stop')} without a package count` : ''}`};
    if (packages.planned != null) return {value: `${compactCount(packages.planned)}${packages.plannedComplete ? '' : '+'}`, kind: 'planned', label: `${plural(packages.planned, 'planned package')}${packages.plannedComplete ? '' : '; partial route totals'}; delivered packages not counted`};
    return {value: '—', kind: 'unknown', label: 'Package counts unavailable'};
  }

  function tileHtml(model, day, {key = '', selected = false, fullDate = ''} = {}) {
    const packages = packageDisplay(model), weather = model.weather;
    const label = `${fullDate}, ${plural(model.stops, 'stop')}, ${packages.label}, ${plural(model.routeCount, 'saved route')}${model.rescueCount ? `; ${plural(model.rescueCount, 'completed rescue')}, ${plural(model.rescueStops, 'rescue stop')}` : ''}${weather.records.length ? `; ${weather.label}${weather.partial ? '; partial weather report' : ''}` : '; weather unavailable'}`;
    return `<button type="button" class="history-calendar-day has-route calendar-rich-day${selected ? ' selected' : ''}${model.rescueCount ? ' has-rescue' : ''}" data-history-day="${escapeHtml(key)}" aria-pressed="${selected}" aria-label="${escapeHtml(label)}">${model.rescueCount ? '<span class="calendar-rescue-mark" aria-hidden="true"></span>' : ''}<span class="calendar-day-top"><span>${escapeHtml(day)}</span>${weather.icon ? `<span class="calendar-weather-icon" aria-hidden="true">${escapeHtml(weather.icon)}</span>` : ''}</span><b class="calendar-stop-count" aria-hidden="true">${escapeHtml(compactCount(model.stops))}</b><span class="calendar-package-count ${packages.kind}" aria-hidden="true"><span class="calendar-package-mark">${packages.kind === 'planned' ? 'P' : '▣'}</span><span>${escapeHtml(packages.value)}</span></span></button>`;
  }

  function detailHtml(model, {dateLabel = '', units = 'miles'} = {}) {
    if (!model.routeCount) return '';
    const packages = model.packages, weather = model.weather;
    const counted = packages.counted == null ? '—' : `${packages.counted.toLocaleString()}${packages.complete ? '' : '+'}`;
    const coverage = packages.counted == null ? 'No stop package counts recorded' : `${packages.countedStops} of ${model.stops} stops counted${packages.unknownStops ? ` · ${packages.unknownStops} unknown` : ' · complete'}`;
    const planned = packages.planned == null ? 'Route package total not entered' : `${packages.planned.toLocaleString()}${packages.plannedComplete ? '' : '+'} planned packages${packages.plannedComplete ? '' : ' · partial totals'}`;
    const metric = (label, value, note) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(note)}</small></div>`;
    const clock = record => {
      const format = timestamp => {
        if (timestamp == null) return '—';
        try { return new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit',timeZone:record.timezone || undefined}); }
        catch (_) { return new Date(timestamp).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}); }
      };
      return `${format(record.startedAt)}–${format(record.endedAt)}`;
    };
    const weatherRows = weather.records.map(record => `<li><span class="day-weather-symbol" aria-hidden="true">${escapeHtml(record.icon)}</span><div><b>${escapeHtml(record.label)}</b><small>${escapeHtml(clock(record))} · ${escapeHtml(temperatureText(record.minC, record.maxC, units))}${record.stale ? ' · route changed; refresh weather' : record.partial ? ' · partial coverage' : ''}</small>${record.observation ? `<p class="day-weather-observation">Your note: ${escapeHtml(record.observation.condition)} · ${escapeHtml(record.observation.period)}${record.observation.note ? ` — ${escapeHtml(record.observation.note)}` : ''}</p>` : ''}</div></li>`).join('');
    const delay = model.delay;
    const delayHtml = delay ? `<div class="day-delay-note"><span aria-hidden="true">◷</span><div><b>${delay.timed ? 'Longest recorded context' : 'Most noted stop context'}: ${escapeHtml(delay.label)}</b><p>${delay.timed ? `${escapeHtml(durationText(delay.observedStationaryMs))} observed stationary across ${plural(delay.observedStops, 'tagged stop')}. Timing is not proof of the cause.` : `${plural(delay.stops, 'tagged stop')} · duration unavailable.`}</p></div></div>` : '';
    return `<section class="day-at-glance" aria-label="Your day at a glance"><header><div><p class="eyebrow">YOUR DAY AT A GLANCE</p><h3>${escapeHtml(dateLabel)}</h3></div><span>${plural(model.routeCount, 'route')}</span></header><div class="day-glance-metrics">${metric('STOPS / LOCATIONS', `${model.stops.toLocaleString()} / ${model.locations.toLocaleString()}`, 'Completed deliveries')}${metric('PACKAGES COUNTED', counted, coverage)}${metric('ACTIVE TIME', durationText(model.activeMs), 'Saved breaks excluded')}${metric('RESCUES', model.rescueCount.toLocaleString(), model.rescueCount ? `${plural(model.rescueStops, 'rescue stop')}` : 'No completed rescues')}</div><p class="day-package-plan">${escapeHtml(planned)}${packages.counted != null && !packages.complete ? ' · + means a partial count' : ''}</p><div class="day-weather"><div class="day-weather-heading"><b>Weather through your routes</b><span>${escapeHtml(temperatureText(weather.minC, weather.maxC, units))}</span></div>${weatherRows ? `<ol>${weatherRows}</ol>` : '<p>Weather has not been added to this day yet.</p>'}${weather.missingRoutes && weather.records.length ? `<p>Weather unavailable for ${plural(weather.missingRoutes, 'route')}.</p>` : ''}${weather.records.length ? '<small class="day-weather-source">Saved hourly weather estimates · brief local showers may be missed.</small>' : ''}</div>${delayHtml}</section>`;
  }

  root.RouteHeatDaySummary = Object.freeze({summarize, packageDisplay, tileHtml, detailHtml});
})(typeof window !== 'undefined' ? window : globalThis);
