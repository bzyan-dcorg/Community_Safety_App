import { useEffect, useMemo, useRef, useState } from "react";
import { MAP_TILES } from "../config/mapConfig.js";
import { useLeaflet } from "../hooks/useLeaflet.js";

function formatLatLng(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return value.toFixed(5);
}

export function MapLocationPicker({
  lat,
  lng,
  onChange,
  onLocationTextChange,
  locationText,
}) {
  const mapNode = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");
  const { instance: L, status: leafletStatus, error: leafletError } = useLeaflet();

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !L) {
      return;
    }
    const initialLat = typeof lat === "number" ? lat : 38.9072;
    const initialLng = typeof lng === "number" ? lng : -77.0369;
    const map = L.map(mapNode.current).setView([initialLat, initialLng], 13);
    L.tileLayer(MAP_TILES.url, {
      maxZoom: MAP_TILES.maxZoom,
      attribution: MAP_TILES.attribution,
    }).addTo(map);
    map.on("click", (event) => {
      onChange?.({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [L, lat, lng, onChange]);

  useEffect(() => {
    if (!mapRef.current || !L) return;
    if (!markerRef.current) {
      markerRef.current = L.marker([lat || 0, lng || 0], { draggable: false });
    }
    const marker = markerRef.current;
    if (typeof lat === "number" && typeof lng === "number") {
      marker.setLatLng([lat, lng]).addTo(mapRef.current);
      mapRef.current.panTo([lat, lng]);
    } else {
      marker.remove();
    }
  }, [L, lat, lng]);

  const handleUseLocation = () => {
    if (!navigator.geolocation) {
      setError("Geolocation not supported in this browser.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        onChange?.({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.error(err);
        setLocating(false);
        setError("Unable to access your current location.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const latLngLabel = useMemo(() => {
    if (typeof lat !== "number" || typeof lng !== "number") {
      return "Tap map or use your location to drop a pin.";
    }
    return `Selected: ${formatLatLng(lat)}, ${formatLatLng(lng)}`;
  }, [lat, lng]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <p className="font-semibold text-slate-600">{latLngLabel}</p>
        <button
          type="button"
          onClick={handleUseLocation}
          className="rounded-full border border-slate-200 px-3 py-1 text-[11px] font-medium text-slate-600 transition hover:border-slate-400 hover:text-ink disabled:opacity-60"
          disabled={locating}
        >
          {locating ? "Locating…" : "Use current location"}
        </button>
      </div>

      <div className="h-56 overflow-hidden rounded-3xl border border-white/80 bg-slate-50">
        {leafletStatus === "error" ? (
          <div className="flex h-full items-center justify-center px-3 text-center text-xs text-rose-600">
            Map unavailable. {leafletError || "Check VITE_MAP_TILE_URL in your web env config."}
          </div>
        ) : L ? (
          <div ref={mapNode} className="h-full w-full" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-500">
            Loading map tiles…
          </div>
        )}
      </div>

      <label className="block text-xs font-semibold text-slate-600">
        Nearby landmark (optional)
        <input
          value={locationText}
          onChange={(event) => onLocationTextChange?.(event.target.value)}
          className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-inner focus:border-ink focus:outline-none"
          placeholder="Near the rec center, bus stop, etc."
        />
      </label>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {leafletStatus === "error" && leafletError && (
        <p className="text-xs text-rose-600">
          Basemap scripts blocked: {leafletError}. Switch to a provider reachable from your network.
        </p>
      )}
    </div>
  );
}
