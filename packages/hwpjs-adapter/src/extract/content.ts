import { transformHwpTablesWithSchema, type TableSchema, type ImageMap } from '../table-schema.js';
import { normalizeText } from '../utils/normalize.js';
import { collectAllTableSchemas, collectBinIds } from '../utils/traverse.js';
import type {
  DocRecord,
  TableRecord,
  TableRowRecord,
  TableCellRecord,
  MergeRange,
} from './types.js';

// ─── 텍스트 추출 헬퍼 ─────────────────────────────────────────────────────────

function runsToText(para: any): string {
  return ((para?.records ?? []) as any[])
    .filter((r: any) => r.type === 'para_text')
    .flatMap((r: any) => r.runs ?? [])
    .filter((r: any) => r.kind === 'text')
    .map((r: any) => normalizeText(r.text))
    .filter(Boolean)
    .join('');
}

function extractParaText(para: any): string {
  const fromRuns = runsToText(para);
  if (fromRuns) return fromRuns;
  return ((para?.records ?? []) as any[])
    .filter((r: any) => r.type === 'para_text' && r.text)
    .map((r: any) => normalizeText(r.text))
    .filter(Boolean)
    .join(' ');
}

// ─── ctrl_header(tbl) 파싱 ───────────────────────────────────────────────────

interface TblCtrlData {
  flatTexts: string[];
  rawCells: any[];
  rawTable: unknown; // 이미지 주입용 raw table
}

function parseTblCtrl(rawPara: any): TblCtrlData {
  const flatTexts: string[] = [];
  let rawCells: any[] = [];
  let rawTable: unknown = null;

  for (const rec of rawPara?.records ?? []) {
    if (rec.type !== 'ctrl_header' || rec.ctrl_id?.trim() !== 'tbl') continue;

    for (const p of rec.paragraphs ?? []) {
      const t =
        runsToText(p) ||
        (p.records ?? [])
          .filter((r: any) => r.type === 'para_text' && r.text)
          .map((r: any) => normalizeText(r.text))
          .filter(Boolean)
          .join(' ');
      flatTexts.push(t);
    }

    rawTable = rec.children?.[0]?.table ?? null;
    rawCells = (rawTable as any)?.cells ?? [];
  }

  return { flatTexts, rawCells, rawTable };
}

// ─── 셀 내용 검사 / 주입 ──────────────────────────────────────────────────────

function allCellsEmpty(schema: TableSchema): boolean {
  return schema.rows.every((row) =>
    row.cells.every((cell) => !cell.value || String(cell.value).trim() === '')
  );
}

function fillCellsFromFlat(schema: TableSchema, flatTexts: string[], rawCells: any[]): void {
  if (flatTexts.length === 0) return;

  const schemaCells: Array<(typeof schema.rows)[0]['cells'][0]> = [];
  for (const row of schema.rows) schemaCells.push(...row.cells);

  const sortedRaw = [...rawCells].sort((a, b) =>
    a.cell_attributes.row_address !== b.cell_attributes.row_address
      ? a.cell_attributes.row_address - b.cell_attributes.row_address
      : a.cell_attributes.col_address - b.cell_attributes.col_address
  );

  let flatIdx = 0;
  for (let i = 0; i < Math.min(schemaCells.length, sortedRaw.length); i++) {
    const paraCount = sortedRaw[i]?.paragraphs?.length ?? 1;
    const chunk = flatTexts.slice(flatIdx, flatIdx + paraCount).filter((t) => t.trim());
    if (chunk.length > 0) schemaCells[i].value = chunk.join('\n');
    flatIdx += paraCount;
  }
}

// ─── TableSchema → TableRecord ───────────────────────────────────────────────

function schemaToTableRecord(schema: TableSchema, schemaPath: string): TableRecord {
  const merges = (schema.merges ?? []) as MergeRange[];

  const rows: TableRowRecord[] = schema.rows.map((row, ri) => {
    const cells: TableCellRecord[] = row.cells.map((cell, ci) => ({
      path: `${schemaPath}.rows[${ri}].cells[${ci}]`,
      content: cell.value != null ? normalizeText(cell.value, false) : '',
      ...(cell.images && cell.images.length > 0
        ? { images: cell.images.map((img) => ({ id: img.id, src: img.src, format: img.format })) }
        : {}),
    }));
    return { cells };
  });

  return {
    row_count: schema.rows.length,
    col_count: schema.rows[0]?.cells.length ?? 0,
    ...(merges.length > 0 ? { merges } : {}),
    rows,
  };
}

// ─── 이미지 주입 (메인 루프에서 수집한 rawTables 사용) ───────────────────────

function injectImages(rawTables: unknown[], tableRecords: TableRecord[], imageMap: ImageMap): void {
  if (imageMap.size === 0) return;

  for (let ti = 0; ti < Math.min(rawTables.length, tableRecords.length); ti++) {
    const rawCells = ((rawTables[ti] as any)?.cells ?? []) as unknown[];
    let ci = 0;
    for (const row of tableRecords[ti].rows) {
      for (const cell of row.cells) {
        const binIds = collectBinIds(rawCells[ci++]);
        if (binIds.length > 0) {
          cell.images = binIds
            .filter((id) => imageMap.has(id))
            .map((id) => {
              const img = imageMap.get(id)!;
              return { id: `img-${id}`, src: img.dataUrl, format: img.format };
            });
        }
      }
    }
  }
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export function extractContent(
  hwpJson: unknown,
  rawBodyText: unknown,
  imageMap: ImageMap
): DocRecord[] {
  const records: DocRecord[] = [];
  const body = (hwpJson as any)?.body_text;
  if (!body) return records;

  // Pass 1: transformHwpTablesWithSchema — table → tableSchema 변환
  const transformed = transformHwpTablesWithSchema(body);
  const rawSections = (rawBodyText as any)?.sections ?? [];
  const allTableRecords: TableRecord[] = [];
  // 이미지 주입용 rawTable을 메인 루프에서 수집 (별도 collectRawTables 패스 제거)
  const rawTableQueue: unknown[] = [];

  for (const [si, section] of (transformed.sections ?? []).entries()) {
    const rawParas = rawSections[si]?.paragraphs ?? [];

    for (const [pi, para] of (section.paragraphs ?? []).entries()) {
      const paraPath = `body_text.sections[${si}].paragraphs[${pi}]`;
      const found = collectAllTableSchemas(para, paraPath);

      if (found.length > 0) {
        const rawPara = rawParas[pi];
        const { flatTexts, rawCells, rawTable } = parseTblCtrl(rawPara);

        for (const { schema, path: tablePath } of found) {
          if (allCellsEmpty(schema) && flatTexts.length > 0) {
            fillCellsFromFlat(schema, flatTexts, rawCells);
          }
          const table = schemaToTableRecord(schema, tablePath);
          allTableRecords.push(table);
          records.push({ path: tablePath, kind: 'table', table });
          // rawTable을 메인 루프에서 수집 — injectImages 별도 패스 불필요
          rawTableQueue.push(rawTable);
        }
        continue;
      }

      const content = extractParaText(para as any);
      if (content) records.push({ path: paraPath, kind: 'text', content });
    }
  }

  // Pass 2: 이미지 주입 (rawTableQueue 재활용, rawBodyText 재순회 없음)
  injectImages(rawTableQueue, allTableRecords, imageMap);
  return records;
}
