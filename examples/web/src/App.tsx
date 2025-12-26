import { useEffect, useState, useCallback } from 'react';
import * as hwpjs from '@ohah/hwpjs';
import './App.css';

type TabType = 'html' | 'body_text' | 'table_schema' | 'table_html';

// ============================================================================
// Table Schema Types & Conversion (inlined from @ohah/hwpjs/table-schema)
// ============================================================================

interface CellPosition {
  row: number;
  col: number;
}

interface MergeRange {
  start: CellPosition;
  end: CellPosition;
}

interface CellImage {
  id: string;
  dataUrl: string; // data:image/...;base64,...
  format: string;
}

interface TableSchemaCell {
  value: string | number | boolean | null;
  images?: CellImage[];
  style?: {
    verticalAlign?: 'top' | 'middle' | 'bottom';
  };
}

interface TableSchemaRow {
  cells: TableSchemaCell[];
}

interface TableSchema {
  rows: TableSchemaRow[];
  merges?: MergeRange[];
}

interface ShapeComponentPicture {
  shape_component_picture: {
    picture_info: {
      bindata_id: number;
    };
  };
}

interface HwpRecord {
  type: string;
  text?: string;
  shape_component_picture?: ShapeComponentPicture['shape_component_picture'];
}

interface HwpCell {
  list_header: {
    attribute: {
      vertical_align: string;
    };
  };
  cell_attributes: {
    row_address: number;
    col_address: number;
    col_span: number;
    row_span: number;
  };
  paragraphs: Array<{
    records: HwpRecord[];
  }>;
}

interface HwpTable {
  attributes: {
    row_count: number;
    col_count: number;
  };
  cells: HwpCell[];
}

// 이미지 맵: bindata_id -> data URL
type ImageMap = Map<number, { dataUrl: string; format: string }>;

interface CellContent {
  text: string;
  images: CellImage[];
}

function extractCellContent(cell: HwpCell, imageMap: ImageMap): CellContent {
  const texts: string[] = [];
  const images: CellImage[] = [];

  for (const para of cell.paragraphs) {
    for (const record of para.records) {
      if (record.type === 'para_text' && record.text) {
        const cleanText = record.text.replace(/[\x00-\x1F]/g, '');
        if (cleanText) texts.push(cleanText);
      }
      if (record.type === 'shape_component_picture' && record.shape_component_picture) {
        const binId = record.shape_component_picture.picture_info?.bindata_id;
        if (binId && imageMap.has(binId)) {
          const img = imageMap.get(binId)!;
          images.push({
            id: `img-${binId}`,
            dataUrl: img.dataUrl,
            format: img.format,
          });
        }
      }
    }
  }

  return { text: texts.join('\n'), images };
}

function extractCellText(cell: HwpCell): string {
  const texts: string[] = [];
  for (const para of cell.paragraphs) {
    for (const record of para.records) {
      if (record.type === 'para_text' && record.text) {
        const cleanText = record.text.replace(/[\x00-\x1F]/g, '');
        if (cleanText) texts.push(cleanText);
      }
    }
  }
  return texts.join('\n');
}

function convertVerticalAlign(hwpAlign: string): 'top' | 'middle' | 'bottom' {
  return hwpAlign === 'center' ? 'middle' : hwpAlign === 'bottom' ? 'bottom' : 'top';
}

function convertHwpTableToTableSchema(hwpTable: HwpTable, imageMap?: ImageMap): TableSchema {
  const { row_count, col_count } = hwpTable.attributes;
  const grid: (HwpCell | null)[][] = Array.from({ length: row_count }, () =>
    Array.from({ length: col_count }, () => null)
  );
  const merges: MergeRange[] = [];

  for (const cell of hwpTable.cells) {
    const { row_address, col_address, row_span, col_span } = cell.cell_attributes;
    grid[row_address][col_address] = cell;
    if (row_span > 1 || col_span > 1) {
      merges.push({
        start: { row: row_address, col: col_address },
        end: { row: row_address + row_span - 1, col: col_address + col_span - 1 },
      });
    }
  }

  const rows: TableSchemaRow[] = [];
  for (let rowIdx = 0; rowIdx < row_count; rowIdx++) {
    const rowCells: TableSchemaCell[] = [];
    for (let colIdx = 0; colIdx < col_count; colIdx++) {
      const cell = grid[rowIdx][colIdx];
      const isMergedAway = merges.some(
        (m) =>
          rowIdx >= m.start.row && rowIdx <= m.end.row &&
          colIdx >= m.start.col && colIdx <= m.end.col &&
          !(rowIdx === m.start.row && colIdx === m.start.col)
      );
      if (isMergedAway) continue;
      if (cell) {
        const content = imageMap
          ? extractCellContent(cell, imageMap)
          : { text: extractCellText(cell), images: [] };
        const verticalAlign = convertVerticalAlign(cell.list_header.attribute.vertical_align);
        const schemaCell: TableSchemaCell = { value: content.text };
        if (content.images.length > 0) {
          schemaCell.images = content.images;
        }
        if (verticalAlign !== 'top') {
          schemaCell.style = { verticalAlign };
        }
        rowCells.push(schemaCell);
      } else {
        rowCells.push({ value: null });
      }
    }
    rows.push({ cells: rowCells });
  }

  const result: TableSchema = { rows };
  if (merges.length > 0) result.merges = merges;
  return result;
}

function isHwpTable(obj: unknown): obj is HwpTable {
  if (!obj || typeof obj !== 'object') return false;
  const table = obj as Record<string, unknown>;
  return (
    'attributes' in table && 'cells' in table &&
    Array.isArray(table.cells) &&
    typeof table.attributes === 'object' && table.attributes !== null &&
    'row_count' in (table.attributes as Record<string, unknown>) &&
    'col_count' in (table.attributes as Record<string, unknown>)
  );
}

function transformHwpTablesWithSchema<T>(hwpJson: T, imageMap?: ImageMap): T {
  function transform(obj: unknown): unknown {
    if (obj === null || obj === undefined) return obj;
    if (Array.isArray(obj)) return obj.map(transform);
    if (typeof obj === 'object') {
      const record = obj as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (key === 'table' && isHwpTable(value)) {
          result.tableSchema = convertHwpTableToTableSchema(value, imageMap);
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
 * body_text에서 모든 tableSchema만 추출
 */
function extractAllTableSchemas(obj: unknown): TableSchema[] {
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

// ============================================================================
// TableSchema → HTML 변환
// ============================================================================

interface MergeInfo {
  rowSpan: number;
  colSpan: number;
}

function buildMergeMap(schema: TableSchema): Map<string, MergeInfo | 'skip'> {
  const mergeMap = new Map<string, MergeInfo | 'skip'>();
  if (!schema.merges) return mergeMap;

  for (const merge of schema.merges) {
    const rowSpan = merge.end.row - merge.start.row + 1;
    const colSpan = merge.end.col - merge.start.col + 1;

    // 시작 셀에 span 정보 저장
    mergeMap.set(`${merge.start.row},${merge.start.col}`, { rowSpan, colSpan });

    // 병합된 다른 셀들은 skip 표시
    for (let r = merge.start.row; r <= merge.end.row; r++) {
      for (let c = merge.start.col; c <= merge.end.col; c++) {
        if (r !== merge.start.row || c !== merge.start.col) {
          mergeMap.set(`${r},${c}`, 'skip');
        }
      }
    }
  }
  return mergeMap;
}

function tableSchemaToHtml(schema: TableSchema): string {
  const mergeMap = buildMergeMap(schema);
  let html = '<table class="schema-table">\n';

  if (schema.caption) {
    html += `  <caption>${escapeHtml(schema.caption)}</caption>\n`;
  }

  html += '  <tbody>\n';

  for (let rowIdx = 0; rowIdx < schema.rows.length; rowIdx++) {
    const row = schema.rows[rowIdx];
    html += '    <tr>\n';

    let cellIdx = 0;
    for (let colIdx = 0; cellIdx < row.cells.length; colIdx++) {
      const key = `${rowIdx},${colIdx}`;
      const mergeInfo = mergeMap.get(key);

      if (mergeInfo === 'skip') {
        continue;
      }

      const cell = row.cells[cellIdx];
      cellIdx++;

      const attrs: string[] = [];
      if (mergeInfo && mergeInfo !== 'skip') {
        if (mergeInfo.rowSpan > 1) attrs.push(`rowspan="${mergeInfo.rowSpan}"`);
        if (mergeInfo.colSpan > 1) attrs.push(`colspan="${mergeInfo.colSpan}"`);
      }

      const styles: string[] = [];
      if (cell.style?.verticalAlign) {
        styles.push(`vertical-align: ${cell.style.verticalAlign}`);
      }
      if (styles.length > 0) {
        attrs.push(`style="${styles.join('; ')}"`);
      }

      const attrStr = attrs.length > 0 ? ' ' + attrs.join(' ') : '';
      const textValue = cell.value !== null ? escapeHtml(String(cell.value)) : '';

      // 이미지 렌더링
      let imagesHtml = '';
      if (cell.images && cell.images.length > 0) {
        imagesHtml = cell.images
          .map(img => `<img src="${img.dataUrl}" alt="${img.id}" class="cell-image" />`)
          .join('');
      }

      html += `      <td${attrStr}>${imagesHtml}${textValue}</td>\n`;
    }

    html += '    </tr>\n';
  }

  html += '  </tbody>\n</table>';
  return html;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function App() {
  const [html, setHtml] = useState<string>('');
  const [bodyText, setBodyText] = useState<unknown>(null);
  const [tableSchemas, setTableSchemas] = useState<TableSchema[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('html');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = async (schema: TableSchema, index: number) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const processHwpFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);
    setHtml('');
    setBodyText(null);
    setTableSchemas([]);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);

      // HTML 변환
      const htmlResult = hwpjs.toHtml(data, {
        includeVersion: false,
        includePageInfo: false,
      });
      setHtml(htmlResult);

      // HTML에서 이미지 data URL 추출 (bindata_id 순서대로)
      const imageMap: ImageMap = new Map();
      const dataUrlMatches = htmlResult.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g);
      if (dataUrlMatches) {
        dataUrlMatches.forEach((dataUrl, i) => {
          const binId = i + 1; // bindata_id는 1부터 시작
          const formatMatch = dataUrl.match(/data:image\/([^;]+)/);
          const format = formatMatch ? formatMatch[1] : 'unknown';
          imageMap.set(binId, { dataUrl, format });
        });
      }

      // JSON 변환 후 body_text 추출 및 테이블 스키마 변환
      const jsonString = hwpjs.toJson(data);
      const parsed = JSON.parse(jsonString);
      if (parsed.body_text) {
        const transformedBodyText = transformHwpTablesWithSchema(parsed.body_text, imageMap);
        setBodyText(transformedBodyText);

        // TableSchema만 추출
        const schemas = extractAllTableSchemas(transformedBodyText);
        setTableSchemas(schemas);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'HWP 파일 파싱 실패';
      setError(errorMessage);
      console.error('Error parsing HWP file:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load default file on mount
  useEffect(() => {
    const loadDefaultFile = async () => {
      try {
        const response = await fetch('./noori.hwp');
        if (response.ok) {
          const blob = await response.blob();
          const file = new File([blob], 'noori.hwp', { type: 'application/x-hwp' });
          await processHwpFile(file);
        }
      } catch {
        // Default file not found, skipping...
      }
    };
    loadDefaultFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processHwpFile(file);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>hwpjs</h1>
        <p className="subtitle">HWP 파일을 HTML 또는 body_text(TableSchema)로 변환하여 보기</p>

        <div className="file-input-wrapper">
          <label htmlFor="hwp-file" className="file-input-label">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            HWP 파일 선택
          </label>
          <input
            id="hwp-file"
            type="file"
            accept=".hwp"
            onChange={handleFileSelect}
            className="file-input"
          />
        </div>
      </header>

      <main className="app-main">
        {loading && (
          <div className="loading">
            <div className="spinner"></div>
            <p>HWP 파일을 파싱하는 중...</p>
          </div>
        )}

        {error && (
          <div className="error">
            <p>❌ {error}</p>
          </div>
        )}

        {(html || bodyText) && !loading && (
          <div className="content-container">
            <div className="tabs">
              <button
                className={`tab ${activeTab === 'html' ? 'active' : ''}`}
                onClick={() => setActiveTab('html')}
              >
                HTML 보기
              </button>
              <button
                className={`tab ${activeTab === 'body_text' ? 'active' : ''}`}
                onClick={() => setActiveTab('body_text')}
              >
                body_text (TableSchema)
              </button>
              <button
                className={`tab ${activeTab === 'table_schema' ? 'active' : ''}`}
                onClick={() => setActiveTab('table_schema')}
              >
                TableSchema Only ({tableSchemas.length})
              </button>
              <button
                className={`tab ${activeTab === 'table_html' ? 'active' : ''}`}
                onClick={() => setActiveTab('table_html')}
              >
                Table HTML ({tableSchemas.length})
              </button>
            </div>

            <div className="tab-content">
              {activeTab === 'html' && html && (
                <div
                  className="html-container"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              )}

              {activeTab === 'body_text' && bodyText && (
                <div className="json-container">
                  <pre className="json-content">
                    {JSON.stringify(bodyText, null, 2)}
                  </pre>
                </div>
              )}

              {activeTab === 'table_schema' && (
                <div className="json-container">
                  {tableSchemas.length === 0 ? (
                    <div className="empty-state">
                      <p>테이블이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="table-schema-list">
                      {tableSchemas.map((schema, index) => (
                        <div
                          key={index}
                          className={`table-schema-item ${copiedIndex === index ? 'copied' : ''}`}
                          onClick={() => copyToClipboard(schema, index)}
                        >
                          <h3>
                            Table {index + 1} ({schema.rows.length} rows)
                            <span className="copy-hint">
                              {copiedIndex === index ? '복사됨!' : '클릭하여 복사'}
                            </span>
                          </h3>
                          <pre className="json-content">
                            {JSON.stringify(schema, null, 2)}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'table_html' && (
                <div className="table-html-container">
                  {tableSchemas.length === 0 ? (
                    <div className="empty-state">
                      <p>테이블이 없습니다.</p>
                    </div>
                  ) : (
                    <div className="table-html-list">
                      {tableSchemas.map((schema, index) => (
                        <div key={index} className="table-html-item">
                          <h3>Table {index + 1} ({schema.rows.length} rows)</h3>
                          <div
                            className="table-html-content"
                            dangerouslySetInnerHTML={{ __html: tableSchemaToHtml(schema) }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {!html && !bodyText && !loading && !error && (
          <div className="empty-state">
            <p>HWP 파일을 선택하거나 기본 파일을 기다리는 중...</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
