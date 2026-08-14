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
    // 主 chunk 含 xterm/react 等核心库，体积由这些库决定；已用 lazy 拆分详情/弹窗。
    chunkSizeWarningLimit: 600,
  },
});
