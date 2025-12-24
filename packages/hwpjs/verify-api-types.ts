/**
 * toJson API 반환값과 HwpDocument 타입 호환성 검증
 */
import type { HwpDocument, ParagraphRecord } from './types/hwp-document';
import { toJson } from './dist/index.js';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// 테스트할 HWP 파일 경로
const testFiles = [
  'C:/Users/kbrainc/Downloads/024. 강의계획서_초보자를 위한 Oracle SQL Database_최예신.hwp',
];

// fixtures 폴더의 HWP 파일들도 추가
const fixturesPath = join(__dirname, '../../crates/hwp-core/tests/fixtures');
try {
  const files = readdirSync(fixturesPath);
  for (const file of files) {
    if (file.endsWith('.hwp')) {
      testFiles.push(join(fixturesPath, file));
    }
  }
} catch (e) {
  console.log('Fixtures folder not accessible');
}

console.log('=== Testing', testFiles.length, 'HWP files ===\n');

interface ValidationResult {
  file: string;
  success: boolean;
  errors: string[];
  warnings: string[];
}

function validateDocument(doc: any, path: string = ''): { errors: string[], warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required top-level fields
  const requiredFields = ['file_header', 'doc_info', 'body_text', 'bin_data'];
  for (const field of requiredFields) {
    if (!(field in doc)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  // file_header 검증
  if (doc.file_header) {
    if (typeof doc.file_header.version !== 'string') {
      errors.push('file_header.version should be string');
    }
    if (!Array.isArray(doc.file_header.document_flags)) {
      errors.push('file_header.document_flags should be array');
    }
  }

  // body_text 검증
  if (doc.body_text) {
    if (!Array.isArray(doc.body_text.sections)) {
      errors.push('body_text.sections should be array');
    } else {
      for (const [si, section] of doc.body_text.sections.entries()) {
        if (typeof section.index !== 'number') {
          warnings.push(`sections[${si}].index should be number`);
        }
        if (!Array.isArray(section.paragraphs)) {
          errors.push(`sections[${si}].paragraphs should be array`);
        }
      }
    }
  }

  // records type 필드 검증
  const validRecordTypes = [
    'para_text', 'para_char_shape', 'para_line_seg', 'ctrl_header',
    'page_def', 'footnote_shape', 'page_border_fill', 'table',
    'shape_component', 'shape_component_picture', 'list_header',
    'para_range_tag', 'memo_list', 'ctrl_data', 'form_object',
    'shape_component_rectangle', 'shape_component_line', 'solid'
  ];

  function checkRecords(records: any[], path: string) {
    if (!Array.isArray(records)) return;
    for (const [i, rec] of records.entries()) {
      if (rec && typeof rec === 'object') {
        if ('type' in rec) {
          if (!validRecordTypes.includes(rec.type)) {
            warnings.push(`Unknown record type: ${rec.type} at ${path}[${i}]`);
          }
        }
        // 재귀 검사
        if (rec.children) checkRecords(rec.children, `${path}[${i}].children`);
        if (rec.paragraphs) {
          for (const [pi, p] of rec.paragraphs.entries()) {
            if (p.records) checkRecords(p.records, `${path}[${i}].paragraphs[${pi}].records`);
          }
        }
      }
    }
  }

  if (doc.body_text?.sections) {
    for (const [si, section] of doc.body_text.sections.entries()) {
      if (section.paragraphs) {
        for (const [pi, para] of section.paragraphs.entries()) {
          if (para.records) {
            checkRecords(para.records, `sections[${si}].paragraphs[${pi}].records`);
          }
        }
      }
    }
  }

  // Table 구조 검증
  function validateTables(obj: any, path: string) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.type === 'table' && obj.table) {
      const t = obj.table;
      if (!t.attributes) {
        errors.push(`${path}.table.attributes missing`);
      } else {
        if (typeof t.attributes.row_count !== 'number') {
          errors.push(`${path}.table.attributes.row_count should be number`);
        }
        if (typeof t.attributes.col_count !== 'number') {
          errors.push(`${path}.table.attributes.col_count should be number`);
        }
      }
      if (!Array.isArray(t.cells)) {
        errors.push(`${path}.table.cells should be array`);
      } else {
        for (const [ci, cell] of t.cells.entries()) {
          if (!cell.cell_attributes) {
            errors.push(`${path}.table.cells[${ci}].cell_attributes missing`);
          }
          if (!Array.isArray(cell.paragraphs)) {
            warnings.push(`${path}.table.cells[${ci}].paragraphs should be array`);
          }
        }
      }
    }

    if (Array.isArray(obj)) {
      obj.forEach((item, i) => validateTables(item, `${path}[${i}]`));
    } else {
      for (const [k, v] of Object.entries(obj)) {
        validateTables(v, `${path}.${k}`);
      }
    }
  }

  validateTables(doc, 'doc');

  return { errors, warnings };
}

// 각 파일 테스트
const results: ValidationResult[] = [];

for (const filePath of testFiles) {
  const fileName = filePath.split(/[/\\]/).pop() || filePath;

  try {
    const hwpData = readFileSync(filePath);
    const jsonStr = toJson(hwpData);
    const doc = JSON.parse(jsonStr);

    const { errors, warnings } = validateDocument(doc);

    results.push({
      file: fileName,
      success: errors.length === 0,
      errors,
      warnings
    });

  } catch (e: any) {
    results.push({
      file: fileName,
      success: false,
      errors: [`Parse error: ${e.message}`],
      warnings: []
    });
  }
}

// 결과 출력
console.log('=== Validation Results ===\n');

let passCount = 0;
let failCount = 0;

for (const r of results) {
  const status = r.success ? '✓' : '✗';
  console.log(`${status} ${r.file}`);

  if (r.success) {
    passCount++;
  } else {
    failCount++;
    for (const err of r.errors) {
      console.log(`    ERROR: ${err}`);
    }
  }

  if (r.warnings.length > 0 && r.warnings.length <= 3) {
    for (const warn of r.warnings) {
      console.log(`    WARN: ${warn}`);
    }
  } else if (r.warnings.length > 3) {
    console.log(`    WARN: ${r.warnings.length} warnings (showing first 3)`);
    for (const warn of r.warnings.slice(0, 3)) {
      console.log(`      - ${warn}`);
    }
  }
}

console.log(`\n=== Summary ===`);
console.log(`Pass: ${passCount}/${results.length}`);
console.log(`Fail: ${failCount}/${results.length}`);

if (failCount === 0) {
  console.log('\n✓ All files match HwpDocument type structure');
} else {
  console.log('\n✗ Some files have type mismatches');
  process.exit(1);
}
