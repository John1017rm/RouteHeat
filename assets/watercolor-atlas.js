(() => {
  'use strict';

  const VERSION = '7.0.0';
  const LIMITS = Object.freeze({
    lite: Object.freeze({segmentSets: 90, points: 3000, routeScan: 360, fragmentsPerRoute: 8}),
    full: Object.freeze({segmentSets: 170, points: 7000, routeScan: 600, fragmentsPerRoute: 12})
  });
  const PASSES = Object.freeze({
    lite: Object.freeze([
      Object.freeze({id: 'wash', weight: 8.2, opacity: 0.12, offsetM: 1.15, smoothFactor: 1.2}),
      Object.freeze({id: 'pigment', weight: 2.8, opacity: 0.52, offsetM: -0.18, smoothFactor: 0.8})
    ]),
    full: Object.freeze([
      Object.freeze({id: 'wash', weight: 11.5, opacity: 0.09, offsetM: 1.65, smoothFactor: 1.25}),
      Object.freeze({id: 'bloom', weight: 6.5, opacity: 0.16, offsetM: -0.85, smoothFactor: 1}),
      Object.freeze({id: 'pigment', weight: 2.65, opacity: 0.5, offsetM: 0.18, smoothFactor: 0.72})
    ])
  });
  const THEME_PALETTES = Object.freeze({
    default: Object.freeze({old: '#2b7fff', middle: '#24d69a', fresh: '#ffe45c'}),
    blue: Object.freeze({old: '#315efb', middle: '#18c7d1', fresh: '#ffe06a'}),
    orange: Object.freeze({old: '#536dfe', middle: '#36cf9d', fresh: '#ffd166'}),
    purple: Object.freeze({old: '#3957d8', middle: '#a879ff', fresh: '#ff70c8'})
  });
  const ownedRenders = new WeakMap();

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const finiteNumber = value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  };
  const validHex = value => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value);

  function rawTrackPoint(raw) {
    if (Array.isArray(raw)) return {lat: raw[0], lng: raw[1], timestamp: raw[2], accuracy: raw[3]};
    return raw && typeof raw === 'object' ? raw : null;
  }

  function mapPoint(raw) {
    const point = rawTrackPoint(raw);
    if (!point) return null;
    const lat = finiteNumber(point.lat ?? point.latitude);
    const lng = finiteNumber(point.lng ?? point.lon ?? point.longitude);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
    const timestamp = finiteNumber(point.timestamp ?? point.time ?? point.recordedAt);
    const accuracy = finiteNumber(point.accuracy);
    return {lat, lng, timestamp, accuracy};
  }

  function distanceMeters(first, second) {
    const radius = 6371000;
    const toRadians = degrees => degrees * Math.PI / 180;
    const latitude = toRadians(second.lat - first.lat);
    const longitude = toRadians(second.lng - first.lng);
    const value = Math.sin(latitude / 2) ** 2
      + Math.cos(toRadians(first.lat)) * Math.cos(toRadians(second.lat)) * Math.sin(longitude / 2) ** 2;
    return 2 * radius * Math.asin(Math.sqrt(clamp(value, 0, 1)));
  }

  function implausibleJump(first, second) {
    const meters = distanceMeters(first, second);
    const firstTime = finiteNumber(first.timestamp);
    const secondTime = finiteNumber(second.timestamp);
    if (firstTime === null || secondTime === null) return meters > 2000;
    const elapsedSeconds = (secondTime - firstTime) / 1000;
    if (elapsedSeconds <= 0) return meters > 250;
    const uncertainty = Math.max(0, first.accuracy || 0) + Math.max(0, second.accuracy || 0);
    const allowance = Math.max(500, elapsedSeconds * 70 + uncertainty * 2);
    return meters > allowance;
  }

  function explicitBreakIndices(route, rawTrack) {
    const indices = new Set();
    const direct = Array.isArray(route?.trackBreakIndices) ? route.trackBreakIndices : [];
    direct.forEach(value => {
      const index = Math.round(Number(value));
      if (Number.isInteger(index) && index > 0 && index < rawTrack.length) indices.add(index);
    });
    const times = (Array.isArray(route?.trackBreakTimes) ? route.trackBreakTimes : [])
      .map(Number)
      .filter(Number.isFinite)
      .sort((first, second) => first - second);
    if (!times.length) return indices;
    let timeIndex = 0;
    for (let index = 0; index < rawTrack.length && timeIndex < times.length; index++) {
      const timestamp = mapPoint(rawTrack[index])?.timestamp;
      if (!Number.isFinite(timestamp)) continue;
      while (timeIndex < times.length && timestamp >= times[timeIndex]) {
        if (index > 0 && index < rawTrack.length) indices.add(index);
        timeIndex++;
      }
    }
    return indices;
  }

  function polylineLength(points) {
    let length = 0;
    for (let index = 1; index < points.length; index++) length += distanceMeters(points[index - 1], points[index]);
    return length;
  }

  function cleanFragment(points) {
    if (!Array.isArray(points) || points.length < 2) return [];
    const cleaned = [points[0]];
    for (let index = 1; index < points.length; index++) {
      const point = points[index];
      const previous = cleaned[cleaned.length - 1];
      if (distanceMeters(previous, point) >= 0.7 || index === points.length - 1) {
        if (point.lat !== previous.lat || point.lng !== previous.lng) cleaned.push(point);
      }
    }
    return cleaned.length >= 2 && polylineLength(cleaned) >= 3 ? cleaned : [];
  }

  function viewportBox(rawBounds) {
    if (!rawBounds) return null;
    const read = (method, direct, nested, coordinate) => {
      try {
        if (typeof rawBounds[method] === 'function') return finiteNumber(rawBounds[method]());
      } catch {}
      const directValue = finiteNumber(rawBounds[direct]);
      if (directValue !== null) return directValue;
      return finiteNumber(rawBounds[nested]?.[coordinate]);
    };
    const south = read('getSouth', 'south', '_southWest', 'lat');
    const west = read('getWest', 'west', '_southWest', 'lng');
    const north = read('getNorth', 'north', '_northEast', 'lat');
    const east = read('getEast', 'east', '_northEast', 'lng');
    if ([south, west, north, east].some(value => value === null) || south > north || west > east) return null;
    const latitudePadding = Math.max(0.002, (north - south) * 0.08);
    const longitudePadding = Math.max(0.002, (east - west) * 0.08);
    return {
      south: south - latitudePadding,
      west: west - longitudePadding,
      north: north + latitudePadding,
      east: east + longitudePadding
    };
  }

  function intersectsViewport(points, viewport) {
    if (!viewport) return true;
    let south = Infinity, west = Infinity, north = -Infinity, east = -Infinity;
    points.forEach(point => {
      south = Math.min(south, point.lat);
      west = Math.min(west, point.lng);
      north = Math.max(north, point.lat);
      east = Math.max(east, point.lng);
    });
    return north >= viewport.south && south <= viewport.north && east >= viewport.west && west <= viewport.east;
  }

  function hash32(value) {
    const text = String(value ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function routeTimestamp(route, fragments) {
    const explicit = finiteNumber(route?.startedAt ?? route?.date ?? route?.createdAt);
    if (explicit !== null && explicit > 0) return explicit;
    for (const fragment of fragments) {
      const timestamp = fragment.find(point => Number.isFinite(point.timestamp))?.timestamp;
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return 0;
  }

  function extractRouteSegments(route, routeIndex, viewport, fragmentLimit) {
    const rawTrack = Array.isArray(route?.track) ? route.track : [];
    if (rawTrack.length < 2) return [];
    const breaks = explicitBreakIndices(route, rawTrack);
    const fragments = [];
    let fragment = [];
    let trustedAnchor = null;
    const flush = () => {
      const cleaned = cleanFragment(fragment);
      if (cleaned.length >= 2 && intersectsViewport(cleaned, viewport)) fragments.push(cleaned);
      fragment = [];
    };
    rawTrack.forEach((raw, index) => {
      const point = mapPoint(raw);
      if (!point) {
        flush();
        trustedAnchor = null;
        return;
      }
      if (breaks.has(index)) {
        flush();
        fragment.push(point);
        trustedAnchor = point;
        return;
      }
      if (trustedAnchor && implausibleJump(trustedAnchor, point)) {
        flush();
        trustedAnchor = null;
        return;
      }
      fragment.push(point);
      trustedAnchor = point;
    });
    flush();
    const timestamp = routeTimestamp(route, fragments);
    const routeId = String(route?.id ?? route?.routeId ?? route?.startedAt ?? `route-${routeIndex}`);
    return fragments
      .map((points, fragmentIndex) => ({
        key: `${routeId}:${fragmentIndex}`,
        routeId,
        routeIndex,
        fragmentIndex,
        timestamp,
        points,
        sourcePoints: points.length,
        meters: polylineLength(points)
      }))
      .sort((first, second) => second.meters - first.meters || first.fragmentIndex - second.fragmentIndex)
      .slice(0, fragmentLimit);
  }

  function spreadSample(items, limit) {
    if (items.length <= limit) return items.slice();
    if (limit <= 1) return [items[items.length - 1]];
    const sampled = [];
    let previousIndex = -1;
    for (let position = 0; position < limit; position++) {
      let index = Math.round(position * (items.length - 1) / (limit - 1));
      if (index <= previousIndex) index = previousIndex + 1;
      if (index >= items.length) index = items.length - 1;
      sampled.push(items[index]);
      previousIndex = index;
    }
    return sampled;
  }

  function projectedPoint(point, cosine) {
    return {x: point.lng * 111320 * cosine, y: point.lat * 110574};
  }

  function distanceToLineSquared(point, first, second) {
    const dx = second.x - first.x;
    const dy = second.y - first.y;
    if (!dx && !dy) return (point.x - first.x) ** 2 + (point.y - first.y) ** 2;
    const ratio = clamp(((point.x - first.x) * dx + (point.y - first.y) * dy) / (dx * dx + dy * dy), 0, 1);
    const x = first.x + ratio * dx;
    const y = first.y + ratio * dy;
    return (point.x - x) ** 2 + (point.y - y) ** 2;
  }

  function simplifyAtTolerance(points, toleranceMeters) {
    if (points.length <= 2) return points.slice();
    const meanLatitude = points.reduce((sum, point) => sum + point.lat, 0) / points.length;
    const cosine = Math.max(0.08, Math.abs(Math.cos(meanLatitude * Math.PI / 180)));
    const projected = points.map(point => projectedPoint(point, cosine));
    const keep = new Uint8Array(points.length);
    keep[0] = 1;
    keep[points.length - 1] = 1;
    const stack = [[0, points.length - 1]];
    const toleranceSquared = toleranceMeters * toleranceMeters;
    while (stack.length) {
      const [start, end] = stack.pop();
      let bestIndex = -1;
      let bestDistance = toleranceSquared;
      for (let index = start + 1; index < end; index++) {
        const distance = distanceToLineSquared(projected[index], projected[start], projected[end]);
        if (distance > bestDistance) {
          bestDistance = distance;
          bestIndex = index;
        }
      }
      if (bestIndex > start && bestIndex < end) {
        keep[bestIndex] = 1;
        stack.push([start, bestIndex], [bestIndex, end]);
      }
    }
    return points.filter((point, index) => keep[index]);
  }

  function evenSample(points, quota) {
    if (points.length <= quota) return points.slice();
    if (quota <= 2) return [points[0], points[points.length - 1]];
    const sampled = [];
    let previousIndex = -1;
    for (let position = 0; position < quota; position++) {
      let index = Math.round(position * (points.length - 1) / (quota - 1));
      if (index <= previousIndex) index = previousIndex + 1;
      if (index >= points.length) index = points.length - 1;
      sampled.push(points[index]);
      previousIndex = index;
    }
    return sampled;
  }

  function simplifyToQuota(points, quota) {
    if (points.length <= quota) return points.slice();
    let low = 0;
    let high = 0.75;
    let candidate = null;
    for (let attempt = 0; attempt < 18; attempt++) {
      const simplified = simplifyAtTolerance(points, high);
      if (simplified.length <= quota) {
        candidate = simplified;
        break;
      }
      low = high;
      high *= 2;
    }
    if (!candidate) return evenSample(points, quota);
    for (let attempt = 0; attempt < 12; attempt++) {
      const middle = (low + high) / 2;
      const simplified = simplifyAtTolerance(points, middle);
      if (simplified.length <= quota) {
        candidate = simplified;
        high = middle;
      } else {
        low = middle;
      }
    }
    return candidate.length <= quota ? candidate : evenSample(candidate, quota);
  }

  function allocatePointQuotas(segments, pointBudget) {
    const minimum = segments.length * 2;
    const available = Math.max(0, pointBudget - minimum);
    const weights = segments.map(segment => Math.sqrt(Math.max(2, segment.sourcePoints)));
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0) || 1;
    const allocations = segments.map((segment, index) => {
      const exact = available * weights[index] / weightTotal;
      const extra = Math.min(segment.sourcePoints - 2, Math.floor(exact));
      return {quota: 2 + Math.max(0, extra), remainder: exact - Math.floor(exact), index};
    });
    let used = allocations.reduce((sum, allocation) => sum + allocation.quota, 0);
    const order = allocations.slice().sort((first, second) => second.remainder - first.remainder || first.index - second.index);
    while (used < pointBudget) {
      let changed = false;
      for (const allocation of order) {
        if (used >= pointBudget) break;
        if (allocation.quota >= segments[allocation.index].sourcePoints) continue;
        allocation.quota++;
        used++;
        changed = true;
      }
      if (!changed) break;
    }
    return allocations.sort((first, second) => first.index - second.index).map(allocation => allocation.quota);
  }

  function blendHex(first, second, amount) {
    const ratio = clamp(amount, 0, 1);
    const channel = (color, index) => parseInt(color.slice(index, index + 2), 16);
    const components = [1, 3, 5].map(index => Math.round(channel(first, index) + (channel(second, index) - channel(first, index)) * ratio));
    return `#${components.map(value => value.toString(16).padStart(2, '0')).join('')}`;
  }

  function resolvedPalette(theme) {
    const rootElement = typeof document !== 'undefined' ? document.documentElement : null;
    const themeObject = theme && typeof theme === 'object' ? theme : {};
    const requestedName = typeof theme === 'string'
      ? theme
      : themeObject.appTheme ?? themeObject.name ?? themeObject.id ?? rootElement?.dataset?.appTheme;
    const name = Object.prototype.hasOwnProperty.call(THEME_PALETTES, requestedName) ? requestedName : 'default';
    const preset = THEME_PALETTES[name];
    let old = themeObject.watercolorOld ?? themeObject.old ?? themeObject.densityLow ?? preset.old;
    let middle = themeObject.watercolorMiddle ?? themeObject.middle ?? themeObject.densityMid ?? themeObject.trail ?? preset.middle;
    let fresh = themeObject.watercolorFresh ?? themeObject.fresh ?? themeObject.densityHigh ?? themeObject.accent ?? preset.fresh;
    old = validHex(old) ? old : preset.old;
    middle = validHex(middle) ? middle : preset.middle;
    fresh = validHex(fresh) ? fresh : preset.fresh;
    const scheme = String(themeObject.scheme ?? themeObject.mode ?? rootElement?.dataset?.theme ?? '').toLowerCase();
    if (scheme === 'sunlight' || scheme === 'light') {
      old = blendHex(old, '#17252f', 0.12);
      middle = blendHex(middle, '#15362d', 0.1);
      fresh = blendHex(fresh, '#4a3900', 0.14);
    }
    return {name, old, middle, fresh, scheme: scheme || 'dark'};
  }

  function recencyColor(ratio, palette) {
    const normalized = clamp(ratio, 0, 1);
    return normalized <= 0.5
      ? blendHex(palette.old, palette.middle, normalized * 2)
      : blendHex(palette.middle, palette.fresh, (normalized - 0.5) * 2);
  }

  function displacedCoordinates(points, offsetMeters, seed) {
    const phase = (seed % 4096) / 4096 * Math.PI * 2;
    return points.map((point, index) => {
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const cosine = Math.max(0.08, Math.abs(Math.cos(point.lat * Math.PI / 180)));
      const east = (next.lng - previous.lng) * 111320 * cosine;
      const north = (next.lat - previous.lat) * 110574;
      const length = Math.hypot(east, north) || 1;
      const wave = 0.76 + Math.sin(phase + index * 0.31) * 0.16 + Math.sin(phase * 1.7 + index * 0.11) * 0.08;
      const shift = offsetMeters * wave;
      const offsetEast = -north / length * shift;
      const offsetNorth = east / length * shift;
      return [point.lat + offsetNorth / 110574, point.lng + offsetEast / (111320 * cosine)];
    });
  }

  function legend(theme) {
    const palette = resolvedPalette(theme);
    return {
      title: 'Watercolor Atlas',
      description: 'Recorded GPS streets layered like translucent pigment.',
      items: [
        {label: 'Earlier washes', color: palette.old},
        {label: 'Layered history', color: palette.middle},
        {label: 'Fresh pigment', color: palette.fresh}
      ],
      note: 'Only recorded GPS trails are painted. Missing trails are left blank rather than connected stop-to-stop.'
    };
  }

  function renderLegend(target, theme) {
    const model = legend(theme);
    if (typeof document === 'undefined') return model;
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return model;
    const wrapper = document.createElement('div');
    wrapper.className = 'watercolor-atlas-legend';
    model.items.forEach(item => {
      const row = document.createElement('span');
      row.className = 'watercolor-atlas-legend-item';
      const swatch = document.createElement('i');
      swatch.className = 'watercolor-atlas-legend-swatch';
      swatch.style.backgroundColor = item.color;
      const label = document.createElement('b');
      label.textContent = item.label;
      row.append(swatch, label);
      wrapper.append(row);
    });
    element.replaceChildren(wrapper);
    return model;
  }

  function renderFallback(target, message = 'Watercolor Atlas needs recorded GPS streets for this view.') {
    if (typeof document === 'undefined') return message;
    const element = typeof target === 'string' ? document.querySelector(target) : target;
    if (!element) return message;
    const card = document.createElement('div');
    card.className = 'watercolor-atlas-fallback';
    const title = document.createElement('strong');
    title.textContent = 'No streets to paint';
    const copy = document.createElement('span');
    copy.textContent = message;
    card.append(title, copy);
    element.replaceChildren(card);
    return message;
  }

  function clear(layerGroup) {
    if (!layerGroup || (typeof layerGroup !== 'object' && typeof layerGroup !== 'function')) return false;
    const state = ownedRenders.get(layerGroup);
    if (!state) return false;
    state.layers.forEach(layer => {
      try {
        if (typeof layerGroup.removeLayer === 'function') layerGroup.removeLayer(layer);
        else if (typeof layer.remove === 'function') layer.remove();
      } catch {
        try { layer.remove?.(); } catch {}
      }
    });
    try {
      if (state.renderer && state.map && typeof state.map.hasLayer === 'function' && state.map.hasLayer(state.renderer)) state.map.removeLayer(state.renderer);
    } catch {}
    ownedRenders.delete(layerGroup);
    return true;
  }

  function failure(code, message, mode = 'full') {
    return {
      ok: false,
      code,
      message,
      mode,
      segmentSets: 0,
      points: 0,
      renderedPaths: 0,
      renderedPoints: 0,
      clipped: false
    };
  }

  function render(options = {}) {
    const mode = options.lite ? 'lite' : 'full';
    const limits = LIMITS[mode];
    const leaflet = options.L ?? (typeof window !== 'undefined' ? window.L : null);
    const layerGroup = options.layerGroup;
    const map = options.map ?? layerGroup?._map ?? null;
    if (!leaflet || typeof leaflet.polyline !== 'function') {
      return failure('leaflet-unavailable', 'Watercolor Atlas could not start because Leaflet is unavailable.', mode);
    }
    if (typeof leaflet.svg !== 'function') {
      return failure('svg-unavailable', 'Watercolor Atlas requires SVG map rendering on this device.', mode);
    }
    if (!layerGroup || typeof layerGroup.addLayer !== 'function') {
      return failure('layer-unavailable', 'Watercolor Atlas could not find its map layer.', mode);
    }
    if (!map) return failure('map-unavailable', 'Watercolor Atlas could not find the active map.', mode);
    clear(layerGroup);

    const inputRoutes = Array.isArray(options.routes) ? options.routes.filter(route => route && typeof route === 'object') : [];
    if (!inputRoutes.length) return failure('no-routes', 'No saved routes match this view.', mode);
    const routeEntries = inputRoutes
      .map((route, index) => ({route, index, timestamp: finiteNumber(route.startedAt) || 0, key: String(route.id ?? route.startedAt ?? index)}))
      .sort((first, second) => first.timestamp - second.timestamp || first.key.localeCompare(second.key));
    const routesToScan = spreadSample(routeEntries, limits.routeScan);
    const viewport = viewportBox(options.viewportBounds);
    let candidates = [];
    routesToScan.forEach(entry => {
      candidates.push(...extractRouteSegments(entry.route, entry.index, viewport, limits.fragmentsPerRoute));
    });
    candidates.sort((first, second) => first.timestamp - second.timestamp || first.routeIndex - second.routeIndex || first.fragmentIndex - second.fragmentIndex || first.key.localeCompare(second.key));
    if (!candidates.length) {
      return failure('no-recorded-track', 'No recorded GPS streets are available for these routes. Watercolor Atlas never draws artificial stop-to-stop lines.', mode);
    }

    const sourceSegmentSets = candidates.length;
    const sourcePoints = candidates.reduce((sum, segment) => sum + segment.sourcePoints, 0);
    const selected = spreadSample(candidates, limits.segmentSets);
    const quotas = allocatePointQuotas(selected, limits.points);
    const segments = selected
      .map((segment, index) => ({...segment, points: simplifyToQuota(segment.points, quotas[index])}))
      .filter(segment => segment.points.length >= 2);
    const pointCount = segments.reduce((sum, segment) => sum + segment.points.length, 0);
    if (!segments.length || pointCount < 2) return failure('no-renderable-track', 'Recorded streets were found, but none were safe to paint in this view.', mode);

    const palette = resolvedPalette(options.theme);
    const dated = segments.map(segment => segment.timestamp).filter(timestamp => timestamp > 0);
    const oldest = dated.length ? Math.min(...dated) : 0;
    const newest = dated.length ? Math.max(...dated) : 0;
    let renderer = null;
    const layers = [];
    try {
      renderer = leaflet.svg({padding: 0.18});
      if (!renderer) throw new Error('SVG renderer is unavailable');
      const passes = PASSES[mode];
      passes.forEach(pass => {
        segments.forEach((segment, segmentIndex) => {
          const recency = newest > oldest && segment.timestamp > 0 ? (segment.timestamp - oldest) / (newest - oldest) : 0.78;
          const color = recencyColor(recency, palette);
          const seed = hash32(`${segment.key}:${pass.id}`);
          const side = seed & 1 ? 1 : -1;
          const widthVariation = 0.9 + ((seed >>> 8) % 101) / 1000;
          const opacityVariation = 0.94 + ((seed >>> 17) % 61) / 1000;
          const coordinates = displacedCoordinates(segment.points, pass.offsetM * side, seed);
          const line = leaflet.polyline(coordinates, {
            renderer,
            className: `routeheat-watercolor-line routeheat-watercolor-${pass.id}`,
            color,
            weight: pass.weight * widthVariation,
            opacity: clamp(pass.opacity * opacityVariation, 0.04, 0.62),
            lineCap: 'round',
            lineJoin: 'round',
            smoothFactor: pass.smoothFactor,
            interactive: false,
            bubblingMouseEvents: false,
            keyboard: false,
            pane: options.pane
          });
          layerGroup.addLayer(line);
          layers.push(line);
        });
      });
      ownedRenders.set(layerGroup, {layers, renderer, map});
      return {
        ok: true,
        code: 'painted',
        message: `${segments.length} recorded street layer${segments.length === 1 ? '' : 's'} painted from saved GPS trails.`,
        mode,
        passes: PASSES[mode].length,
        segmentSets: segments.length,
        sourceSegmentSets,
        points: pointCount,
        sourcePoints,
        renderedPaths: layers.length,
        renderedPoints: pointCount * PASSES[mode].length,
        clipped: sourceSegmentSets > limits.segmentSets || sourcePoints > limits.points || inputRoutes.length > limits.routeScan,
        limits: {...limits},
        legend: legend(options.theme)
      };
    } catch (error) {
      layers.forEach(layer => {
        try { layerGroup.removeLayer(layer); } catch { try { layer.remove?.(); } catch {} }
      });
      try {
        if (renderer && typeof map.hasLayer === 'function' && map.hasLayer(renderer)) map.removeLayer(renderer);
      } catch {}
      return failure('render-failed', `Watercolor Atlas could not paint this view${error?.message ? `: ${error.message}` : '.'}`, mode);
    }
  }

  const api = Object.freeze({
    version: VERSION,
    limits: LIMITS,
    render,
    clear,
    legend,
    renderLegend,
    renderFallback
  });

  if (typeof window !== 'undefined') window.RouteHeatWatercolor = api;
  else if (typeof globalThis !== 'undefined') globalThis.RouteHeatWatercolor = api;
})();
