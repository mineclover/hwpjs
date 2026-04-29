// ─── 공통 출력 스키마 ─────────────────────────────────────────────────────────

export type ExtractApi = 'content' | 'style'

export type ExtractMeta = {
  source_hwp: string
  source_json: string
  extracted_at: string
  apis: ExtractApi[]
}

export type ExtractResult = {
  meta: ExtractMeta
  records: DocRecord[]
}

// ─── DocRecord ────────────────────────────────────────────────────────────────

export type DocRecord = {
  path: string                  // JSON path (join key)
  kind: 'text' | 'table'

  // API: content
  content?: string
  table?: TableRecord

  // API: style
  para_style?: ParagraphStyle
  runs?: StyleRun[]
}

// ─── Table ───────────────────────────────────────────────────────────────────

export type TableRecord = {
  row_count: number
  col_count: number
  merges?: MergeRange[]
  rows: TableRowRecord[]
}

export type TableRowRecord = {
  cells: TableCellRecord[]
}

export type TableCellRecord = {
  path: string
  content: string
  images?: CellImageRecord[]
  runs?: StyleRun[]
}

export type CellImageRecord = {
  id: string
  src: string
  format: string
}

export type MergeRange = {
  start: { row: number; col: number }
  end: { row: number; col: number }
}

// ─── Style ───────────────────────────────────────────────────────────────────

export type StyleRun = {
  text: string
  offset: number
  length: number
  style: CharStyle
}

export type CharStyle = {
  font: string
  size: number          // pt (HWP base_size / 100)
  bold: boolean
  italic: boolean
  underline: boolean
  strikethrough: boolean
  color: string         // #rrggbb
  bg_color?: string     // #rrggbb, 흰색이면 생략
}

export type ParagraphStyle = {
  align: 'left' | 'right' | 'center' | 'justify' | string
  line_spacing: number  // %
  indent_left: number   // HWP unit (1/100mm)
  indent_right: number
  indent_first: number
  space_before: number
  space_after: number
}
