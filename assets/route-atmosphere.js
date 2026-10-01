((root) => {
  'use strict';

  const VERSION = 4;
  const HOUR_MS = 3600000;
  const PRECISION_DEGREES = 0.01;
  const MAX_ROUTE_RADIUS_METERS = 75000;
  const FORECAST_ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
  const HISTORICAL_ENDPOINT = 'https://historical-forecast-api.open-meteo.com/v1/forecast';
  const ARCHIVE_ENDPOINT = 'https://archive-api.open-meteo.com/v1/archive';
  const HOURLY_FIELDS = [
    'temperature_2m', 'apparent_temperature', 'relative_humidity_2m',
    'precipitation', 'rain', 'snowfall', 'weather_code', 'cloud_cover',
    'wind_speed_10m', 'wind_gusts_10m', 'is_day'
  ];
  const DAILY_FIELDS = ['sunrise', 'sunset', 'daylight_duration'];
  const CONDITION_LABELS = Object.freeze({
    0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Foggy', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle',
    55: 'Heavy drizzle', 56: 'Freezing drizzle', 57: 'Heavy freezing drizzle',
    61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain',
    67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow',
    77: 'Snow grains', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers',
    85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorms',
    96: 'Storms with hail', 99: 'Heavy storms with hail'
  });
  const CONDITION_ICONS = Object.freeze({
    clear: '☀', cloud: '◒', fog: '≋', rain: '☂', snow: '✦', storm: 'ϟ'
  });

  const numberOrNull = value => {
    if (value == null || typeof value === 'boolean' || String(value).trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const bounded = (value, min, max) => {
    const parsed = numberOrNull(value);
    return parsed == null || parsed < min || parsed > max ? null : parsed;
  };
  const integer = (value, min, max) => {
    const parsed = bounded(value, min, max);
    return parsed == null ? null : Math.round(parsed);
  };
  const mean = values => {
    const clean = values.map(numberOrNull).filter(value => value != null);
    return clean.length ? clean.reduce((total, value) => total + value, 0) / clean.length : null;
  };
  const median = values => {
    const clean = values.map(numberOrNull).filter(value => value != null).sort((a, b) => a - b);
    if (!clean.length) return null;
    const middle = Math.floor(clean.length / 2);
    return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  };
  const sum = values => values.map(numberOrNull).filter(value => value != null).reduce((total, value) => total + value, 0);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const text = (value, max = 96) => String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
  const escapeHtml = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
  const fnv = value => {
    const input = String(value);
    let hash = 2166136261;
    for (let index = 0; index < input.length; index += 1) {
      hash ^= input.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
  };
  const point = raw => {
    if (!raw) return null;
    const lat = numberOrNull(Array.isArray(raw) ? raw[0] : raw.lat ?? raw.latitude);
    const lng = numberOrNull(Array.isArray(raw) ? raw[1] : raw.lng ?? raw.lon ?? raw.longitude);
    if (lat == null || lng == null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (Math.abs(lat) < 0.000001 && Math.abs(lng) < 0.000001)) return null;
    return {lat, lng};
  };
  const distanceMeters = (first, second) => {
    const radians = Math.PI / 180;
    const lat1 = first.lat * radians;
    const lat2 = second.lat * radians;
    const deltaLat = (second.lat - first.lat) * radians;
    const deltaLng = (second.lng - first.lng) * radians;
    const value = Math.min(1, Math.max(0, Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2));
    return 6371000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  };
  const sampleEvenly = (items, limit) => {
    if (items.length <= limit) return items.slice();
    return Array.from({length: limit}, (_, index) => items[Math.min(items.length - 1, Math.floor(index * items.length / limit))]);
  };
  const routePoints = saved => {
    const stops = (Array.isArray(saved?.stops) ? saved.stops : []).map(stop => {
      const normalized = point(stop);
      const accuracy = numberOrNull(stop?.accuracy);
      return normalized && !(accuracy > 75) ? normalized : null;
    }).filter(Boolean);
    if (stops.length >= 2) return stops;
    const track = (Array.isArray(saved?.track) ? saved.track : []).map(raw => numberOrNull(raw?.accuracy) > 75 ? null : point(raw)).filter(Boolean);
    return stops.length ? [...stops, ...sampleEvenly(track, 80)] : track;
  };
  function coarseRoutePoint(saved) {
    const source = sampleEvenly(routePoints(saved), 800);
    if (!source.length) return null;
    // If every point is within half the radius of the first, every pair is
    // within the full radius. This exact fast path avoids the 80 × 800 search
    // for ordinary neighborhood routes, without caching mutable route data.
    let cluster = source;
    if (source.some(current => distanceMeters(source[0], current) > MAX_ROUTE_RADIUS_METERS / 2)) {
      const candidates = sampleEvenly(source, 80);
      let best = candidates[0], bestCount = 0;
      candidates.forEach(candidate => {
        const count = source.reduce((total, current) => total + (distanceMeters(candidate, current) <= MAX_ROUTE_RADIUS_METERS ? 1 : 0), 0);
        if (count > bestCount) { best = candidate; bestCount = count; }
      });
      cluster = source.filter(current => distanceMeters(best, current) <= MAX_ROUTE_RADIUS_METERS);
    }
    if (!cluster.length || cluster.length < Math.ceil(source.length * 0.45)) return null;
    const lat = median(cluster.map(current => current.lat));
    const lng = median(cluster.map(current => current.lng));
    if (lat == null || lng == null) return null;
    return {
      lat: Math.round(lat / PRECISION_DEGREES) * PRECISION_DEGREES,
      lng: Math.round(lng / PRECISION_DEGREES) * PRECISION_DEGREES,
      pointsUsed: cluster.length
    };
  }
  const utcDate = timestamp => new Date(Number(timestamp)).toISOString().slice(0, 10);
  // New lookups use Unix seconds, so weather timestamps never inherit the viewer's timezone.
  const localTimestamp = (value, utcOffsetSeconds = 0) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value * 1000 : null;
    if (!value) return null;
    const input = String(value);
    const explicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(input);
    const parsed = Date.parse(explicitZone ? input : input + 'Z');
    return Number.isFinite(parsed) ? parsed - (explicitZone ? 0 : Number(utcOffsetSeconds || 0) * 1000) : null;
  };
  const routeWindow = saved => {
    const startedAt = numberOrNull(saved?.startedAt);
    const endedAt = numberOrNull(saved?.endedAt || saved?.stops?.at?.(-1)?.timestamp || startedAt);
    if (startedAt == null || endedAt == null || startedAt <= 0 || endedAt < startedAt) return null;
    return {startedAt, endedAt: Math.max(startedAt + 60000, endedAt)};
  };
  function fingerprint(saved, coarse = coarseRoutePoint(saved)) {
    const window = routeWindow(saved);
    if (!window || !coarse) return '';
    const locations = routeLocationPlan(saved, coarse).map(area => `${area.lat.toFixed(2)},${area.lng.toFixed(2)}`).join(';');
    return fnv(`${String(saved.id || '')}|${window.startedAt}|${window.endedAt}|${coarse.lat.toFixed(2)}|${coarse.lng.toFixed(2)}|${locations}`);
  }
  // A compact route keeps one location. Wider routes use at most three rounded
  // areas, matched to the time the driver was there; no new GPS trail is saved.
  function routeLocationPlan(saved, coarse = coarseRoutePoint(saved)) {
    const window = routeWindow(saved);
    if (!coarse || !window) return [];
    const timed = [...sampleEvenly(Array.isArray(saved.track) ? saved.track : [], 1200), ...sampleEvenly(Array.isArray(saved.stops) ? saved.stops : [], 400)].map(raw => {
      const coordinates = point(raw), at = numberOrNull(Array.isArray(raw) ? raw[2] : raw?.timestamp), accuracy = numberOrNull(raw?.accuracy);
      return coordinates && at != null && at >= window.startedAt && at <= window.endedAt && !(accuracy > 75) ? {...coordinates, at} : null;
    }).filter(Boolean).sort((a, b) => a.at - b.at);
    const base = {start: window.startedAt, end: window.endedAt, ...coarse};
    if (timed.length < 4 || !timed.some(item => distanceMeters(coarse, item) > 5000)) return [base];
    const span = (window.endedAt - window.startedAt) / 3, plan = [];
    for (let index = 0; index < 3; index++) {
      const start = window.startedAt + index * span, end = index === 2 ? window.endedAt : start + span;
      const samples = timed.filter(item => item.at >= start && (index === 2 ? item.at <= end : item.at < end));
      const area = samples.length >= 2 ? coarseRoutePoint({stops: samples}) : coarse;
      plan.push({start, end, ...(area || coarse)});
    }
    if (!plan.some(area => distanceMeters(plan[0], area) > 5000)) return [base];
    return plan;
  }
  const conditionFamily = code => {
    const value = numberOrNull(code);
    if (value == null) return 'unknown';
    if (value === 0 || value === 1) return 'clear';
    if ([2, 3].includes(value)) return 'cloud';
    if ([45, 48].includes(value)) return 'fog';
    if (value >= 95) return 'storm';
    if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
    if (value >= 51 && value <= 82) return 'rain';
    return 'cloud';
  };
  const conditionLabel = code => numberOrNull(code) == null ? 'Conditions unavailable' : CONDITION_LABELS[Number(code)] || 'Mixed conditions';
  const conditionIcon = code => CONDITION_ICONS[conditionFamily(code)] || '?';
  const conditionRank = code => {
    const family = conditionFamily(code);
    return {clear: 0, cloud: 1, fog: 2, rain: 3, snow: 4, storm: 5}[family] ?? 1;
  };
  const dominantCondition = codes => {
    const counts = new Map();
    codes.map(value => integer(value, 0, 999)).filter(value => value != null).forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts.entries()].sort((first, second) => conditionRank(second[0]) - conditionRank(first[0]) || second[1] - first[1])[0]?.[0] ?? 2;
  };
  function moonPhase(timestamp) {
    const epoch = Date.UTC(2000, 0, 6, 18, 14, 0);
    const synodicDays = 29.530588853;
    const days = (Number(timestamp) - epoch) / 86400000;
    const phase = ((days / synodicDays) % 1 + 1) % 1;
    const index = Math.floor((phase * 8) + 0.5) % 8;
    const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
    const icons = ['●', '◔', '◐', '◕', '○', '◕', '◑', '◔'];
    const illuminationPercent = Math.round((1 - Math.cos(phase * Math.PI * 2)) / 2 * 100);
    return {phase: Number(phase.toFixed(5)), name: names[index], illuminationPercent, icon: icons[index]};
  }
  const routeLocalDate = (timestamp, timezone, utcOffsetSeconds = 0) => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit'}).formatToParts(new Date(timestamp));
      return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
    } catch (_) { return utcDate(timestamp + Number(utcOffsetSeconds || 0) * 1000); }
  };
  const dailyOverlap = (daily, startedAt, endedAt, utcOffsetSeconds = 0, timezone = 'UTC') => {
    const sunrises = Array.isArray(daily?.sunrise) ? daily.sunrise : [];
    const sunsets = Array.isArray(daily?.sunset) ? daily.sunset : [];
    let secondsDuringRoute = 0;
    const routeSunrises = [], routeSunsets = [], routeDaylight = [];
    for (let index = 0; index < Math.min(sunrises.length, sunsets.length); index += 1) {
      const sunrise = localTimestamp(sunrises[index], utcOffsetSeconds);
      const sunset = localTimestamp(sunsets[index], utcOffsetSeconds);
      if (sunrise == null || sunset == null || sunset <= sunrise) continue;
      // Fetch padding must not inflate the daylight total or change the displayed sunrise.
      const day = routeLocalDate(sunrise, timezone, utcOffsetSeconds);
      if (day < routeLocalDate(startedAt, timezone, utcOffsetSeconds) || day > routeLocalDate(endedAt - 1, timezone, utcOffsetSeconds)) continue;
      routeSunrises.push(sunrise); routeSunsets.push(sunset);
      routeDaylight.push(numberOrNull(daily?.daylight_duration?.[index]));
      secondsDuringRoute += Math.max(0, Math.min(endedAt, sunset) - Math.max(startedAt, sunrise)) / 1000;
    }
    const totalSeconds = sum(routeDaylight);
    const routeSeconds = Math.max(60, (endedAt - startedAt) / 1000);
    return {
      secondsDuringRoute: Math.round(secondsDuringRoute),
      percentOfRoute: Math.round(clamp(secondsDuringRoute / routeSeconds * 100, 0, 100)),
      sunrise: routeSunrises[0] ?? null,
      sunset: routeSunsets.at(-1) ?? null,
      totalSeconds: Math.round(totalSeconds || 0)
    };
  };
  const closestObservation = (samples, target) => samples.reduce((best, sample) => !best || Math.abs(sample.at - target) < Math.abs(best.at - target) ? sample : best, null);
  const overlapMs = (start, end, window) => Math.max(0, Math.min(end, window.endedAt) - Math.max(start, window.startedAt));
  const periodLabel = period => ({rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms', fog: 'Fog'})[period.family] || conditionLabel(period.conditionCode);
  const hasFullCoverage = raw => numberOrNull(raw?.coverage?.conditionPercent) === 100 && numberOrNull(raw?.coverage?.precipitationPercent) === 100 && !(raw?.coverage?.conditionMissingMinutes > 0) && !(raw?.coverage?.precipitationMissingMinutes > 0);
  const validConditionCode = value => {
    const code = numberOrNull(value);
    return code != null && Object.hasOwn(CONDITION_LABELS, code) ? code : null;
  };
  // Total precipitation includes convective showers, while rain alone does not.
  // Even a small non-zero amount is wet evidence; do not erase trace showers.
  const wetCode = sample => sample?.snowfallCm > 0 ? 71 : sample?.rainMm > 0 || sample?.precipitationMm > 0 && !(sample?.snowfallCm > 0) ? 61 : null;
  function chronologicalPeriods(observations, accumulations, window) {
    const boundaries = [...new Set([window.startedAt, window.endedAt, ...observations.flatMap(sample => [sample.at, sample.at + HOUR_MS]), ...accumulations.flatMap(sample => [sample.at - HOUR_MS, sample.at])])].filter(at => at >= window.startedAt && at <= window.endedAt).sort((a, b) => a - b);
    const periods = [];
    for (let index = 0; index < boundaries.length - 1; index++) {
      const startAt = boundaries[index], endAt = boundaries[index + 1], midpoint = (startAt + endAt) / 2;
      const observation = observations.find(sample => sample.at <= midpoint && sample.at + HOUR_MS > midpoint);
      const accumulation = accumulations.find(sample => sample.at - HOUR_MS <= midpoint && sample.at > midpoint);
      let code = observation?.conditionCode ?? null;
      const wet = wetCode(accumulation);
      if (wet != null && conditionRank(wet) > conditionRank(code)) code = wet;
      if (code == null) continue;
      const precipitationMm = accumulation?.precipitationMm == null ? null : accumulation.precipitationMm * (endAt - startAt) / HOUR_MS;
      const next = {startAt, endAt, family: conditionFamily(code), conditionCode: code, temperatureMinC: observation?.temperatureC ?? null, temperatureMaxC: observation?.temperatureC ?? null, precipitationMm};
      const previous = periods.at(-1);
      if (previous && previous.conditionCode === code && previous.endAt === startAt) {
        previous.endAt = endAt;
        const temperatures = [previous.temperatureMinC, previous.temperatureMaxC, next.temperatureMinC].filter(value => value != null);
        previous.temperatureMinC = temperatures.length ? Math.min(...temperatures) : null;
        previous.temperatureMaxC = temperatures.length ? Math.max(...temperatures) : null;
        previous.precipitationMm = previous.precipitationMm == null || precipitationMm == null ? null : previous.precipitationMm + precipitationMm;
      } else periods.push(next);
    }
    return periods.slice(0, 96);
  }
  function weatherSummary(raw) {
    const periods = Array.isArray(raw?.periods) ? raw.periods : [];
    if (periods.length) {
      const labels = periods.map(periodLabel).filter((label, index, list) => !index || label !== list[index - 1]);
      if (labels.length === 1) return labels[0] + (hasFullCoverage(raw) && periods[0].startAt === raw.coverage.startedAt && periods.at(-1).endAt === raw.coverage.endedAt && periods.every((period,index) => !index || period.startAt === periods[index-1].endAt) ? ' throughout the route' : ' in available hours');
      if (labels.length <= 5) return labels.map((label, index) => index ? label.toLowerCase() : label).join(' → ');
      const distinct = [...new Set(labels)];
      return 'Changing conditions · ' + distinct.join(', ').toLowerCase();
    }
    const events = Array.isArray(raw?.events) ? raw.events : [];
    if (!events.length) return conditionLabel(raw?.conditionCode);
    const hazards = events.filter(event => ['storm', 'snow', 'rain', 'fog'].includes(event.family)).sort((a, b) => conditionRank(b.conditionCode) - conditionRank(a.conditionCode));
    const sky = events.filter(event => ['clear', 'cloud'].includes(event.family)).sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
    const labels = hazards.slice(0, sky ? 2 : 3).map(event => ({storm: 'Thunderstorms', snow: 'Snow', rain: 'Rain', fog: 'Fog'})[event.family]);
    if (sky) labels.push(conditionLabel(sky.conditionCode));
    if (!labels.length) return conditionLabel(raw.conditionCode);
    return labels.map((label, index) => index ? label.toLowerCase() : label).join(' & ');
  }
  function summaryIcon(raw) {
    const families = new Set([...(raw?.periods || []), ...(raw?.events || [])].map(item => item.family));
    if (families.has('storm')) return families.size > 1 ? '⛈' : CONDITION_ICONS.storm;
    if (families.has('snow') && families.size > 1) return '🌨';
    if (families.has('rain') && families.has('clear')) return '🌦';
    if (families.has('rain')) return CONDITION_ICONS.rain;
    if (families.has('clear') && families.has('cloud')) return '🌤';
    return conditionIcon(raw?.conditionCode);
  }
  function summarizeResponse(saved, raw, sourceKind, coarse) {
    const window = routeWindow(saved);
    if (!window || !raw || typeof raw !== 'object' || !raw.hourly || !Array.isArray(raw.hourly.time)) throw new Error('Weather response was incomplete');
    const routeSamples = [];
    const seenTimes = new Set();
    raw.hourly.time.forEach((time, index) => {
      const at = localTimestamp(time, raw.utc_offset_seconds);
      if (at == null || seenTimes.has(at) || at < window.startedAt - HOUR_MS || at > window.endedAt + HOUR_MS) return;
      seenTimes.add(at);
      routeSamples.push({
        at,
        temperatureC: bounded(raw.hourly.temperature_2m?.[index], -100, 70),
        apparentC: bounded(raw.hourly.apparent_temperature?.[index], -100, 70),
        humidityPercent: bounded(raw.hourly.relative_humidity_2m?.[index], 0, 100),
        precipitationMm: bounded(raw.hourly.precipitation?.[index], 0, 1000),
        rainMm: bounded(raw.hourly.rain?.[index], 0, 1000),
        snowfallCm: bounded(raw.hourly.snowfall?.[index], 0, 1000),
        conditionCode: validConditionCode(raw.hourly.weather_code?.[index]),
        cloudCoverPercent: bounded(raw.hourly.cloud_cover?.[index], 0, 100),
        windKmh: bounded(raw.hourly.wind_speed_10m?.[index], 0, 500),
        gustKmh: bounded(raw.hourly.wind_gusts_10m?.[index], 0, 600),
        isDay: integer(raw.hourly.is_day?.[index], 0, 1)
      });
    });
    routeSamples.sort((a, b) => a.at - b.at);
    // Instantaneous conditions represent the following hourly interval. Precipitation
    // and gusts represent the preceding hour; keep their windows separate.
    const observations = routeSamples.filter(sample => overlapMs(sample.at, sample.at + HOUR_MS, window) > 0);
    const accumulationSamples = routeSamples.filter(sample => overlapMs(sample.at - HOUR_MS, sample.at, window) > 0);
    if (!observations.some(sample => sample.conditionCode != null || sample.temperatureC != null) && !accumulationSamples.some(sample => sample.precipitationMm != null)) throw weatherError('no-hours', 'No usable weather samples covered this route');
    const weightedMean = field => {
      const valid = observations.filter(sample => sample[field] != null);
      const duration = sum(valid.map(sample => overlapMs(sample.at, sample.at + HOUR_MS, window)));
      return duration ? sum(valid.map(sample => sample[field] * overlapMs(sample.at, sample.at + HOUR_MS, window))) / duration : null;
    };
    const accumulation = field => {
      const valid = accumulationSamples.filter(sample => sample[field] != null);
      return valid.length ? sum(valid.map(sample => sample[field] * overlapMs(sample.at - HOUR_MS, sample.at, window) / HOUR_MS)) : null;
    };
    const temperatures = observations.map(sample => sample.temperatureC).filter(value => value != null);
    const apparent = observations.map(sample => sample.apparentC).filter(value => value != null);
    const wind = observations.map(sample => sample.windKmh).filter(value => value != null);
    const gusts = accumulationSamples.map(sample => sample.gustKmh).filter(value => value != null);
    const midpoint = window.startedAt + (window.endedAt - window.startedAt) / 2;
    const timeline = [window.startedAt, midpoint, window.endedAt].map((at, index) => {
      const eligible = routeSamples.filter(sample => sample.at <= window.endedAt && (sample.conditionCode != null || sample.temperatureC != null));
      const sample = closestObservation(eligible, at);
      return sample ? {...sample, stage: ['START', 'MID-ROUTE', 'FINISH'][index]} : null;
    }).filter((sample, index, list) => sample && list.findIndex(item => item?.at === sample.at) === index);
    if (timeline.length === 2) timeline[1].stage = 'FINISH';
    const eventMap = new Map();
    const addEvent = (family, conditionCode, start, end) => {
      if (family === 'unknown') return;
      start = Math.max(start, window.startedAt); end = Math.min(end, window.endedAt);
      if (end <= start) return;
      let event = eventMap.get(family);
      if (!event) {event = {family, conditionCode, firstAt: start, lastAt: end, periods: [], codes: new Map()}; eventMap.set(family, event);}
      event.firstAt = Math.min(event.firstAt, start); event.lastAt = Math.max(event.lastAt, end);
      event.periods.push([start, end]);
      event.codes.set(conditionCode, (event.codes.get(conditionCode) || 0) + end - start);
    };
    observations.forEach(sample => addEvent(conditionFamily(sample.conditionCode), sample.conditionCode, sample.at, sample.at + HOUR_MS));
    accumulationSamples.forEach(sample => {
      const wet = wetCode(sample);
      if (wet != null) addEvent(conditionFamily(wet), wet, sample.at - HOUR_MS, sample.at);
    });
    const events = [...eventMap.values()].map(event => {
      const periods = event.periods.sort((a, b) => a[0] - b[0]);
      let duration = 0, previousEnd = 0;
      periods.forEach(([start, end]) => {duration += Math.max(0, end - Math.max(start, previousEnd)); previousEnd = Math.max(previousEnd, end);});
      return {family: event.family, conditionCode: [...event.codes.entries()].sort((a, b) => b[1] - a[1])[0][0], firstAt: event.firstAt, lastAt: event.lastAt, durationMinutes: Math.round(duration / 60000)};
    }).sort((a, b) => a.firstAt - b.firstAt);
    const routeMs = window.endedAt - window.startedAt;
    const conditionCoverageMs = sum(observations.filter(sample => sample.conditionCode != null).map(sample => overlapMs(sample.at, sample.at + HOUR_MS, window)));
    const precipitationCoverageMs = sum(accumulationSamples.filter(sample => sample.precipitationMm != null).map(sample => overlapMs(sample.at - HOUR_MS, sample.at, window)));
    return normalize({
      version: VERSION,
      fingerprint: fingerprint(saved, coarse),
      capturedAt: Date.now(),
      source: {provider: 'Open-Meteo', kind: sourceKind, modeled: true, license: 'CC BY 4.0'},
      timezone: text(raw.timezone || 'UTC', 64),
      coverage: {startedAt: window.startedAt, endedAt: window.endedAt, hourlySamples: observations.length, pointsUsed: coarse.pointsUsed, locationPrecisionDegrees: PRECISION_DEGREES, conditionPercent: Math.round(clamp(conditionCoverageMs / routeMs * 100, 0, 100)), precipitationPercent: Math.round(clamp(precipitationCoverageMs / routeMs * 100, 0, 100)), conditionMissingMinutes: Math.ceil(Math.max(0, routeMs - conditionCoverageMs) / 60000), precipitationMissingMinutes: Math.ceil(Math.max(0, routeMs - precipitationCoverageMs) / 60000)},
      conditionCode: events.length ? dominantCondition(events.map(event => event.conditionCode)) : null,
      temperature: {startC: timeline[0]?.temperatureC, endC: timeline.at(-1)?.temperatureC, meanC: weightedMean('temperatureC'), minC: temperatures.length ? Math.min(...temperatures) : null, maxC: temperatures.length ? Math.max(...temperatures) : null},
      apparentTemperature: {meanC: weightedMean('apparentC'), minC: apparent.length ? Math.min(...apparent) : null, maxC: apparent.length ? Math.max(...apparent) : null},
      precipitationMm: accumulation('precipitationMm'), rainMm: accumulation('rainMm'), snowfallCm: accumulation('snowfallCm'),
      humidityPercent: weightedMean('humidityPercent'), cloudCoverPercent: weightedMean('cloudCoverPercent'),
      wind: {meanKmh: weightedMean('windKmh'), maxKmh: wind.length ? Math.max(...wind) : null, gustMaxKmh: gusts.length ? Math.max(...gusts) : null},
      daylight: dailyOverlap(raw.daily, window.startedAt, window.endedAt, raw.utc_offset_seconds, raw.timezone),
      moon: moonPhase(midpoint),
      events, timeline, periods: chronologicalPeriods(observations, accumulationSamples, window), observation: saved?.atmosphere?.observation
    });
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![1, 2, 3, VERSION].includes(Number(raw.version))) return null;
    const source = raw.source && typeof raw.source === 'object' ? raw.source : {};
    if (text(source.provider, 40) !== 'Open-Meteo') return null;
    const coverageRaw = raw.coverage && typeof raw.coverage === 'object' ? raw.coverage : {};
    const temperatureRaw = raw.temperature && typeof raw.temperature === 'object' ? raw.temperature : {};
    const apparentRaw = raw.apparentTemperature && typeof raw.apparentTemperature === 'object' ? raw.apparentTemperature : {};
    const windRaw = raw.wind && typeof raw.wind === 'object' ? raw.wind : {};
    const daylightRaw = raw.daylight && typeof raw.daylight === 'object' ? raw.daylight : {};
    const moonRaw = raw.moon && typeof raw.moon === 'object' ? raw.moon : {};
    const fingerprintValue = /^fnv1a-[a-f0-9]{8}$/i.test(String(raw.fingerprint || '')) ? String(raw.fingerprint).toLowerCase() : '';
    const capturedAt = integer(raw.capturedAt, 1, 4102444800000);
    const conditionCode = integer(raw.conditionCode, 0, 999);
    const startedAt = integer(coverageRaw.startedAt, 1, 4102444800000);
    const endedAt = integer(coverageRaw.endedAt, 1, 4102444800000);
    if (!fingerprintValue || capturedAt == null || startedAt == null || endedAt == null || endedAt < startedAt) return null;
    const normalizeTemperature = value => bounded(value, -100, 70);
    const timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).slice(0, 3).map(sample => {
      if (!sample || typeof sample !== 'object') return null;
      const at = integer(sample.at, startedAt - 86400000, endedAt + 86400000);
      if (at == null) return null;
      return {
        at, stage: ['START', 'MID-ROUTE', 'FINISH'].includes(sample.stage) ? sample.stage : '',
        temperatureC: normalizeTemperature(sample.temperatureC), apparentC: normalizeTemperature(sample.apparentC),
        humidityPercent: bounded(sample.humidityPercent, 0, 100), precipitationMm: bounded(sample.precipitationMm, 0, 1000),
        rainMm: bounded(sample.rainMm, 0, 1000), snowfallCm: bounded(sample.snowfallCm, 0, 1000),
        conditionCode: integer(sample.conditionCode, 0, 999), cloudCoverPercent: bounded(sample.cloudCoverPercent, 0, 100),
        windKmh: bounded(sample.windKmh, 0, 500), gustKmh: bounded(sample.gustKmh, 0, 600), isDay: integer(sample.isDay, 0, 1)
      };
    }).filter(Boolean);
    const events = (Array.isArray(raw.events) ? raw.events : []).slice(0, 6).map(event => {
      if (!event || !['clear', 'cloud', 'fog', 'rain', 'snow', 'storm'].includes(event.family)) return null;
      const code = integer(event.conditionCode, 0, 999), firstAt = integer(event.firstAt, startedAt, endedAt), lastAt = integer(event.lastAt, startedAt, endedAt);
      if (code == null || conditionFamily(code) !== event.family || firstAt == null || lastAt == null || lastAt < firstAt) return null;
      return {family: event.family, conditionCode: code, firstAt, lastAt, durationMinutes: integer(event.durationMinutes, 0, Math.ceil((endedAt - startedAt) / 60000)) || 0};
    }).filter(Boolean);
    const phase = bounded(moonRaw.phase, 0, 1);
    let periodEnd = startedAt;
    const periods = (Array.isArray(raw.periods) ? raw.periods : []).slice(0, 96).map(period => {
      if (!period || typeof period !== 'object') return null;
      const startAt = integer(period.startAt, startedAt, endedAt), endAt = integer(period.endAt, startedAt, endedAt), code = integer(period.conditionCode, 0, 999);
      if (startAt == null || endAt == null || startAt < periodEnd || endAt <= startAt || code == null || !CONDITION_LABELS[code] || conditionFamily(code) !== period.family) return null;
      periodEnd = endAt;
      return {startAt, endAt, family: conditionFamily(code), conditionCode: code, temperatureMinC: normalizeTemperature(period.temperatureMinC), temperatureMaxC: normalizeTemperature(period.temperatureMaxC), precipitationMm: bounded(period.precipitationMm, 0, 5000)};
    }).filter(Boolean);
    return {
      version: Number(raw.version),
      fingerprint: fingerprintValue,
      capturedAt,
      source: {provider: 'Open-Meteo', kind: ['forecast', 'historical-forecast', 'archive'].includes(source.kind) ? source.kind : 'forecast', modeled: true, license: 'CC BY 4.0'},
      timezone: text(raw.timezone || 'auto', 64),
      coverage: {startedAt, endedAt, hourlySamples: integer(coverageRaw.hourlySamples, 1, 240) || timeline.length || 1, pointsUsed: integer(coverageRaw.pointsUsed, 1, 5000) || 1, locationPrecisionDegrees: PRECISION_DEGREES, locationCount: integer(coverageRaw.locationCount, 1, 3) || 1, availableLocationCount: integer(coverageRaw.availableLocationCount, 1, 3) || integer(coverageRaw.locationCount, 1, 3) || 1, conditionPercent: integer(coverageRaw.conditionPercent, 0, 100), precipitationPercent: integer(coverageRaw.precipitationPercent, 0, 100), conditionMissingMinutes: integer(coverageRaw.conditionMissingMinutes, 0, Math.ceil((endedAt - startedAt) / 60000)), precipitationMissingMinutes: integer(coverageRaw.precipitationMissingMinutes, 0, Math.ceil((endedAt - startedAt) / 60000))},
      conditionCode,
      temperature: {startC: normalizeTemperature(temperatureRaw.startC), endC: normalizeTemperature(temperatureRaw.endC), meanC: normalizeTemperature(temperatureRaw.meanC), minC: normalizeTemperature(temperatureRaw.minC), maxC: normalizeTemperature(temperatureRaw.maxC)},
      apparentTemperature: {meanC: normalizeTemperature(apparentRaw.meanC), minC: normalizeTemperature(apparentRaw.minC), maxC: normalizeTemperature(apparentRaw.maxC)},
      precipitationMm: bounded(raw.precipitationMm, 0, 5000),
      rainMm: bounded(raw.rainMm, 0, 5000),
      snowfallCm: bounded(raw.snowfallCm, 0, 5000),
      humidityPercent: bounded(raw.humidityPercent, 0, 100),
      cloudCoverPercent: bounded(raw.cloudCoverPercent, 0, 100),
      wind: {meanKmh: bounded(windRaw.meanKmh, 0, 500), maxKmh: bounded(windRaw.maxKmh, 0, 500), gustMaxKmh: bounded(windRaw.gustMaxKmh, 0, 600)},
      daylight: {secondsDuringRoute: integer(daylightRaw.secondsDuringRoute, 0, 172800) || 0, percentOfRoute: integer(daylightRaw.percentOfRoute, 0, 100) || 0, sunrise: integer(daylightRaw.sunrise, 1, 4102444800000), sunset: integer(daylightRaw.sunset, 1, 4102444800000), totalSeconds: integer(daylightRaw.totalSeconds, 0, 172800) || 0},
      moon: {phase: phase == null ? moonPhase(startedAt + (endedAt - startedAt) / 2).phase : phase, name: text(moonRaw.name || moonPhase(startedAt).name, 40), illuminationPercent: integer(moonRaw.illuminationPercent, 0, 100) || 0, icon: text(moonRaw.icon || '○', 4)},
      events, timeline, periods, observation: normalizeObservation(raw.observation)
    };
  }
  function endpointFor(saved) {
    const startedAt = Number(saved?.startedAt);
    const ageDays = (Date.now() - startedAt) / 86400000;
    if (ageDays <= 5) return {url: FORECAST_ENDPOINT, kind: 'forecast'};
    if (new Date(startedAt).getUTCFullYear() >= 2022) return {url: HISTORICAL_ENDPOINT, kind: 'historical-forecast'};
    return {url: ARCHIVE_ENDPOINT, kind: 'archive'};
  }
  const OBSERVED_CONDITIONS = Object.freeze({rain: 'Rain', snow: 'Snow', storm: 'Thunderstorms', cloud: 'Cloudy', clear: 'Clear', fog: 'Fog'});
  const OBSERVED_PERIODS = Object.freeze({all: 'Throughout the route', morning: 'In the morning', afternoon: 'In the afternoon', evening: 'In the evening', start: 'Near the start', middle: 'Mid-route', finish: 'Near the finish'});
  function normalizeObservation(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Object.hasOwn(OBSERVED_CONDITIONS, raw.condition) || !Object.hasOwn(OBSERVED_PERIODS, raw.period)) return null;
    const recordedAt = integer(raw.recordedAt, 1, 4102444800000);
    if (recordedAt == null) return null;
    return {condition: raw.condition, period: raw.period, note: text(raw.note, 160), recordedAt};
  }
  function withObservation(raw, observation) {
    const normalized = normalize(raw);
    return normalized ? {...normalized, observation: normalizeObservation(observation)} : null;
  }
  function observationLabel(raw) {
    const observation = normalizeObservation(raw);
    return observation ? `${OBSERVED_CONDITIONS[observation.condition]} ${OBSERVED_PERIODS[observation.period].toLowerCase()}` : '';
  }
  function observationEditor(saved) {
    const observation = normalizeObservation(saved?.atmosphere?.observation), routeId = escapeHtml(saved?.id || '');
    return `<details class="atmosphere-observation-editor"><summary>Weather was different?</summary><form data-atmosphere-observation data-route-id="${routeId}"><p>Add what you experienced. Your observation stays separate from the weather estimate.</p><div class="atmosphere-observation-fields"><label>Weather<select name="condition" aria-label="Weather">${Object.entries(OBSERVED_CONDITIONS).map(([value, label]) => `<option value="${value}"${observation?.condition === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>When<select name="period" aria-label="When">${Object.entries(OBSERVED_PERIODS).map(([value, label]) => `<option value="${value}"${observation?.period === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label></div><label>Optional note<input name="note" aria-label="Optional note" type="text" maxlength="160" value="${escapeHtml(observation?.note || '')}" placeholder="Heavy showers before lunch"></label><div class="atmosphere-observation-actions"><button type="submit">Save observation</button>${observation ? `<button type="button" data-atmosphere-action="remove-observation" data-route-id="${routeId}">Remove observation</button>` : ''}</div></form></details>`;
  }
  function weatherError(code, message) { const error = new Error(message); error.weatherCode = code; return error; }
  function errorMessage(error) {
    if (error?.name === 'AbortError' || error?.name === 'TimeoutError') return 'Weather lookup timed out. Retry when the connection is stronger; your saved route is unchanged.';
    if (error?.weatherCode === 'rate-limit') return 'The weather service is busy. Try again later; your saved route is unchanged.';
    if (error?.weatherCode === 'no-hours') return 'Hourly weather is not available for these route hours yet. Try again later; missing hours are not dry weather.';
    if (error?.weatherCode === 'location') return 'A trustworthy GPS trail or mapped stop is needed to find weather for this route.';
    return 'Weather is unavailable right now. Check the connection and retry; your saved route and any previous report are unchanged.';
  }
  async function fetchForRoute(saved, {signal, fetchImpl = root.fetch} = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('Weather lookup is unavailable');
    const coarse = coarseRoutePoint(saved);
    const window = routeWindow(saved);
    if (!coarse || !window) throw weatherError('location', 'A trustworthy saved route location is required');
    const endpoint = endpointFor(saved), plan = routeLocationPlan(saved);
    const parameters = new URLSearchParams({
      latitude: coarse.lat.toFixed(2), longitude: coarse.lng.toFixed(2),
      // Padding also covers routes viewed later from another timezone and the final rain interval.
      start_date: utcDate(window.startedAt - 86400000), end_date: utcDate(window.endedAt + 86400000),
      hourly: HOURLY_FIELDS.join(','), daily: DAILY_FIELDS.join(','),
      timezone: 'auto', timeformat: 'unixtime', temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    const lookup = async selected => {
      const areas = [...new Map(plan.map(area => [`${area.lat.toFixed(2)},${area.lng.toFixed(2)}`, area])).values()];
      const settled = await Promise.allSettled(areas.map(async area => {
        const query = new URLSearchParams(parameters); query.set('latitude', area.lat.toFixed(2)); query.set('longitude', area.lng.toFixed(2));
        const response = await fetchImpl(`${selected.url}?${query}`, {signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
        if (!response?.ok) throw weatherError(response?.status === 429 ? 'rate-limit' : 'service', `Weather service returned ${response?.status || 'an error'}`);
        const raw = await response.json();
        if (!Array.isArray(raw?.hourly?.time) || !raw.hourly.time.length) throw weatherError('no-hours', 'Weather response was incomplete');
        return {area, raw, byTime: new Map(raw.hourly.time.map((time, index) => [localTimestamp(time, raw.utc_offset_seconds), index]))};
      }));
      if (signal?.aborted) throw signal.reason || Object.assign(new Error('Weather request was canceled'), {name:'AbortError'});
      const responses = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
      if (!responses.length) throw settled.find(item => item.status === 'rejected')?.reason || weatherError('no-hours', 'No route weather was returned');
      let raw = responses[0].raw;
      // A failed area leaves its own hours empty. Never substitute another area's
      // sunny weather, or discard the useful hours from successful requests.
      if (areas.length > 1) {
        const times = [...new Set(responses.flatMap(response => [...response.byTime.keys()]))].filter(at => at != null).sort((a, b) => a - b);
        const hourly = {time: times.map(at => at / 1000)};
        for (const field of HOURLY_FIELDS) {
          const accumulated = ['precipitation', 'rain', 'snowfall', 'wind_gusts_10m'].includes(field);
          hourly[field] = times.map(at => {
            const sampleAt = clamp(at + (accumulated ? -HOUR_MS / 2 : HOUR_MS / 2), window.startedAt, window.endedAt - 1);
            const area = plan.find(item => sampleAt >= item.start && sampleAt < item.end) || plan.at(-1);
            const response = responses.find(item => item.area.lat === area.lat && item.area.lng === area.lng);
            const index = response?.byTime.get(at);
            return index == null ? null : response.raw.hourly[field]?.[index] ?? null;
          });
        }
        raw = {...raw, hourly};
      }
      const result = summarizeResponse(saved, raw, selected.kind, coarse);
      result.coverage.locationCount = areas.length;
      result.coverage.availableLocationCount = responses.length;
      return result;
    };
    try { return await lookup(endpoint); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || error?.weatherCode === 'rate-limit' || endpoint.kind !== 'historical-forecast') throw error;
      // Historical model coverage varies by region and date; older routes can use reanalysis.
      return lookup({url: ARCHIVE_ENDPOINT, kind: 'archive'});
    }
  }
  function isCurrent(saved, atmosphere = normalize(saved?.atmosphere)) {
    if (!atmosphere) return false;
    const current = fingerprint(saved);
    return !!current && current === atmosphere.fingerprint;
  }
  function needsRefresh(saved, now = Date.now()) {
    const atmosphere = normalize(saved?.atmosphere);
    if (!atmosphere || atmosphere.version < VERSION || !isCurrent(saved, atmosphere)) return true;
    const ageDays = (now - Number(saved?.startedAt)) / 86400000, sinceCapture = now - atmosphere.capturedAt;
    if (!hasFullCoverage(atmosphere) && sinceCapture >= refreshDelayMs(atmosphere)) return true;
    if (atmosphere.source.kind !== 'forecast') return false;
    if (ageDays > 5) return true;
    // One next-day refinement replaces an immediate post-route forecast. A new
    // report captured a day after finish is stable until historical data is used.
    return now - Number(saved?.endedAt) >= 24 * HOUR_MS && atmosphere.capturedAt - Number(saved?.endedAt) < 24 * HOUR_MS && sinceCapture >= 12 * HOUR_MS;
  }
  function refreshDelayMs(raw) { return hasFullCoverage(raw) ? 6 * HOUR_MS : HOUR_MS / 2; }
  const toFahrenheit = celsius => celsius == null ? null : celsius * 9 / 5 + 32;
  const temperatureValue = (celsius, units) => units === 'kilometers' ? celsius : toFahrenheit(celsius);
  const temperatureText = (celsius, units, digits = 0) => {
    const value = temperatureValue(celsius, units);
    return value == null ? '—' : `${value.toFixed(digits)}°${units === 'kilometers' ? 'C' : 'F'}`;
  };
  const windText = (kmh, units) => kmh == null ? '—' : units === 'kilometers' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh * 0.621371)} mph`;
  const precipitationText = (millimeters, units) => millimeters == null ? '—' : units === 'kilometers' ? millimeters > 0 && millimeters < .1 ? '<0.1 mm' : `${millimeters.toFixed(millimeters < 10 ? 1 : 0)} mm` : millimeters > 0 && millimeters < .254 ? '<0.01 in' : `${(millimeters / 25.4).toFixed(millimeters < 2.54 ? 2 : 1)} in`;
  const clockText = (timestamp, timezone) => {
    if (!timestamp) return '—';
    try { return new Date(timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', ...(timezone && timezone !== 'auto' ? {timeZone: timezone} : {})}); }
    catch (_) { return new Date(timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}); }
  };
  const durationText = seconds => {
    const totalMinutes = Math.max(0, Math.round(Number(seconds || 0) / 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  function historyChip(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `<span class="history-atmosphere-chip"><i aria-hidden="true">${escapeHtml(summaryIcon(atmosphere))}</i>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))} · ${escapeHtml(weatherSummary(atmosphere))}${atmosphere.observation ? ' · Your observation saved' : ''}</span>`;
  }
  function calendarSummary(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return null;
    return {icon: summaryIcon(atmosphere), label: weatherSummary(atmosphere), temperatureText: `${temperatureText(atmosphere.temperature.minC, units)}–${temperatureText(atmosphere.temperature.maxC, units)}`, minC: atmosphere.temperature.minC, maxC: atmosphere.temperature.maxC, partial: !hasFullCoverage(atmosphere), observation: atmosphere.observation};
  }
  function shortPhrase(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `${weatherSummary(atmosphere)}, ${temperatureText(atmosphere.temperature.meanC, units)}, ${windText(atmosphere.wind.maxKmh, units)} max wind${!hasFullCoverage(atmosphere) ? ' (partial modeled coverage)' : ' (modeled)'}${atmosphere.observation ? ` · Driver observation: ${observationLabel(atmosphere.observation)}` : ''}`;
  }
  const observationRenderKeys = new WeakMap();
  function preserveObservationDraft(container, saved) {
    const key = `${saved.id || ''}|${JSON.stringify(normalizeObservation(saved.atmosphere?.observation))}`;
    const editor = observationRenderKeys.get(container) === key ? container.querySelector?.('.atmosphere-observation-editor') : null;
    const form = editor?.querySelector('form'), active = container.ownerDocument?.activeElement;
    const fields = form ? ['condition', 'period', 'note'].map(name => ({name, value: form.elements.namedItem(name)?.value})) : [];
    const focusedName = form?.contains(active) ? active.name : '', selection = focusedName === 'note' ? [active.selectionStart, active.selectionEnd] : null;
    const wasOpen = !!editor?.open;
    observationRenderKeys.set(container, key);
    return () => {
      // A background refresh may replace the card while an observation is being
      // entered. Preserve that draft, but never revive a saved/removed old value.
      const nextEditor = fields.length ? container.querySelector?.('.atmosphere-observation-editor') : null;
      const nextForm = nextEditor?.querySelector('form');
      if (!nextForm) return;
      nextEditor.open = wasOpen;
      fields.forEach(({name, value}) => { const field = nextForm.elements.namedItem(name); if (field && value != null) field.value = value; });
      const focused = focusedName ? nextForm.elements.namedItem(focusedName) : null;
      focused?.focus({preventScroll: true});
      if (focused && selection && selection.every(value => value != null)) focused.setSelectionRange?.(...selection);
    };
  }
  function renderCard(container, saved, {units = 'miles', state = 'idle', message = ''} = {}) {
    if (!container || !saved) return;
    const restoreObservationDraft = preserveObservationDraft(container, saved);
    const routeId = escapeHtml(String(saved.id || ''));
    const atmosphere = normalize(saved.atmosphere);
    container.hidden = false;
    container.dataset.state = ['loading', 'error', 'off'].includes(state) ? state : atmosphere ? hasFullCoverage(atmosphere) ? 'ready' : 'partial' : 'pending';
    if (!atmosphere) {
      const title = state === 'loading' ? 'Building full-route weather…' : state === 'off' ? 'Automatic atmosphere is off' : state === 'error' ? 'Weather unavailable' : 'Weather report pending';
      const detail = message || (state === 'loading' ? 'Reading every route hour across up to three rounded areas.' : state === 'off' ? 'Enable it in Settings to add modeled conditions after future routes.' : 'The report will describe your route hours, including changing conditions. Missing weather is never counted as dry.');
      container.innerHTML = `<div class="atmosphere-empty-art" aria-hidden="true"><i></i><i></i><span>◒</span></div><div class="atmosphere-empty-copy"><p class="eyebrow">ROUTE ATMOSPHERE</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p><button type="button" data-atmosphere-action="build" data-route-id="${routeId}"${state === 'loading' || state === 'off' ? ' disabled' : ''}>${state === 'loading' ? 'Building…' : 'Build atmosphere'}</button><small>Approximate modeled conditions near the route · review only while parked.</small></div>`;
      return;
    }
    const timeline = atmosphere.timeline.map((sample, index) => `<div><span>${escapeHtml(sample.stage || (atmosphere.timeline.length === 2 ? ['START', 'FINISH'][index] : ['START', 'MID-ROUTE', 'FINISH'][index]) || 'ROUTE')}</span><b>${escapeHtml(temperatureText(sample.temperatureC, units))}</b><small>${escapeHtml(clockText(sample.at, atmosphere.timezone))} · ${escapeHtml(conditionLabel(sample.conditionCode))}</small></div>`).join('');
    const partialCoverage = !hasFullCoverage(atmosphere);
    const coverageLine = atmosphere.version < VERSION ? 'Earlier report · refresh to check the full route again' : (partialCoverage ? 'Partial hourly coverage' : 'Across the whole route') + ' · ' + clockText(atmosphere.coverage.startedAt, atmosphere.timezone) + '–' + clockText(atmosphere.coverage.endedAt, atmosphere.timezone);
    const rainEvent = atmosphere.events.find(event => event.family === 'rain');
    const precipitationDetail = atmosphere.precipitationMm == null ? 'Precipitation data unavailable' : atmosphere.coverage.precipitationPercent !== 100 || atmosphere.coverage.precipitationMissingMinutes > 0 ? 'Available-hour estimate · coverage incomplete' : rainEvent ? durationText(rainEvent.durationMinutes * 60) + ' with rain modeled' : atmosphere.precipitationMm > 0 ? 'Estimated across route hours' : atmosphere.coverage.precipitationPercent !== 100 || atmosphere.coverage.precipitationMissingMinutes > 0 ? 'No precipitation in available hours · coverage incomplete' : 'No modeled precipitation';
    const routeDaylight = !atmosphere.daylight.sunrise && !atmosphere.daylight.sunset ? 'Daylight unavailable' : atmosphere.daylight.secondsDuringRoute ? `${durationText(atmosphere.daylight.secondsDuringRoute)} · ${atmosphere.daylight.percentOfRoute}% of route` : 'Mostly after dark';
    const snow = atmosphere.snowfallCm > 0.05 ? ` · ${units === 'kilometers' ? `${atmosphere.snowfallCm.toFixed(1)} cm snow` : `${(atmosphere.snowfallCm / 2.54).toFixed(1)} in snow`}` : '';
    const shownPeriods = [];
    let coveredUntil = atmosphere.coverage.startedAt;
    for (const period of atmosphere.periods) {
      if (period.startAt > coveredUntil) shownPeriods.push({family:'unknown', startAt:coveredUntil, endAt:period.startAt});
      shownPeriods.push(period); coveredUntil = period.endAt;
    }
    if (atmosphere.version >= VERSION && coveredUntil < atmosphere.coverage.endedAt) shownPeriods.push({family:'unknown', startAt:coveredUntil, endAt:atmosphere.coverage.endedAt});
    const periods = shownPeriods.map(period => period.family === 'unknown' ? `<li data-weather="unknown"><span aria-hidden="true">?</span><div><b>Conditions unavailable</b><small>${escapeHtml(clockText(period.startAt, atmosphere.timezone))}–${escapeHtml(clockText(period.endAt, atmosphere.timezone))} · missing hours</small></div></li>` : `<li data-weather="${escapeHtml(period.family)}"><span aria-hidden="true">${escapeHtml(conditionIcon(period.conditionCode))}</span><div><b>${escapeHtml(periodLabel(period))}</b><small>${escapeHtml(clockText(period.startAt, atmosphere.timezone))}–${escapeHtml(clockText(period.endAt, atmosphere.timezone))}</small></div><strong>${escapeHtml(temperatureText(period.temperatureMinC, units))}${period.temperatureMaxC != null && temperatureText(period.temperatureMaxC, units) !== temperatureText(period.temperatureMinC, units) ? `–${escapeHtml(temperatureText(period.temperatureMaxC, units))}` : ''}</strong></li>`).join('');
    const observation = atmosphere.observation ? `<aside class="atmosphere-driver-observation"><b>Your observation · ${escapeHtml(observationLabel(atmosphere.observation))}</b>${atmosphere.observation.note ? `<p>${escapeHtml(atmosphere.observation.note)}</p>` : ''}<small>Driver reported · modeled totals remain separate</small></aside>` : '';
    const provenance = `<p class="atmosphere-coverage-note">${atmosphere.coverage.locationCount > 1 ? `${atmosphere.coverage.locationCount} rounded areas matched to route hours` : 'One rounded route area'} · ${atmosphere.source.kind === 'forecast' ? 'Recent model estimate' : atmosphere.source.kind === 'historical-forecast' ? 'Historical hourly model' : 'Historical weather model'}${atmosphere.coverage.availableLocationCount < atmosphere.coverage.locationCount ? ` · ${atmosphere.coverage.locationCount - atmosphere.coverage.availableLocationCount} area lookup unavailable` : ''}</p>`;
    const coverageNotice = partialCoverage ? `<aside class="atmosphere-coverage-warning" role="status"><b>Partial weather report</b><p>Conditions cover ${atmosphere.coverage.conditionPercent ?? 0}% of route hours · precipitation covers ${atmosphere.coverage.precipitationPercent ?? 0}%. Missing hours are unknown; a dry available hour cannot describe the whole day.</p></aside>` : '';
    const refreshNotice = atmosphere.version < VERSION ? '<p class="atmosphere-refresh-status">This earlier report is kept while a full-route update is pending. Use Refresh day to try now.</p>' : '';
    container.innerHTML = `<div class="atmosphere-hero"><div class="atmosphere-condition-art ${escapeHtml(conditionFamily(atmosphere.conditionCode))}" aria-hidden="true"><i></i><span>${escapeHtml(summaryIcon(atmosphere))}</span></div><div><p class="eyebrow">ROUTE ATMOSPHERE</p><h3>${escapeHtml(weatherSummary(atmosphere))}</h3><strong>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))}</strong><span class="atmosphere-average-label">Route average</span><small>${escapeHtml(coverageLine)}</small></div><span class="atmosphere-source-badge">MODELED WEATHER</span></div><div class="atmosphere-metric-grid"><div><span>TEMPERATURE</span><b>${escapeHtml(temperatureText(atmosphere.temperature.minC, units))} – ${escapeHtml(temperatureText(atmosphere.temperature.maxC, units))}</b><small>Route-time range</small></div><div><span>PRECIPITATION</span><b>${escapeHtml(precipitationText(atmosphere.precipitationMm, units))}</b><small>${escapeHtml(precipitationDetail)}${escapeHtml(snow)}</small></div><div><span>WIND</span><b>${escapeHtml(windText(atmosphere.wind.maxKmh, units))}</b><small>Gusts ${escapeHtml(windText(atmosphere.wind.gustMaxKmh, units))}</small></div><div><span>DAYLIGHT</span><b>${escapeHtml(routeDaylight)}</b><small>${escapeHtml(clockText(atmosphere.daylight.sunrise, atmosphere.timezone))} sunrise · ${escapeHtml(clockText(atmosphere.daylight.sunset, atmosphere.timezone))} sunset</small></div></div>${periods ? `<ol class="atmosphere-periods" aria-label="Weather through the route">${periods}</ol>` : timeline ? `<div class="atmosphere-timeline">${timeline}</div>` : ''}${coverageNotice}${refreshNotice}${provenance}${observation}${observationEditor(saved)}<div class="atmosphere-moon"><span aria-hidden="true">${escapeHtml(atmosphere.moon.icon)}</span><div><b>${escapeHtml(atmosphere.moon.name)}</b><small>${atmosphere.moon.illuminationPercent}% illuminated · calculated privately on device</small></div></div>${state === 'error' ? `<p class="atmosphere-refresh-status" role="status">${escapeHtml(message || 'The saved report is still available. Refresh could not finish yet.')}</p>` : ''}<footer><span>Hourly weather estimates near the route. Brief local showers may be missed; partial-hour rain totals are estimated.</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo · CC BY 4.0</a>${state === 'loading' ? '<b>Refreshing…</b>' : `<button type="button" data-atmosphere-action="build" data-route-id="${routeId}">Refresh day</button>`}</footer>`;
    restoreObservationDraft();
  }

  root.RouteHeatAtmosphere = Object.freeze({
    VERSION, normalize, coarseRoutePoint, fingerprint, fetchForRoute, isCurrent,
    needsRefresh, refreshDelayMs, moonPhase, conditionLabel, conditionIcon, weatherSummary, summaryIcon, historyChip, shortPhrase,
    calendarSummary, routeLocationPlan, normalizeObservation, withObservation, observationLabel, observationEditor, errorMessage,
    renderCard
  });
})(typeof window !== 'undefined' ? window : globalThis);
