/**
 * HWP → TableSchema → table-manager Table → HTML 전체 파이프라인 테스트
 */
import { describe, it, expect } from 'bun:test';
import { toJson } from '@ohah/hwpjs';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
} from '../src/table-schema';
import { tableSchemaToTable, tableSchemasToTables } from '../src/to-table';
import { tableToHtml } from '../../table-manager/src/html/html-converter';
import * as fs from 'fs';
import * as path from 'path';

const fixturesDir = path.join(__dirname, '../../../crates/hwp-core/tests/fixtures');

function loadHwp(name: string) {
  const hwpPath = path.join(fixturesDir, name);
  const buf = fs.readFileSync(hwpPath);
  const json = JSON.parse(toJson(buf));
  const transformed = transformHwpTablesWithSchema(json);
  return extractAllTableSchemas(transformed);
}

describe('HWP → TableSchema → Table → HTML pipeline', () => {
  describe('table.hwp', () => {
    it('should extract at least one table schema', () => {
      const schemas = loadHwp('table.hwp');
      expect(schemas.length).toBeGreaterThan(0);
    });

    it('should convert TableSchema to table-manager Table', () => {
      const schemas = loadHwp('table.hwp');
      const table = tableSchemaToTable(schemas[0]);

      expect(table.rows).toBeDefined();
      expect(Array.isArray(table.rows)).toBe(true);
      expect(table.rows.length).toBeGreaterThan(0);
      for (const row of table.rows) {
        expect(Array.isArray(row.cells)).toBe(true);
      }
    });

    it('should render Table to valid HTML', () => {
      const schemas = loadHwp('table.hwp');
      const table = tableSchemaToTable(schemas[0]);
      const html = tableToHtml(table);

      expect(typeof html).toBe('string');
      expect(html).toContain('<table');
      expect(html).toContain('</table>');
      expect(html).toContain('<tr');
      expect(html).toContain('<td');
    });

    it('should preserve merge info through the pipeline', () => {
      const schemas = loadHwp('table.hwp');
      // find a schema that has merges
      const schemaWithMerge = schemas.find(s => s.merges && s.merges.length > 0);
      if (!schemaWithMerge) {
        console.log('No merged cells in table.hwp, skipping merge check');
        return;
      }

      const table = tableSchemaToTable(schemaWithMerge);
      expect(table.merges).toBeDefined();
      expect(table.merges!.length).toBeGreaterThan(0);

      const html = tableToHtml(table);
      // merged cells should produce colspan or rowspan attributes
      const hasMergeAttr = html.includes('colspan') || html.includes('rowspan');
      expect(hasMergeAttr).toBe(true);
    });

    it('should convert all tables from file to HTML', () => {
      const schemas = loadHwp('table.hwp');
      const tables = tableSchemasToTables(schemas);
      const htmlList = tables.map(t => tableToHtml(t, { pretty: false }));

      expect(htmlList.length).toBe(schemas.length);
      for (const html of htmlList) {
        expect(html).toContain('<table');
        expect(html).toContain('</table>');
      }
    });
  });

  describe('table2.hwp', () => {
    it('should handle complex merges end-to-end', () => {
      const hwpPath = path.join(fixturesDir, 'table2.hwp');
      if (!fs.existsSync(hwpPath)) return;

      const schemas = loadHwp('table2.hwp');
      expect(schemas.length).toBeGreaterThan(0);

      const tables = tableSchemasToTables(schemas);
      for (const table of tables) {
        const html = tableToHtml(table);
        expect(html).toContain('<table');
        expect(html).toContain('</table>');
      }
    });
  });

  describe('noori.hwp', () => {
    it('should produce HTML for every table in mixed-content document', () => {
      const hwpPath = path.join(fixturesDir, 'noori.hwp');
      if (!fs.existsSync(hwpPath)) return;

      const schemas = loadHwp('noori.hwp');
      expect(schemas.length).toBeGreaterThan(0);

      for (const schema of schemas) {
        const table = tableSchemaToTable(schema);
        const html = tableToHtml(table, { pretty: false });
        expect(html).toContain('<table');
        // each cell should have content or at least a <td>
        expect(html).toContain('<td');
      }
    });
  });

  describe('HTML output quality', () => {
    it('cell text from HWP should appear in HTML output', () => {
      const schemas = loadHwp('table.hwp');
      const schema = schemas[0];
      // find first non-empty cell value
      let firstText = '';
      for (const row of schema.rows) {
        for (const cell of row.cells) {
          if (cell.value && String(cell.value).trim()) {
            firstText = String(cell.value).trim();
            break;
          }
        }
        if (firstText) break;
      }

      if (!firstText) {
        console.log('No text in first table, skipping text check');
        return;
      }

      const table = tableSchemaToTable(schema);
      const html = tableToHtml(table, { pretty: false });
      expect(html).toContain(firstText);
    });

    it('HTML should be well-formed (no unclosed tags)', () => {
      const schemas = loadHwp('table.hwp');
      const table = tableSchemaToTable(schemas[0]);
      const html = tableToHtml(table, { pretty: false });

      const tableOpen = (html.match(/<table/g) ?? []).length;
      const tableClose = (html.match(/<\/table>/g) ?? []).length;
      const trOpen = (html.match(/<tr/g) ?? []).length;
      const trClose = (html.match(/<\/tr>/g) ?? []).length;

      expect(tableOpen).toBe(tableClose);
      expect(trOpen).toBe(trClose);
    });
  });
});
