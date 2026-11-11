import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// 列出 public/ 底下的檔案 (圖示、manifest)，加入離線快取清單
const listPublicFiles = (dir, base = dir) =>
    readdirSync(dir).flatMap(name => {
        const fullPath = join(dir, name);
        if (statSync(fullPath).isDirectory()) return listPublicFiles(fullPath, base);
        return name.startsWith('.') ? [] : ['/' + relative(base, fullPath).split('\\').join('/')];
    });

// 建置時產生 dist/sw.js：把本次所有輸出檔寫入預先快取清單，並以建置 ID 區分快取版本
const serviceWorkerPlugin = () => ({
    name: 'icd10-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
        const bundleFiles = Object.keys(bundle)
            .filter(file => !file.endsWith('.map') && file !== 'index.html')
            .map(file => '/' + file);
        const precacheUrls = [...new Set(['/', '/index.html', ...bundleFiles, ...listPublicFiles('public')])];
        const source = readFileSync('src/sw.js', 'utf8')
            .replace('__PRECACHE_URLS__', JSON.stringify(precacheUrls, null, 2))
            .replace('__BUILD_ID__', JSON.stringify(Date.now().toString(36)));
        this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
});

export default defineConfig({
    plugins: [react(), serviceWorkerPlugin()],
    build: {
        target: 'es2020'
    }
});
