import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api, Plot, PlotGeometry } from '../api';

const STATUS_COLOR: Record<string, string> = {
  available: '#2e9e5b',
  reserved: '#e0a800',
  sold: '#2a4d8f',
  transferred: '#6b7a8d',
  withheld: '#d23f3f',
};

const STATUSES = ['all', 'available', 'reserved', 'sold', 'transferred', 'withheld'] as const;

// Fallback centre (Kwekwe estate) when no plots have coordinates yet.
const KWEKWE: [number, number] = [-18.928, 29.814];

/** GeoJSON Polygon ring ([lng,lat]) → Leaflet [lat,lng] pairs. */
function polygonLatLngs(geom: PlotGeometry | null): [number, number][] {
  if (!geom || geom.type !== 'Polygon' || !geom.coordinates?.length) return [];
  return geom.coordinates[0].map(([lng, lat]) => [lat, lng] as [number, number]);
}

/** Builds a popup DOM node with plot detail + a Reserve button (when allowed). */
function buildPopup(p: Plot, onReserve?: (id: string) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'popup';
  const price = p.price != null ? `<div class="popup-row">${p.currency} ${p.price.toLocaleString()}</div>` : '';
  const area =
    p.areaSqm != null ? ` · ${p.areaSqm} m²` : p.areaHa != null ? ` · ${p.areaHa} ha` : '';
  el.innerHTML =
    `<div class="popup-head"><strong>${p.plotNumber}</strong>` +
    `<span class="status status-${p.status}">${p.status}</span></div>` +
    `<div class="popup-row">${p.development}</div>` +
    `<div class="popup-row">${p.plotType}${area}</div>` +
    price;
  if (p.status === 'available' && onReserve) {
    const btn = document.createElement('button');
    btn.className = 'btn small';
    btn.textContent = 'Reserve';
    btn.onclick = () => onReserve(p.plotId);
    el.appendChild(btn);
  }
  return el;
}

/**
 * Imperative L.geoJSON layer for plots that have polygon geometry (GIS-004).
 * Styled by status, with the same detail/reserve popup as the markers.
 */
function PolygonLayer({
  plots,
  onReserve,
}: {
  plots: Plot[];
  onReserve?: (id: string) => void;
}) {
  const map = useMap();
  useEffect(() => {
    if (plots.length === 0) return;
    const byId = new Map(plots.map((p) => [p.plotId, p]));
    const features = plots.map((p) => ({
      type: 'Feature' as const,
      geometry: p.geojson,
      properties: { plotId: p.plotId },
    }));

    const layer = L.geoJSON(features as unknown as GeoJSON.FeatureCollection, {
      style: (feature) => {
        const p = byId.get(feature?.properties?.plotId);
        return {
          color: '#ffffff',
          weight: 2,
          fillColor: (p && STATUS_COLOR[p.status]) || '#888',
          fillOpacity: 0.55,
        };
      },
      onEachFeature: (feature, lyr) => {
        const p = byId.get(feature.properties?.plotId);
        if (p) lyr.bindPopup(buildPopup(p, onReserve));
      },
    }).addTo(map);

    return () => {
      map.removeLayer(layer);
    };
  }, [plots, map, onReserve]);

  return null;
}

/** Pans/zooms the map to fit all rendered plots whenever they change. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 17);
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 18 });
  }, [points, map]);
  return null;
}

/**
 * Interactive plot map (GIS-001..004): plots drawn as polygons where survey
 * geometry exists, otherwise as GPS markers. Colour-coded by live allocation
 * status, clickable to inspect or reserve. Base tiles from OpenStreetMap.
 */
export function MapView({ onReserve }: { onReserve?: (plotId: string) => void }) {
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [filter, setFilter] = useState<(typeof STATUSES)[number]>('all');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      setPlots(await api.listPlots(filter === 'all' ? undefined : filter));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const all = plots ?? [];
  const withPolygon = all.filter((p) => p.geojson?.type === 'Polygon');
  const pointOnly = all.filter(
    (p) => !p.geojson && p.gpsLat != null && p.gpsLng != null,
  );

  // Fit to polygon vertices + standalone marker points.
  const fitPoints: [number, number][] = [
    ...withPolygon.flatMap((p) => polygonLatLngs(p.geojson)),
    ...pointOnly.map((p) => [p.gpsLat as number, p.gpsLng as number] as [number, number]),
  ];

  return (
    <section>
      <div className="section-head">
        <h1>Plot map</h1>
        <button className="btn ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div className="filters">
        {STATUSES.map((s) => (
          <button
            key={s}
            className={filter === s ? 'chip active' : 'chip'}
            onClick={() => setFilter(s)}
          >
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {error && (
        <div className="banner error">
          Couldn’t load plots: {error}
          <div className="banner-hint">
            Is the backend running on <code>localhost:3000</code>?
          </div>
        </div>
      )}

      <div className="card map-card">
        <MapContainer center={KWEKWE} zoom={15} className="map" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds points={fitPoints} />
          <PolygonLayer plots={withPolygon} onReserve={onReserve} />
          {pointOnly.map((p) => (
            <CircleMarker
              key={p.plotId}
              center={[p.gpsLat as number, p.gpsLng as number]}
              radius={10}
              pathOptions={{
                color: '#ffffff',
                weight: 2,
                fillColor: STATUS_COLOR[p.status] ?? '#888',
                fillOpacity: 0.9,
              }}
            >
              <Popup>
                <div className="popup">
                  <div className="popup-head">
                    <strong>{p.plotNumber}</strong>
                    <span className={`status status-${p.status}`}>{p.status}</span>
                  </div>
                  <div className="popup-row">{p.development}</div>
                  <div className="popup-row">
                    {p.plotType}
                    {p.areaSqm != null ? ` · ${p.areaSqm} m²` : ''}
                  </div>
                  {p.price != null && (
                    <div className="popup-row">
                      {p.currency} {p.price.toLocaleString()}
                    </div>
                  )}
                  {p.status === 'available' && onReserve && (
                    <button className="btn small" onClick={() => onReserve(p.plotId)}>
                      Reserve
                    </button>
                  )}
                </div>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="legend">
        {Object.entries(STATUS_COLOR).map(([s, c]) => (
          <span key={s} className="legend-item">
            <span className="dot" style={{ background: c }} />
            {s}
          </span>
        ))}
      </div>
    </section>
  );
}
