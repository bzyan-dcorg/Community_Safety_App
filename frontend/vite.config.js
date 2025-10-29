import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// We let dev server run at http://localhost:5173
export default defineConfig({
  plugins: [react()],
})
