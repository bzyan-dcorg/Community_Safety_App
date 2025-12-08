import { useEffect, useRef, useState } from "react";
import { fetchIncidents } from "../api.js";
import { MAP_TILES } from "../config/mapConfig.js";
import { useLeaflet } from "../hooks/useLeaflet.js";

const DEFAULT_VIEW = {
  lat: 38.9072,
  lng: -77.0369,
  zoom: 12,
};

const NEIGHBORHOOD_PRESETS = [
  { id: "downtown", label: "Downtown core", lat: 38.9035, lng: -77.033, zoom: 14 },
  { id: "anacostia", label: "Anacostia", lat: 38.8625, lng: -76.9885, zoom: 14 },
  { id: "petworth", label: "Petworth", lat: 38.9425, lng: -77.0277, zoom: 14 },
];

const INCIDENT_META = {
  community: { label: "Community", color: "#0ea5e9" },
  "public-order": { label: "Public Order", color: "#f97316" },
  police: { label: "Police", color: "#6366f1" },
};

export default function IncidentMapOverview() {
  const [incidents, setIncidents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locating, setLocating] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [focusEnabled, setFocusEnabled] = useState(false);
  const [focusArea, setFocusArea] = useState(NEIGHBORHOOD_PRESETS[0].id);
  const { instance: L, status: leafletStatus, error: leafletError } = useLeaflet();
  const mapNodeRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const selectedPreset =
    NEIGHBORHOOD_PRESETS.find((preset) => preset.id === focusArea) || NEIGHBORHOOD_PRESETS[0];

  useEffect(() => {
    if (!L || mapRef.current || !mapNodeRef.current) {
      return;
    }
    const mapInstance = L.map(mapNodeRef.current).setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);
    L.tileLayer(MAP_TILES.url, {
      maxZoom: MAP_TILES.maxZoom,
      attribution: MAP_TILES.attribution,
    }).addTo(mapInstance);
    mapRef.current = mapInstance;
    setMapReady(true);
    return () => {
      mapInstance.remove();
      mapRef.current = null;
    };
  }, [L]);

  useEffect(() => {
    if (!mapReady) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];
    const readyMap = mapRef.current;
    if (!readyMap) return;

    incidents
      .filter((incident) => typeof incident.lat === "number" && typeof incident.lng === "number")
      .forEach((incident) => {
        const meta = INCIDENT_META[incident.incident_type] || INCIDENT_META.community;
        const icon = L.divIcon({
          className: "incident-map-marker",
          html: `<span style="display:block;width:16px;height:16px;border-radius:999px;background:${meta.color};border:2px solid #fff;box-shadow:0 0 0 2px rgba(15,23,42,0.15);"></span>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([incident.lat, incident.lng], {
          title: incident.category,
          icon,
        }).addTo(readyMap);
        marker.bindPopup(
          `<div style="font-weight:600;color:#0f172a;">${incident.category || "Incident"}</div>
          <div style="color:#475569;">${incident.location_text || "Location not shared"}</div>
          <div style="color:#94a3b8;font-size:12px;">${incident.incident_type || "community"}</div>`,
        );
        markersRef.current.push(marker);
      });
  }, [incidents, mapReady, L]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (focusEnabled && selectedPreset) {
      mapRef.current.setView([selectedPreset.lat, selectedPreset.lng], selectedPreset.zoom);
    } else if (!focusEnabled) {
      mapRef.current.setView([DEFAULT_VIEW.lat, DEFAULT_VIEW.lng], DEFAULT_VIEW.zoom);
    }
  }, [focusEnabled, focusArea, mapReady, selectedPreset]);

  useEffect(() => {
    loadIncidents();
  }, []);

  async function loadIncidents() {
    setLoading(true);
    setError("");
    try {
      const data = await fetchIncidents({ limit: 100 });
      setIncidents(data);
    } catch (err) {
      console.error(err);
      setError("Unable to load incidents.");
    } finally {
      setLoading(false);
    }
  }

  async function handleLocate() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        if (mapRef.current) {
          mapRef.current.setView([latitude, longitude], 14);
        }
      },
      (err) => {
        console.error(err);
        setError("Unable to access your current location.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <section className="rounded-3xl border border-white/70 bg-white/80 p-4 shadow-lg backdrop-blur-sm sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-ink sm:text-lg">Neighborhood map</h3>
          <p className="text-xs text-slate-500 sm:text-sm">Pins update as reporters drop map locations.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={loadIncidents}
            className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Loading…" : "Refresh"}
          </button>
          <button
            type="button"
            onClick={handleLocate}
            className="rounded-full border border-slate-200 px-3 py-1 font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-50"
            disabled={locating}
          >
            {locating ? "Locating…" : "Use my location"}
          </button>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3 text-xs text-slate-600 sm:flex sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 font-semibold text-ink">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-ink focus:ring-ink"
            checked={focusEnabled}
            onChange={(event) => setFocusEnabled(event.target.checked)}
          />
          Follow a specific neighborhood
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:mt-0 sm:flex-row sm:items-center">
          <select
            className="rounded-2xl border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700 focus:border-ink focus:outline-none disabled:opacity-50"
            value={focusArea}
            onChange={(event) => setFocusArea(event.target.value)}
            disabled={!focusEnabled}
          >
            {NEIGHBORHOOD_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-500">
            {focusEnabled ? "Map centers on your selected community." : "Enable to jump directly to a neighborhood."}
          </p>
        </div>
      </div>

      <div className="mt-4 h-64 overflow-hidden rounded-3xl border border-slate-200 bg-slate-50">
        {leafletStatus === "error" ? (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-rose-600">
            Map scripts were blocked. {leafletError || "Update VITE_MAP_TILE_URL to use an accessible provider."}
          </div>
        ) : L ? (
          <div ref={mapNodeRef} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-sm text-slate-500">
            Loading basemap assets…
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(INCIDENT_META).map(([key, meta]) => (
          <span
            key={key}
            className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-600"
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
        ))}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-600">{error}</div>
      )}
    </section>
  );
}
