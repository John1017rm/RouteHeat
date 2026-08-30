((root) => {
  'use strict';

  const VERSION = 1;
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
  const localDate = timestamp => {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const localTimestamp = value => {
    if (typeof value === 'number') return Number.isFinite(value) ? value * 1000 : null;
    if (!value) return null;
    const parsed = new Date(String(value)).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  };
  const routeWindow = saved => {
    const startedAt = Number(saved?.startedAt);
    const endedAt = Number(saved?.endedAt || saved?.stops?.at?.(-1)?.timestamp || startedAt);
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) || endedAt < startedAt) return null;
    return {startedAt, endedAt: Math.max(startedAt + 60000, endedAt)};
  };
  function fingerprint(saved, coarse = coarseRoutePoint(saved)) {
    const window = routeWindow(saved);
    if (!window || !coarse) return '';
    return fnv(`${String(saved.id || '')}|${window.startedAt}|${window.endedAt}|${coarse.lat.toFixed(2)}|${coarse.lng.toFixed(2)}`);
  }
  const conditionFamily = code => {
    const value = Number(code);
    if (value === 0 || value === 1) return 'clear';
    if ([2, 3].includes(value)) return 'cloud';
    if ([45, 48].includes(value)) return 'fog';
    if (value >= 95) return 'storm';
    if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
    if (value >= 51 && value <= 82) return 'rain';
    return 'cloud';
  };
  const conditionLabel = code => CONDITION_LABELS[Number(code)] || 'Mixed conditions';
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
  const dailyOverlap = (daily, startedAt, endedAt) => {
    const sunrises = Array.isArray(daily?.sunrise) ? daily.sunrise : [];
    const sunsets = Array.isArray(daily?.sunset) ? daily.sunset : [];
    let secondsDuringRoute = 0;
    for (let index = 0; index < Math.min(sunrises.length, sunsets.length); index += 1) {
      const sunrise = localTimestamp(sunrises[index]);
      const sunset = localTimestamp(sunsets[index]);
      if (sunrise == null || sunset == null || sunset <= sunrise) continue;
      secondsDuringRoute += Math.max(0, Math.min(endedAt, sunset) - Math.max(startedAt, sunrise)) / 1000;
    }
    const totalSeconds = sum(Array.isArray(daily?.daylight_duration) ? daily.daylight_duration : []);
    const routeSeconds = Math.max(60, (endedAt - startedAt) / 1000);
    return {
      secondsDuringRoute: Math.round(secondsDuringRoute),
      percentOfRoute: Math.round(clamp(secondsDuringRoute / routeSeconds * 100, 0, 100)),
      sunrise: localTimestamp(sunrises[0]),
      sunset: localTimestamp(sunsets.at?.(-1)),
      totalSeconds: Math.round(totalSeconds || 0)
    };
  };
  const closestObservation = (samples, target) => samples.reduce((best, sample) => !best || Math.abs(sample.at - target) < Math.abs(best.at - target) ? sample : best, null);
  function summarizeResponse(saved, raw, sourceKind, coarse) {
    const window = routeWindow(saved);
    if (!window || !raw || typeof raw !== 'object' || !raw.hourly || !Array.isArray(raw.hourly.time)) throw new Error('Weather response was incomplete');
    const times = raw.hourly.time.map(localTimestamp);
    const routeSamples = [];
    times.forEach((at, index) => {
      if (at == null || at < window.startedAt - 3600000 || at > window.endedAt + 3600000) return;
      routeSamples.push({
        at,
        temperatureC: numberOrNull(raw.hourly.temperature_2m?.[index]),
        apparentC: numberOrNull(raw.hourly.apparent_temperature?.[index]),
        humidityPercent: numberOrNull(raw.hourly.relative_humidity_2m?.[index]),
        precipitationMm: numberOrNull(raw.hourly.precipitation?.[index]),
        rainMm: numberOrNull(raw.hourly.rain?.[index]),
        snowfallCm: numberOrNull(raw.hourly.snowfall?.[index]),
        conditionCode: integer(raw.hourly.weather_code?.[index], 0, 999),
        cloudCoverPercent: numberOrNull(raw.hourly.cloud_cover?.[index]),
        windKmh: numberOrNull(raw.hourly.wind_speed_10m?.[index]),
        gustKmh: numberOrNull(raw.hourly.wind_gusts_10m?.[index]),
        isDay: integer(raw.hourly.is_day?.[index], 0, 1)
      });
    });
    if (!routeSamples.length) throw new Error('No weather samples covered this route');
    const aggregateSamples = routeSamples.filter(sample => sample.at >= window.startedAt && sample.at <= window.endedAt);
    const observations = aggregateSamples.length ? aggregateSamples : routeSamples;
    const temperatures = observations.map(sample => sample.temperatureC).filter(value => value != null);
    const apparent = observations.map(sample => sample.apparentC).filter(value => value != null);
    const wind = observations.map(sample => sample.windKmh).filter(value => value != null);
    const gusts = observations.map(sample => sample.gustKmh).filter(value => value != null);
    const midpoint = window.startedAt + (window.endedAt - window.startedAt) / 2;
    const timeline = [window.startedAt, midpoint, window.endedAt].map(at => closestObservation(routeSamples, at)).filter((sample, index, list) => sample && list.indexOf(sample) === index).map(sample => ({...sample}));
    return normalize({
      version: VERSION,
      fingerprint: fingerprint(saved, coarse),
      capturedAt: Date.now(),
      source: {provider: 'Open-Meteo', kind: sourceKind, modeled: true, license: 'CC BY 4.0'},
      timezone: text(raw.timezone || 'auto', 64),
      coverage: {startedAt: window.startedAt, endedAt: window.endedAt, hourlySamples: observations.length, pointsUsed: coarse.pointsUsed, locationPrecisionDegrees: PRECISION_DEGREES},
      conditionCode: dominantCondition(observations.map(sample => sample.conditionCode)),
      temperature: {startC: timeline[0]?.temperatureC, endC: timeline.at(-1)?.temperatureC, meanC: mean(temperatures), minC: temperatures.length ? Math.min(...temperatures) : null, maxC: temperatures.length ? Math.max(...temperatures) : null},
      apparentTemperature: {meanC: mean(apparent), minC: apparent.length ? Math.min(...apparent) : null, maxC: apparent.length ? Math.max(...apparent) : null},
      precipitationMm: sum(observations.map(sample => sample.precipitationMm)),
      rainMm: sum(observations.map(sample => sample.rainMm)),
      snowfallCm: sum(observations.map(sample => sample.snowfallCm)),
      humidityPercent: mean(observations.map(sample => sample.humidityPercent)),
      cloudCoverPercent: mean(observations.map(sample => sample.cloudCoverPercent)),
      wind: {meanKmh: mean(wind), maxKmh: wind.length ? Math.max(...wind) : null, gustMaxKmh: gusts.length ? Math.max(...gusts) : null},
      daylight: dailyOverlap(raw.daily, window.startedAt, window.endedAt),
      moon: moonPhase(midpoint),
      timeline
    });
  }
  function normalize(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Number(raw.version) !== VERSION) return null;
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
    if (!fingerprintValue || capturedAt == null || conditionCode == null || startedAt == null || endedAt == null || endedAt < startedAt) return null;
    const normalizeTemperature = value => bounded(value, -100, 70);
    const timeline = (Array.isArray(raw.timeline) ? raw.timeline : []).slice(0, 3).map(sample => {
      if (!sample || typeof sample !== 'object') return null;
      const at = integer(sample.at, startedAt - 86400000, endedAt + 86400000);
      if (at == null) return null;
      return {
        at,
        temperatureC: normalizeTemperature(sample.temperatureC), apparentC: normalizeTemperature(sample.apparentC),
        humidityPercent: bounded(sample.humidityPercent, 0, 100), precipitationMm: bounded(sample.precipitationMm, 0, 1000),
        rainMm: bounded(sample.rainMm, 0, 1000), snowfallCm: bounded(sample.snowfallCm, 0, 1000),
        conditionCode: integer(sample.conditionCode, 0, 999), cloudCoverPercent: bounded(sample.cloudCoverPercent, 0, 100),
        windKmh: bounded(sample.windKmh, 0, 500), gustKmh: bounded(sample.gustKmh, 0, 600), isDay: integer(sample.isDay, 0, 1)
      };
    }).filter(Boolean);
    const phase = bounded(moonRaw.phase, 0, 1);
    return {
      version: VERSION,
      fingerprint: fingerprintValue,
      capturedAt,
      source: {provider: 'Open-Meteo', kind: ['forecast', 'historical-forecast', 'archive'].includes(source.kind) ? source.kind : 'forecast', modeled: true, license: 'CC BY 4.0'},
      timezone: text(raw.timezone || 'auto', 64),
      coverage: {startedAt, endedAt, hourlySamples: integer(coverageRaw.hourlySamples, 1, 240) || timeline.length || 1, pointsUsed: integer(coverageRaw.pointsUsed, 1, 5000) || 1, locationPrecisionDegrees: PRECISION_DEGREES},
      conditionCode,
      temperature: {startC: normalizeTemperature(temperatureRaw.startC), endC: normalizeTemperature(temperatureRaw.endC), meanC: normalizeTemperature(temperatureRaw.meanC), minC: normalizeTemperature(temperatureRaw.minC), maxC: normalizeTemperature(temperatureRaw.maxC)},
      apparentTemperature: {meanC: normalizeTemperature(apparentRaw.meanC), minC: normalizeTemperature(apparentRaw.minC), maxC: normalizeTemperature(apparentRaw.maxC)},
      precipitationMm: bounded(raw.precipitationMm, 0, 5000) || 0,
      rainMm: bounded(raw.rainMm, 0, 5000) || 0,
      snowfallCm: bounded(raw.snowfallCm, 0, 5000) || 0,
      humidityPercent: bounded(raw.humidityPercent, 0, 100),
      cloudCoverPercent: bounded(raw.cloudCoverPercent, 0, 100),
      wind: {meanKmh: bounded(windRaw.meanKmh, 0, 500), maxKmh: bounded(windRaw.maxKmh, 0, 500), gustMaxKmh: bounded(windRaw.gustMaxKmh, 0, 600)},
      daylight: {secondsDuringRoute: integer(daylightRaw.secondsDuringRoute, 0, 172800) || 0, percentOfRoute: integer(daylightRaw.percentOfRoute, 0, 100) || 0, sunrise: integer(daylightRaw.sunrise, 1, 4102444800000), sunset: integer(daylightRaw.sunset, 1, 4102444800000), totalSeconds: integer(daylightRaw.totalSeconds, 0, 172800) || 0},
      moon: {phase: phase == null ? moonPhase(startedAt + (endedAt - startedAt) / 2).phase : phase, name: text(moonRaw.name || moonPhase(startedAt).name, 40), illuminationPercent: integer(moonRaw.illuminationPercent, 0, 100) || 0, icon: text(moonRaw.icon || '○', 4)},
      timeline
    };
  }
  function endpointFor(saved) {
    const startedAt = Number(saved?.startedAt);
    const ageDays = (Date.now() - startedAt) / 86400000;
    if (ageDays <= 5) return {url: FORECAST_ENDPOINT, kind: 'forecast'};
    if (new Date(startedAt).getFullYear() >= 2021) return {url: HISTORICAL_ENDPOINT, kind: 'historical-forecast'};
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
      start_date: localDate(window.startedAt), end_date: localDate(window.endedAt),
      hourly: HOURLY_FIELDS.join(','), daily: DAILY_FIELDS.join(','),
      timezone: 'auto', temperature_unit: 'celsius', wind_speed_unit: 'kmh', precipitation_unit: 'mm'
    });
    const response = await fetchImpl(`${endpoint.url}?${parameters}`, {signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer'});
    if (!response?.ok) throw new Error(`Weather service returned ${response?.status || 'an error'}`);
    return summarizeResponse(saved, await response.json(), endpoint.kind, coarse);
  }
  function isCurrent(saved, atmosphere = normalize(saved?.atmosphere)) {
    if (!atmosphere) return false;
    const current = fingerprint(saved);
    return !!current && current === atmosphere.fingerprint;
  }
  function needsRefresh(saved) {
    const atmosphere = normalize(saved?.atmosphere);
    if (!atmosphere || !isCurrent(saved, atmosphere)) return true;
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
  const precipitationText = (millimeters, units) => units === 'kilometers' ? `${millimeters.toFixed(millimeters < 10 ? 1 : 0)} mm` : `${(millimeters / 25.4).toFixed(millimeters < 2.54 ? 2 : 1)} in`;
  const clockText = timestamp => timestamp ? new Date(timestamp).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'}) : '—';
  const durationText = seconds => {
    const hours = Math.floor(Number(seconds || 0) / 3600);
    const minutes = Math.round((Number(seconds || 0) % 3600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
  };
  function historyChip(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `<span class="history-atmosphere-chip"><i aria-hidden="true">${escapeHtml(conditionIcon(atmosphere.conditionCode))}</i>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))} · ${escapeHtml(conditionLabel(atmosphere.conditionCode))}</span>`;
  }
  function shortPhrase(raw, units = 'miles') {
    const atmosphere = normalize(raw);
    if (!atmosphere) return '';
    return `${conditionLabel(atmosphere.conditionCode)}, ${temperatureText(atmosphere.temperature.meanC, units)}, ${windText(atmosphere.wind.maxKmh, units)} max wind`;
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
    const timeline = atmosphere.timeline.map((sample, index) => `<div><span>${['START', 'MIDDAY', 'FINISH'][index] || 'ROUTE'}</span><b>${escapeHtml(temperatureText(sample.temperatureC, units))}</b><small>${escapeHtml(clockText(sample.at))} · ${escapeHtml(conditionLabel(sample.conditionCode))}</small></div>`).join('');
    const routeDaylight = atmosphere.daylight.secondsDuringRoute ? `${durationText(atmosphere.daylight.secondsDuringRoute)} · ${atmosphere.daylight.percentOfRoute}% of route` : 'Mostly after dark';
    const snow = atmosphere.snowfallCm > 0.05 ? ` · ${units === 'kilometers' ? `${atmosphere.snowfallCm.toFixed(1)} cm snow` : `${(atmosphere.snowfallCm / 2.54).toFixed(1)} in snow`}` : '';
    container.innerHTML = `<div class="atmosphere-hero"><div class="atmosphere-condition-art ${escapeHtml(conditionFamily(atmosphere.conditionCode))}" aria-hidden="true"><i></i><span>${escapeHtml(conditionIcon(atmosphere.conditionCode))}</span></div><div><p class="eyebrow">ROUTE ATMOSPHERE</p><h3>${escapeHtml(conditionLabel(atmosphere.conditionCode))}</h3><strong>${escapeHtml(temperatureText(atmosphere.temperature.meanC, units))}</strong><small>Modeled near the route · ${escapeHtml(atmosphere.timezone)}</small></div><span class="atmosphere-source-badge">SAVED WITH ROUTE</span></div><div class="atmosphere-metric-grid"><div><span>TEMPERATURE</span><b>${escapeHtml(temperatureText(atmosphere.temperature.minC, units))} – ${escapeHtml(temperatureText(atmosphere.temperature.maxC, units))}</b><small>Route-time range</small></div><div><span>PRECIPITATION</span><b>${escapeHtml(precipitationText(atmosphere.precipitationMm, units))}</b><small>${atmosphere.precipitationMm ? 'During route window' : 'No modeled precipitation'}${escapeHtml(snow)}</small></div><div><span>WIND</span><b>${escapeHtml(windText(atmosphere.wind.maxKmh, units))}</b><small>Gusts ${escapeHtml(windText(atmosphere.wind.gustMaxKmh, units))}</small></div><div><span>DAYLIGHT</span><b>${escapeHtml(routeDaylight)}</b><small>${escapeHtml(clockText(atmosphere.daylight.sunrise))} sunrise · ${escapeHtml(clockText(atmosphere.daylight.sunset))} sunset</small></div></div>${timeline ? `<div class="atmosphere-timeline">${timeline}</div>` : ''}<div class="atmosphere-moon"><span aria-hidden="true">${escapeHtml(atmosphere.moon.icon)}</span><div><b>${escapeHtml(atmosphere.moon.name)}</b><small>${atmosphere.moon.illuminationPercent}% illuminated · calculated privately on device</small></div></div><footer><span>Approximate modeled conditions, not a weather-station observation.</span><a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Weather data by Open-Meteo · CC BY 4.0</a>${state === 'loading' ? '<b>Refreshing…</b>' : ''}</footer>`;
  }

  root.RouteHeatAtmosphere = Object.freeze({
    VERSION, normalize, coarseRoutePoint, fingerprint, fetchForRoute, isCurrent,
    needsRefresh, moonPhase, conditionLabel, conditionIcon, historyChip, shortPhrase,
    renderCard
  });
})(typeof window !== 'undefined' ? window : globalThis);
