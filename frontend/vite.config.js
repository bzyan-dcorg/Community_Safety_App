import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const devApiTarget = env.VITE_DEV_API_TARGET || 'http://127.0.0.1:8000';
  const devProxyDisabled = env.VITE_DISABLE_DEV_PROXY === '1';

  return {
    plugins: [react()],
    server: devProxyDisabled
      ? undefined
      : {
          proxy: {
            '/api': {
              target: devApiTarget,
              changeOrigin: true,
              rewrite: (path) => path.replace(/^\/api/, ''),
            },
          },
        },
  };
});
