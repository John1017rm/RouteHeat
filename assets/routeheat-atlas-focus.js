/* Read-only shortcuts over the atlas's already filtered stop-visit clusters. */
((root) => {
  'use strict';
  const finite = value => value == null || typeof value === 'boolean' || String(value).trim() === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const size = value => Math.max(0, finite(value?.size) ?? (Array.isArray(value) ? value.length : 0));

  function bestStop(clusters) {
    const eligible = (Array.isArray(clusters) ? clusters : []).filter(cluster => {
      const lat = finite(cluster?.lat), lng = finite(cluster?.lng), visits = finite(cluster?.visits);
      return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isInteger(visits) && visits > 0;
    });
    if (!eligible.length) return null;
    // Every cluster has at most one visit per saved route. Break equal counts by
    // most recent visit and then position so repeated renders never jump around.
    eligible.sort((first, second) => Number(second.visits) - Number(first.visits)
      || (finite(second.lastAt) || 0) - (finite(first.lastAt) || 0)
      || Number(first.lat) - Number(second.lat) || Number(first.lng) - Number(second.lng)
      || String(first.id || '').localeCompare(String(second.id || '')));
    return {cluster: eligible[0], ties: eligible.filter(cluster => Number(cluster.visits) === Number(eligible[0].visits)).length, areas: eligible.length};
  }

  function popupHtml(choice, {filterLabels = [], dateLabel = value => new Date(value).toLocaleDateString()} = {}) {
    if (!choice?.cluster) return '';
    const cluster = choice.cluster, visits = Number(cluster.visits), routes = size(cluster.routeIds), days = size(cluster.days);
    const first = finite(cluster.firstAt), latest = finite(cluster.lastAt), locations = finite(cluster.totalLocations);
    const scope = filterLabels.length ? `Current filters: ${filterLabels.join(' · ')}` : 'All saved routes';
    const title = choice.ties > 1 ? 'Tied most delivered stop' : 'Most delivered stop';
    return `<div class="visit-cluster-popup atlas-focus-popup"><strong class="visit-cluster-title">${title}</strong><span class="atlas-focus-total">${visits.toLocaleString()} <small>recorded route visit${visits === 1 ? '' : 's'}</small></span><span class="visit-cluster-meta">${routes.toLocaleString()} route${routes === 1 ? '' : 's'} · ${days.toLocaleString()} delivery day${days === 1 ? '' : 's'}${locations != null && locations > visits ? ` · ${locations.toLocaleString()} delivery locations` : ''}</span>${choice.ties > 1 ? `<span class="visit-cluster-meta">One of ${choice.ties.toLocaleString()} areas with this visit count. Showing the most recently visited.</span>` : ''}${first != null && latest != null ? `<span class="visit-cluster-dates">First ${escapeHtml(dateLabel(first))} · latest ${escapeHtml(dateLabel(latest))}</span>` : ''}<small class="visit-cluster-note">${escapeHtml(scope)}. Approximate saved GPS stops within 32 m, with one visit per route. Nearby addresses can share an area.</small></div>`;
  }

  root.RouteHeatAtlasFocus = Object.freeze({bestStop, popupHtml});
})(typeof window !== 'undefined' ? window : globalThis);
