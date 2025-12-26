import { describe, it, expect } from 'bun:test';
import { toJson } from '../dist/index.js';
import {
  convertHwpTableToTableSchema,
  transformHwpTablesWithSchema,
  type HwpTable,
  type TableSchema,
} from '../src/table-schema';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../../../crates/hwp-core/tests/fixtures');

describe('table-schema', () => {
  describe('convertHwpTableToTableSchema', () => {
    it('should convert simple table without merges', () => {
      const hwpTable: HwpTable = {
        attributes: {
          attribute: { page_break: 'no_break', header_row_repeat: false },
          row_count: 2,
          col_count: 2,
          cell_spacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          row_sizes: [1000, 1000],
          border_fill_id: 1,
          zones: [],
        },
        cells: [
          createMockCell(0, 0, 1, 1, 'A1'),
          createMockCell(0, 1, 1, 1, 'B1'),
          createMockCell(1, 0, 1, 1, 'A2'),
          createMockCell(1, 1, 1, 1, 'B2'),
        ],
      };

      const result = convertHwpTableToTableSchema(hwpTable);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toHaveLength(2);
      expect(result.rows[0].cells[0].value).toBe('A1');
      expect(result.rows[0].cells[1].value).toBe('B1');
      expect(result.rows[1].cells[0].value).toBe('A2');
      expect(result.rows[1].cells[1].value).toBe('B2');
      expect(result.merges).toBeUndefined();
    });

    it('should convert table with colspan', () => {
      // 2x2 table where bottom row is merged (col_span=2)
      const hwpTable: HwpTable = {
        attributes: {
          attribute: { page_break: 'no_break', header_row_repeat: false },
          row_count: 2,
          col_count: 2,
          cell_spacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          row_sizes: [1000, 1000],
          border_fill_id: 1,
          zones: [],
        },
        cells: [
          createMockCell(0, 0, 1, 1, 'A1'),
          createMockCell(0, 1, 1, 1, 'B1'),
          createMockCell(1, 0, 2, 1, 'Merged'), // colspan=2
        ],
      };

      const result = convertHwpTableToTableSchema(hwpTable);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toHaveLength(2);
      expect(result.rows[1].cells).toHaveLength(1); // merged cell only
      expect(result.rows[1].cells[0].value).toBe('Merged');
      expect(result.merges).toHaveLength(1);
      expect(result.merges![0]).toEqual({
        start: { row: 1, col: 0 },
        end: { row: 1, col: 1 },
      });
    });

    it('should convert table with rowspan', () => {
      // 2x2 table where right column is merged (row_span=2)
      const hwpTable: HwpTable = {
        attributes: {
          attribute: { page_break: 'no_break', header_row_repeat: false },
          row_count: 2,
          col_count: 2,
          cell_spacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          row_sizes: [1000, 1000],
          border_fill_id: 1,
          zones: [],
        },
        cells: [
          createMockCell(0, 0, 1, 1, 'A1'),
          createMockCell(0, 1, 1, 2, 'Merged'), // rowspan=2
          createMockCell(1, 0, 1, 1, 'A2'),
        ],
      };

      const result = convertHwpTableToTableSchema(hwpTable);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toHaveLength(2);
      expect(result.rows[1].cells).toHaveLength(1); // only A2, merged cell skipped
      expect(result.merges).toHaveLength(1);
      expect(result.merges![0]).toEqual({
        start: { row: 0, col: 1 },
        end: { row: 1, col: 1 },
      });
    });

    it('should convert table with both colspan and rowspan', () => {
      // 2x3 table from fixture (table.hwp)
      // Cell 2: row_span=2, Cell 3: col_span=2
      const hwpTable: HwpTable = {
        attributes: {
          attribute: { page_break: 'no_break', header_row_repeat: false },
          row_count: 2,
          col_count: 3,
          cell_spacing: 0,
          padding: { top: 0, right: 0, bottom: 0, left: 0 },
          row_sizes: [1000, 1000],
          border_fill_id: 1,
          zones: [],
        },
        cells: [
          createMockCell(0, 0, 1, 1, 'A'),
          createMockCell(0, 1, 1, 1, 'B'),
          createMockCell(0, 2, 1, 2, 'C'), // rowspan=2
          createMockCell(1, 0, 2, 1, 'D'), // colspan=2
        ],
      };

      const result = convertHwpTableToTableSchema(hwpTable);

      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].cells).toHaveLength(3);
      expect(result.rows[1].cells).toHaveLength(1); // D only (C is skipped due to rowspan)
      expect(result.merges).toHaveLength(2);
    });
  });

  describe('transformHwpTablesWithSchema', () => {
    it('should transform real HWP file with tables', () => {
      const hwpPath = path.join(fixturesDir, 'table.hwp');
      const hwpBuffer = fs.readFileSync(hwpPath);
      const json = JSON.parse(toJson(hwpBuffer));

      const transformed = transformHwpTablesWithSchema(json);

      // table 프로퍼티가 tableSchema로 교체되었는지 확인
      const tableSchemas = findAllByKey(transformed, 'tableSchema');
      expect(tableSchemas.length).toBeGreaterThan(0);

      // 첫 번째 테이블 스키마 검증
      const firstSchema = tableSchemas[0] as TableSchema;
      expect(firstSchema.rows).toBeDefined();
      expect(Array.isArray(firstSchema.rows)).toBe(true);
    });

    it('should keep original table when keepOriginal is true', () => {
      const hwpPath = path.join(fixturesDir, 'table.hwp');
      const hwpBuffer = fs.readFileSync(hwpPath);
      const json = JSON.parse(toJson(hwpBuffer));

      const transformed = transformHwpTablesWithSchema(json, { keepOriginal: true });

      // 원본 table도 유지되는지 확인
      const tables = findAllByKey(transformed, 'table');
      const tableSchemas = findAllByKey(transformed, 'tableSchema');

      expect(tables.length).toBeGreaterThan(0);
      expect(tableSchemas.length).toBeGreaterThan(0);
    });

    it('should use custom schema key', () => {
      const hwpPath = path.join(fixturesDir, 'table.hwp');
      const hwpBuffer = fs.readFileSync(hwpPath);
      const json = JSON.parse(toJson(hwpBuffer));

      const transformed = transformHwpTablesWithSchema(json, { schemaKey: 'customTable' });

      const customTables = findAllByKey(transformed, 'customTable');
      expect(customTables.length).toBeGreaterThan(0);
    });
  });

  describe('real HWP files', () => {
    it('should handle table2.hwp with complex merges', () => {
      const hwpPath = path.join(fixturesDir, 'table2.hwp');
      if (!fs.existsSync(hwpPath)) {
        console.log('Skipping: table2.hwp not found');
        return;
      }

      const hwpBuffer = fs.readFileSync(hwpPath);
      const json = JSON.parse(toJson(hwpBuffer));
      const transformed = transformHwpTablesWithSchema(json);

      const tableSchemas = findAllByKey(transformed, 'tableSchema');
      expect(tableSchemas.length).toBeGreaterThan(0);

      // 각 테이블 스키마가 유효한지 검증
      for (const schema of tableSchemas) {
        const ts = schema as TableSchema;
        expect(ts.rows).toBeDefined();
        expect(ts.rows.length).toBeGreaterThan(0);
        for (const row of ts.rows) {
          expect(row.cells).toBeDefined();
        }
      }
    });

    it('should handle noori.hwp with mixed content', () => {
      const hwpPath = path.join(fixturesDir, 'noori.hwp');
      if (!fs.existsSync(hwpPath)) {
        console.log('Skipping: noori.hwp not found');
        return;
      }

      const hwpBuffer = fs.readFileSync(hwpPath);
      const json = JSON.parse(toJson(hwpBuffer));
      const transformed = transformHwpTablesWithSchema(json);

      // 변환 후에도 JSON 구조가 유효한지 확인
      expect(transformed.file_header).toBeDefined();
      expect(transformed.body_text).toBeDefined();
    });
  });
});

// Helper functions
function createMockCell(
  row: number,
  col: number,
  colSpan: number,
  rowSpan: number,
  text: string
): HwpTable['cells'][0] {
  return {
    list_header: {
      paragraph_count: 1,
      attribute: {
        text_direction: 'horizontal',
        line_break: 'normal',
        vertical_align: 'center',
      },
    },
    cell_attributes: {
      row_address: row,
      col_address: col,
      col_span: colSpan,
      row_span: rowSpan,
      width: 1000,
      height: 500,
      left_margin: 0,
      right_margin: 0,
      top_margin: 0,
      bottom_margin: 0,
      border_fill_id: 1,
    },
    paragraphs: [
      {
        para_header: {},
        records: [{ type: 'para_text', text }],
      },
    ],
  };
}

function findAllByKey(obj: unknown, key: string): unknown[] {
  const results: unknown[] = [];

  function search(o: unknown) {
    if (!o || typeof o !== 'object') return;
    if (Array.isArray(o)) {
      o.forEach(search);
      return;
    }
    const record = o as Record<string, unknown>;
    if (key in record) {
      results.push(record[key]);
    }
    Object.values(record).forEach(search);
  }

  search(obj);
  return results;
}
