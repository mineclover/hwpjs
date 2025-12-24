/**
 * HWP Document Type Definitions
 *
 * AUTO-GENERATED from JSON output samples
 * DO NOT EDIT MANUALLY
 *
 * Generated: 2025-12-23T03:34:57.354Z
 * Samples: 37 HWP files
 *
 * Usage:
 *   import type { HwpDocument } from './types/hwp-document.generated';
 *   const doc: HwpDocument = JSON.parse(toJson(hwpBuffer));
 */

export interface HwpDocument {
    file_header:         FileHeader;
    doc_info:            DocInfo;
    body_text:           BodyText;
    bin_data:            BinData;
    preview_text:        PreviewText;
    preview_image:       PreviewImage;
    scripts:             Scripts;
    xml_template:        null;
    summary_information: SummaryInformation;
}

export interface BinData {
    items: BinDataItem[];
}

export interface BinDataItem {
    index: number;
    data:  string;
}

export interface BodyText {
    sections: Section[];
}

export interface Section {
    index:      number;
    paragraphs: SectionParagraph[];
}

export interface SectionParagraph {
    para_header: ParaHeader;
    records:     PurpleRecord[];
}

export interface ParaHeader {
    text_char_count:    number;
    control_mask:       ControlMask;
    para_shape_id:      number;
    para_style_id:      number;
    column_divide_type: ColumnDivideType[];
    char_shape_count:   number;
    range_tag_count:    number;
    line_align_count:   number;
    instance_id:        number;
    section_merge:      number | null;
}

export type ColumnDivideType = "section" | "multi_column" | "page";

export interface ControlMask {
    value: number;
    flags: Flag[];
}

export type Flag = "section_column_definition" | "gso_table" | "footnote_endnote" | "header_footer" | "field_start" | "field_end" | "page_control" | "tab" | "auto_number";

export interface PurpleRecord {
    type:                    RecordType;
    text?:                   string;
    runs?:                   Run[];
    control_char_positions?: ControlCharPosition[];
    shapes?:                 Shape[];
    segments?:               Segment[];
    ctrl_id?:                PurpleCtrlID;
    ctrl_id_value?:          number;
    data_type?:              PurpleDataType;
    attribute?:              AttributeAttribute | number;
    column_spacing?:         number;
    vertical_alignment?:     number;
    horizontal_alignment?:   number;
    default_tip_spacing?:    number;
    number_para_shape_id?:   number;
    page_number?:            number;
    figure_number?:          number;
    table_number?:           number;
    equation_number?:        number;
    language?:               number;
    children?:               PurpleChild[];
    column_widths?:          number[];
    attribute_high?:         number;
    divider_line_type?:      number;
    divider_line_thickness?: number;
    divider_line_color?:     number;
    offset_y?:               number;
    offset_x?:               number;
    width?:                  number;
    height?:                 number;
    z_order?:                number;
    margin?:                 Margin;
    instance_id?:            number;
    page_divide?:            number;
    description?:            null | string;
    caption?:                Caption | null;
    paragraphs?:             RecordParagraph[];
    number?:                 number;
    reserved?:               number[];
    reserved2?:              number;
    text_width?:             number;
    text_height?:            number;
    text_ref?:               number;
    number_ref?:             number;
    inline_control_params?:  Array<Array<InlineControlParamClass | number>>;
    flags?:                  Flags;
    user_symbol?:            Prefix;
    prefix?:                 Prefix;
    suffix?:                 Prefix;
}

export interface AttributeAttribute {
    column_type?:                 "normal";
    column_count?:                number;
    column_direction?:            ColumnDirection;
    equal_width?:                 boolean;
    like_letters?:                boolean;
    affect_line_spacing?:         boolean;
    vert_rel_to?:                 HorzRelTo;
    vert_relative?:               number;
    horz_rel_to?:                 HorzRelTo;
    horz_relative?:               number;
    vert_rel_to_para_limit?:      boolean;
    overlap?:                     boolean;
    object_width_standard?:       "absolute";
    object_height_standard?:      "absolute";
    object_text_option?:          ObjectTextOption;
    object_text_position_option?: "both_sides";
    object_category?:             ObjectCategory;
    size_protect?:                boolean;
    apply_page?:                  string;
}

export type ColumnDirection = "left" | "bottom" | "top" | "right";

export type HorzRelTo = "page" | "column" | "paper" | "para";

export type ObjectCategory = "figure" | "table";

export type ObjectTextOption = "top_and_bottom" | "tight";

export interface Caption {
    align:          ColumnDirection;
    include_margin: boolean;
    width:          number;
    gap:            number;
    last_width:     number;
    vertical_align: CaptionVerticalAlign;
}

export type CaptionVerticalAlign = "top" | "middle" | "bottom";

export interface PurpleChild {
    type:              FluffyType;
    page_def?:         PageDef;
    footnote_shape?:   FootnoteShape;
    page_border_fill?: PageBorderFill;
    shape_component?:  ShapeComponent;
    children?:         FluffyChild[];
    table?:            Table;
    header?:           Header;
    paragraphs?:       FluffyParagraph[];
}

export interface FluffyChild {
    type:                       PurpleType;
    header?:                    Header;
    paragraphs?:                PurpleParagraph[];
    shape_component_rectangle?: ShapeComponentRectangle;
    shape_component_picture?:   ShapeComponentPicture;
    shape_component_line?:      ShapeComponentLine;
}

export interface Header {
    paragraph_count: number;
    attribute:       HeaderAttribute;
}

export interface HeaderAttribute {
    text_direction: Direction;
    line_break:     "normal";
    vertical_align: AttributeVerticalAlign;
}

export type Direction = "horizontal" | "vertical";

export type AttributeVerticalAlign = "center" | "top" | "bottom";

export interface PurpleParagraph {
    para_header: ParaHeader;
    records:     FluffyRecord[];
}

export interface FluffyRecord {
    type:                    RecordType;
    text?:                   string;
    runs?:                   Run[];
    control_char_positions?: ControlCharPosition[];
    shapes?:                 Shape[];
    segments?:               Segment[];
    ctrl_id?:                PurpleCtrlID;
    ctrl_id_value?:          number;
    data_type?:              PurpleDataType;
    attribute?:              PurpleAttribute;
    column_spacing?:         number;
    column_widths?:          any[];
    attribute_high?:         number;
    divider_line_type?:      number;
    divider_line_thickness?: number;
    divider_line_color?:     number;
}

export interface PurpleAttribute {
    column_type:      "normal";
    column_count:     number;
    column_direction: ColumnDirection;
    equal_width:      boolean;
}

export interface ControlCharPosition {
    position: number;
    code:     number;
    name:     Name;
}

export type Name = "PARA_BREAK" | "RESERVED_2" | "AUTO_NUMBER" | "SHAPE_OBJECT" | "FOOTNOTE" | "HEADER_FOOTER" | "RESERVED_3" | "FIELD_END" | "PAGE_CONTROL" | "TAB";

export type PurpleCtrlID = "secd" | "cold" | "gso " | "tbl " | "fn  " | "en  " | "head" | "foot" | "%hlk" | "pgnp";

export type PurpleDataType = "section_definition" | "column_definition" | "object_common" | "footnote_endnote" | "header_footer" | "other" | "page_number_position";

export interface Run {
    kind:          Kind;
    text?:         string;
    position?:     number;
    code?:         number;
    name?:         Name;
    size_wchars?:  number;
    display_text?: string;
}

export type Kind = "text" | "control";

export interface Segment {
    text_start_position:   number;
    vertical_position:     number;
    line_height:           number;
    text_height:           number;
    baseline_distance:     number;
    line_spacing:          number;
    column_start_position: number;
    segment_width:         number;
    tag:                   Tag;
}

export interface Tag {
    is_first_line_of_page:      boolean;
    is_first_line_of_column:    boolean;
    is_empty_segment:           boolean;
    is_first_segment_of_line:   boolean;
    is_last_segment_of_line:    boolean;
    has_auto_hyphenation:       boolean;
    has_indentation:            boolean;
    has_paragraph_header_shape: boolean;
}

export interface Shape {
    position: number;
    shape_id: number;
}

export type RecordType = "para_text" | "para_char_shape" | "para_line_seg" | "ctrl_header" | "shape_component" | "shape_component_picture";

export interface ShapeComponentLine {
    start_point: GroupOffset;
    end_point:   GroupOffset;
    flag:        number;
}

export interface GroupOffset {
    x: number;
    y: number;
}

export interface ShapeComponentPicture {
    border_color:       Color;
    border_width:       number;
    border_attributes:  number;
    border_rectangle_x: Margin;
    border_rectangle_y: Margin;
    crop_rectangle:     Margin;
    padding:            Margin;
    picture_info:       ImageBulletAttributes;
    border_opacity:     number;
    instance_id:        number;
    effect_data:        number[];
}

export interface Color {
    r: number;
    g: number;
    b: number;
}

export interface Margin {
    top:    number;
    right:  number;
    bottom: number;
    left:   number;
}

export interface ImageBulletAttributes {
    brightness:  number;
    contrast:    number;
    effect:      number;
    bindata_id?: number;
    id?:         number;
}

export interface ShapeComponentRectangle {
    corner_curvature: number;
    x_coordinates:    Margin;
    y_coordinates:    Margin;
}

export type PurpleType = "list_header" | "shape_component_rectangle" | "shape_component_picture" | "shape_component_line";

export interface FootnoteShape {
    attributes:              FootnoteShapeAttributes;
    custom_symbol:           number;
    front_decoration:        number;
    back_decoration:         number;
    start_number:            number;
    breakline_length:        number;
    breakline_top_margin:    number;
    breakline_bottom_margin: number;
    remark_between_margin:   number;
    breakline_type:          number;
    breakline_thickness:     number;
    breakline_color:         Color;
}

export interface FootnoteShapeAttributes {
    number_shape:  "arabic";
    page_position: "separate";
    numbering:     "continue";
    superscript:   boolean;
    prefix:        boolean;
}

export interface PageBorderFill {
    attributes:     PageBorderFillAttributes;
    left_spacing:   number;
    right_spacing:  number;
    top_spacing:    number;
    bottom_spacing: number;
    border_fill_id: number;
}

export interface PageBorderFillAttributes {
    position_reference: HorzRelTo;
    include_header:     boolean;
    include_footer:     boolean;
    fill_area:          HorzRelTo;
}

export interface PageDef {
    paper_width:    number;
    paper_height:   number;
    left_margin:    number;
    right_margin:   number;
    top_margin:     number;
    bottom_margin:  number;
    header_margin:  number;
    footer_margin:  number;
    binding_margin: number;
    attributes:     PageDefAttributes;
}

export interface PageDefAttributes {
    paper_direction: Direction;
    binding_method:  "single_page";
}

export interface FluffyParagraph {
    para_header: ParaHeader;
    records:     TentacledRecord[];
}

export interface TentacledRecord {
    type:                    RecordType;
    text?:                   string;
    runs?:                   Run[];
    control_char_positions?: ControlCharPosition[];
    shapes?:                 Shape[];
    segments?:               Segment[];
    ctrl_id?:                FluffyCtrlID;
    ctrl_id_value?:          number;
    data_type?:              Flag;
    attribute?:              number;
    number?:                 number;
    user_symbol?:            Prefix;
    prefix?:                 Prefix;
    suffix?:                 Prefix;
}

export type FluffyCtrlID = "atno" | "cold" | "gso ";

export type Prefix = "\u0000" | ")";

export interface ShapeComponent {
    object_control_id:  ObjectControlID;
    object_control_id2: ObjectControlID;
    group_offset:       GroupOffset;
    group_count:        number;
    local_version:      number;
    initial_width:      number;
    initial_height:     number;
    width:              number;
    height:             number;
    attributes:         AttributesEnum;
    rotation_angle:     number;
    rotation_center:    GroupOffset;
    rendering:          Rendering;
}

export type AttributesEnum = "vertical_flip" | "horizontal_flip";

export type ObjectControlID = "cer$" | "cip$" | "nil$";

export interface Rendering {
    matrix_count:       number;
    translation_matrix: TranslationMatrix;
    matrix_sequence:    MatrixSequence[];
}

export interface MatrixSequence {
    scale:    TranslationMatrix;
    rotation: TranslationMatrix;
}

export interface TranslationMatrix {
    elements: number[];
}

export interface Table {
    attributes: TableAttributes;
    cells:      Cell[];
}

export interface TableAttributes {
    attribute:      AttributesAttribute;
    row_count:      number;
    col_count:      number;
    cell_spacing:   number;
    padding:        Margin;
    row_sizes:      number[];
    border_fill_id: number;
    zones:          any[];
}

export interface AttributesAttribute {
    page_break:        PageBreak;
    header_row_repeat: boolean;
}

export type PageBreak = "no_break_other" | "no_break";

export interface Cell {
    list_header:     Header;
    cell_attributes: { [key: string]: number };
    paragraphs:      CellParagraph[];
}

export interface CellParagraph {
    para_header: ParaHeader;
    records:     StickyRecord[];
}

export interface StickyRecord {
    type:                     RecordType;
    shapes?:                  Shape[];
    segments?:                Segment[];
    text?:                    string;
    runs?:                    Run[];
    control_char_positions?:  ControlCharPosition[];
    ctrl_id?:                 PurpleCtrlID;
    ctrl_id_value?:           number;
    data_type?:               PurpleDataType;
    attribute?:               AttributeAttribute;
    column_spacing?:          number;
    column_widths?:           any[];
    attribute_high?:          number;
    divider_line_type?:       number;
    divider_line_thickness?:  number;
    divider_line_color?:      number;
    offset_y?:                number;
    offset_x?:                number;
    width?:                   number;
    height?:                  number;
    z_order?:                 number;
    margin?:                  Margin;
    instance_id?:             number;
    page_divide?:             number;
    description?:             null | string;
    caption?:                 null;
    shape_component?:         ShapeComponent;
    shape_component_picture?: ShapeComponentPicture;
}

export type FluffyType = "page_def" | "footnote_shape" | "page_border_fill" | "shape_component" | "table" | "list_header";

export interface Flags {
    shape:    number;
    position: string;
}

export interface InlineControlParamClass {
    chid?:  string;
    width?: number;
}

export interface RecordParagraph {
    para_header: ParaHeader;
    records:     IndigoRecord[];
}

export interface IndigoRecord {
    type:                    RecordType;
    shapes?:                 Shape[];
    segments?:               Segment[];
    text?:                   string;
    runs?:                   Run[];
    control_char_positions?: ControlCharPosition[];
    ctrl_id?:                FluffyCtrlID;
    ctrl_id_value?:          number;
    data_type?:              FluffyDataType;
    attribute?:              AttributeAttribute | number;
    number?:                 number;
    user_symbol?:            Prefix;
    prefix?:                 Prefix;
    suffix?:                 Prefix;
    column_spacing?:         number;
    column_widths?:          any[];
    attribute_high?:         number;
    divider_line_type?:      number;
    divider_line_thickness?: number;
    divider_line_color?:     number;
    offset_y?:               number;
    offset_x?:               number;
    width?:                  number;
    height?:                 number;
    z_order?:                number;
    margin?:                 Margin;
    instance_id?:            number;
    page_divide?:            number;
    description?:            null | string;
    caption?:                null;
    children?:               TentacledChild[];
}

export interface TentacledChild {
    type:            RecordType;
    shape_component: ShapeComponent;
    children:        StickyChild[];
}

export interface StickyChild {
    type:                    RecordType;
    shape_component_picture: ShapeComponentPicture;
}

export type FluffyDataType = "auto_number" | "column_definition" | "object_common";

export interface DocInfo {
    document_properties:   DocumentProperties;
    id_mappings:           { [key: string]: number | null };
    bin_data:              BinDatum[];
    face_names:            FaceName[];
    border_fill:           BorderFill[];
    char_shapes:           CharShape[];
    tab_defs:              TabDef[];
    numbering:             NumberingElement[];
    bullets:               Bullet[];
    para_shapes:           ParaShape[];
    styles:                Style[];
    doc_data:              DocDatum[];
    distribute_doc_data:   null;
    compatible_document:   CompatibleDocument | null;
    layout_compatibility:  LayoutCompatibility | null;
    track_change:          TrackChange | null;
    memo_shapes:           any[];
    forbidden_chars:       any[];
    track_change_contents: any[];
    track_change_authors:  any[];
}

export interface BinDatum {
    storage_type: string;
    attributes:   BinDatumAttributes;
    embedding:    Embedding;
}

export interface BinDatumAttributes {
    storage_type: string;
    compression:  string;
    access:       string;
}

export interface Embedding {
    binary_data_id: number;
    extension:      string;
}

export interface BorderFill {
    attributes: BorderFillAttributes;
    borders:    Border[];
    diagonal:   Diagonal;
    fill:       Fill;
}

export interface BorderFillAttributes {
    has_3d_effect:         boolean;
    has_shadow:            boolean;
    slash_shape:           number;
    backslash_shape:       number;
    slash_broken_line:     number;
    backslash_broken_line: boolean;
    slash_rotated_180:     boolean;
    backslash_rotated_180: boolean;
    has_center_line:       boolean;
}

export interface Border {
    line_type: number;
    width:     number;
    color:     Color;
}

export interface Diagonal {
    line_type: number;
    thickness: number;
    color:     Color;
}

export interface Fill {
    type:                          FillType;
    background_color?:             Color;
    pattern_color?:                Color;
    pattern_type?:                 number;
    gradient_type?:                number;
    angle?:                        number;
    horizontal_center?:            number;
    vertical_center?:              number;
    spread?:                       number;
    color_count?:                  number;
    positions?:                    null;
    colors?:                       any[];
    image_fill_type?:              number;
    image_info?:                   number[];
    gradient_spread_center?:       null;
    additional_attributes_length?: null;
    additional_attributes?:        null;
}

export type FillType = "solid" | "none" | "gradient" | "image";

export interface Bullet {
    attributes:              BulletAttributes;
    width:                   number;
    space:                   number;
    char_shape_id:           number;
    bullet_char:             number;
    image_bullet_id:         number;
    image_bullet_attributes: ImageBulletAttributes | null;
    check_bullet_char:       number;
}

export interface BulletAttributes {
    align_type:    AlignType;
    instance_like: boolean;
    auto_outdent:  boolean;
    distance_type: DistanceType;
}

export type AlignType = "left" | "center" | "right" | "justify" | "distribute" | "divide" | "decimal";

export type DistanceType = "ratio" | "value";

export interface CharShape {
    font_ids:            FontIDS;
    font_stretch:        FontIDS;
    letter_spacing:      FontIDS;
    relative_size:       FontIDS;
    text_position:       FontIDS;
    base_size:           number;
    attributes:          CharShapeAttributes;
    shadow_spacing_x:    number;
    shadow_spacing_y:    number;
    text_color:          Color;
    underline_color:     Color;
    shading_color:       Color;
    shadow_color:        Color;
    border_fill_id:      number | null;
    strikethrough_color: Color | null;
}

export interface CharShapeAttributes {
    italic:              boolean;
    bold:                boolean;
    underline_type:      number;
    underline_style:     number;
    outline_type:        number;
    shadow_type:         number;
    emboss:              boolean;
    engrave:             boolean;
    superscript:         boolean;
    subscript:           boolean;
    strikethrough:       number;
    emphasis_mark:       number;
    use_font_spacing:    boolean;
    strikethrough_style: number;
    kerning:             boolean;
}

export interface FontIDS {
    korean:   number;
    english:  number;
    chinese:  number;
    japanese: number;
    other:    number;
    symbol:   number;
    user:     number;
}

export interface CompatibleDocument {
    target_program: string;
}

export interface DocDatum {
    parameter_set: ParameterSet;
}

export interface ParameterSet {
    set_id:     number;
    item_count: number;
    items:      ParameterSetItem[];
}

export interface ParameterSetItem {
    id:        number;
    item_type: string;
    data:      Data;
}

export interface Data {
    type: string;
}

export interface DocumentProperties {
    area_count:            number;
    start_number_info:     number;
    page_start_number:     number;
    footnote_start_number: number;
    endnote_start_number:  number;
    image_start_number:    number;
    table_start_number:    number;
    formula_start_number:  number;
    list_id:               number;
    paragraph_id:          number;
    character_position:    number;
}

export interface FaceName {
    name:                  string;
    alternative_font_type: AlternativeFontType | null;
    alternative_font_name: AlternativeFontName | null;
    font_type_info:        FontTypeInfo;
    default_font_name:     null | string;
}

export type AlternativeFontName = "굴림" | "한양신명조" | "명조";

export type AlternativeFontType = "TTF" | "HFT";

export interface FontTypeInfo {
    font_family:      number;
    serif:            number;
    bold:             number;
    proportion:       number;
    contrast:         number;
    stroke_variation: number;
    stroke_type:      number;
    letter_type:      number;
    middle_line:      number;
    x_height:         number;
}

export interface LayoutCompatibility {
    character_format: number;
    paragraph_format: number;
    section_format:   number;
    object_format:    number;
    field_format:     number;
}

export interface NumberingElement {
    levels:          Level[];
    extended_levels: ExtendedLevel[];
}

export interface ExtendedLevel {
    format_length: number;
    format_string: ExtendedLevelFormatString;
}

export type ExtendedLevelFormatString = "\u0000" | "";

export interface Level {
    attributes:         BulletAttributes;
    width:              number;
    distance:           number;
    char_shape_id:      number;
    format_length:      number;
    format_string:      LevelFormatString;
    start_number:       number;
    level_start_number: number | null;
}

export type LevelFormatString = "^1." | "\u000c\u0000\u00002\uffff\uffff\u0003^3)Č\u0000\u00002\uffff\uffff\u0003^4)\u000c\u0000\u00002\uffff\uffff\u0004(^5)Č\u0000\u00002\uffff\uffff\u0004(^6),\u0000\u00002" | "" | "\u000c\u0000\u00002\uffff\uffff\u0003^3.l\u0000\u00002\uffff\uffff\u0003^4)¬\u0000\u00002\uffff\uffff\u0003^5)\u000c\u0000\u00002\uffff\uffff\u0003^6),\u0000\u00002\uffff\uffff" | "제^1장";

export interface ParaShape {
    attributes1:           Attributes1;
    left_margin:           number;
    right_margin:          number;
    indent:                number;
    outdent:               number;
    top_spacing:           number;
    bottom_spacing:        number;
    line_spacing_old:      number;
    tab_def_id:            number;
    number_bullet_id:      number;
    border_fill_id:        number;
    border_spacing_left:   number;
    border_spacing_right:  number;
    border_spacing_top:    number;
    border_spacing_bottom: number;
    attributes2:           Attributes2 | null;
    attributes3:           Attributes3 | null;
    line_spacing:          number | null;
}

export interface Attributes1 {
    line_spacing_type_old:    LineSpacingType;
    align:                    AlignType;
    line_divide_en:           LineDivide;
    line_divide_ko:           LineDivide;
    use_line_grid:            boolean;
    blank_min_value:          number;
    protect_orphan_line:      boolean;
    with_next_paragraph:      boolean;
    protect_paragraph:        boolean;
    always_page_break_before: boolean;
    vertical_align:           Attributes1VerticalAlign;
    line_height_matches_font: boolean;
    header_shape_type:        HeaderShapeType;
    paragraph_level:          number;
    connect_border:           boolean;
    ignore_margin:            boolean;
    tail_shape:               boolean;
}

export type HeaderShapeType = "none" | "outline" | "bullet" | "number";

export type LineDivide = "word" | "character";

export type LineSpacingType = "bycharacter" | "fixed" | "marginonly";

export type Attributes1VerticalAlign = "baseline" | "center";

export interface Attributes2 {
    single_line_input:   number;
    auto_spacing_ko_en:  boolean;
    auto_spacing_ko_num: boolean;
}

export interface Attributes3 {
    line_spacing_type: LineSpacingType;
}

export interface Style {
    local_name:    string;
    english_name:  string;
    style_type:    StyleType;
    next_style_id: number;
    lang_id:       number;
    para_shape_id: number | null;
    char_shape_id: number | null;
}

export type StyleType = "paragraph" | "character";

export interface TabDef {
    attributes: TabDefAttributes;
    count:      number;
    tabs:       Tab[];
}

export interface TabDefAttributes {
    has_left_auto_tab:  boolean;
    has_right_auto_tab: boolean;
}

export interface Tab {
    position:  number;
    tab_type:  AlignType;
    fill_type: number;
}

export interface TrackChange {
}

export interface FileHeader {
    signature:       "HWP Document File";
    version:         VersionEnum;
    document_flags:  DocumentFlag[];
    license_flags:   any[];
    encrypt_version: number;
    kogl_country:    number;
}

export type DocumentFlag = "compressed" | "xml_template" | "distribution";

export type VersionEnum = "5.0.1.7" | "5.0.3.0" | "5.1.0.1";

export interface PreviewImage {
    data:   string;
    format: Format;
}

export type Format = "GIF" | "UNKNOWN";

export interface PreviewText {
    text: string;
}

export interface Scripts {
    version:        VersionClass;
    default_script: null;
}

export interface VersionClass {
    high: number;
    low:  number;
}

export interface SummaryInformation {
    title:           string;
    subject:         Subject;
    author:          string;
    keywords:        Keywords;
    comments:        Comments;
    last_saved_by:   LastSavedBy;
    revision_number: RevisionNumber;
    last_printed:    Date;
    create_time:     Date;
    last_saved_time: Date;
    page_count:      number;
    date_string:     string;
    para_count:      number;
}

export type Comments = "" | "문서요약 설명" | "기타입니다.";

export type Keywords = "" | "문서요약 키워드" | "키워드입니다.";

export type LastSavedBy = "mete0r" | "user" | "지현" | "shifeed" | "Administrator";

export type RevisionNumber = "6, 7, 9, 1053 WIN6" | "6, 5, 0, 825 WIN6" | "8, 0, 0, 466 WIN32LEWindows_7" | "10, 0, 0, 5060 WIN32LEWindows_8";

export type Subject = "" | "문서요약 테스트 주제" | "fields crossing lineseg/paragraph boundary" | "주제입니다.";
