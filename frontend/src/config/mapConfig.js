const DEFAULT_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const DEFAULT_ATTRIBUTION = "&copy; OpenStreetMap contributors";
const DEFAULT_MAX_ZOOM = 19;

const envTileUrl = import.meta.env.VITE_MAP_TILE_URL;
const envAttribution = import.meta.env.VITE_MAP_TILE_ATTRIBUTION;
const envMaxZoom = Number.parseInt(import.meta.env.VITE_MAP_MAX_ZOOM ?? "", 10);

export const MAP_TILES = {
  url: typeof envTileUrl === "string" && envTileUrl.trim().length ? envTileUrl.trim() : DEFAULT_TILE_URL,
  attribution:
    typeof envAttribution === "string" && envAttribution.trim().length ? envAttribution.trim() : DEFAULT_ATTRIBUTION,
  maxZoom: Number.isFinite(envMaxZoom) ? envMaxZoom : DEFAULT_MAX_ZOOM,
};
