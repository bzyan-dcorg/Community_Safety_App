

# RUN

cd frontend
npm install
npm run dev

## OAuth config

1. Copy `.env.local.example` to `.env.local`.
2. Replace `VITE_GOOGLE_CLIENT_ID`, `VITE_APPLE_CLIENT_ID`, and `VITE_APPLE_REDIRECT_URI` with the values from your Google/Apple developer consoles (override `VITE_API_BASE_URL` / `VITE_API_PORT` if needed).
3. Restart `npm run dev` (or rebuild) so Vite picks up the new environment variables.
