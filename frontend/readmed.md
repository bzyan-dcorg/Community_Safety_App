

# RUN

cd frontend
npm install
npm run dev

## OAuth config

1. Copy `.env.local.example` to `.env.local`.
2. Replace `VITE_GOOGLE_CLIENT_ID`, `VITE_APPLE_CLIENT_ID`, and `VITE_APPLE_REDIRECT_URI` with the values from your Google/Apple developer consoles (override `VITE_API_BASE_URL` / `VITE_API_PORT` if needed).
3. Restart `npm run dev` (or rebuild) so Vite picks up the new environment variables.

## Local network testing tips

- The dev server now proxies API calls through Vite at `/api` by default. This keeps Expo/web clients on phones/tablets working even when the FastAPI process only listens on `127.0.0.1`.
- If you intentionally expose the FastAPI server over the network (for example `uvicorn backend.main:app --host 0.0.0.0 --port 8000`), either keep the proxy on or set `VITE_API_BASE_URL=http://your-ip:8000`.
- To tweak proxy behavior, set the following in `.env.local`:
  - `VITE_DISABLE_DEV_PROXY=1` to bypass the proxy (frontend will call the API host directly).
  - `VITE_DEV_API_TARGET=http://127.0.0.1:8000` to point the proxy at another URL/port.
