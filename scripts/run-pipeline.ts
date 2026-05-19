/**
 * HWP Pipeline — 폴더 일괄 처리
 *
 * Usage:
 *   bun scripts/run-pipeline.ts <hwp-folder> <output-folder>
 *
 * 출력:
 *   <output>/content/          — content API만 (스타일 제외)
 *   <output>/full/             — content + style API
 *   <output>/content/index.json — 전체 파일 목록 + 메타
 *   <output>/full/index.json
 */

import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import { extract } from '../packages/hwpjs-adapter/src/extract/index.js';
import type { ExtractResult } from '../packages/hwpjs-adapter/src/extract/index.js';
import type { ImageMap } from '../packages/hwpjs-adapter/src/table-schema.js';
import * as fs from 'fs';
import * as path from 'path';

// ─── imageMap ─────────────────────────────────────────────────────────────────

function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

// ─── 단일 파일 처리 ────────────────────────────────────────────────────────────

function processFile(
  hwpPath: string,
  outDir: string,
  includeStyle: boolean
): {
  file: string;
  records: number;
  tables: number;
  texts: number;
  images: number;
  error?: string;
} {
  const baseName = path.basename(hwpPath, '.hwp');
  const jsonPath = path.join(outDir, `${baseName}.json`);
  const extractPath = path.join(outDir, `${baseName}.extract.json`);

  const buf = fs.readFileSync(hwpPath);

  // imageMap (toHtml 기반)
  const hwpHtml = toHtml(buf);
  const imageMap = buildImageMap(hwpHtml);

  // JSON 저장
  const hwpJson = JSON.parse(toJson(buf));
  fs.writeFileSync(jsonPath, JSON.stringify(hwpJson, null, 2));

  // extract
  const result: ExtractResult = extract(hwpJson, {
    apis: includeStyle ? ['content', 'style'] : ['content'],
    imageMap,
    sourcePaths: {
      hwp: path.resolve(hwpPath).replace(/\\/g, '/'),
      json: path.resolve(jsonPath).replace(/\\/g, '/'),
    },
  });

  fs.writeFileSync(extractPath, JSON.stringify(result, null, 2));

  const tables = result.records.filter((r) => r.kind === 'table').length;
  const texts = result.records.filter((r) => r.kind === 'text').length;
  const images = result.records
    .filter((r) => r.kind === 'table')
    .reduce(
      (n, r) =>
        n +
        (r.table?.rows
          .flatMap((row) => row.cells)
          .reduce((m, c) => m + (c.images?.length ?? 0), 0) ?? 0),
      0
    );

  return { file: baseName, records: result.records.length, tables, texts, images };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: bun scripts/run-pipeline.ts <hwp-folder> <output-folder>');
  process.exit(1);
}

const hwpFolder = path.resolve(args[0]);
const outBase = path.resolve(args[1]);

const hwpFiles = fs
  .readdirSync(hwpFolder)
  .filter((f) => f.toLowerCase().endsWith('.hwp'))
  .sort()
  .map((f) => path.join(hwpFolder, f));

if (hwpFiles.length === 0) {
  console.error('HWP 파일 없음:', hwpFolder);
  process.exit(1);
}

const contentDir = path.join(outBase, 'content');
const fullDir = path.join(outBase, 'full');
fs.mkdirSync(contentDir, { recursive: true });
fs.mkdirSync(fullDir, { recursive: true });

console.log(`\n📂 ${hwpFolder}`);
console.log(`📦 ${hwpFiles.length}개 파일\n`);

type RunSummary = ReturnType<typeof processFile> & { error?: string };
const contentIndex: RunSummary[] = [];
const fullIndex: RunSummary[] = [];

for (const [i, hwpPath] of hwpFiles.entries()) {
  const label = path.basename(hwpPath);
  const num = String(i + 1).padStart(3, ' ');
  process.stdout.write(`[${num}/${hwpFiles.length}] ${label} ...`);

  try {
    const cSummary = processFile(hwpPath, contentDir, false);
    const fSummary = processFile(hwpPath, fullDir, true);
    contentIndex.push(cSummary);
    fullIndex.push(fSummary);
    console.log(` ✓  text:${cSummary.texts} table:${cSummary.tables} img:${cSummary.images}`);
  } catch (e: any) {
    const err = {
      file: path.basename(hwpPath, '.hwp'),
      records: 0,
      tables: 0,
      texts: 0,
      images: 0,
      error: String(e?.message ?? e),
    };
    contentIndex.push(err);
    fullIndex.push(err);
    console.log(` ✗  ${err.error.slice(0, 60)}`);
  }
}

// index.json 저장
fs.writeFileSync(
  path.join(contentDir, 'index.json'),
  JSON.stringify(
    { generated_at: new Date().toISOString(), apis: ['content'], files: contentIndex },
    null,
    2
  )
);
fs.writeFileSync(
  path.join(fullDir, 'index.json'),
  JSON.stringify(
    { generated_at: new Date().toISOString(), apis: ['content', 'style'], files: fullIndex },
    null,
    2
  )
);

const errors = fullIndex.filter((f) => f.error).length;
const ok = hwpFiles.length - errors;
console.log(`\n✅ 완료: ${ok}/${hwpFiles.length} 성공${errors > 0 ? `, ${errors}개 오류` : ''}`);
console.log(`   content → ${contentDir}`);
console.log(`   full    → ${fullDir}`);
