import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.112.3';

const ACS_YEAR = 2024;
const SNAPSHOT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const TRACT_CACHE_TTL_MS = 400 * 24 * 60 * 60 * 1000;
const REQUEST_LIMIT = 60;
const COMPUTE_LIMIT = 8;
const GLOBAL_COMPUTE_LIMIT = 240;
const RATE_WINDOW_SECONDS = 60 * 60;
const MAX_ROUTE_ID_LENGTH = 192;
const MAX_ROUTE_STOPS = 5000;
const MAX_ELIGIBLE_STOPS = 1000;
const MAX_TRACTS = 64;
const MAX_COUNTIES = 12;
const MAX_BODY_BYTES = 2048;
const GEOCODER_URL = 'https://geocoding.geo.census.gov/geocoder/geographies/coordinatesbatch';
const ACS_URL = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5`;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://john1017rm.github.io',
  'https://appassets.androidplatform.net'
];
const DEFAULT_CENSUS_BENCHMARK = 'Public_AR_Current';
const DEFAULT_CENSUS_GEOGRAPHY_VINTAGE = 'ACS2024_Current';

type JsonObject = Record<string, unknown>;
type PhaseInfo = { id: string; label: string; type: 'original' | 'rescue'; startedAt: number };
type EligibleStop = {
  id: string;
  lat: number;
  lng: number;
  phaseId: string;
  phaseLabel: string;
  phaseType: 'original' | 'rescue';
  locationCount: number;
};
type CoordinateCluster = { id: string; lat: number; lng: number; stops: EligibleStop[] };
type TractCode = { geoid: string; stateFips: string; countyFips: string; tractCode: string };
type GeocoderSettings = { benchmark: string; vintage: string };
type TractStatistics = {
  name: string;
  homeValue: number | null;
  homeValueMoe90: number | null;
  householdIncome: number | null;
  householdIncomeMoe90: number | null;
  grossRent: number | null;
  grossRentMoe90: number | null;
  medianYearBuilt: number | null;
  medianYearBuiltMoe90: number | null;
  occupiedUnits: number | null;
  ownerOccupiedUnits: number | null;
  renterOccupiedUnits: number | null;
  ownerOccupiedPercent: number | null;
};
type TractMembership = TractCode & {
  stopCount: number;
  phaseCounts: Map<string, number>;
  statistics?: TractStatistics;
};

class PublicError extends Error {
  status: number;
  code: string;
  retryAfter?: number;

  constructor(status: number, code: string, message: string, retryAfter?: number) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryAfter = retryAfter;
  }
}

const textValue = (value: unknown, maximum = 192) => String(value ?? '')
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maximum);

const finiteNumber = (value: unknown) => {
  const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  return Number.isFinite(number) ? number : null;
};

const boundedInteger = (value: unknown, minimum: number, maximum: number) => {
  const number = finiteNumber(value);
  return number !== null && number >= minimum && number <= maximum ? Math.round(number) : null;
};

const boundedEstimate = (value: unknown, minimum = 0, maximum = 1_000_000_000) => {
  const number = finiteNumber(value);
  return number !== null && number >= minimum && number <= maximum ? Math.round(number) : null;
};

function namedEnvironmentKey(name: string) {
  const raw = Deno.env.get(name);
  if (!raw) return '';
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return '';
    const record = parsed as Record<string, unknown>;
    const preferred = record.default ?? Object.values(record)[0];
    if (typeof preferred === 'string') return preferred;
    if (preferred && typeof preferred === 'object' && typeof (preferred as JsonObject).key === 'string') {
      return String((preferred as JsonObject).key);
    }
  } catch {
    return '';
  }
  return '';
}

function configuredOrigins() {
  const supplied = String(Deno.env.get('ROUTEHEAT_ALLOWED_ORIGINS') || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const candidates = supplied.length ? supplied : DEFAULT_ALLOWED_ORIGINS;
  return new Set(candidates.map(value => {
    try { return new URL(value).origin; } catch { return ''; }
  }).filter(Boolean));
}

function censusGeocoderSettings() {
  const configuredYear = String(Deno.env.get('CENSUS_ACS_YEAR') || ACS_YEAR).trim();
  const benchmark = String(Deno.env.get('CENSUS_BENCHMARK') || DEFAULT_CENSUS_BENCHMARK).trim();
  const vintage = String(Deno.env.get('CENSUS_GEOGRAPHY_VINTAGE') || DEFAULT_CENSUS_GEOGRAPHY_VINTAGE).trim();
  if (configuredYear !== String(ACS_YEAR) || benchmark !== DEFAULT_CENSUS_BENCHMARK || vintage !== DEFAULT_CENSUS_GEOGRAPHY_VINTAGE) {
    throw new PublicError(503, 'census_geography_not_configured', 'Census geography settings are not configured correctly.');
  }
  return { benchmark, vintage };
}

function requestOriginAllowed(origin: string | null) {
  if (!origin) return true;
  if (configuredOrigins().has(origin)) return true;
  if (!Deno.env.get('DENO_DEPLOYMENT_ID')) {
    try {
      const url = new URL(origin);
      return (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
        && (url.protocol === 'http:' || url.protocol === 'https:');
    } catch {
      return false;
    }
  }
  return false;
}

function corsHeaders(request: Request) {
  const origin = request.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
  if (origin && requestOriginAllowed(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function jsonResponse(request: Request, status: number, body: JsonObject, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      ...corsHeaders(request),
      ...extraHeaders
    }
  });
}

async function readBody(request: Request) {
  const contentLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new PublicError(413, 'request_too_large', 'Neighborhood Snapshot request is too large.');
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    throw new PublicError(413, 'request_too_large', 'Neighborhood Snapshot request is too large.');
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw || '{}'); }
  catch { throw new PublicError(400, 'invalid_json', 'Send a valid Neighborhood Snapshot request.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new PublicError(400, 'invalid_request', 'Send a valid Neighborhood Snapshot request.');
  }
  const body = parsed as JsonObject;
  const routeId = textValue(body.routeId, MAX_ROUTE_ID_LENGTH + 1);
  if (!routeId || routeId.length > MAX_ROUTE_ID_LENGTH || /[\u0000-\u001f\u007f]/.test(String(body.routeId ?? ''))) {
    throw new PublicError(400, 'invalid_route_id', 'Choose a valid saved route.');
  }
  const action = body.action == null ? 'generate' : String(body.action);
  if (action !== 'generate' && action !== 'delete') {
    throw new PublicError(400, 'invalid_action', 'Neighborhood Snapshot action is not supported.');
  }
  if (body.forceRefresh != null && typeof body.forceRefresh !== 'boolean') {
    throw new PublicError(400, 'invalid_refresh', 'Refresh must be true or false.');
  }
  return { routeId, action, forceRefresh: body.forceRefresh === true };
}

function bearerToken(request: Request) {
  const header = String(request.headers.get('authorization') || '');
  const match = /^Bearer\s+([^\s]+)$/i.exec(header);
  if (!match || match[1].length > 4096) {
    throw new PublicError(401, 'authentication_required', 'Sign in to Cloud before building a snapshot.');
  }
  return match[1];
}

function serverClients(request: Request) {
  const url = String(Deno.env.get('SUPABASE_URL') || '');
  const publishableKey = String(Deno.env.get('SUPABASE_ANON_KEY') || namedEnvironmentKey('SUPABASE_PUBLISHABLE_KEYS'));
  const secretKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || namedEnvironmentKey('SUPABASE_SECRET_KEYS'));
  if (!url || !publishableKey || !secretKey) {
    throw new PublicError(503, 'server_not_configured', 'Neighborhood Snapshot server credentials are not configured.');
  }
  const authorization = String(request.headers.get('authorization') || '');
  return {
    user: createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: authorization } }
    }),
    admin: createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    })
  };
}

async function authenticatedUserId(request: Request, client: SupabaseClient) {
  const token = bearerToken(request);
  const { data, error } = await client.auth.getUser(token);
  const id = String(data?.user?.id || '');
  if (error || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new PublicError(401, 'invalid_session', 'Cloud session expired. Sign in again, then retry.');
  }
  return id;
}

async function takeRateLimit(admin: SupabaseClient, userId: string, bucket: 'snapshot_request' | 'snapshot_compute', limit: number) {
  const { data, error } = await admin.rpc('routeheat_take_function_rate_limit', {
    p_user_id: userId,
    p_bucket: bucket,
    p_limit: limit,
    p_window_seconds: RATE_WINDOW_SECONDS
  });
  if (error) {
    throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot database setup is incomplete.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true) {
    const resetAt = Date.parse(String(row?.reset_at || ''));
    const retryAfter = Number.isFinite(resetAt) ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : RATE_WINDOW_SECONDS;
    throw new PublicError(429, 'snapshot_rate_limited', 'Snapshot limit reached. Wait a little while, then retry.', retryAfter);
  }
}

async function takeGlobalComputeLimit(admin: SupabaseClient) {
  const { data, error } = await admin.rpc('routeheat_take_global_function_rate_limit', {
    p_bucket: 'snapshot_compute',
    p_limit: GLOBAL_COMPUTE_LIMIT,
    p_window_seconds: RATE_WINDOW_SECONDS
  });
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot database setup is incomplete.');
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.allowed !== true) {
    const resetAt = Date.parse(String(row?.reset_at || ''));
    const retryAfter = Number.isFinite(resetAt) ? Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) : RATE_WINDOW_SECONDS;
    throw new PublicError(429, 'snapshot_project_limit', 'Neighborhood Snapshot is busy for everyone right now. Wait a little while, then retry.', retryAfter);
  }
}

function normalizePhases(route: JsonObject) {
  const raw = Array.isArray(route.phases) ? route.phases : [];
  const phases: PhaseInfo[] = raw.slice(0, 24).flatMap((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const phase = item as JsonObject;
    const id = textValue(phase.id, 192) || `phase-${index + 1}`;
    const type = phase.type === 'rescue' ? 'rescue' : 'original';
    const label = textValue(phase.label, 64) || (type === 'rescue' ? `Rescue ${index || 1}` : 'Original route');
    return [{ id, type, label, startedAt: Math.max(0, finiteNumber(phase.startedAt) || 0) } as PhaseInfo];
  });
  if (!phases.length) phases.push({ id: 'phase-main', type: 'original', label: 'Original route', startedAt: Math.max(0, finiteNumber(route.startedAt) || 0) });
  const seen = new Set<string>();
  return phases.filter(phase => !seen.has(phase.id) && !!seen.add(phase.id));
}

function phaseForStop(stop: JsonObject, phases: PhaseInfo[]) {
  const requested = textValue(stop.phaseId, 192);
  const exact = phases.find(phase => phase.id === requested);
  if (exact) return exact;
  const timestamp = finiteNumber(stop.timestamp) || 0;
  return phases.slice().reverse().find(phase => timestamp >= phase.startedAt) || phases[0];
}

function eligibleRouteStops(route: JsonObject, phases: PhaseInfo[]) {
  const rawStops = Array.isArray(route.stops) ? route.stops : [];
  if (rawStops.length > MAX_ROUTE_STOPS) {
    throw new PublicError(422, 'route_too_large', 'This route contains too many stop records for Neighborhood Snapshot.');
  }
  const eligible: EligibleStop[] = [];
  rawStops.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return;
    const stop = item as JsonObject;
    const lat = finiteNumber(stop.lat);
    const lng = finiteNumber(stop.lng);
    if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    if (Math.abs(lat) < 0.01 && Math.abs(lng) < 0.01) return;
    const locationSource = String(stop.locationSource || '');
    const accuracy = finiteNumber(stop.accuracy);
    const manual = locationSource === 'manual' || stop.manualLocation === true;
    if (!manual && locationSource !== 'gps') return;
    if (!manual && accuracy !== null && accuracy > 100) return;
    const phase = phaseForStop(stop, phases);
    eligible.push({
      id: textValue(stop.id, 192) || `stop-${index + 1}`,
      lat,
      lng,
      phaseId: phase.id,
      phaseLabel: phase.label,
      phaseType: phase.type,
      locationCount: boundedInteger(stop.locationCount, 1, 20) || 1
    });
  });
  if (!eligible.length) {
    throw new PublicError(422, 'no_mapped_stops', 'No trusted mapped stops are available for this route.');
  }
  if (eligible.length > MAX_ELIGIBLE_STOPS) {
    throw new PublicError(422, 'too_many_mapped_stops', 'This route has too many mapped stops for one snapshot.');
  }
  return eligible;
}

function coordinateClusters(stops: EligibleStop[]) {
  const byCoordinate = new Map<string, CoordinateCluster>();
  stops.forEach(stop => {
    const key = `${stop.lat.toFixed(5)},${stop.lng.toFixed(5)}`;
    const existing = byCoordinate.get(key);
    if (existing) existing.stops.push(stop);
    else byCoordinate.set(key, { id: '', lat: stop.lat, lng: stop.lng, stops: [stop] });
  });
  return [...byCoordinate.values()].map((cluster, index) => ({ ...cluster, id: String(index + 1) }));
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function routeInputHash(routeId: string, route: JsonObject, phases: PhaseInfo[], stops: EligibleStop[], geocoder: GeocoderSettings) {
  return sha256({
    version: 1,
    routeId,
    endedAt: finiteNumber(route.endedAt) || 0,
    geocoder,
    phases: phases.map(({ id, label, type, startedAt }) => ({ id, label, type, startedAt })),
    stops: stops.map(stop => ({
      id: stop.id,
      lat: Number(stop.lat.toFixed(5)),
      lng: Number(stop.lng.toFixed(5)),
      phaseId: stop.phaseId,
      locationCount: stop.locationCount
    }))
  });
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  catch { throw new PublicError(502, 'census_unavailable', 'U.S. Census data is temporarily unavailable. Try again later.'); }
  finally { clearTimeout(timer); }
}

async function fetchCensusWithRetry(url: string, init: RequestInit, timeoutMs: number, attempts = 2) {
  let lastFailure: unknown = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(url, init, timeoutMs);
      if (response.status !== 429 && response.status < 500) return response;
      lastFailure = new PublicError(502, 'census_unavailable', 'U.S. Census data is temporarily unavailable. Try again later.');
    } catch (error) {
      lastFailure = error;
    }
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, 220 + Math.floor(Math.random() * 280)));
  }
  if (lastFailure instanceof PublicError) throw lastFailure;
  throw new PublicError(502, 'census_unavailable', 'U.S. Census data is temporarily unavailable. Try again later.');
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (character === '"') quoted = false;
      else field += character;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === ',') { row.push(field); field = ''; }
    else if (character === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (character !== '\r') field += character;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function parseBatchTracts(csv: string) {
  const results = new Map<string, TractCode>();
  for (const row of parseCsv(csv.replace(/^\uFEFF/, ''))) {
    const id = textValue(row[0], 32);
    if (!/^\d{1,4}$/.test(id)) continue;
    let codes: string[] | null = null;
    for (let index = row.length - 3; index >= 1; index -= 1) {
      const candidate = row.slice(index, index + 3).map(value => String(value || '').trim());
      if (/^\d{2}$/.test(candidate[0]) && /^\d{3}$/.test(candidate[1]) && /^\d{6}$/.test(candidate[2])) {
        codes = candidate;
        break;
      }
    }
    if (!codes) continue;
    const [stateFips, countyFips, tractCode] = codes;
    results.set(id, { stateFips, countyFips, tractCode, geoid: `${stateFips}${countyFips}${tractCode}` });
  }
  return results;
}

async function batchGeocode(clusters: CoordinateCluster[], settings: GeocoderSettings) {
  const csv = clusters.map(cluster => `${cluster.id},${cluster.lng.toFixed(6)},${cluster.lat.toFixed(6)}`).join('\n');
  const form = new FormData();
  form.append('coordinatesFile', new Blob([csv], { type: 'text/csv' }), 'routeheat-coordinates.csv');
  form.append('benchmark', settings.benchmark);
  form.append('vintage', settings.vintage);
  const response = await fetchCensusWithRetry(GEOCODER_URL, { method: 'POST', body: form }, 25_000, 2);
  if (!response.ok) throw new PublicError(502, 'census_geocoder_failed', 'U.S. Census geography matching is temporarily unavailable.');
  const output = await response.text();
  if (!output || output.length > 2_000_000) throw new PublicError(502, 'census_geocoder_failed', 'U.S. Census geography matching returned an invalid response.');
  const matches = parseBatchTracts(output);
  if (!matches.size) throw new PublicError(422, 'outside_census_coverage', 'No Census tracts matched this route. Neighborhood Snapshot covers U.S. routes only.');
  return matches;
}

function validStatistics(value: unknown): value is TractStatistics {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const statistics = value as JsonObject;
  if (!textValue(statistics.name, 200)) return false;
  const ranges: [keyof TractStatistics, number, number][] = [
    ['homeValue', 0, 1_000_000_000],
    ['homeValueMoe90', 0, 1_000_000_000],
    ['householdIncome', 0, 1_000_000_000],
    ['householdIncomeMoe90', 0, 1_000_000_000],
    ['grossRent', 0, 10_000_000],
    ['grossRentMoe90', 0, 10_000_000],
    ['medianYearBuilt', 1600, 2200],
    ['medianYearBuiltMoe90', 0, 1000],
    ['occupiedUnits', 0, 100_000_000],
    ['ownerOccupiedUnits', 0, 100_000_000],
    ['renterOccupiedUnits', 0, 100_000_000],
    ['ownerOccupiedPercent', 0, 100]
  ];
  const inRange = ranges.every(([key, minimum, maximum]) => {
    if (statistics[key] == null) return true;
    const number = Number(statistics[key]);
    return Number.isFinite(number) && number >= minimum && number <= maximum;
  });
  if (!inRange) return false;
  const occupied = statistics.occupiedUnits == null ? null : Number(statistics.occupiedUnits);
  const owner = statistics.ownerOccupiedUnits == null ? null : Number(statistics.ownerOccupiedUnits);
  const renter = statistics.renterOccupiedUnits == null ? null : Number(statistics.renterOccupiedUnits);
  return !(occupied !== null && ((owner !== null && owner > occupied) || (renter !== null && renter > occupied)));
}

function censusValue(headers: string[], row: unknown[], variable: string, minimum = 0, maximum = 1_000_000_000) {
  const index = headers.indexOf(variable);
  if (index < 0) return null;
  const annotationIndex = headers.indexOf(`${variable}A`);
  if (annotationIndex >= 0 && textValue(row[annotationIndex], 64)) return null;
  return boundedEstimate(row[index], minimum, maximum);
}

function statisticsFromAcsRow(headers: string[], row: unknown[]): TractStatistics | null {
  const nameIndex = headers.indexOf('NAME');
  const name = textValue(nameIndex >= 0 ? row[nameIndex] : '', 200);
  if (!name) return null;
  const occupiedUnits = censusValue(headers, row, 'B25003_001E', 0, 100_000_000);
  const ownerOccupiedUnits = censusValue(headers, row, 'B25003_002E', 0, 100_000_000);
  const renterOccupiedUnits = censusValue(headers, row, 'B25003_003E', 0, 100_000_000);
  const ownerOccupiedPercent = occupiedUnits !== null && occupiedUnits > 0 && ownerOccupiedUnits !== null
    ? Math.round(ownerOccupiedUnits / occupiedUnits * 1000) / 10
    : null;
  const statistics: TractStatistics = {
    name,
    homeValue: censusValue(headers, row, 'B25077_001E'),
    homeValueMoe90: censusValue(headers, row, 'B25077_001M'),
    householdIncome: censusValue(headers, row, 'B19013_001E'),
    householdIncomeMoe90: censusValue(headers, row, 'B19013_001M'),
    grossRent: censusValue(headers, row, 'B25064_001E', 0, 10_000_000),
    grossRentMoe90: censusValue(headers, row, 'B25064_001M', 0, 10_000_000),
    medianYearBuilt: censusValue(headers, row, 'B25035_001E', 1600, 2200),
    medianYearBuiltMoe90: censusValue(headers, row, 'B25035_001M', 0, 1000),
    occupiedUnits,
    ownerOccupiedUnits,
    renterOccupiedUnits,
    ownerOccupiedPercent
  };
  return validStatistics(statistics) ? statistics : null;
}

async function fetchAcsCounty(codes: TractCode[], censusApiKey: string) {
  const first = codes[0];
  if (!first) return new Map<string, { code: TractCode; value: TractStatistics }>();
  const variables = [
    'NAME',
    'B25077_001E', 'B25077_001M', 'B25077_001EA', 'B25077_001MA',
    'B19013_001E', 'B19013_001M', 'B19013_001EA', 'B19013_001MA',
    'B25064_001E', 'B25064_001M', 'B25064_001EA', 'B25064_001MA',
    'B25035_001E', 'B25035_001M', 'B25035_001EA', 'B25035_001MA',
    'B25003_001E', 'B25003_001EA', 'B25003_002E', 'B25003_002EA', 'B25003_003E', 'B25003_003EA'
  ];
  const url = new URL(ACS_URL);
  url.searchParams.set('get', variables.join(','));
  url.searchParams.set('for', 'tract:*');
  url.searchParams.set('in', `state:${first.stateFips} county:${first.countyFips}`);
  url.searchParams.set('key', censusApiKey);
  const response = await fetchCensusWithRetry(url.toString(), { method: 'GET', headers: { Accept: 'application/json' } }, 10_000, 2);
  if (response.status === 401 || response.status === 403) throw new PublicError(503, 'census_key_invalid', 'Census API key is not accepted. Update the Supabase secret, then retry.');
  if (!response.ok) throw new PublicError(502, 'census_data_failed', 'U.S. Census estimates are temporarily unavailable.');
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const raw = await response.text();
  if (/missing\s+key|invalid\s+key/i.test(raw)) throw new PublicError(503, 'census_key_invalid', 'Census API key is not accepted. Update the Supabase secret, then retry.');
  if (!contentType.includes('json') || !raw || raw.length > 12_000_000) throw new PublicError(502, 'census_data_failed', 'U.S. Census estimates returned an invalid response.');
  let payload: unknown;
  try { payload = JSON.parse(raw); }
  catch { throw new PublicError(502, 'census_data_failed', 'U.S. Census estimates returned an invalid response.'); }
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) throw new PublicError(502, 'census_data_failed', 'U.S. Census estimates returned an invalid response.');
  const headers = (payload[0] as unknown[]).map(String);
  const stateIndex = headers.indexOf('state'), countyIndex = headers.indexOf('county'), tractIndex = headers.indexOf('tract');
  if (stateIndex < 0 || countyIndex < 0 || tractIndex < 0) throw new PublicError(502, 'census_data_failed', 'U.S. Census estimates returned an invalid response.');
  const requested = new Map(codes.map(code => [code.geoid, code]));
  const result = new Map<string, { code: TractCode; value: TractStatistics }>();
  (payload.slice(1) as unknown[]).forEach(rawRow => {
    if (!Array.isArray(rawRow)) return;
    const geoid = `${String(rawRow[stateIndex] || '')}${String(rawRow[countyIndex] || '')}${String(rawRow[tractIndex] || '')}`;
    const code = requested.get(geoid);
    if (!code) return;
    const value = statisticsFromAcsRow(headers, rawRow);
    if (value) result.set(geoid, { code, value });
  });
  return result;
}

async function concurrentMap<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

async function tractStatistics(admin: SupabaseClient, codes: TractCode[], censusApiKey: string) {
  const nowIso = new Date().toISOString();
  const geoids = [...new Set(codes.map(code => code.geoid))];
  const { data, error } = await admin
    .from('routeheat_census_tract_cache')
    .select('geoid,name,statistics,expires_at')
    .eq('data_year', ACS_YEAR)
    .in('geoid', geoids)
    .gt('expires_at', nowIso);
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot cache setup is incomplete.');
  const statistics = new Map<string, TractStatistics>();
  (data || []).forEach(row => {
    const geoid = String(row.geoid || '');
    const candidate = row.statistics as unknown;
    if (/^\d{11}$/.test(geoid) && validStatistics(candidate)) {
      statistics.set(geoid, { ...(candidate as TractStatistics), name: textValue(row.name, 200) || candidate.name });
    }
  });
  const missing = codes.filter((code, index) => codes.findIndex(candidate => candidate.geoid === code.geoid) === index && !statistics.has(code.geoid));
  const countyGroups = new Map<string, TractCode[]>();
  missing.forEach(code => { const key = `${code.stateFips}${code.countyFips}`, group = countyGroups.get(key) || []; group.push(code); countyGroups.set(key, group); });
  if (countyGroups.size > MAX_COUNTIES) throw new PublicError(422, 'too_many_counties', 'This route crosses too many counties for one snapshot.');
  const countyResults = await concurrentMap([...countyGroups.values()], 3, group => fetchAcsCounty(group, censusApiKey));
  const fetched = countyResults.flatMap(group => [...group.values()]);
  const cacheRows: JsonObject[] = [];
  const fetchedAt = new Date();
  const expiresAt = new Date(fetchedAt.getTime() + TRACT_CACHE_TTL_MS);
  fetched.forEach(({ code, value }) => {
    statistics.set(code.geoid, value);
    cacheRows.push({
      data_year: ACS_YEAR,
      geoid: code.geoid,
      state_fips: code.stateFips,
      county_fips: code.countyFips,
      tract_code: code.tractCode,
      name: value.name,
      statistics: value,
      fetched_at: fetchedAt.toISOString(),
      expires_at: expiresAt.toISOString()
    });
  });
  if (cacheRows.length) {
    const { error: writeError } = await admin.from('routeheat_census_tract_cache').upsert(cacheRows, { onConflict: 'data_year,geoid' });
    if (writeError) throw new PublicError(503, 'snapshot_cache_failed', 'Neighborhood Snapshot cache could not be updated.');
  }
  return statistics;
}

function weightedMedian<T>(items: T[], valueOf: (item: T) => number | null, weightOf: (item: T) => number) {
  const valid = items.map(item => ({ value: valueOf(item), weight: Math.max(0, weightOf(item)) }))
    .filter(item => item.value !== null && Number.isFinite(item.value) && item.weight > 0) as { value: number; weight: number }[];
  if (!valid.length) return null;
  valid.sort((first, second) => first.value - second.value);
  const midpoint = valid.reduce((sum, item) => sum + item.weight, 0) / 2;
  let cumulative = 0;
  for (const item of valid) {
    cumulative += item.weight;
    if (cumulative >= midpoint) return item.value;
  }
  return valid[valid.length - 1].value;
}

function weightedMedianMember<T>(items: T[], valueOf: (item: T) => number | null, weightOf: (item: T) => number) {
  const valid = items.map(item => ({ item, value: valueOf(item), weight: Math.max(0, weightOf(item)) }))
    .filter(entry => entry.value !== null && Number.isFinite(entry.value) && entry.weight > 0) as { item: T; value: number; weight: number }[];
  if (!valid.length) return null;
  valid.sort((first, second) => first.value - second.value);
  const midpoint = valid.reduce((sum, entry) => sum + entry.weight, 0) / 2;
  let cumulative = 0;
  for (const entry of valid) {
    cumulative += entry.weight;
    if (cumulative >= midpoint) return entry.item;
  }
  return valid[valid.length - 1].item;
}

function summaryFor(memberships: TractMembership[], weightOf: (membership: TractMembership) => number) {
  const withStatistics = memberships.filter(membership => membership.statistics && weightOf(membership) > 0);
  const values = (key: keyof TractStatistics) => withStatistics
    .map(membership => membership.statistics?.[key])
    .filter(value => typeof value === 'number' && Number.isFinite(value)) as number[];
  const median = (key: keyof TractStatistics) => weightedMedian(
    withStatistics,
    membership => {
      const value = membership.statistics?.[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    },
    weightOf
  );
  const selected = (key: keyof TractStatistics) => weightedMedianMember(
    withStatistics,
    membership => {
      const value = membership.statistics?.[key];
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    },
    weightOf
  );
  const homeValues = values('homeValue');
  const homeArea = selected('homeValue'), incomeArea = selected('householdIncome'), rentArea = selected('grossRent');
  return {
    typicalDeliveredAreaHomeValue: homeArea?.statistics?.homeValue ?? null,
    homeValueRange: {
      min: homeValues.length ? Math.min(...homeValues) : null,
      max: homeValues.length ? Math.max(...homeValues) : null
    },
    homeValueMoe90: homeArea?.statistics?.homeValueMoe90 ?? null,
    typicalHouseholdIncome: incomeArea?.statistics?.householdIncome ?? null,
    householdIncomeMoe90: incomeArea?.statistics?.householdIncomeMoe90 ?? null,
    typicalGrossRent: rentArea?.statistics?.grossRent ?? null,
    grossRentMoe90: rentArea?.statistics?.grossRentMoe90 ?? null,
    ownerOccupiedPercent: median('ownerOccupiedPercent'),
    medianYearBuilt: median('medianYearBuilt')
  };
}

function summaryHasData(summary: ReturnType<typeof summaryFor>) {
  return summary.typicalDeliveredAreaHomeValue !== null
    || summary.typicalHouseholdIncome !== null
    || summary.typicalGrossRent !== null
    || summary.ownerOccupiedPercent !== null
    || summary.medianYearBuilt !== null;
}

function buildSnapshot(
  inputHash: string,
  phases: PhaseInfo[],
  eligibleStops: EligibleStop[],
  memberships: TractMembership[]
) {
  const usable = memberships.filter(membership => membership.statistics);
  const matchedStops = usable.reduce((sum, membership) => sum + membership.stopCount, 0);
  const summary = summaryFor(usable, membership => membership.stopCount);
  if (!matchedStops || !summaryHasData(summary)) {
    throw new PublicError(422, 'census_estimates_unavailable', 'Census housing estimates are unavailable for the matched route areas.');
  }
  const phaseById = new Map(phases.map(phase => [phase.id, phase]));
  const areas = usable.slice().sort((first, second) => second.stopCount - first.stopCount || first.geoid.localeCompare(second.geoid)).slice(0, 32).map(membership => {
    const statistics = membership.statistics!;
    return {
      geoid: membership.geoid,
      name: statistics.name,
      stopCount: membership.stopCount,
      stopShare: Math.round(membership.stopCount / matchedStops * 1000) / 10,
      homeValue: { estimate: statistics.homeValue, moe90: statistics.homeValueMoe90 },
      householdIncome: statistics.householdIncome,
      grossRent: statistics.grossRent,
      ownerOccupiedPercent: statistics.ownerOccupiedPercent,
      medianYearBuilt: statistics.medianYearBuilt,
      phaseLabels: [...membership.phaseCounts.entries()]
        .filter(([, count]) => count > 0)
        .sort((first, second) => second[1] - first[1])
        .map(([id]) => phaseById.get(id)?.label || 'Route phase')
        .slice(0, 12)
    };
  });
  const phaseRows = phases.flatMap(phase => {
    const eligible = eligibleStops.filter(stop => stop.phaseId === phase.id).length;
    if (!eligible) return [];
    const matched = usable.reduce((sum, membership) => sum + (membership.phaseCounts.get(phase.id) || 0), 0);
    const phaseMemberships = usable.filter(membership => (membership.phaseCounts.get(phase.id) || 0) > 0);
    const phaseSummary = summaryFor(phaseMemberships, membership => membership.phaseCounts.get(phase.id) || 0);
    if (!summaryHasData(phaseSummary)) return [];
    return [{
      id: phase.id,
      label: phase.label,
      type: phase.type,
      coverage: {
        eligibleStops: eligible,
        matchedStops: matched,
        matchedPercent: Math.round(matched / eligible * 1000) / 10,
        tractCount: phaseMemberships.length
      },
      summary: phaseSummary
    }];
  });
  return {
    version: 1,
    source: {
      agency: 'U.S. Census Bureau',
      dataset: '2020–2024 ACS 5-Year Detailed Tables',
      year: ACS_YEAR,
      geography: 'Census tract',
      generatedAt: new Date().toISOString()
    },
    coverage: {
      eligibleStops: eligibleStops.length,
      matchedStops,
      matchedPercent: Math.round(matchedStops / eligibleStops.length * 1000) / 10,
      tractCount: usable.length,
      approximateStops: 0
    },
    summary,
    areas,
    phases: phaseRows,
    inputHash,
    cached: false
  };
}

async function readCachedSnapshot(admin: SupabaseClient, userId: string, routeId: string, inputHash: string) {
  const { data, error } = await admin
    .from('routeheat_neighborhood_snapshots')
    .select('snapshot_data,input_hash,data_year,expires_at')
    .eq('user_id', userId)
    .eq('route_id', routeId)
    .eq('input_hash', inputHash)
    .eq('data_year', ACS_YEAR)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot cache setup is incomplete.');
  if (!data?.snapshot_data || typeof data.snapshot_data !== 'object' || Number((data.snapshot_data as JsonObject).version) !== 1) return null;
  return { ...(data.snapshot_data as JsonObject), cached: true };
}

async function beginSnapshotGeneration(
  admin: SupabaseClient,
  userId: string,
  routeId: string,
  expectedGeneration: number,
  expectedRevision: number,
  expectedUpdatedAt: number
) {
  const { data, error } = await admin.rpc('routeheat_begin_neighborhood_generation', {
    p_user_id: userId,
    p_route_id: routeId,
    p_expected_generation: expectedGeneration,
    p_expected_revision: expectedRevision,
    p_expected_updated_at: expectedUpdatedAt
  });
  const generation = boundedInteger(data, 1, Number.MAX_SAFE_INTEGER);
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot database setup is incomplete.');
  if (generation === null) throw new PublicError(409, 'snapshot_canceled', 'The route changed or was removed before this snapshot started. Sync, then retry.');
  return generation;
}

async function validateSnapshotGeneration(
  admin: SupabaseClient,
  userId: string,
  routeId: string,
  generation: number,
  expectedRevision: number,
  expectedUpdatedAt: number
) {
  const { data, error } = await admin.rpc('routeheat_validate_neighborhood_generation', {
    p_user_id: userId,
    p_route_id: routeId,
    p_generation: generation,
    p_expected_revision: expectedRevision,
    p_expected_updated_at: expectedUpdatedAt
  });
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot database setup is incomplete.');
  if (data !== true) throw new PublicError(409, 'snapshot_canceled', 'Snapshot canceled because the route changed or was removed.');
}

async function writeSnapshot(
  admin: SupabaseClient,
  userId: string,
  routeId: string,
  generation: number,
  expectedRevision: number,
  expectedUpdatedAt: number,
  inputHash: string,
  snapshot: JsonObject
) {
  const now = new Date();
  const { data, error } = await admin.rpc('routeheat_store_neighborhood_snapshot', {
    p_user_id: userId,
    p_route_id: routeId,
    p_generation: generation,
    p_expected_revision: expectedRevision,
    p_expected_updated_at: expectedUpdatedAt,
    p_input_hash: inputHash,
    p_data_year: ACS_YEAR,
    p_snapshot_data: snapshot,
    p_expires_at: new Date(now.getTime() + SNAPSHOT_TTL_MS).toISOString()
  });
  if (error) throw new PublicError(503, 'snapshot_cache_failed', 'Neighborhood Snapshot could not be protected in its private cache.');
  if (data !== true) throw new PublicError(409, 'snapshot_canceled', 'Snapshot canceled because the route changed or was removed.');
}

async function deleteSnapshot(admin: SupabaseClient, userId: string, routeId: string) {
  const { error } = await admin.rpc('routeheat_remove_neighborhood_snapshot', { p_user_id: userId, p_route_id: routeId });
  if (error) throw new PublicError(503, 'snapshot_delete_failed', 'Neighborhood Snapshot cache could not be removed.');
}

async function readRoute(client: SupabaseClient, userId: string, routeId: string) {
  const { data, error } = await client.rpc('routeheat_neighborhood_route_input', { p_route_id: routeId });
  if (error) throw new PublicError(503, 'snapshot_setup_incomplete', 'Neighborhood Snapshot database setup is incomplete.');
  if (!data) throw new PublicError(404, 'route_not_found', 'Route not found in Cloud. Sync once, then retry.');
  if (typeof data !== 'object' || Array.isArray(data) || !finiteNumber((data as JsonObject).endedAt)) {
    throw new PublicError(422, 'route_not_finished', 'Neighborhood Snapshot is available after a route is finished and safely synced.');
  }
  return data as JsonObject;
}

async function generateSnapshot(
  admin: SupabaseClient,
  userClient: SupabaseClient,
  userId: string,
  routeId: string,
  forceRefresh: boolean,
  censusApiKey: string
) {
  const route = await readRoute(userClient, userId, routeId);
  const routeRevision = Math.max(0, Math.round(finiteNumber(route.revision) || 0));
  const routeUpdatedAt = Math.max(0, finiteNumber(route.updatedAt) || finiteNumber(route.endedAt) || 0);
  const routeGeneration = boundedInteger(route.neighborhoodGeneration, 0, Number.MAX_SAFE_INTEGER);
  if (routeGeneration === null || routeUpdatedAt < 1) {
    throw new PublicError(409, 'route_version_unavailable', 'Cloud is still saving the latest route version. Sync, then retry.');
  }
  const phases = normalizePhases(route);
  const eligibleStops = eligibleRouteStops(route, phases);
  const geocoder = censusGeocoderSettings();
  const inputHash = await routeInputHash(routeId, route, phases, eligibleStops, geocoder);
  const generation = await beginSnapshotGeneration(admin, userId, routeId, routeGeneration, routeRevision, routeUpdatedAt);
  const stampRouteVersion = (snapshot: JsonObject) => ({ ...snapshot, routeRevision, routeUpdatedAt, serverGeneration: generation });
  if (!forceRefresh) {
    const cached = await readCachedSnapshot(admin, userId, routeId, inputHash);
    if (cached) {
      await validateSnapshotGeneration(admin, userId, routeId, generation, routeRevision, routeUpdatedAt);
      return stampRouteVersion(cached);
    }
  }
  await takeRateLimit(admin, userId, 'snapshot_compute', COMPUTE_LIMIT);
  await takeGlobalComputeLimit(admin);
  const clusters = coordinateClusters(eligibleStops);
  const matches = await batchGeocode(clusters, geocoder);
  const membershipByGeoid = new Map<string, TractMembership>();
  clusters.forEach(cluster => {
    const code = matches.get(cluster.id);
    if (!code) return;
    const membership = membershipByGeoid.get(code.geoid) || { ...code, stopCount: 0, phaseCounts: new Map<string, number>() };
    membership.stopCount += cluster.stops.length;
    cluster.stops.forEach(stop => membership.phaseCounts.set(stop.phaseId, (membership.phaseCounts.get(stop.phaseId) || 0) + 1));
    membershipByGeoid.set(code.geoid, membership);
  });
  const memberships = [...membershipByGeoid.values()];
  if (!memberships.length) throw new PublicError(422, 'outside_census_coverage', 'No Census tracts matched this route. Neighborhood Snapshot covers U.S. routes only.');
  if (memberships.length > MAX_TRACTS) throw new PublicError(422, 'too_many_tracts', 'This route crosses too many Census tracts for one snapshot.');
  const statistics = await tractStatistics(admin, memberships, censusApiKey);
  memberships.forEach(membership => { membership.statistics = statistics.get(membership.geoid); });
  const snapshot = stampRouteVersion(buildSnapshot(inputHash, phases, eligibleStops, memberships) as unknown as JsonObject);
  await writeSnapshot(admin, userId, routeId, generation, routeRevision, routeUpdatedAt, inputHash, snapshot);
  return snapshot;
}

Deno.serve(async request => {
  if (!requestOriginAllowed(request.headers.get('origin'))) {
    return jsonResponse(request, 403, { error: 'origin_not_allowed', message: 'This RouteHeat origin is not allowed.' });
  }
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
  if (request.method !== 'POST') {
    return jsonResponse(request, 405, { error: 'method_not_allowed', message: 'Use POST for Neighborhood Snapshot.' }, { Allow: 'POST, OPTIONS' });
  }
  try {
    const body = await readBody(request);
    const clients = serverClients(request);
    const userId = await authenticatedUserId(request, clients.user);
    if (body.action === 'delete') {
      await deleteSnapshot(clients.admin, userId, body.routeId);
      return jsonResponse(request, 200, { deleted: true });
    }
    await takeRateLimit(clients.admin, userId, 'snapshot_request', REQUEST_LIMIT);
    const censusApiKey = String(Deno.env.get('CENSUS_API_KEY') || '').trim();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(censusApiKey)) {
      throw new PublicError(503, 'census_key_missing', 'Census API key is not configured in Supabase.');
    }
    const snapshot = await generateSnapshot(
      clients.admin,
      clients.user,
      userId,
      body.routeId,
      body.forceRefresh,
      censusApiKey
    );
    return jsonResponse(request, 200, { snapshot: snapshot as unknown as JsonObject });
  } catch (error) {
    const failure = error instanceof PublicError
      ? error
      : new PublicError(500, 'snapshot_failed', 'Neighborhood Snapshot could not be completed.');
    const extra = failure.retryAfter ? { 'Retry-After': String(failure.retryAfter) } : {};
    return jsonResponse(request, failure.status, { error: failure.code, message: failure.message }, extra);
  }
});
