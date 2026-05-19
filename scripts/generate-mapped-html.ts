/**
 * mapped/*.extract.json → HTML 뷰어 생성
 */
import type {
  ExtractResult,
  DocRecord,
  StyleRun,
  TableCellRecord,
} from '../packages/hwpjs-adapter/src/extract/index.js';
import * as fs from 'fs';
import * as path from 'path';

const mappedDir = 'D:/woo-work/hwp-pipe-output/mapped';
const htmlDir = 'D:/woo-work/hwp-pipe-output/html';
fs.mkdirSync(htmlDir, { recursive: true });

// ─── 렌더러 ──────────────────────────────────────────────────────────────────

function esc(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderRuns(runs: StyleRun[] | undefined, fallback: string): string {
  if (!runs || runs.length === 0) return esc(fallback).replace(/\n/g, '<br>');
  return runs
    .map((r) => {
      const s = r.style;
      const css = [
        s.bold ? 'font-weight:bold' : '',
        s.italic ? 'font-style:italic' : '',
        s.underline ? 'text-decoration:underline' : '',
        s.strikethrough ? 'text-decoration:line-through' : '',
        s.color && s.color !== '#000000' ? `color:${s.color}` : '',
        s.bg_color ? `background:${s.bg_color}` : '',
      ]
        .filter(Boolean)
        .join(';');
      return css ? `<span style="${css}">${esc(r.text)}</span>` : esc(r.text);
    })
    .join('');
}

function renderCell(cell: TableCellRecord): string {
  const text = renderRuns(cell.runs, cell.content);
  const imgs = (cell.images ?? [])
    .map(
      (img) => `<img src="${img.src}" alt="" style="max-width:100%;display:block;margin-top:4px">`
    )
    .join('');
  return `<div class="cell-path">${esc(cell.path)}</div><div class="cell-content">${text}${imgs}</div>`;
}

function renderTable(record: DocRecord): string {
  if (!record.table) return '';
  const { rows, merges = [] } = record.table;

  function isMergedAway(r: number, c: number) {
    return merges.some(
      (m) =>
        (r > m.start.row || (r === m.start.row && c > m.start.col)) &&
        r <= m.end.row &&
        c <= m.end.col
    );
  }
  function getSpan(r: number, c: number) {
    const m = merges.find((m) => m.start.row === r && m.start.col === c);
    return m
      ? { cs: m.end.col - m.start.col + 1, rs: m.end.row - m.start.row + 1 }
      : { cs: 1, rs: 1 };
  }

  const trs = rows
    .map((row, ri) => {
      let ci = 0;
      const tds = row.cells
        .map((cell) => {
          while (isMergedAway(ri, ci)) ci++;
          const { cs, rs } = getSpan(ri, ci++);
          const span = [cs > 1 ? `colspan="${cs}"` : '', rs > 1 ? `rowspan="${rs}"` : '']
            .filter(Boolean)
            .join(' ');
          return `<td${span ? ' ' + span : ''}>${renderCell(cell)}</td>`;
        })
        .join('');
      return `<tr>${tds}</tr>`;
    })
    .join('');

  return `<table>${trs}</table>`;
}

function renderDoc(result: ExtractResult, cdms: string): string {
  const meta = result.meta as any;
  const hwpFile = path.basename(meta.source_hwp ?? '');
  let tableIdx = 0;

  const blocks = result.records
    .map((record) => {
      if (record.kind === 'text') {
        const ps = record.para_style;
        const hint = ps ? `${ps.align} | 행간${ps.line_spacing}%` : '';
        return `<div class="block text-block">
        <div class="id-col">
          <span class="path-tag">${esc(record.path)}</span>
          ${hint ? `<span class="style-hint">${esc(hint)}</span>` : ''}
        </div>
        <div class="content-col"><p>${renderRuns(record.runs, record.content ?? '')}</p></div>
      </div>`;
      }
      tableIdx++;
      const imgCount =
        record.table?.rows
          .flatMap((r) => r.cells)
          .reduce((n, c) => n + (c.images?.length ?? 0), 0) ?? 0;
      return `<div class="block table-block">
      <div class="block-header">
        <span class="table-index">Table ${tableIdx}</span>
        <span class="path-tag">${esc(record.path)}</span>
        ${imgCount > 0 ? `<span class="img-badge">이미지 ${imgCount}</span>` : ''}
      </div>
      <div class="table-wrap">${renderTable(record)}</div>
    </div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>${esc(cdms)} — ${esc(meta.title ?? '')}</title>
<style>
  :root { --id-bg:#f0f4ff; --id-fg:#3b5bdb; --id-border:#c5d0fa; --border:#e2e8f0; }
  *{box-sizing:border-box;}
  body{font-family:'Malgun Gothic',sans-serif;margin:0;padding:20px 28px;max-width:1100px;background:#f1f5f9;color:#1e293b;}
  .file-info{background:#1e293b;color:#e2e8f0;border-radius:10px;padding:14px 18px;margin-bottom:20px;font-size:12px;}
  .file-info h1{margin:0 0 8px;font-size:16px;color:#f8fafc;}
  .file-row{display:flex;gap:8px;margin:2px 0;}
  .file-label{color:#94a3b8;min-width:65px;flex-shrink:0;}
  .file-path{font-family:monospace;color:#7dd3fc;word-break:break-all;}
  .file-stats{margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;}
  .stat{background:#334155;border-radius:5px;padding:2px 8px;font-size:11px;color:#cbd5e1;}
  .stat strong{color:#f8fafc;}
  .block{margin-bottom:8px;border-radius:7px;overflow:hidden;border:1px solid var(--border);}
  .text-block{background:#fff;display:grid;grid-template-columns:280px 1fr;}
  .id-col{background:var(--id-bg);padding:8px 10px;border-right:2px solid var(--id-border);display:flex;flex-direction:column;gap:3px;}
  .content-col{padding:8px 12px;}
  .content-col p{margin:0;font-size:13px;line-height:1.8;}
  .style-hint{font-size:10px;color:#7c86a2;font-family:monospace;}
  .table-block{background:#fff;}
  .block-header{display:flex;align-items:center;gap:7px;padding:7px 12px;background:#f8fafc;border-bottom:1px solid var(--border);flex-wrap:wrap;}
  .table-index{background:#3b5bdb;color:#fff;font-size:11px;font-weight:bold;padding:2px 8px;border-radius:9px;white-space:nowrap;}
  .img-badge{background:#7c3aed;color:#fff;font-size:11px;padding:2px 7px;border-radius:9px;}
  .table-wrap{overflow-x:auto;padding:8px;}
  table{border-collapse:collapse;width:100%;font-size:12px;}
  td{vertical-align:top;border:1px solid #cbd5e1;padding:0;}
  .cell-path{background:var(--id-bg);color:var(--id-fg);font-family:monospace;font-size:10px;padding:2px 5px;border-bottom:1px solid var(--id-border);}
  .cell-content{padding:4px 7px;min-height:20px;line-height:1.6;}
  .cell-img{max-width:100%;display:block;margin-top:3px;}
  .path-tag{font-family:monospace;font-size:10px;color:var(--id-fg);background:var(--id-bg);border:1px solid var(--id-border);padding:1px 5px;border-radius:3px;word-break:break-all;}
</style></head><body>
<div class="file-info">
  <h1>[${esc(cdms)}] ${esc(meta.title ?? hwpFile)}</h1>
  <div class="file-row"><span class="file-label">HWP</span><span class="file-path">${esc(hwpFile)}</span></div>
  <div class="file-row"><span class="file-label">APIs</span><span class="file-path">${esc((meta.apis ?? []).join(', '))}</span></div>
  <div class="file-stats">
    <div class="stat">텍스트 <strong>${result.records.filter((r) => r.kind === 'text').length}</strong></div>
    <div class="stat">테이블 <strong>${result.records.filter((r) => r.kind === 'table').length}</strong></div>
  </div>
</div>
${blocks}
</body></html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const extractFiles = fs
  .readdirSync(mappedDir)
  .filter((f) => f.endsWith('.extract.json'))
  .sort();

console.log(`\n${extractFiles.length}개 extract.json → HTML 변환\n`);

for (const fname of extractFiles) {
  const cdms = fname.replace('.extract.json', '');
  const result: ExtractResult = JSON.parse(fs.readFileSync(path.join(mappedDir, fname), 'utf-8'));
  const html = renderDoc(result, cdms);
  fs.writeFileSync(path.join(htmlDir, `${cdms}.html`), html);
  process.stdout.write(`✓ ${cdms}\n`);
}

// 인덱스 HTML
const indexRows = extractFiles
  .map((fname) => {
    const cdms = fname.replace('.extract.json', '');
    const meta = (JSON.parse(fs.readFileSync(path.join(mappedDir, fname), 'utf-8')) as any).meta;
    return `<tr><td><a href="${cdms}.html" target="_blank">${cdms}</a></td><td>${esc(meta.title ?? '')}</td><td>${esc(path.basename(meta.source_hwp ?? ''))}</td></tr>`;
  })
  .join('');

const indexHtml = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><title>HWP Pipeline Index</title>
<style>body{font-family:'Malgun Gothic',sans-serif;padding:24px;}table{border-collapse:collapse;width:100%;}
th,td{border:1px solid #ddd;padding:8px 12px;font-size:13px;}th{background:#3b5bdb;color:#fff;}
tr:nth-child(even){background:#f5f7ff;}a{color:#3b5bdb;}</style></head><body>
<h2>강의계획서 추출 결과 (${extractFiles.length}개)</h2>
<table><thead><tr><th>CDMS 코드</th><th>과정명</th><th>HWP 파일</th></tr></thead>
<tbody>${indexRows}</tbody></table></body></html>`;

fs.writeFileSync(path.join(htmlDir, 'index.html'), indexHtml);
console.log(`\n✅ 완료 → ${htmlDir}/index.html`);
