import { useEffect, useMemo, useState } from "react";

const LEAFLET_SOURCES = [
  {
    id: "unpkg",
    script: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
    style: "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  },
  {
    id: "cdnjs",
    script: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js",
    style: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css",
  },
  {
    id: "jsdelivr",
    script: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js",
    style: "https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css",
  },
];

let leafletLoaderPromise = null;

function getLeafletGlobal() {
  if (typeof window === "undefined") {
    return null;
  }
  return window.L || null;
}

function ensureStyles(source) {
  if (typeof document === "undefined") return;
  const selector = `link[data-leaflet-style="${source.id}"]`;
  let link = document.querySelector(selector);
  if (!link) {
    link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.leafletStyle = source.id;
    link.href = source.style;
    document.head.appendChild(link);
  }
  link.crossOrigin = "";
}

function loadScript(source) {
  return new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("Document not available"));
      return;
    }

    const selector = `script[data-leaflet-source="${source.id}"]`;
    let script = document.querySelector(selector);
    const cleanup = () => {
      if (!script) return;
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };

    const handleLoad = () => {
      if (!script) return;
      script.dataset.loaded = "true";
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
      reject(new Error(`Leaflet script failed for ${source.id}`));
    };

    if (!script) {
      script = document.createElement("script");
      script.async = true;
      script.dataset.leafletSource = source.id;
      script.src = source.script;
      script.crossOrigin = "";
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
      document.head.appendChild(script);
    } else if (script.dataset.loaded === "true") {
      resolve();
      return;
    } else {
      script.addEventListener("load", handleLoad);
      script.addEventListener("error", handleError);
    }
  });
}

function loadLeaflet() {
  const existing = getLeafletGlobal();
  if (existing) {
    return Promise.resolve({ leaflet: existing, sourceId: "global" });
  }
  if (typeof document === "undefined") {
    return Promise.resolve({ leaflet: null, sourceId: "" });
  }
  if (leafletLoaderPromise) {
    return leafletLoaderPromise;
  }

  let currentIndex = 0;

  leafletLoaderPromise = new Promise((resolve, reject) => {
    const tryLoad = () => {
      if (currentIndex >= LEAFLET_SOURCES.length) {
        reject(new Error("All Leaflet CDNs failed to load."));
        return;
      }
      const source = LEAFLET_SOURCES[currentIndex];
      ensureStyles(source);
      loadScript(source)
        .then(() => {
          const instance = getLeafletGlobal();
          if (instance) {
            resolve({ leaflet: instance, sourceId: source.id });
          } else {
            currentIndex += 1;
            tryLoad();
          }
        })
        .catch(() => {
          currentIndex += 1;
          tryLoad();
        });
    };

    tryLoad();
  }).finally(() => {
    if (!getLeafletGlobal()) {
      leafletLoaderPromise = null;
    }
  });

  return leafletLoaderPromise;
}

export function useLeaflet() {
  const initialInstance = useMemo(() => getLeafletGlobal(), []);
  const [instance, setInstance] = useState(initialInstance);
  const [status, setStatus] = useState(initialInstance ? "ready" : "idle");
  const [error, setError] = useState("");
  const [source, setSource] = useState(initialInstance ? "global" : "");

  useEffect(() => {
    if (instance || typeof document === "undefined") {
      return undefined;
    }

    let isMounted = true;
    setStatus("loading");
    setError("");
    setSource("");

    loadLeaflet()
      .then(({ leaflet, sourceId }) => {
        if (!isMounted) return;
        if (leaflet) {
          setInstance(leaflet);
          setStatus("ready");
          setSource(sourceId);
        } else {
          setStatus("error");
          setError("Leaflet failed to initialize.");
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setStatus("error");
        setError(err?.message || "Unable to load map scripts.");
      });

    return () => {
      isMounted = false;
    };
  }, [instance]);

  return { instance, status, error, source };
}
