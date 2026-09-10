import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** 生产构建注入 CSP（开发模式跳过，避免干扰 Vite HMR/React Refresh 的内联脚本）。 */
function injectCsp(): Plugin {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "connect-src 'self'",
  ].join('; ');
  return {
    name: 'inject-csp',
    transformIndexHtml(html, ctx) {
      if (ctx.server) return html;
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), injectCsp()],
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // 把第三方库拆成独立 chunk：升级应用代码时 xterm/react 不必重下（不改变总体积）。
    // Vite 8 走 Rolldown，分包 API 是 output.codeSplitting（旧的 advancedChunks 已废弃）。
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'vendor-react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'vendor-xterm', test: /node_modules[\\/]@xterm[\\/]/ },
            { name: 'vendor-lucide', test: /node_modules[\\/]lucide-react[\\/]/ },
          ],
        },
      },
    },
    chunkSizeWarningLimit: 400,
  },
});
