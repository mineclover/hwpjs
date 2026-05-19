/**
 * 특정 폴더의 HWP 파일들에서 3번째 테이블의 능력단위 블럭 추출
 *
 * Usage: bun scripts/extract-third-tables.ts <input-folder> [output-folder] [table-number]
 */

import * as fs from 'fs';
import * as path from 'path';
import * as hwpjs from '../packages/hwpjs/dist/index.js';
import {
  transformHwpTablesWithSchema,
  extractAllTableSchemas,
  saveImagesToFiles,
  type TableSchema,
  type TableSchemaRow,
  type MergeRange,
  type ImageMap,
} from '../packages/hwpjs-adapter/src/table-schema';

// 능력단위 정보 타입
interface CompetencyUnit {
  code: string; // 분류번호 (예: 1503010210_14v3)
  name: string; // 능력단위명
  level: string; // NCS 수준 (예: 2수준)
}

// 체크박스 패턴 카운트 타입
interface CheckboxPattern {
  pattern: string; // 예: "이론", "이론,실습", "이론,실습,사례"
  count: number;
}

interface CheckboxCounts {
  patterns: CheckboxPattern[]; // 패턴별 빈도
  topPattern: string; // 최고빈도 패턴
  totalLessons: number; // 총 회차 수
}

interface ExtractedData {
  fileName: string;
  fileNumber: number | null; // 파일명에서 추출한 순번
  courseName: string; // 과정명(국문)
  courseNameEn: string; // 과정명(영문)
  ncsApplied: boolean; // NCS 적용 여부
  classification: {
    major: { code: string; name: string }; // 대분류
    middle: { code: string; name: string }; // 중분류
    minor: { code: string; name: string }; // 소분류
    detail: { code: string; name: string }; // 세분류
  };
  competencyUnits: CompetencyUnit[]; // 능력단위 목록
  maxNcsLevel: number | null; // 최고 NCS 수준
  // CSV에서 매칭된 정보
  publicContentEval: string; // 공공 콘텐츠 평가 (Y/N)
  category: string; // 구분
  cdmsCode: string; // CDMS 과목코드
  // 체크박스 카운트 (이론/실습/사례)
  checkboxCounts: CheckboxCounts;
  tableSchema?: TableSchema; // 원본 테이블 스키마
}

// CSV 데이터 타입
interface CsvRecord {
  publicContentEval: string;
  category: string;
  number: number;
  contentName: string;
  cdmsCode: string;
}

// ============================================================================
// 능력단위 블럭 추출 로직
// ============================================================================

function getCellValue(row: TableSchemaRow, colIndex: number): string {
  const cell = row.cells[colIndex];
  if (!cell) return '';
  return String(cell.value || '').trim();
}

/**
 * 특정 row, col에서 시작하는 merge 정보 찾기
 */
function findMergeAt(
  merges: MergeRange[] | undefined,
  row: number,
  col: number
): MergeRange | undefined {
  if (!merges) return undefined;
  return merges.find((m) => m.start.row === row && m.start.col === col);
}

/**
 * 능력단위 코드 패턴 확인 (예: 1503010210_14v3, 1503010211_14v3)
 */
function isCompetencyCode(value: string): boolean {
  // 숫자로 시작하고 _숫자v숫자 패턴을 포함
  return /^\d+_\d+v\d+/.test(value.trim());
}

/**
 * NCS 수준 문자열에서 숫자 추출 (예: "2수준" -> 2, " 3수준" -> 3, "4" -> 4)
 */
function parseNcsLevel(levelStr: string): number | null {
  const match = levelStr.trim().match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * 능력단위 목록에서 최고 NCS 수준 추출
 */
function getMaxNcsLevel(units: CompetencyUnit[]): number | null {
  if (units.length === 0) return null;

  let maxLevel: number | null = null;
  for (const unit of units) {
    const level = parseNcsLevel(unit.level);
    if (level !== null && (maxLevel === null || level > maxLevel)) {
      maxLevel = level;
    }
  }
  return maxLevel;
}

/**
 * 파일명에서 순번 추출 (예: "001. 강의계획서..." -> 1, "072. 강의계획서..." -> 72)
 */
function extractFileNumber(fileName: string): number | null {
  const match = fileName.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * CSV 파일 파싱 (list.csv)
 */
function parseCsvFile(csvPath: string): Map<number, CsvRecord> {
  const csvMap = new Map<number, CsvRecord>();

  if (!fs.existsSync(csvPath)) {
    console.warn(`CSV file not found: ${csvPath}`);
    return csvMap;
  }

  const content = fs.readFileSync(csvPath, 'utf-8');
  const lines = content.split('\n');

  // 헤더가 3줄에 걸쳐있으므로 4번째 줄(index 3)부터 데이터
  let lastCategory = '';
  for (let i = 3; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // CSV 파싱 (쉼표로 분리, 따옴표 처리)
    const parts = parseCSVLine(line);
    if (parts.length < 5) continue;

    const publicContentEval = parts[0].trim();
    const category = parts[1].trim() || lastCategory;
    if (parts[1].trim()) lastCategory = parts[1].trim();
    const number = parseInt(parts[2].trim(), 10);
    const contentName = parts[3].trim();
    const cdmsCode = parts[4].trim();

    if (!isNaN(number)) {
      csvMap.set(number, {
        publicContentEval,
        category,
        number,
        contentName,
        cdmsCode,
      });
    }
  }

  return csvMap;
}

/**
 * CSV 라인 파싱 (따옴표 처리)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

/**
 * 행의 모든 셀에서 특정 텍스트 찾기
 */
function findCellWithText(row: TableSchemaRow, text: string): number {
  for (let i = 0; i < row.cells.length; i++) {
    if (getCellValue(row, i) === text) {
      return i;
    }
  }
  return -1;
}

/**
 * 테이블 스키마에서 능력단위 정보 추출
 */
function extractCompetencyData(
  schema: TableSchema,
  fileName: string,
  csvMap?: Map<number, CsvRecord>
): ExtractedData {
  const fileNumber = extractFileNumber(fileName);
  const csvRecord = fileNumber !== null && csvMap ? csvMap.get(fileNumber) : undefined;

  const data: ExtractedData = {
    fileName,
    fileNumber,
    courseName: '',
    courseNameEn: '',
    ncsApplied: false,
    classification: {
      major: { code: '', name: '' },
      middle: { code: '', name: '' },
      minor: { code: '', name: '' },
      detail: { code: '', name: '' },
    },
    competencyUnits: [],
    maxNcsLevel: null,
    publicContentEval: csvRecord?.publicContentEval || '',
    category: csvRecord?.category || '',
    cdmsCode: csvRecord?.cdmsCode || '',
    checkboxCounts: {
      patterns: [],
      topPattern: '',
      totalLessons: 0,
    },
    tableSchema: schema,
  };

  for (let i = 0; i < schema.rows.length; i++) {
    const row = schema.rows[i];
    const firstCell = getCellValue(row, 0);

    if (firstCell === '과정명(국문)') {
      data.courseName = getCellValue(row, 1);
    } else if (firstCell === '과정명(영문)') {
      data.courseNameEn = getCellValue(row, 1);
    } else if (firstCell === 'NCS 수행정보') {
      // NCS 적용 여부 확인 (체크 표시 있는지)
      const appliedCell = getCellValue(row, 2);
      data.ncsApplied = appliedCell.includes('NCS 적용') && !appliedCell.includes('▢');
    } else if (firstCell === '대분류') {
      data.classification.major = { code: getCellValue(row, 1), name: getCellValue(row, 2) };
    } else if (firstCell === '중분류') {
      data.classification.middle = { code: getCellValue(row, 1), name: getCellValue(row, 2) };
    } else if (firstCell === '소분류') {
      data.classification.minor = { code: getCellValue(row, 1), name: getCellValue(row, 2) };
    } else if (firstCell === '세분류') {
      data.classification.detail = { code: getCellValue(row, 1), name: getCellValue(row, 2) };
    } else if (firstCell.startsWith('능력단위')) {
      // 능력단위 헤더 행 발견 (예: "능력단위", "능력단위\n※ 최신개정으로 작성")
      // 다음 행들에서 능력단위 코드 패턴이 있는 행들을 추출
      for (let j = i + 1; j < schema.rows.length; j++) {
        const unitRow = schema.rows[j];
        const code = getCellValue(unitRow, 0);

        // 능력단위 코드 패턴 확인
        if (isCompetencyCode(code)) {
          const name = getCellValue(unitRow, 1);
          const level = getCellValue(unitRow, 2);
          data.competencyUnits.push({ code: code.trim(), name, level });
        } else {
          // 패턴에 맞지 않으면 능력단위 블록 종료
          break;
        }
      }
    }
  }

  // 최고 NCS 수준 계산
  data.maxNcsLevel = getMaxNcsLevel(data.competencyUnits);

  return data;
}

/**
 * 전체 테이블에서 이론/실습/사례 체크박스 패턴 수집
 * - 회차별로 체크된 항목들의 조합 패턴을 수집
 * - 예: "이론", "이론,실습", "이론,실습,사례" 등
 */
function countCheckboxes(schemas: TableSchema[]): CheckboxCounts {
  const patternMap = new Map<string, number>();
  let totalLessons = 0;

  // 모든 테이블에서 이론/실습/사례 행 찾기
  for (const schema of schemas) {
    if (schema.rows.length === 0) continue;

    for (const row of schema.rows) {
      // 각 셀에서 "이론/실습/사례" 라벨 찾기
      for (let i = 0; i < row.cells.length; i++) {
        const cellVal = getCellValue(row, i);

        if (cellVal === '이론/실습/사례') {
          // 다음 3개 셀에서 체크박스 확인
          const theoryVal = getCellValue(row, i + 1).trim();
          const practiceVal = getCellValue(row, i + 2).trim();
          const caseVal = getCellValue(row, i + 3).trim();

          // 체크 여부 확인:
          // - ☑ 또는 ■ = checked
          // - ▢ = unchecked
          // - ▢ 없이 텍스트만 있으면 = checked (일부 파일에서 체크시 ▢ 제거)
          const isTheoryChecked =
            theoryVal.includes('☑') ||
            theoryVal.includes('■') ||
            (theoryVal.includes('이론') && !theoryVal.includes('▢'));
          const isPracticeChecked =
            practiceVal.includes('☑') ||
            practiceVal.includes('■') ||
            (practiceVal.includes('실습') && !practiceVal.includes('▢'));
          const isCaseChecked =
            caseVal.includes('☑') ||
            caseVal.includes('■') ||
            (caseVal.includes('사례') && !caseVal.includes('▢'));

          // 패턴 생성
          const checked: string[] = [];
          if (isTheoryChecked) checked.push('이론');
          if (isPracticeChecked) checked.push('실습');
          if (isCaseChecked) checked.push('사례');

          const pattern = checked.length > 0 ? checked.join(',') : '없음';
          patternMap.set(pattern, (patternMap.get(pattern) || 0) + 1);
          totalLessons++;

          break; // 이 행에서 이미 찾았으므로 다음 행으로
        }
      }
    }
  }

  // 패턴 빈도순 정렬
  const patterns: CheckboxPattern[] = Array.from(patternMap.entries())
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  // 최고빈도 패턴 (동률일 경우 모두 표시)
  const maxCount = patterns[0]?.count || 0;
  const topPatterns = patterns.filter((p) => p.count === maxCount).map((p) => p.pattern);

  return {
    patterns,
    topPattern: topPatterns.join(' / '),
    totalLessons,
  };
}

// ============================================================================
// HTML/JSON 출력
// ============================================================================

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

/**
 * NCS 수준에 따른 레벨 클래스 반환 (1~3: low, 4~6: mid, 7+: high)
 */
function getLevelClass(level: number | null): string {
  if (level === null) return '';
  if (level <= 3) return 'level-low';
  if (level <= 6) return 'level-mid';
  return 'level-high';
}

function generateCompetencyHtml(dataList: ExtractedData[]): string {
  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>능력단위 추출 결과</title>
  <style>
    body { font-family: 'Malgun Gothic', sans-serif; padding: 20px; max-width: 1200px; margin: 0 auto; }
    h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
    .file-section { margin-bottom: 30px; background: #f8f9fa; padding: 20px; border-radius: 8px; position: relative; }
    .file-name { color: #495057; font-size: 14px; margin-bottom: 10px; }
    .course-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; flex-wrap: wrap; gap: 10px; }
    .course-name { color: #007bff; font-size: 18px; font-weight: bold; }
    .badges { display: flex; gap: 8px; align-items: center; }
    .max-level { padding: 5px 12px; border-radius: 20px; font-size: 14px; font-weight: bold; color: white; }
    .max-level.level-low { background: #28a745; }
    .max-level.level-mid { background: #ffc107; color: #333; }
    .max-level.level-high { background: #dc3545; }
    .badge { padding: 4px 10px; border-radius: 12px; font-size: 12px; font-weight: bold; }
    .badge-eval { background: #e9ecef; color: #495057; }
    .badge-eval.eval-y { background: #d4edda; color: #155724; }
    .badge-eval.eval-n { background: #f8d7da; color: #721c24; }
    .badge-category { background: #cce5ff; color: #004085; }
    .badge-cdms { background: #e2e3e5; color: #383d41; font-family: monospace; }
    .meta-info { display: flex; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
    .classification { background: #e9ecef; padding: 10px; border-radius: 4px; margin-bottom: 15px; font-size: 13px; }
    .classification span { margin-right: 15px; }
    .competency-table { width: 100%; border-collapse: collapse; }
    .competency-table th { background: #007bff; color: white; padding: 10px; text-align: left; }
    .competency-table td { border: 1px solid #dee2e6; padding: 10px; }
    .competency-table tr:nth-child(even) { background: #f8f9fa; }
    .no-data { color: #999; font-style: italic; }
    .summary { background: #d4edda; padding: 15px; border-radius: 8px; margin-bottom: 30px; }
    .checkbox-counts { background: #e8f5e9; padding: 12px; border-radius: 4px; margin-bottom: 15px; display: flex; gap: 20px; flex-wrap: wrap; align-items: center; }
    .checkbox-item { display: flex; align-items: center; gap: 6px; font-size: 13px; }
    .checkbox-label { font-weight: bold; color: #495057; }
    .checkbox-pattern { color: #1565c0; font-weight: bold; font-size: 14px; }
    .checkbox-total { color: #666; }
    .checkbox-detail { display: flex; gap: 8px; flex-wrap: wrap; }
    .pattern-badge { background: #fff; padding: 2px 8px; border-radius: 10px; font-size: 11px; color: #555; border: 1px solid #ccc; }
  </style>
</head>
<body>
<h1>능력단위 추출 결과</h1>
<div class="summary">
  <strong>총 ${dataList.length}개 파일 처리</strong> |
  총 ${dataList.reduce((sum, d) => sum + d.competencyUnits.length, 0)}개 능력단위 추출
</div>
`;

  for (const data of dataList) {
    const levelClass = getLevelClass(data.maxNcsLevel);
    const levelDisplay = data.maxNcsLevel !== null ? `${data.maxNcsLevel}수준` : '-';
    const evalClass =
      data.publicContentEval === 'Y' ? 'eval-y' : data.publicContentEval === 'N' ? 'eval-n' : '';

    html += `<div class="file-section">
  <div class="file-name">${escapeHtml(data.fileName)}</div>
  <div class="course-header">
    <div class="course-name">${escapeHtml(data.courseName)}</div>
    <div class="badges">
      <div class="max-level ${levelClass}">최고 ${levelDisplay}</div>
    </div>
  </div>
  <div class="meta-info">
    <span class="badge badge-eval ${evalClass}">공공평가: ${escapeHtml(data.publicContentEval || '-')}</span>
    <span class="badge badge-category">구분: ${escapeHtml(data.category || '-')}</span>
    <span class="badge badge-cdms">CDMS: ${escapeHtml(data.cdmsCode || '-')}</span>
  </div>
  <div class="classification">
    <span><strong>대:</strong> ${escapeHtml(data.classification.major.name)}</span>
    <span><strong>중:</strong> ${escapeHtml(data.classification.middle.name)}</span>
    <span><strong>소:</strong> ${escapeHtml(data.classification.minor.name)}</span>
    <span><strong>세:</strong> ${escapeHtml(data.classification.detail.name)}</span>
  </div>
  <div class="checkbox-counts">
    <div class="checkbox-item">
      <span class="checkbox-label">회차:</span>
      <span class="checkbox-total">${data.checkboxCounts.totalLessons}개</span>
    </div>
    <div class="checkbox-detail">
      ${data.checkboxCounts.patterns.map((p) => `<span class="pattern-badge">${escapeHtml(p.pattern)}(${p.count})</span>`).join(' ')}
    </div>
  </div>
`;

    if (data.competencyUnits.length > 0) {
      html += `  <table class="competency-table">
    <thead>
      <tr>
        <th style="width: 25%">분류번호</th>
        <th style="width: 55%">능력단위명</th>
        <th style="width: 20%">NCS 수준</th>
      </tr>
    </thead>
    <tbody>
`;
      for (const unit of data.competencyUnits) {
        html += `      <tr>
        <td>${escapeHtml(unit.code)}</td>
        <td>${escapeHtml(unit.name)}</td>
        <td>${escapeHtml(unit.level)}</td>
      </tr>
`;
      }
      html += `    </tbody>
  </table>
`;
    } else {
      html += `  <p class="no-data">능력단위 정보 없음</p>
`;
    }

    html += `</div>
`;
  }

  html += `</body>
</html>`;
  return html;
}

// ============================================================================
// Main Logic
// ============================================================================

async function processHwpFile(filePath: string, imageOutputDir: string): Promise<TableSchema[]> {
  const data = fs.readFileSync(filePath);
  const uint8Data = new Uint8Array(data);

  // HTML에서 이미지 추출
  const htmlResult = hwpjs.toHtml(uint8Data, {
    includeVersion: false,
    includePageInfo: false,
  });

  const imageMap: ImageMap = new Map();
  const dataUrlMatches = htmlResult.match(/data:image\/[a-z]+;base64,[A-Za-z0-9+/=]+/g);
  if (dataUrlMatches) {
    dataUrlMatches.forEach((dataUrl, i) => {
      const binId = i + 1;
      const format = dataUrl.match(/data:image\/([^;]+)/)?.[1] ?? 'unknown';
      imageMap.set(binId, { dataUrl, format });
    });
  }

  // JSON 변환 및 테이블 스키마 추출
  const jsonString = hwpjs.toJson(uint8Data);
  const parsed = JSON.parse(jsonString);

  if (!parsed.body_text) return [];

  const transformedBodyText = transformHwpTablesWithSchema(parsed.body_text, { imageMap });
  const schemas = extractAllTableSchemas(transformedBodyText);

  // 이미지를 파일로 저장하고 src를 파일 경로로 교체
  return saveImagesToFiles(schemas, imageOutputDir);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error(
      'Usage: bun scripts/extract-third-tables.ts <input-folder> [output-folder] [table-number]'
    );
    process.exit(1);
  }

  const folderPath = args[0];
  const outputFolder = args[1] || folderPath;
  const tableIndex = args[2] ? parseInt(args[2], 10) - 1 : 2; // 기본값: 3번째 테이블 (index 2)

  if (!fs.existsSync(folderPath)) {
    console.error(`Folder not found: ${folderPath}`);
    process.exit(1);
  }

  // 출력 폴더 생성
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  const imageOutputDir = path.join(outputFolder, 'images');

  const hwpFiles = fs
    .readdirSync(folderPath)
    .filter((f) => f.toLowerCase().endsWith('.hwp'))
    .sort()
    .map((f) => path.join(folderPath, f));

  if (hwpFiles.length === 0) {
    console.error(`No HWP files found in: ${folderPath}`);
    process.exit(1);
  }

  console.log(`Found ${hwpFiles.length} HWP file(s)`);
  console.log(`Extracting table #${tableIndex + 1} from each file\n`);

  // CSV 파일 로드 (입력 폴더의 상위에서 list.csv 찾기)
  const csvPath = path.join(folderPath, '..', 'list.csv');
  const csvMap = parseCsvFile(csvPath);
  if (csvMap.size > 0) {
    console.log(`Loaded ${csvMap.size} records from CSV\n`);
  }

  const extractedDataList: ExtractedData[] = [];

  for (const hwpFile of hwpFiles) {
    const fileName = path.basename(hwpFile);
    console.log(`Processing: ${fileName}`);

    try {
      const schemas = await processHwpFile(hwpFile, imageOutputDir);

      if (schemas.length > tableIndex) {
        const tableSchema = schemas[tableIndex];
        const data = extractCompetencyData(tableSchema, fileName, csvMap);

        // 모든 테이블에서 체크박스 카운트 (레슨 플랜 테이블)
        data.checkboxCounts = countCheckboxes(schemas);

        extractedDataList.push(data);
        console.log(
          `  -> Found ${schemas.length} table(s), ${data.competencyUnits.length} unit(s), ${data.checkboxCounts.totalLessons}회차`
        );
      } else {
        console.log(`  -> Only ${schemas.length} table(s), skipping`);
      }
    } catch (err) {
      console.error(`  -> Error: ${err}`);
    }
  }

  // HTML 출력
  const htmlOutput = generateCompetencyHtml(extractedDataList);
  const htmlPath = path.join(outputFolder, 'competency-units.html');
  fs.writeFileSync(htmlPath, htmlOutput);
  console.log(`\nHTML saved to: ${htmlPath}`);

  // JSON 출력 (tableSchema 제외한 버전)
  const jsonDataList = extractedDataList.map((d) => {
    const { tableSchema, ...rest } = d;
    return rest;
  });
  const jsonPath = path.join(outputFolder, 'competency-units.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonDataList, null, 2));
  console.log(`JSON saved to: ${jsonPath}`);

  // 전체 테이블 스키마 포함 JSON (디버깅/분석용)
  const fullJsonPath = path.join(outputFolder, 'competency-units-full.json');
  fs.writeFileSync(fullJsonPath, JSON.stringify(extractedDataList, null, 2));
  console.log(`Full JSON (with tableSchema) saved to: ${fullJsonPath}`);
}

main();
