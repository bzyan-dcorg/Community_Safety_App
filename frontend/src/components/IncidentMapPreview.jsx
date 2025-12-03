import { useEffect, useRef } from "react";
import { MAP_TILES } from "../config/mapConfig.js";
import { useLeaflet } from "../hooks/useLeaflet.js";

const MAP_ZOOM = 15;

export function IncidentMapPreview({ lat, lng, locationText, fallbackLink }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const { instance: L, status, error } = useLeaflet();
  const hasCoords = typeof lat === "number" && typeof lng === "number";

  useEffect(() => {
    if (!hasCoords || !L || mapRef.current || !containerRef.current) {
      return undefined;
    }

    const mapInstance = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      dragging: true,
      touchZoom: true,
    }).setView([lat, lng], MAP_ZOOM);

    L.tileLayer(MAP_TILES.url, {
      maxZoom: MAP_TILES.maxZoom,
      attribution: MAP_TILES.attribution,
    }).addTo(mapInstance);

    L.circleMarker([lat, lng], {
      radius: 6,
      color: "#0f172a",
      weight: 2,
      fillColor: "#22d3ee",
      fillOpacity: 0.9,
    }).addTo(mapInstance);

    mapRef.current = mapInstance;

    return () => {
      mapInstance.remove();
      mapRef.current = null;
    };
  }, [L, lat, lng, hasCoords]);

  useEffect(() => {
    if (!hasCoords || !mapRef.current) {
      return;
    }
    mapRef.current.setView([lat, lng], MAP_ZOOM, { animate: false });
  }, [hasCoords, lat, lng]);

  if (!hasCoords) {
    return (
      <div className="overflow-hidden rounded-3xl border border-white/80 bg-slate-50 p-4 text-sm text-slate-500 shadow-inner">
        No map pin was provided for this incident.
      </div>
    );
  }

  const renderBody = () => {
    if (status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-rose-600">
          Map preview blocked. {error || "Open the full map to view the pin."}
        </div>
      );
    }
    if (L) {
      return <div ref={containerRef} className="h-full w-full" />;
    }
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-xs text-slate-500">
        Loading map preview…
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-white/80 bg-slate-50 shadow-inner">
      <div className="h-44 w-full">{renderBody()}</div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-[11px] text-slate-600">
        <div className="space-y-1">
          <div>
            Pin: {lat.toFixed(4)} , {lng.toFixed(4)}
          </div>
          {locationText ? <div className="text-slate-500">{locationText}</div> : null}
        </div>
        {status === "error" && fallbackLink ? (
          <a
            href={fallbackLink}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full border border-slate-200 px-3 py-1 font-medium text-ink transition hover:border-ink"
          >
            Open map
          </a>
        ) : null}
      </div>
    </div>
  );
}
