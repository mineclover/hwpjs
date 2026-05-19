/**
 * hwpjs TableSchema → table-manager Table 변환기
 *
 * TableSchema(hwpjs)는 Table(table-manager)을 원형으로 설계되었으므로
 * 구조가 거의 1:1 매핑된다.
 *
 * 주요 차이점:
 *  - TableSchemaCell.images : HWP-specific → attributes.__hwp_images에 직렬화
 *  - Cell.colspan/rowspan   : table-manager Cell에 직접 존재하지만 hwpjs는 merges 배열로만 관리
 *  - Cell.formula           : table-manager-specific, HWP 변환 시 불필요 (미사용)
 *  - Cell.value 타입        : table-manager는 Date 포함, hwpjs는 문자열로 처리
 */

import type { Table, Cell, Row } from '../../table-manager/src/schema.js';
import type { TableSchema, TableSchemaCell, TableSchemaRow } from './table-schema.js';

// ============================================================================
// TableSchema → Table
// ============================================================================

function toCell(cell: TableSchemaCell): Cell {
  const result: Cell = { value: cell.value };

  if (cell.style) result.style = cell.style;
  if (cell.className) result.className = cell.className;
  if (cell.id) result.id = cell.id;
  if (cell.isHeader) result.isHeader = cell.isHeader;

  // images → attributes.__hwp_images (직렬화)
  const attrs: Record<string, string> = cell.attributes ? { ...cell.attributes } : {};
  if (cell.images && cell.images.length > 0) {
    attrs.__hwp_images = JSON.stringify(cell.images);
  }
  if (Object.keys(attrs).length > 0) result.attributes = attrs;

  return result;
}

function toRow(row: TableSchemaRow): Row {
  const result: Row = { cells: row.cells.map(toCell) };
  if (row.style) result.style = row.style;
  if (row.className) result.className = row.className;
  if (row.id) result.id = row.id;
  return result;
}

/**
 * hwpjs TableSchema → table-manager Table
 */
export function tableSchemaToTable(schema: TableSchema): Table {
  const result: Table = { rows: schema.rows.map(toRow) };
  if (schema.merges && schema.merges.length > 0) result.merges = schema.merges;
  if (schema.style) result.style = schema.style;
  if (schema.className) result.className = schema.className;
  if (schema.id) result.id = schema.id;
  if (schema.caption) result.caption = schema.caption;
  return result;
}

// ============================================================================
// Table → TableSchema (역방향)
// ============================================================================

function fromCell(cell: Cell): TableSchemaCell {
  const result: TableSchemaCell = {
    value: cell.value instanceof Date ? cell.value.toISOString() : cell.value,
  };

  if (cell.style) result.style = cell.style;
  if (cell.className) result.className = cell.className;
  if (cell.id) result.id = cell.id;
  if (cell.isHeader) result.isHeader = cell.isHeader;

  // attributes.__hwp_images → images 복원
  if (cell.attributes) {
    const { __hwp_images, ...rest } = cell.attributes;
    if (__hwp_images) {
      try {
        result.images = JSON.parse(__hwp_images);
      } catch {
        /* ignore */
      }
    }
    if (Object.keys(rest).length > 0) result.attributes = rest;
  }

  return result;
}

function fromRow(row: Row): TableSchemaRow {
  const result: TableSchemaRow = { cells: row.cells.map(fromCell) };
  if (row.style) result.style = row.style;
  if (row.className) result.className = row.className;
  if (row.id) result.id = row.id;
  return result;
}

/**
 * table-manager Table → hwpjs TableSchema
 */
export function tableToTableSchema(table: Table): TableSchema {
  const result: TableSchema = { rows: table.rows.map(fromRow) };
  if (table.merges && table.merges.length > 0) result.merges = table.merges;
  if (table.style) result.style = table.style;
  if (table.className) result.className = table.className;
  if (table.id) result.id = table.id;
  if (table.caption) result.caption = table.caption;
  return result;
}

// ============================================================================
// 배열 변환 편의 함수
// ============================================================================

export function tableSchemasToTables(schemas: TableSchema[]): Table[] {
  return schemas.map(tableSchemaToTable);
}

export function tablesToTableSchemas(tables: Table[]): TableSchema[] {
  return tables.map(tableToTableSchema);
}
