# BRIDGE: TableSchema ↔ Table 스키마 차이 문서

## 요약

- **목적**: `@ohah/hwpjs-adapter/to-table`이 처리하는 hwpjs `TableSchema`와 table-manager `Table` 간 스키마 불일치 항목을 기록하고, 각 방향의 변환 처리 방식을 명시한다.
- **진입점**: `packages/hwpjs-adapter/src/to-table.ts:54` - `tableSchemaToTable()` (정방향), `:99` - `tableToTableSchema()` (역방향)
- **의존성**:
  - hwpjs 타입: `packages/hwpjs/src/table-schema.ts` (`TableSchema`, `TableSchemaCell`, `CellImage`)
  - table-manager 타입: `packages/table-manager/src/schema.ts` (`Table`, `Cell`, `CellValue`)

---

두 스키마는 구조가 거의 1:1로 대응된다. 이 문서는 대응되지 않는 항목 3가지를 다룬다.

---

## 1. `images[]` 필드

**주체: hwpjs** (HWP 포맷 전용 개념)

### 차이

hwpjs `TableSchemaCell`은 `images?: CellImage[]` 필드를 가진다.
HWP 문서는 셀 내에 바이너리 이미지를 직접 임베드할 수 있기 때문이다.
타입 정의 위치: `packages/hwpjs/src/table-schema.ts:34-39` (`CellImage`), `:43-51` (`TableSchemaCell`)

table-manager `Cell`에는 이미지 필드가 없다.
table-manager는 Excel/CSV 기반 설계이며, 이 포맷들은 셀 내 이미지 임베드를 스키마 수준에서 지원하지 않는다.
타입 정의 위치: `packages/table-manager/src/schema.ts:109-125`

### 변환 처리

**TableSchema → Table** (정방향):
`images` 배열을 JSON 직렬화하여 `Cell.attributes.__hwp_images` 문자열 필드에 저장한다.
table-manager의 `attributes: Record<string, string>` 필드를 활용하므로 스키마를 위반하지 않는다.
처리 위치: `packages/hwpjs-adapter/src/to-table.ts:33-38`

```ts
attrs.__hwp_images = JSON.stringify(cell.images)
```

**Table → TableSchema** (역방향):
`attributes.__hwp_images`가 존재하면 `JSON.parse`로 `CellImage[]`를 복원하고, `__hwp_images` 키는 `attributes`에서 제거한다.
처리 위치: `packages/hwpjs-adapter/src/to-table.ts:77-83`

---

## 2. `Date` 타입

**주체: table-manager** (Excel 호환 개념)

### 차이

table-manager `Cell.value`의 타입은 `string | number | boolean | Date | null`이다.
Excel 파서는 날짜 셀을 `Date` 객체로 파싱하기 때문에 `Date`가 포함된다.
타입 정의 위치: `packages/table-manager/src/schema.ts:11` (`CellValue`)

hwpjs `TableSchemaCell.value`의 타입은 `string | number | boolean | null`이다.
HWP는 날짜를 문자열로 저장하므로 `Date` 타입이 필요 없다.
타입 정의 위치: `packages/hwpjs/src/table-schema.ts:44`

### 변환 처리

**TableSchema → Table** (정방향):
hwpjs에서 `Date` 값이 생성되지 않으므로 별도 처리가 불필요하다.

**Table → TableSchema** (역방향):
`Cell.value`가 `Date` 인스턴스인 경우 `toISOString()`으로 문자열 변환한다.
처리 위치: `packages/hwpjs-adapter/src/to-table.ts:69`

```ts
value: cell.value instanceof Date ? cell.value.toISOString() : cell.value
```

---

## 3. `colspan` / `rowspan` vs `merges` 배열

**주체: 양쪽 모두** (병합 셀 표현 방식이 다름)

### 차이

table-manager `Cell`은 `colspan?`, `rowspan?` 필드를 직접 보유한다.
또한 `Table.merges?` 배열도 병행 지원한다.
타입 정의 위치: `packages/table-manager/src/schema.ts:119-120` (Cell), `:157` (Table.merges)

hwpjs `TableSchemaCell`에는 `colspan`, `rowspan` 필드가 없다.
병합 정보는 `TableSchema.merges[]` 배열로만 관리하며, 각 항목은 `{ start: CellPosition, end: CellPosition }` 형태다.
타입 정의 위치: `packages/hwpjs/src/table-schema.ts:17-20` (`MergeRange`), `:65-72` (`TableSchema.merges`)

### 변환 처리

**TableSchema → Table** (정방향):
Cell에 `colspan`/`rowspan`을 채우지 않는다.
`TableSchema.merges` 배열을 `Table.merges`로 그대로 전달한다.
table-manager는 `merges` 배열을 기반으로 Logical Matrix를 구축할 때 span을 자동 계산한다.
처리 위치: `packages/hwpjs-adapter/src/to-table.ts:56`

**Table → TableSchema** (역방향):
`Table.merges` 배열을 `TableSchema.merges`로 그대로 전달한다.
Cell에 `colspan`/`rowspan`이 있더라도 역방향 변환에서는 무시된다.
hwpjs는 `merges` 배열만을 병합의 단일 출처로 사용하기 때문이다.
처리 위치: `packages/hwpjs-adapter/src/to-table.ts:101`
