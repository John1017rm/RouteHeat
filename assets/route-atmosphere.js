((root) => {
  'use strict';

  const VERSION = 2;
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
    const value = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
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
    const track = (Array.isArray(saved?.track) ? saved.track : []).map(raw => point(raw)).filter(Boolean);
    return stops.length ? [...stops, ...sampleEvenly(track, 80)] : track;
  };
  function coarseRoutePoint(saved) {
    const source = sampleEvenly(routePoints(saved), 800);
    if (!source.length) return null;
    const candidates = sampleEvenly(source, 80);
    let best = candidates[0];
    let bestCount = 0;
    candidates.forEach(candidate => {
      const count = source.reduce((total, current) => total + (distanceMeters(candidate, current) <= MAX_ROUTE_RADIUS_METERS ? 1 : 0), 0);
      if (count > bestCount) {
        best = candidate;
        bestCount = count;
      }
    });
    const cluster = source.filter(current => distanceMeters(best, current) <= MAX_ROUTE_RADIUS_METERS);
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
    return fnv(`${String(saved.id || '')}|${window.startedAt}|${window.endedAt}|${coarse.lat.toFixed(2)}|${coarse.lng.toFixed(2)}`);
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
  const conditionIcon = code => CONDITION_ICONS[conditionFamily(code)] || CONDITION_ICONS.cloud;
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
  function weatherSummary(raw) {
    const events = Array.isArray(raw?.events) ? raw.events : [];
    if (!events.length) return conditionLabel(raw?.conditionCode);
    const hazards = events.filter(event => ['storm', 'snow', 'rain', 'fog'].includes(event.family)).sort((a, b) => conditionRank(b.conditionCode) - conditionRank(a.conditionCode));
    const sky = events.filter(event => ['clear', 'cloud'].includes(event.family)).sort((a, b) => b.durationMinutes - a.durationMinutes)[0];
    const labels = hazards.slice(0, sky ? 2 : 3).map(event => ({storm: 'Thunderstorms', snow: 'Snow', rain: 'Rain', fog: 'Fog'})[event.family]);
    if (sky) labels.push(conditionLabel(sky.conditionCode));
    if (!labels.length) return conditionLabel(raw.conditionCode);
    return labels.map((label, index) => index ? label.toLowerCase() : label).join(' & ');
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
        conditionCode: integer(raw.hourly.weather_code?.[index], 0, 999),
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
    if (!observations.some(sample => sample.conditionCode != null || sample.temperatureC != null) && !accumulationSamples.some(sample => sample.precipitationMm != null)) throw new Error('No usable weather samples covered this route');
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
      if (sample.snowfallCm >= 0.01) addEvent('snow', 71, sample.at - HOUR_MS, sample.at);
      // Forecast rain excludes convective showers; total precipitation also catches those.
      if (sample.rainMm >= 0.1 || sample.precipitationMm >= 0.1 && !(sample.snowfallCm > 0)) addEvent('rain', 61, sample.at - HOUR_MS, sample.at);
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
      coverage: {startedAt: window.startedAt, endedAt: window.endedAt, hourlySamples: observations.length, pointsUsed: coarse.pointsUsed, locationPrecisionDegrees: PRECISION_DEGREES, conditionPercent: Math.round(clamp(conditionCoverageMs / routeMs * 100, 0, 100)), precipitationPercent: Math.round(clamp(precipitationCoverageMs / routeMs * 100, 0, 100))},
      conditionCode: events.length ? dominantCondition(events.map(event => event.conditionCode)) : null,
      temperature: {startC: timeline[0]?.temperatureC, endC: timeline.at(-1)?.temperatureC, meanC: weightedMean('temperatureC'), minC: temperatures.length ? Math.min(...temperatures) : null, maxC: temperatures.length ? Math.max(...temperatures) : null},
      apparentTemperature: {meanC: weightedMean('apparentC'), minC: apparent.length ? Math.min(...apparent) : null, maxC: apparent.length ? Math.max(...apparent) : null},
      precipitationMm: accumulation('precipitationMm'), rainMm: accumulation('rainMm'), snowfallCm: accumulation('snowfallCm'),
      humidityPercent: weightedMean('humidityPercent'), cloudCoverPercent: weightedMean('cloudCoverPercent'),
      wind: {meanKmh: weightedMean('windKmh'), maxKmh: wind.length ? Math.max(...wind) : null, gustMaxKmh: gusts.length ? Math.max(...gusts) : null},
      daylight: dailyOverlap(raw.daily, window.startedAt, window.endedAt, raw.utc_offset_seconds, raw.timezone),
      moon: moonPhase(midpoint),
      events, timeline
    });
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![1, VERSION].includes(Number(raw.version))) return null;
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
    return {
      version: Number(raw.version),
      fingerprint: fingerprintValue,
      capturedAt,
      source: {provider: 'Open-Meteo', kind: ['forecast', 'historical-forecast', 'archive'].includes(source.kind) ? source.kind : 'forecast', modeled: true, license: 'CC BY 4.0'},
      timezone: text(raw.timezone || 'auto', 64),
      coverage: {startedAt, endedAt, hourlySamples: integer(coverageRaw.hourlySamples, 1, 240) || timeline.length || 1, pointsUsed: integer(coverageRaw.pointsUsed, 1, 5000) || 1, locationPrecisionDegrees: PRECISION_DEGREES, conditionPercent: integer(coverageRaw.conditionPercent, 0, 100), precipitationPercent: integer(coverageRaw.precipitationPercent, 0, 100)},
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
      events, timeline
    };
  }
  function endpointFor(saved) {
    const startedAt = Number(saved?.startedAt);
    const ageDays = (Date.now() - startedAt) / 86400000;
    if (ageDays <= 5) return {url: FORECAST_ENDPOINT, kind: 'forecast'};
    if (new Date(startedAt).getUTCFullYear() >= 2022) return {url: HISTORICAL_ENDPOINT, kind: 'historical-forecast'};
    return {url: ARCHIVE_ENDPOINT, kind: 'archive'};
  }
  async function fetchForRoute(saved, {signal, fetchImpl = root.fetch} = {}) {
    if (typeof fetchImpl !== 'function') throw new Error('Weather lookup is unavailable');
    const coarse = coarseRoutePoint(saved);
    const window = routeWindow(saved);
    if (!coarse || !window) throw new Error('A trustworthy saved route location is required');
    const endpoint = endpointFor(saved);
    const parameters = new URLSearchParams({
      latitude: coarse.lat.toFixed(2), longitude: coarse.lng.toFixed(2),
      // Padding also covers routes viewed later from another timezone and the final rain interval.
      start_date: utcDate(window.startedAt - 86400000), end_date: utcDate(window.endedAt + 86400000),
      hourly: HOURLY_FIELDS.join(','), daily: DAILY_FIELDS.join(','),
      timezone: 'auto', timeformat: 'unixtime', temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    const lookup = async selected => {
      const response = await fetchImpl(`${selected.url}?${parameters}`, {signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
      if (!response?.ok) throw new Error(`Weather service returned ${response?.status || 'an error'}`);
      return summarizeResponse(saved, await response.json(), selected.kind, coarse);
    };
    try { return await lookup(endpoint); }
    catch (error) {
      if (signal?.aborted || error?.name === 'AbortError' || endpoint.kind !== 'historical-forecast') throw error;
      // Historical model coverage varies by region and date; older routes can use reanalysis.
      return lookup({url: ARCHIVE_ENDPOINT, kind: 'archive'});
    }
  }
  function isCurrent(saved, atmosphere = normalize(saved?.atmosphere)) {
    if (!atmosphere) return false;
    const current = fingerprint(saved);
    return !!current && current === atmosphere.fingerprint;
  }
  function needsRefresh(saved) {
    const atmosphere = normalize(saved?.atmosphere);
    if (!atmosphere || atmosphere.version < VERSION || !isCurrent(saved, atmosphere)) return true;
    const ageDays = (Date.now() - Number(saved?.startedAt)) / 86400000;
    return atmosphere.source.kind === 'forecast' && ageDays > 5;
  }
  const toFahrenheit = celsius => celsius == null ? null : celsius * 9 / 5 + 32;
  const temperatureValue = (celsius, units) => units === 'kilometers' ? celsius : toFahrenheit(celsius);
  const temperatureText = (celsius, units, digits = 0) => {
    const value = temperatureValue(celsius, units);
    return value == null ? '—' : `${value.toFixed(digits)}°${units === 'kilometers' ? 'C' : 'F'}`;
  };
  const windText = (kmh, units) => kmh == null ? '—' : units === 'kilometers' ? `${Math.round(kmh)} km/h` : `${Math.round(kmh * 0.621371)} mph`;
  const precipitationText = (millimeters, units) => millimeters == null ? '—' : units === 'kilometers' ? `${millimeters.toFixed(millimeters < 10 ? 1 : 0)} mm` : `${(millimeters / 25.4).toFixed(millimeters < 2.54 ? 2 : 1)} in`;
  const clockText = (timestamp, timezone) => {
    if (!timestamp) return '—';
    try { return new Date(timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit', ...(timezone && timezone !== 'auto' ? {timeZone: timezone} : {})}); }
    catch (_) { return new Date(timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}); }
  };
  const durationText = seconds => {
    const hours = Math.floor(Number(seconds || 0) / 3600);
    const minutes = Math.round((Number(seconds || 0) % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  function historyChip(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `<span class="history-atmosphere-chip"><i aria-hidden="true">${escapeHtml(conditionIcon(atmosphere.conditionCode))}</i>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))} · ${escapeHtml(weatherSummary(atmosphere))}</span>`;
  }
  function shortPhrase(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `${weatherSummary(atmosphere)}, ${temperatureText(atmosphere.temperature.meanC, units)}, ${windText(atmosphere.wind.maxKmh, units)} max wind`;
  }
  function renderCard(container, saved, {units = 'miles', state = 'idle', message = ''} = {}) {
    if (!container || !saved) return;
    const routeId = escapeHtml(String(saved.id || ''));
    const atmosphere = normalize(saved.atmosphere);
    container.hidden = false;
    container.dataset.state = atmosphere ? 'ready' : state;
    if (!atmosphere) {
      const title = state === 'loading' ? 'Reading this route’s day…' : state === 'off' ? 'Automatic atmosphere is off' : state === 'error' ? 'Atmosphere is still waiting' : 'Add this route’s atmosphere';
      const detail = message || (state === 'loading' ? 'Only a rounded route-level location and date are being used.' : state === 'off' ? 'Enable it in Settings to add modeled conditions after future routes.' : 'Save modeled temperature, precipitation, wind, daylight, and moon phase with this route.');
      container.innerHTML = `<div class="atmosphere-empty-art" aria-hidden="true"><i></i><i></i><span>◒</span></div><div class="atmosphere-empty-copy"><p class="eyebrow">ROUTE ATMOSPHERE</p><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p><button type="button" data-atmosphere-action="build" data-route-id="${routeId}"${state === 'loading' || state === 'off' ? ' disabled' : ''}>${state === 'loading' ? 'Building…' : 'Build atmosphere'}</button><small>Approximate modeled conditions near the route · review only while parked.</small></div>`;
      return;
    }
    const timeline = atmosphere.timeline.map((sample, index) => `<div><span>${escapeHtml(sample.stage || (atmosphere.timeline.length === 2 ? ['START', 'FINISH'][index] : ['START', 'MID-ROUTE', 'FINISH'][index]) || 'ROUTE')}</span><b>${escapeHtml(temperatureText(sample.temperatureC, units))}</b><small>${escapeHtml(clockText(sample.at, atmosphere.timezone))} · ${escapeHtml(conditionLabel(sample.conditionCode))}</small></div>`).join('');
    const partialCoverage = atmosphere.version >= 2 && (atmosphere.coverage.conditionPercent < 95 || atmosphere.coverage.precipitationPercent < 95);
    const coverageLine = atmosphere.version < 2 ? 'Earlier report · a full-route refresh will fill in the day’s weather' : (partialCoverage ? 'Partial hourly coverage' : 'Across the whole route') + ' · ' + clockText(atmosphere.coverage.startedAt, atmosphere.timezone) + '–' + clockText(atmosphere.coverage.endedAt, atmosphere.timezone);
    const rainEvent = atmosphere.events.find(event => event.family === 'rain');
    const precipitationDetail = atmosphere.precipitationMm == null ? 'Precipitation data unavailable' : atmosphere.precipitationMm > 0 ? (rainEvent ? durationText(rainEvent.durationMinutes * 60) + ' with rain modeled' : 'Estimated across route hours') : atmosphere.coverage.precipitationPercent != null && atmosphere.coverage.precipitationPercent < 95 ? 'No rain in available hours' : 'No modeled precipitation';
    const routeDaylight = atmosphere.daylight.secondsDuringRoute ? `${durationText(atmosphere.daylight.secondsDuringRoute)} · ${atmosphere.daylight.percentOfRoute}% of route` : 'Mostly after dark';
    const snow = atmosphere.snowfallCm > 0.05 ? ` · ${units === 'kilometers' ? `${atmosphere.snowfallCm.toFixed(1)} cm snow` : `${(atmosphere.snowfallCm / 2.54).toFixed(1)} in snow`}` : '';
    container.innerHTML = `<div class="atmosphere-hero"><div class="atmosphere-condition-art ${escapeHtml(conditionFamily(atmosphere.conditionCode))}" aria-hidden="true"><i></i><span>${escapeHtml(conditionIcon(atmosphere.conditionCode))}</span></div><div><p class="eyebrow">ROUTE ATMOSPHERE</p><h3>${escapeHtml(weatherSummary(atmosphere))}</h3><strong>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))}</strong><small>${escapeHtml(coverageLine)}</small></div><span class="atmosphere-source-badge">SAVED WITH ROUTE</span></div><div class="atmosphere-metric-grid"><div><span>TEMPERATURE</span><b>${escapeHtml(temperatureText(atmosphere.temperature.minC, units))} – ${escapeHtml(temperatureText(atmosphere.temperature.maxC, units))}</b><small>Route-time range</small></div><div><span>PRECIPITATION</span><b>${escapeHtml(precipitationText(atmosphere.precipitationMm, units))}</b><small>${escapeHtml(precipitationDetail)}${escapeHtml(snow)}</small></div><div><span>WIND</span><b>${escapeHtml(windText(atmosphere.wind.maxKmh, units))}</b><small>Gusts ${escapeHtml(windText(atmosphere.wind.gustMaxKmh, units))}</small></div><div><span>DAYLIGHT</span><b>${escapeHtml(routeDaylight)}</b><small>${escapeHtml(clockText(atmosphere.daylight.sunrise, atmosphere.timezone))} sunrise · ${escapeHtml(clockText(atmosphere.daylight.sunset, atmosphere.timezone))} sunset</small></div></div>${timeline ? `<div class="atmosphere-timeline">${timeline}</div>` : ''}<div class="atmosphere-moon"><span aria-hidden="true">${escapeHtml(atmosphere.moon.icon)}</span><div><b>${escapeHtml(atmosphere.moon.name)}</b><small>${atmosphere.moon.illuminationPercent}% illuminated · calculated privately on device</small></div></div><footer><span>Hourly weather estimates near the route. Brief local showers may be missed; partial-hour rain totals are estimated.</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo · CC BY 4.0</a>${state === 'loading' ? '<b>Refreshing…</b>' : `<button type="button" data-atmosphere-action="build" data-route-id="${routeId}">Refresh day</button>`}</footer>`;
  }

  root.RouteHeatAtmosphere = Object.freeze({
    VERSION, normalize, coarseRoutePoint, fingerprint, fetchForRoute, isCurrent,
    needsRefresh, moonPhase, conditionLabel, conditionIcon, weatherSummary, historyChip, shortPhrase,
    renderCard
  });
})(typeof window !== 'undefined' ? window : globalThis);
