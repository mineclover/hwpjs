/**
 * Anomaly Detection Framework — Field Extractor
 *
 * DocumentSchema.fields 정의를 기반으로 TableSchema[] 에서 필드 값을 추출합니다.
 */

import type { TableSchema } from '../table-schema';
import type {
  FieldDef,
  ExtractedField,
  ExtractedCheckboxCluster,
  ExtractedTableRows,
  ExtractedText,
  ExtractedNumberSet,
  CheckboxOption,
  CheckboxFormat,
} from './types';

// ============================================================================
// Checkbox Parsing Helpers
// ============================================================================

function hasCheckMark(val: string): boolean {
  return /[☑■✓✔]/.test(val);
}

function hasUncheckMark(val: string): boolean {
  return /[▢□]/.test(val);
}

function isBareUncheck(val: string): boolean {
  // ▢/□ 만 있고 라벨 텍스트 없음
  return /^[\s▢□]+$/.test(val) && hasUncheckMark(val);
}

function matchKnownOption(val: string, options: string[]): string | null {
  const cleaned = val.replace(/[☑■▢□✓✔\s\n]/g, '');
  for (const opt of options) {
    if (cleaned.includes(opt.replace(/\s/g, ''))) return opt;
  }
  return null;
}

/**
 * 셀 값 배열에서 체크박스 선택지를 파싱합니다.
 * knownOptions에 없는 ▢ 단독 셀도 bare-uncheck로 수집합니다.
 */
function parseCheckboxOptions(cellVals: string[], knownOptions: string[]): CheckboxOption[] {
  const options: CheckboxOption[] = [];

  for (const val of cellVals) {
    const matched = matchKnownOption(val, knownOptions);

    if (matched) {
      let checked: boolean;
      let format: CheckboxFormat;

      if (hasCheckMark(val)) {
        checked = true;
        format = 'checkmark';
      } else if (hasUncheckMark(val)) {
        checked = false;
        format = 'unchecked';
      } else {
        // 체크 문자 없음 = ▢ 제거(text-only) 방식으로 체크된 상태
        checked = true;
        format = 'text-only';
      }

      options.push({ option: matched, checked, recognized: true, format });
    } else if (isBareUncheck(val)) {
      options.push({
        option: val.trim(),
        checked: false,
        recognized: false,
        format: 'bare-uncheck',
      });
    }
  }

  return options;
}

// ============================================================================
// Per-strategy Extractors
// ============================================================================

/**
 * row_contains_label:
 * anchor 텍스트가 포함된 행을 찾아 타입에 맞게 추출합니다.
 */
function extractRowContainsLabel(field: FieldDef, tables: TableSchema[]): ExtractedField {
  const anchor = field.extractor.anchor ?? '';

  for (let ti = 0; ti < tables.length; ti++) {
    const tableIdx = field.extractor.table_index;
    if (tableIdx !== undefined && tableIdx !== ti) continue;

    const table = tables[ti];

    for (let ri = 0; ri < table.rows.length; ri++) {
      const row = table.rows[ri];
      const cellVals = row.cells.map(c => String(c.value ?? '').trim());

      if (!cellVals.some(v => v.includes(anchor))) continue;

      const location = { table_index: ti, row_index: ri };

      if (field.type === 'checkbox_cluster') {
        const knownOptions = field.options ?? [];
        const options = parseCheckboxOptions(cellVals, knownOptions);
        if (options.length > 0) {
          return { found: true, options, location } satisfies ExtractedCheckboxCluster;
        }
      }

      if (field.type === 'text') {
        // anchor 셀 제외한 나머지 셀 값 병합
        const value = cellVals.filter(v => !v.includes(anchor)).join(' ').trim();
        return { found: true, value, location } satisfies ExtractedText;
      }

      if (field.type === 'number_set') {
        const values = cellVals
          .flatMap(v => (v.match(/\d+(\.\d+)?/g) ?? []).map(Number))
          .filter(n => !isNaN(n));
        if (values.length > 0) {
          return { found: true, values, location } satisfies ExtractedNumberSet;
        }
      }
    }
  }

  return { found: false };
}

/**
 * rows_after_header:
 * anchor 텍스트가 있는 헤더 행을 찾고, 이후 행들을 table_rows로 반환합니다.
 *
 * anchors 배열이 제공된 경우 순서대로 시도합니다.
 * min_rows가 설정된 경우, 데이터 행 수가 min_rows 미만인 매칭은 건너뛰고
 * 다음 anchor를 시도합니다. 이를 통해 잘못된 소형 테이블이 먼저 매칭되어도
 * fallback anchor로 올바른 테이블을 찾을 수 있습니다.
 */
function extractRowsAfterHeader(field: FieldDef, tables: TableSchema[]): ExtractedField {
  const effectiveAnchors = [
    ...(field.extractor.anchor ? [field.extractor.anchor] : []),
    ...(field.extractor.anchors ?? []),
  ];
  if (effectiveAnchors.length === 0) return { found: false };

  const minRows = field.extractor.min_rows ?? 0;

  for (const anchor of effectiveAnchors) {
    for (let ti = 0; ti < tables.length; ti++) {
      const tableIdx = field.extractor.table_index;
      if (tableIdx !== undefined && tableIdx !== ti) continue;

      const table = tables[ti];
      let headerIdx = -1;

      for (let ri = 0; ri < table.rows.length; ri++) {
        const cellVals = table.rows[ri].cells.map(c => String(c.value ?? '').trim());
        if (cellVals.some(v => v.includes(anchor))) {
          headerIdx = ri;
          break;
        }
      }

      if (headerIdx < 0) continue;

      const dataRows = table.rows
        .slice(headerIdx + 1)
        .map(row => row.cells.map(c => String(c.value ?? '').trim()));

      // min_rows 미만이면 이 매칭을 건너뜁니다 (다음 anchor 또는 다음 테이블로)
      if (dataRows.length < minRows) continue;

      return {
        found: true,
        count: dataRows.length,
        rows: dataRows,
        location: { table_index: ti, row_index: headerIdx + 1 },
      } satisfies ExtractedTableRows;
    }
  }

  return { found: false };
}

/**
 * table_caption:
 * 테이블 캡션 텍스트를 text 필드로 반환합니다.
 */
function extractTableCaption(field: FieldDef, tables: TableSchema[]): ExtractedField {
  const anchor = field.extractor.anchor;

  for (let ti = 0; ti < tables.length; ti++) {
    const tableIdx = field.extractor.table_index;
    if (tableIdx !== undefined && tableIdx !== ti) continue;

    const caption = tables[ti].caption ?? '';
    if (anchor && !caption.includes(anchor)) continue;

    return {
      found: true,
      value: caption,
      location: { table_index: ti },
    } satisfies ExtractedText;
  }

  return { found: false };
}

/**
 * cell_value_match:
 * 정규식 pattern과 일치하는 셀을 찾아 text로 반환합니다.
 */
function extractCellValueMatch(field: FieldDef, tables: TableSchema[]): ExtractedField {
  const pattern = field.extractor.pattern ? new RegExp(field.extractor.pattern) : null;

  for (let ti = 0; ti < tables.length; ti++) {
    const tableIdx = field.extractor.table_index;
    if (tableIdx !== undefined && tableIdx !== ti) continue;

    const table = tables[ti];

    for (let ri = 0; ri < table.rows.length; ri++) {
      for (let ci = 0; ci < table.rows[ri].cells.length; ci++) {
        const val = String(table.rows[ri].cells[ci].value ?? '').trim();
        if (!pattern || pattern.test(val)) {
          return {
            found: true,
            value: val,
            location: { table_index: ti, row_index: ri, cell_index: ci },
          } satisfies ExtractedText;
        }
      }
    }
  }

  return { found: false };
}

// ============================================================================
// Public API
// ============================================================================

/**
 * 단일 필드 추출
 */
export function extractField(field: FieldDef, tables: TableSchema[]): ExtractedField {
  switch (field.extractor.strategy) {
    case 'row_contains_label':
      return extractRowContainsLabel(field, tables);
    case 'rows_after_header':
      return extractRowsAfterHeader(field, tables);
    case 'table_caption':
      return extractTableCaption(field, tables);
    case 'cell_value_match':
      return extractCellValueMatch(field, tables);
    default:
      return { found: false };
  }
}

/**
 * 스키마의 모든 필드 추출
 * @returns field.id → ExtractedField 맵
 */
export function extractAllFields(
  fields: FieldDef[],
  tables: TableSchema[],
): Record<string, ExtractedField> {
  const result: Record<string, ExtractedField> = {};
  for (const field of fields) {
    result[field.id] = extractField(field, tables);
  }
  return result;
}
