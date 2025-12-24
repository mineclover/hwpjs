import type {
  HwpDocument,
  Table,
  TableCell,
  ParagraphRecord,
  ParaTextRecord,
  CtrlHeaderRecord
} from './types/hwp-document';
import * as fs from 'fs';

const json = fs.readFileSync('test-output.json', 'utf-8');
const doc: HwpDocument = JSON.parse(json);

// 1. 기본 구조 검증
console.log('=== Basic Structure ===');
console.log('version:', doc.file_header.version);
console.log('sections:', doc.body_text.sections.length);
console.log('paragraphs:', doc.body_text.sections[0].paragraphs.length);

// 2. 테이블 찾기
function findTables(records: ParagraphRecord[]): Table[] {
  const tables: Table[] = [];
  for (const r of records) {
    if (r.type === 'table') {
      tables.push(r.table);
    }
    if ('children' in r && r.children) {
      tables.push(...findTables(r.children));
    }
    if ('paragraphs' in r && r.paragraphs) {
      for (const p of r.paragraphs) {
        tables.push(...findTables(p.records));
      }
    }
  }
  return tables;
}

const allTables: Table[] = [];
for (const section of doc.body_text.sections) {
  for (const para of section.paragraphs) {
    allTables.push(...findTables(para.records));
  }
}

console.log('\n=== Tables ===');
console.log('total:', allTables.length);

for (const [i, table] of allTables.entries()) {
  console.log(`\nTable ${i + 1}:`);
  console.log(`  size: ${table.attributes.row_count}x${table.attributes.col_count}`);
  console.log(`  cells: ${table.cells.length}`);

  // 병합 셀 찾기
  const mergedCells = table.cells.filter(
    c => c.cell_attributes.row_span > 1 || c.cell_attributes.col_span > 1
  );
  if (mergedCells.length > 0) {
    console.log(`  merged cells: ${mergedCells.length}`);
  }
}

// 3. 셀 내용 확인
console.log('\n=== Sample Cell Content ===');
const sampleTable = allTables[2]; // 3번째 테이블 (12x5)
if (sampleTable && sampleTable.cells[0]) {
  const cell = sampleTable.cells[0];
  console.log('Cell position:', cell.cell_attributes.row_address, cell.cell_attributes.col_address);
  console.log('Paragraphs:', cell.paragraphs.length);

  for (const para of cell.paragraphs) {
    for (const rec of para.records) {
      if (rec.type === 'para_text') {
        console.log('Text:', rec.text.slice(0, 50));
      }
    }
  }
}

console.log('\n=== Type Check Passed ===');
