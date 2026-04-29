/**
 * HWP document JSON structure types.
 * toJson() returns a JSON string; these types describe its shape.
 * Fields reflect the Rust HwpDocument model serialized via serde.
 */

export interface HwpDocument {
  file_header?: FileHeader;
  doc_info?: DocInfo;
  body_text?: BodyText;
  bin_data?: BinData[];
  preview_text?: PreviewText;
  preview_image?: PreviewImage;
  summary_information?: SummaryInformation;
  [key: string]: unknown;
}

export interface FileHeader {
  signature?: string;
  version?: string;
  [key: string]: unknown;
}

export interface DocInfo {
  [key: string]: unknown;
}

export interface BodyText {
  sections?: Section[];
  [key: string]: unknown;
}

export interface Section {
  paragraphs?: Paragraph[];
  [key: string]: unknown;
}

export type Paragraph = SectionParagraph;

export interface SectionParagraph {
  records?: ParagraphRecord[];
  [key: string]: unknown;
}

export type ParagraphRecord = PurpleRecord;

export interface PurpleRecord {
  type?: RecordType;
  [key: string]: unknown;
}

export type RecordType = string;

export interface Table {
  cells?: TableCell[][];
  [key: string]: unknown;
}

export interface TableCell {
  attributes?: CellAttributes;
  paragraphs?: Paragraph[];
  [key: string]: unknown;
}

export interface CellAttributes {
  col?: number;
  row?: number;
  [key: string]: unknown;
}

export interface BinData {
  [key: string]: unknown;
}

export interface PreviewText {
  text?: string;
  [key: string]: unknown;
}

export interface PreviewImage {
  [key: string]: unknown;
}

export interface SummaryInformation {
  title?: string;
  author?: string;
  [key: string]: unknown;
}
