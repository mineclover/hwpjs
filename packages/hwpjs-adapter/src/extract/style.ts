import { normalizeText } from '../utils/normalize.js';
import { collectRawTables } from '../utils/traverse.js';
import type { DocRecord, StyleRun, CharStyle, ParagraphStyle } from './types.js';

// ─── 색상 변환 ────────────────────────────────────────────────────────────────

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function isWhite(r: number, g: number, b: number): boolean {
  return r === 255 && g === 255 && b === 255;
}

// ─── Char Shape 룩업 ──────────────────────────────────────────────────────────

function resolveCharStyle(shapeId: number, charShapes: any[], faceNames: any[]): CharStyle {
  const cs = charShapes[shapeId];
  if (!cs)
    return {
      font: '',
      size: 10,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
      color: '#000000',
    };

  const fontId = cs.font_ids?.korean ?? 0;
  const font = faceNames[fontId]?.name ?? '';
  const size = Math.round(((cs.base_size ?? 1000) / 100) * 10) / 10;

  const attr = cs.attributes ?? {};
  const tc = cs.text_color ?? { r: 0, g: 0, b: 0 };
  const sc = cs.shading_color ?? { r: 255, g: 255, b: 255 };

  return {
    font,
    size,
    bold: !!attr.bold,
    italic: !!attr.italic,
    underline: (attr.underline_type ?? 0) > 0,
    strikethrough: (attr.strikethrough ?? 0) > 0,
    color: toHex(tc.r, tc.g, tc.b),
    ...(!isWhite(sc.r, sc.g, sc.b) ? { bg_color: toHex(sc.r, sc.g, sc.b) } : {}),
  };
}

// ─── StyleRun 빌드 ────────────────────────────────────────────────────────────

function buildStyleRuns(
  text: string,
  shapes: Array<{ position: number; shape_id: number }>,
  charShapes: any[],
  faceNames: any[]
): StyleRun[] {
  if (!shapes || shapes.length === 0 || !text) return [];

  const runs: StyleRun[] = [];
  for (let i = 0; i < shapes.length; i++) {
    const offset = shapes[i].position;
    const end = i + 1 < shapes.length ? shapes[i + 1].position : text.length;
    const runText = text.slice(offset, end);
    if (!runText) continue;

    runs.push({
      text: runText,
      offset,
      length: runText.length,
      style: resolveCharStyle(shapes[i].shape_id, charShapes, faceNames),
    });
  }
  return runs;
}

// ─── Paragraph Style 빌드 ────────────────────────────────────────────────────

function buildParaStyle(paraShapeId: number, paraShapes: any[]): ParagraphStyle {
  const ps = paraShapes[paraShapeId];
  if (!ps)
    return {
      align: 'left',
      line_spacing: 160,
      indent_left: 0,
      indent_right: 0,
      indent_first: 0,
      space_before: 0,
      space_after: 0,
    };

  return {
    align: ps.attributes1?.align ?? 'left',
    line_spacing: ps.line_spacing ?? ps.line_spacing_old ?? 160,
    indent_left: ps.left_margin ?? 0,
    indent_right: ps.right_margin ?? 0,
    indent_first: ps.indent ?? 0,
    space_before: ps.top_spacing ?? 0,
    space_after: ps.bottom_spacing ?? 0,
  };
}

// ─── 셀 텍스트 추출 (style용) ──────────────────────────────────────────────────

function extractCellTextAndShapes(cell: any): { text: string; shapes: any[] } | null {
  for (const para of cell.paragraphs ?? []) {
    const textRec = (para.records ?? []).find((r: any) => r.type === 'para_text' && r.text);
    const shapeRec = (para.records ?? []).find((r: any) => r.type === 'para_char_shape');
    if (textRec) {
      return { text: normalizeText(textRec.text, false), shapes: shapeRec?.shapes ?? [] };
    }
  }
  return null;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export function extractStyle(hwpJson: unknown, contentRecords: DocRecord[]): DocRecord[] {
  const docInfo = (hwpJson as any)?.doc_info;
  if (!docInfo) return contentRecords;

  const charShapes: any[] = docInfo.char_shapes ?? [];
  const faceNames: any[] = docInfo.face_names ?? [];
  const paraShapes: any[] = docInfo.para_shapes ?? [];

  const body = (hwpJson as any)?.body_text;
  if (!body) return contentRecords;

  const paraMap = new Map<string, { para: any }>();
  for (const [si, section] of (body.sections ?? []).entries()) {
    for (const [pi, para] of (section.paragraphs ?? []).entries()) {
      paraMap.set(`body_text.sections[${si}].paragraphs[${pi}]`, { para });
    }
  }

  const rawTables = collectRawTables(body);
  let tableIdx = 0;

  for (const record of contentRecords) {
    if (record.kind === 'text') {
      const entry = paraMap.get(record.path);
      if (!entry) continue;
      const { para } = entry;

      const textRec = (para.records ?? []).find((r: any) => r.type === 'para_text' && r.text);
      const shapeRec = (para.records ?? []).find((r: any) => r.type === 'para_char_shape');
      const paraShapeId = para.para_header?.para_shape_id ?? 0;

      if (textRec) {
        const text = normalizeText(textRec.text, false);
        record.runs = buildStyleRuns(text, shapeRec?.shapes ?? [], charShapes, faceNames);
      }
      record.para_style = buildParaStyle(paraShapeId, paraShapes);
    } else if (record.kind === 'table' && record.table) {
      const rawTable = rawTables[tableIdx++] as any;
      if (!rawTable) continue;

      const rawCells: any[] = rawTable.cells ?? [];
      let ci = 0;
      for (const row of record.table.rows) {
        for (const cell of row.cells) {
          const rawCell = rawCells[ci++];
          if (!rawCell) continue;
          const extracted = extractCellTextAndShapes(rawCell);
          if (extracted) {
            cell.runs = buildStyleRuns(extracted.text, extracted.shapes, charShapes, faceNames);
          }
        }
      }
    }
  }

  return contentRecords;
}
