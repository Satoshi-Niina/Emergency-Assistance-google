import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: '/',
    plugins: [react()],
    publicDir: 'public', // publicフォルダを明示的に指定
    server: {
        port: 5173,
        host: true,
        strictPort: false,
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                secure: false,
                configure: (proxy, options) => {
                    proxy.on('proxyReq', (proxyReq, req, res) => {
                        console.log('Proxying request:', req.method, req.url, '-> http://localhost:8080');
                    });
                    proxy.on('error', (err, req, res) => {
                        console.error('Proxy error:', err);
                    });
                }
            }
        }
    },
    resolve: {
        alias: {
            '@': '/src'
        }
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
        minify: 'terser',
        cssCodeSplit: false,
        emptyOutDir: true, // 古いファイルを確実に削除
        chunkSizeWarningLimit: 10000,
        target: 'es2015',
        assetsInlineLimit: 8192,
        rollupOptions: {
            output: {
                // ハッシュを追加してキャッシュ問題を回避
                entryFileNames: 'main.[hash].mjs',
                chunkFileNames: 'chunk.[hash].mjs',
                assetFileNames: (assetInfo) => {
                    if (assetInfo.name?.endsWith('.css')) {
                        // CSSファイルにもハッシュを追加
                        return 'style.[hash].css';
                    }
                    return 'assets/[name].[hash].[ext]';
                },
                inlineDynamicImports: true,
                // 小さなアセットはインライン化
                manualChunks: undefined
            }
        }
    }
});
