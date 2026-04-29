import { toJson, toHtml } from '../packages/hwpjs/dist/index.js';
import { extract, type DocRecord, type StyleRun, type TableCellRecord } from '../packages/hwpjs-adapter/src/extract/index.js';
import type { ImageMap } from '../packages/hwpjs-adapter/src/table-schema.js';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(import.meta.dir, '../crates/hwp-core/tests/fixtures');
const outDir      = path.join(import.meta.dir, '../output');
fs.mkdirSync(outDir, { recursive: true });

// ─── imageMap ────────────────────────────────────────────────────────────────

function buildImageMap(html: string): ImageMap {
  const map: ImageMap = new Map();
  const matches = html.match(/data:image\/([^;]+);base64,[A-Za-z0-9+/=]+/g) ?? [];
  matches.forEach((dataUrl, i) => {
    const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'jpeg';
    map.set(i + 1, { dataUrl, format });
  });
  return map;
}

// ─── 렌더러 ──────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderRuns(runs: StyleRun[] | undefined, fallback: string): string {
  if (!runs || runs.length === 0) return esc(fallback).replace(/\n/g, '<br>');
  return runs.map(run => {
    const s = run.style;
    const css = [
      s.bold ? 'font-weight:bold' : '',
      s.italic ? 'font-style:italic' : '',
      s.underline ? 'text-decoration:underline' : '',
      s.strikethrough ? 'text-decoration:line-through' : '',
      s.color && s.color !== '#000000' ? `color:${s.color}` : '',
      s.bg_color ? `background:${s.bg_color}` : '',
    ].filter(Boolean).join(';');
    const tag = css ? `<span style="${css}">` : '<span>';
    return `${tag}${esc(run.text)}</span>`;
  }).join('');
}

function renderCell(cell: TableCellRecord): string {
  const text = renderRuns(cell.runs, cell.content);
  const imgs = (cell.images ?? []).map(img =>
    `<img src="${img.src}" alt="" class="cell-img">`
  ).join('');
  return `<div class="cell-path">${esc(cell.path)}</div>
          <div class="cell-content">${text}${imgs}</div>`;
}

function renderTable(record: DocRecord): string {
  if (!record.table) return '';
  const { rows, merges = [] } = record.table;

  function isMergedAway(r: number, c: number) {
    return merges.some(m =>
      (r > m.start.row || (r === m.start.row && c > m.start.col)) &&
      r <= m.end.row && c <= m.end.col
    );
  }
  function getSpan(r: number, c: number) {
    const m = merges.find(m => m.start.row === r && m.start.col === c);
    return m ? { cs: m.end.col - m.start.col + 1, rs: m.end.row - m.start.row + 1 } : { cs: 1, rs: 1 };
  }

  const trs = rows.map((row, ri) => {
    let ci = 0;
    const tds = row.cells.map(cell => {
      while (isMergedAway(ri, ci)) ci++;
      const { cs, rs } = getSpan(ri, ci);
      const span = [cs > 1 ? `colspan="${cs}"` : '', rs > 1 ? `rowspan="${rs}"` : ''].filter(Boolean).join(' ');
      ci++;
      return `<td${span ? ' ' + span : ''}>${renderCell(cell)}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `<table>${trs}</table>`;
}

function renderTextRecord(record: DocRecord): string {
  const paraStyle = record.para_style;
  const styleHint = paraStyle
    ? `align:${paraStyle.align} | line:${paraStyle.line_spacing}% | indent:${paraStyle.indent_first}`
    : '';
  return `<div class="text-item">
    <div class="id-col">
      <span class="path-tag">${esc(record.path)}</span>
      ${styleHint ? `<span class="style-hint">${esc(styleHint)}</span>` : ''}
    </div>
    <div class="content-col"><p>${renderRuns(record.runs, record.content ?? '')}</p></div>
  </div>`;
}

function renderBlocks(records: DocRecord[]): string {
  let tableIdx = 0;
  return records.map(record => {
    if (record.kind === 'text') {
      return `<div class="block text-block">${renderTextRecord(record)}</div>`;
    }
    tableIdx++;
    const imgCount = record.table?.rows.flatMap(r => r.cells).reduce((n, c) => n + (c.images?.length ?? 0), 0) ?? 0;
    return `<div class="block table-block">
      <div class="block-header">
        <span class="table-index">Table ${tableIdx}</span>
        <span class="path-tag">${esc(record.path)}</span>
        ${imgCount > 0 ? `<span class="img-badge">이미지 ${imgCount}개</span>` : ''}
      </div>
      <div class="table-wrap">${renderTable(record)}</div>
    </div>`;
  }).join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const target  = 'noori.hwp';
const hwpPath = path.join(fixturesDir, target);
const buf     = fs.readFileSync(hwpPath);
const baseName = path.basename(target, '.hwp');

const hwpHtml = toHtml(buf, { includeVersion: true });
fs.writeFileSync(path.join(outDir, `${baseName}-hwpjs.html`), hwpHtml);
const imageMap = buildImageMap(hwpHtml);

const hwpJson    = JSON.parse(toJson(buf));
const jsonOutPath = path.join(outDir, `${baseName}.json`);
fs.writeFileSync(jsonOutPath, JSON.stringify(hwpJson, null, 2));

const result = extract(hwpJson, {
  apis: ['content', 'style'],
  imageMap,
  sourcePaths: {
    hwp:  path.resolve(hwpPath).replace(/\\/g, '/'),
    json: path.resolve(jsonOutPath).replace(/\\/g, '/'),
  },
});

// ExtractResult JSON 저장
const extractOutPath = path.join(outDir, `${baseName}.extract.json`);
fs.writeFileSync(extractOutPath, JSON.stringify(result, null, 2));

const tableCount = result.records.filter(r => r.kind === 'table').length;
const textCount  = result.records.filter(r => r.kind === 'text').length;
const imageTotal = result.records
  .filter(r => r.kind === 'table')
  .reduce((n, r) => n + (r.table?.rows.flatMap(row => row.cells).reduce((m, c) => m + (c.images?.length ?? 0), 0) ?? 0), 0);

const absHwpPath     = result.meta.source_hwp;
const absJsonPath    = result.meta.source_json;
const absExtractPath = path.resolve(extractOutPath).replace(/\\/g, '/');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<title>${baseName} — HWP Pipeline</title>
<style>
  :root {
    --id-bg: #f0f4ff; --id-fg: #3b5bdb; --id-border: #c5d0fa;
    --block-border: #e2e8f0;
  }
  * { box-sizing: border-box; }
  body { font-family: 'Malgun Gothic', sans-serif; margin: 0; padding: 24px 32px;
         max-width: 1100px; background: #f1f5f9; color: #1e293b; }

  .file-info { background: #1e293b; color: #e2e8f0; border-radius: 10px;
               padding: 16px 20px; margin-bottom: 24px; font-size: 12px; }
  .file-info h1 { margin: 0 0 10px; font-size: 18px; color: #f8fafc; }
  .file-row { display: flex; gap: 8px; margin: 3px 0; }
  .file-label { color: #94a3b8; min-width: 70px; flex-shrink: 0; }
  .file-path { font-family: monospace; color: #7dd3fc; word-break: break-all; }
  .file-stats { margin-top: 10px; display: flex; gap: 10px; flex-wrap: wrap; }
  .stat { background: #334155; border-radius: 6px; padding: 3px 10px; font-size: 11px; color: #cbd5e1; }
  .stat strong { color: #f8fafc; }

  .block { margin-bottom: 10px; border-radius: 8px; overflow: hidden;
           border: 1px solid var(--block-border); }

  /* 텍스트 블록 */
  .text-block { background: #fff; }
  .text-item { display: grid; grid-template-columns: 320px 1fr; }
  .id-col { background: var(--id-bg); padding: 10px 12px; border-right: 2px solid var(--id-border);
            display: flex; flex-direction: column; gap: 4px; }
  .content-col { padding: 10px 14px; }
  .content-col p { margin: 0; font-size: 13px; line-height: 1.8; }
  .style-hint { font-size: 10px; color: #7c86a2; font-family: monospace; }

  /* 테이블 블록 */
  .table-block { background: #fff; }
  .block-header { display: flex; align-items: center; gap: 8px; padding: 8px 14px;
                  background: #f8fafc; border-bottom: 1px solid var(--block-border); flex-wrap: wrap; }
  .table-index { background: #3b5bdb; color: #fff; font-size: 11px; font-weight: bold;
                 padding: 2px 9px; border-radius: 10px; white-space: nowrap; }
  .img-badge { background: #7c3aed; color: #fff; font-size: 11px;
               padding: 2px 8px; border-radius: 10px; white-space: nowrap; }
  .table-wrap { overflow-x: auto; padding: 10px; }

  table { border-collapse: collapse; width: 100%; font-size: 12px; }
  td { vertical-align: top; border: 1px solid #cbd5e1; padding: 0; }
  .cell-path { background: var(--id-bg); color: var(--id-fg); font-family: monospace;
               font-size: 10px; padding: 3px 6px; border-bottom: 1px solid var(--id-border); }
  .cell-content { padding: 5px 8px; min-height: 22px; line-height: 1.6; }
  .cell-img { max-width: 100%; display: block; margin-top: 4px; }

  .path-tag { font-family: monospace; font-size: 10px; color: var(--id-fg);
              background: var(--id-bg); border: 1px solid var(--id-border);
              padding: 2px 6px; border-radius: 4px; word-break: break-all; }
</style>
</head>
<body>
<div class="file-info">
  <h1>${baseName}.hwp — HWP Pipeline 출력</h1>
  <div class="file-row"><span class="file-label">HWP</span><span class="file-path">${absHwpPath}</span></div>
  <div class="file-row"><span class="file-label">JSON</span><span class="file-path">${absJsonPath}</span></div>
  <div class="file-row"><span class="file-label">Extract</span><span class="file-path">${absExtractPath}</span></div>
  <div class="file-row"><span class="file-label">APIs</span><span class="file-path">${result.meta.apis.join(', ')}</span></div>
  <div class="file-stats">
    <div class="stat">텍스트 <strong>${textCount}</strong></div>
    <div class="stat">테이블 <strong>${tableCount}</strong></div>
    <div class="stat">이미지 <strong>${imageTotal}</strong></div>
  </div>
</div>
${renderBlocks(result.records)}
</body>
</html>`;

const htmlOutPath = path.join(outDir, `${baseName}-pipeline.html`);
fs.writeFileSync(htmlOutPath, html);

console.log(`✓ ${target}`);
console.log(`  APIs: ${result.meta.apis.join(', ')}`);
console.log(`  records: ${result.records.length} (text ${textCount} / table ${tableCount})`);
console.log(`  extract.json → ${absExtractPath}`);
