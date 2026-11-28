import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { buildSkeletonLayout, type SkeletonPage } from './src/skeletonGeometry.js';

function readJson(file: string, fallback?: unknown) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (fallback !== undefined && (error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

export function pageSkeletonPlugin(publicDirectory: string): Plugin {
  const geometryFile = (page: string) => `pages/page_${page}/skeleton-layout.json`;
  const geometryFor = (page: string): string => {
    const folder = path.join(publicDirectory, 'pages', `page_${page}`);
    const data = readJson(path.join(folder, `page_${page}_dom.json`));
    const frames = readJson(path.join(folder, 'layout_frames.json'), {});
    const options: Omit<Parameters<typeof buildSkeletonLayout>[0], 'language'> = {
      width: data.width,
      height: data.height,
      blocks: data.blocks ?? [],
      imageBoxes: data.images?.filter((image: { role: string }) => image.role === 'content').map((image: { bbox: number[] }) => image.bbox),
      fidelityOverlays: readJson(path.join(folder, 'fidelity_overlays.json'), {}).overlays,
      contentsRows: readJson(path.join(folder, 'contents_rows.json'), {}).rows,
      frameFor: block => frames[block.id],
    };
    const layout: SkeletonPage = {
      en: buildSkeletonLayout({ ...options, language: 'en' }),
      'pt-BR': buildSkeletonLayout({ ...options, language: 'pt-BR' }),
    };
    return JSON.stringify(layout);
  };
  return {
    name: 'rulebook-skeleton-layout',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = request.url?.match(/^\/pages\/page_(\d{3})\/skeleton-layout\.json(?:\?.*)?$/u);
        if (!match) return next();
        try {
          const body = geometryFor(match[1]);
          response.setHeader('Content-Type', 'application/json; charset=utf-8');
          response.end(body);
        } catch (error) {
          return next(error);
        }
      });
    },
    generateBundle() {
      const pagesDirectory = path.join(publicDirectory, 'pages');
      for (const name of fs.readdirSync(pagesDirectory)) {
        const match = name.match(/^page_(\d{3})$/u);
        if (!match) continue;
        const page = match[1];
        this.emitFile({ type: 'asset', fileName: geometryFile(page), source: geometryFor(page) });
      }
    },
  };
}
