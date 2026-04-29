/**
 * HWP Table → Table Schema 변환 유틸리티
 *
 * Table Schema Spec v1.0 기반
 * @see https://github.com/.../table-schema/SPEC.md
 */

// ============================================================================
// Table Schema Types (from SPEC.md)
// ============================================================================

export interface CellPosition {
  row: number;
  col: number;
}

export interface MergeRange {
  start: CellPosition;
  end: CellPosition;
}

export interface CellStyle {
  backgroundColor?: string;
  color?: string;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  textAlign?: 'left' | 'center' | 'right';
  verticalAlign?: 'top' | 'middle' | 'bottom';
  fontSize?: string;
  border?: string;
  padding?: string;
}

export interface CellImage {
  id: string;
  /** 파일 경로(상대) 또는 data URL. saveImagesToFiles() 호출 후 파일 경로로 교체됩니다. */
  src: string;
  format: string;
}

export type ImageMap = Map<number, { dataUrl: string; format: string }>;

export interface TableSchemaCell {
  value: string | number | boolean | null;
  images?: CellImage[];
  style?: CellStyle;
  className?: string;
  id?: string;
  isHeader?: boolean;
  attributes?: Record<string, string>;
}

export interface TableSchemaRow {
  cells: TableSchemaCell[];
  style?: CellStyle;
  className?: string;
  id?: string;
}

export interface TableStyle {
  width?: string;
  borderCollapse?: 'collapse' | 'separate';
}

export interface TableSchema {
  rows: TableSchemaRow[];
  merges?: MergeRange[];
  style?: TableStyle;
  className?: string;
  id?: string;
  caption?: string;
}

// ============================================================================
// HWP Table Types (subset for conversion)
// ============================================================================

interface HwpCellAttributes {
  col_address: number;
  row_address: number;
  col_span: number;
  row_span: number;
  width: number;
  height: number;
  left_margin: number;
  right_margin: number;
  top_margin: number;
  bottom_margin: number;
  border_fill_id: number;
}

interface HwpCellParagraphRecord {
  type: string;
  text?: string;
  runs?: Array<{
    kind: string;
    text?: string;
  }>;
  shape_component_picture?: {
    picture_info: {
      bindata_id: number;
    };
  };
}

interface HwpCellParagraph {
  para_header: unknown;
  records: HwpCellParagraphRecord[];
}

interface HwpListHeader {
  paragraph_count: number;
  attribute: {
    text_direction: string;
    line_break: string;
    vertical_align: string;
  };
}

interface HwpCell {
  list_header: HwpListHeader;
  cell_attributes: HwpCellAttributes;
  paragraphs: HwpCellParagraph[];
}

interface HwpTableAttributes {
  attribute: {
    page_break: string;
    header_row_repeat: boolean;
  };
  row_count: number;
  col_count: number;
  cell_spacing: number;
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  row_sizes: number[];
  border_fill_id: number;
  zones: unknown[];
}

export interface HwpTable {
  attributes: HwpTableAttributes;
  cells: HwpCell[];
}

// ============================================================================
// Conversion Functions
// ============================================================================

/**
 * HWP 셀에서 텍스트 추출 (이미지 없는 경우)
 */
function extractCellText(cell: HwpCell): string {
  const texts: string[] = [];

  for (const para of cell.paragraphs) {
    for (const record of para.records) {
      if (record.type === 'para_text' && record.text) {
        // 제어 문자 제거 (char code < 32)
        const cleanText = record.text.replace(/[\x00-\x1F]/g, '');
        if (cleanText) {
          texts.push(cleanText);
        }
      }
    }
  }

  return texts.join('\n');
}

/**
 * HWP 셀에서 텍스트와 이미지 모두 추출 (ImageMap이 제공된 경우)
 */
function extractCellContent(cell: HwpCell, imageMap: ImageMap): { text: string; images: CellImage[] } {
  const texts: string[] = [];
  const images: CellImage[] = [];

  for (const para of cell.paragraphs) {
    for (const record of para.records) {
      if (record.type === 'para_text' && record.text) {
        const cleanText = record.text.replace(/[\x00-\x1F]/g, '');
        if (cleanText) texts.push(cleanText);
      }
      // 실제 구조: ctrl_header → shape_component → shape_component_picture
      if (record.type === 'ctrl_header' && Array.isArray((record as any).children)) {
        for (const shapeComp of (record as any).children) {
          if (shapeComp.type === 'shape_component' && Array.isArray(shapeComp.children)) {
            for (const shapePic of shapeComp.children) {
              if (shapePic.type === 'shape_component_picture') {
                const binId = shapePic.shape_component_picture?.picture_info?.bindata_id;
                if (binId !== undefined && imageMap.has(binId)) {
                  const img = imageMap.get(binId)!;
                  images.push({ id: `img-${binId}`, src: img.dataUrl, format: img.format });
                }
              }
            }
          }
        }
      }
    }
  }

  return { text: texts.join('\n'), images };
}

/**
 * HWP vertical_align을 Table Schema로 변환
 */
function convertVerticalAlign(hwpAlign: string): 'top' | 'middle' | 'bottom' {
  switch (hwpAlign) {
    case 'top':
      return 'top';
    case 'center':
      return 'middle';
    case 'bottom':
      return 'bottom';
    default:
      return 'top';
  }
}

/**
 * HWP Table → Table Schema 변환
 *
 * @param hwpTable - HWP 테이블 원본 데이터
 * @param imageMap - (선택) 이미지 ID → data URL 매핑. 제공 시 셀 내 이미지도 추출됩니다.
 */
export function convertHwpTableToTableSchema(hwpTable: HwpTable, imageMap?: ImageMap): TableSchema {
  const { row_count, col_count } = hwpTable.attributes;

  // 2D 그리드 초기화 (병합된 셀 추적용)
  const grid: (HwpCell | null)[][] = Array.from({ length: row_count }, () =>
    Array.from({ length: col_count }, () => null)
  );

  const merges: MergeRange[] = [];

  // 셀을 그리드에 배치하고 병합 정보 수집
  for (const cell of hwpTable.cells) {
    const { row_address, col_address, row_span, col_span } = cell.cell_attributes;

    // 시작 셀 배치
    grid[row_address][col_address] = cell;

    // 병합 정보 수집 (span > 1인 경우)
    if (row_span > 1 || col_span > 1) {
      merges.push({
        start: { row: row_address, col: col_address },
        end: { row: row_address + row_span - 1, col: col_address + col_span - 1 },
      });
    }
  }

  // Table Schema rows 생성
  const rows: TableSchemaRow[] = [];

  for (let rowIdx = 0; rowIdx < row_count; rowIdx++) {
    const rowCells: TableSchemaCell[] = [];

    for (let colIdx = 0; colIdx < col_count; colIdx++) {
      const cell = grid[rowIdx][colIdx];

      // 병합으로 인해 건너뛰어야 하는 셀인지 확인
      const isMergedAway = merges.some(
        (m) =>
          rowIdx >= m.start.row &&
          rowIdx <= m.end.row &&
          colIdx >= m.start.col &&
          colIdx <= m.end.col &&
          !(rowIdx === m.start.row && colIdx === m.start.col) // 시작 셀은 제외
      );

      if (isMergedAway) {
        continue;
      }

      if (cell) {
        const verticalAlign = convertVerticalAlign(cell.list_header.attribute.vertical_align);
        const schemaCell: TableSchemaCell = imageMap
          ? (() => {
              const { text, images } = extractCellContent(cell, imageMap);
              const c: TableSchemaCell = { value: text };
              if (images.length > 0) c.images = images;
              return c;
            })()
          : { value: extractCellText(cell) };

        // 스타일이 기본값이 아닌 경우만 추가
        if (verticalAlign !== 'top') {
          schemaCell.style = { ...schemaCell.style, verticalAlign };
        }

        rowCells.push(schemaCell);
      } else {
        rowCells.push({ value: null });
      }
    }

    rows.push({ cells: rowCells });
  }

  const result: TableSchema = { rows };

  if (merges.length > 0) {
    result.merges = merges;
  }

  return result;
}

// ============================================================================
// HWP JSON Transform
// ============================================================================

/**
 * HWP JSON 전체에서 테이블을 찾아 Table Schema로 변환
 *
 * table 프로퍼티를 tableSchema로 교체 (원본 table도 유지 가능)
 *
 * @param hwpJson - toJson()으로 파싱된 HWP JSON 객체 (혹은 body_text 등 부분)
 * @param options.keepOriginal - 원본 table 프로퍼티 유지 여부 (기본: false)
 * @param options.schemaKey - 교체할 프로퍼티 이름 (기본: 'tableSchema')
 * @param options.imageMap - 이미지 ID → data URL 매핑. 제공 시 셀 내 이미지도 추출됩니다.
 */
export function transformHwpTablesWithSchema<T>(
  hwpJson: T,
  options: {
    keepOriginal?: boolean;
    schemaKey?: string;
    imageMap?: ImageMap;
  } = {}
): T {
  const { keepOriginal = false, schemaKey = 'tableSchema', imageMap } = options;

  function transform(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(transform);
    }

    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      const result: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (key === 'table' && isHwpTable(value)) {
          const tableSchema = convertHwpTableToTableSchema(value, imageMap);
          result[schemaKey] = tableSchema;

          if (keepOriginal) {
            result.table = value;
          }
        } else {
          result[key] = transform(value);
        }
      }

      return result;
    }

    return obj;
  }

  return transform(hwpJson) as T;
}

/**
 * HWP Table 타입 가드
 */
function isHwpTable(obj: unknown): obj is HwpTable {
  if (!obj || typeof obj !== 'object') return false;
  const table = obj as Record<string, unknown>;
  return (
    'attributes' in table &&
    'cells' in table &&
    Array.isArray(table.cells) &&
    typeof table.attributes === 'object' &&
    table.attributes !== null &&
    'row_count' in (table.attributes as Record<string, unknown>) &&
    'col_count' in (table.attributes as Record<string, unknown>)
  );
}

// ============================================================================
// Image File Utilities (Node.js / Bun)
// ============================================================================

/**
 * 스키마 내 모든 이미지를 파일로 저장하고 src를 파일 경로로 교체합니다.
 * (Node.js / Bun 전용)
 *
 * @param schemas - TableSchema 배열 (CellImage.src 가 data URL인 상태)
 * @param outputDir - 이미지를 저장할 디렉토리 경로
 * @returns 이미지 src가 파일 경로로 업데이트된 새 스키마 배열
 *
 * @example
 * const schemas = extractAllTableSchemas(transformed);
 * const saved   = await saveImagesToFiles(schemas, './output/images');
 * // saved[n].rows[r].cells[c].images[i].src === 'output/images/img-2.jpeg'
 */
export async function saveImagesToFiles(
  schemas: TableSchema[],
  outputDir: string,
): Promise<TableSchema[]> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(outputDir, { recursive: true });

  // 중복 저장 방지: id → 저장된 파일 경로
  const saved = new Map<string, string>();
  const pending: Array<{ id: string; path: string; base64: string }> = [];

  for (const schema of schemas) {
    for (const row of schema.rows) {
      for (const cell of row.cells) {
        for (const img of cell.images ?? []) {
          if (!img.src.startsWith('data:') || saved.has(img.id)) continue;
          const base64 = img.src.split(',')[1] ?? '';
          const filePath = `${outputDir}/${img.id}.${img.format}`;
          pending.push({ id: img.id, path: filePath, base64 });
          saved.set(img.id, filePath);
        }
      }
    }
  }

  await Promise.all(
    pending.map(({ path, base64 }) =>
      writeFile(path, Buffer.from(base64, 'base64')),
    ),
  );

  // src를 파일 경로로 교체한 새 스키마 반환
  return schemas.map(schema => ({
    ...schema,
    rows: schema.rows.map(row => ({
      ...row,
      cells: row.cells.map(cell => ({
        ...cell,
        images: cell.images?.map(img => ({
          ...img,
          src: saved.get(img.id) ?? img.src,
        })),
      })),
    })),
  }));
}

// ============================================================================
// Table Schema Extraction
// ============================================================================

/**
 * 변환된 HWP JSON에서 모든 TableSchema만 추출
 */
export function extractAllTableSchemas(obj: unknown): TableSchema[] {
  const schemas: TableSchema[] = [];

  function traverse(node: unknown): void {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
      node.forEach(traverse);
      return;
    }
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if ('tableSchema' in record && record.tableSchema) {
        schemas.push(record.tableSchema as TableSchema);
      }
      Object.values(record).forEach(traverse);
    }
  }

  traverse(obj);
  return schemas;
}
