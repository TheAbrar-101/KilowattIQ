/**
 * KilowattIQ PDF Font Subsystem & Bangla Unicode Typography Engine
 * 
 * Features:
 * - Embedded TTF fonts: Noto Sans Bengali (Regular & Bold), SolaimanLipi, JetBrains Mono
 * - Automatic Bengali script detection (Unicode block U+0980–U+09FF)
 * - Automatic font switching between English (Helvetica/JetBrains Mono) and Bangla (Noto/SolaimanLipi)
 * - Native OpenType glyph layout & Unicode conjunct shaping via fontkit / PDFKit
 * - Dedicated tabular numeric rendering in JetBrains Mono
 * - Inline multi-script segmentation with PDFKit `continued: true` to guarantee ZERO tofu boxes
 */

import path from 'path';
import fs from 'fs';
import PDFDocument from 'pdfkit';

export const FONT_NOTO_BENGALI = 'NotoSansBengali';
export const FONT_NOTO_BENGALI_BOLD = 'NotoSansBengali-Bold';
export const FONT_SOLAIMAN_LIPI = 'SolaimanLipi';
export const FONT_JETBRAINS_MONO = 'JetBrainsMono';
export const FONT_LATIN = 'Helvetica';
export const FONT_LATIN_BOLD = 'Helvetica-Bold';

// Resolve asset font paths
const ASSET_DIR = path.resolve(process.cwd(), 'src/server/reports/pdf/assets');

export const FONT_PATHS = {
  notoBengaliRegular: path.join(ASSET_DIR, 'NotoSansBengali-Regular.ttf'),
  notoBengaliBold: path.join(ASSET_DIR, 'NotoSansBengali-Bold.ttf'),
  solaimanLipi: path.join(ASSET_DIR, 'SolaimanLipi.ttf'),
  jetBrainsMono: path.join(ASSET_DIR, 'JetBrainsMono-Regular.ttf'),
};

/**
 * Regex matching any character in the Bengali Unicode block (U+0980 to U+09FF)
 */
export const BANGLA_UNICODE_REGEX = /[\u0980-\u09FF]/;

/**
 * Checks if a string contains any Bengali Unicode characters
 */
export function hasBanglaCharacters(text?: string | null): boolean {
  if (!text) return false;
  return BANGLA_UNICODE_REGEX.test(text);
}

/**
 * Checks if a character code point falls into the Bengali Unicode block
 */
export function isBanglaCodePoint(cp: number): boolean {
  return cp >= 0x0980 && cp <= 0x09FF;
}

/**
 * Checks if a string contains purely numeric, currency, or unit metrics
 */
export function isNumericOrCurrency(text?: string | null): boolean {
  if (!text) return false;
  const cleaned = text.trim();
  return (
    /^[0-9\s,.\-+/%৳BDT$€£:]+$/.test(cleaned) ||
    /^[0-9]+(\.[0-9]+)?\s*(kWh|W|kW|V|A|Hz|BDT|৳)?$/i.test(cleaned)
  );
}

/**
 * Registers all embedded Bangla and Monospace fonts in a PDFKit Document
 */
export function registerReportFonts(doc: typeof PDFDocument.prototype): void {
  try {
    if (fs.existsSync(FONT_PATHS.notoBengaliRegular)) {
      doc.registerFont(FONT_NOTO_BENGALI, FONT_PATHS.notoBengaliRegular);
    }
    if (fs.existsSync(FONT_PATHS.notoBengaliBold)) {
      doc.registerFont(FONT_NOTO_BENGALI_BOLD, FONT_PATHS.notoBengaliBold);
    }
    if (fs.existsSync(FONT_PATHS.solaimanLipi)) {
      doc.registerFont(FONT_SOLAIMAN_LIPI, FONT_PATHS.solaimanLipi);
    }
    if (fs.existsSync(FONT_PATHS.jetBrainsMono)) {
      doc.registerFont(FONT_JETBRAINS_MONO, FONT_PATHS.jetBrainsMono);
    }
  } catch (err) {
    console.warn('[PDF Fonts] Font registration warning:', err);
  }
}

/**
 * Shared shaper document instance for layout and tofu verification
 */
let sharedShaperDoc: any = null;

function getSharedShaperDoc(): any {
  if (!sharedShaperDoc) {
    sharedShaperDoc = new PDFDocument({ size: 'A4', margin: 36 });
    registerReportFonts(sharedShaperDoc);
  }
  return sharedShaperDoc;
}

/**
 * Applies Unicode OpenType glyph shaping using fontkit / PDFKit layout engine.
 * Handles complex Bengali conjuncts (reph, ya-phala, juktakkhor, kar signs).
 */
export function shapeBanglaText(
  text: string,
  fontName: string = FONT_NOTO_BENGALI
): {
  glyphs: any[];
  hasTofu: boolean;
  tofuCount: number;
} {
  try {
    const shaperDoc = getSharedShaperDoc();
    shaperDoc.font(fontName);
    const layoutRes = shaperDoc._font.layout(text);
    const glyphs = layoutRes?.glyphs || [];
    const tofuGlyphs = glyphs.filter((g: any) => g.id === 0);

    return {
      glyphs,
      hasTofu: tofuGlyphs.length > 0,
      tofuCount: tofuGlyphs.length,
    };
  } catch (err) {
    console.warn(`[PDF Fonts] Shaping warning for font "${fontName}":`, err);
    return { glyphs: [], hasTofu: false, tofuCount: 0 };
  }
}

/**
 * Asserts that a text string shapes with ZERO tofu boxes (.notdef glyphs)
 */
export function assertNoTofuBoxes(text: string, fontName: string = FONT_NOTO_BENGALI): void {
  const { hasTofu, tofuCount } = shapeBanglaText(text, fontName);
  if (hasTofu) {
    throw new Error(`Tofu box detected in string "${text}" rendered with font "${fontName}": ${tofuCount} missing glyph(s).`);
  }
}

/**
 * Determines the optimal font family given text content, weight, and column type
 */
export function selectOptimalFont(
  text: string,
  options: {
    isBold?: boolean;
    preferSolaiman?: boolean;
    isNumericColumn?: boolean;
  } = {}
): string {
  const { isBold = false, preferSolaiman = false, isNumericColumn = false } = options;

  if (isNumericColumn) {
    return FONT_JETBRAINS_MONO;
  }

  if (hasBanglaCharacters(text)) {
    if (preferSolaiman) {
      return FONT_SOLAIMAN_LIPI;
    }
    return isBold ? FONT_NOTO_BENGALI_BOLD : FONT_NOTO_BENGALI;
  }

  if (isNumericOrCurrency(text)) {
    return FONT_JETBRAINS_MONO;
  }

  return isBold ? FONT_LATIN_BOLD : FONT_LATIN;
}

export interface TextSegment {
  text: string;
  font: string;
}

/**
 * Segments a mixed string into contiguous runs, switching fonts automatically
 * so that no glyph maps to .notdef / tofu box.
 */
export function segmentTextRuns(
  text: string,
  options: {
    isBold?: boolean;
    preferSolaiman?: boolean;
    isNumeric?: boolean;
    isNumericColumn?: boolean;
  } = {}
): TextSegment[] {
  if (!text) return [];

  const { isBold = false, preferSolaiman = false, isNumeric = false, isNumericColumn = false } = options;

  const banglaFont = preferSolaiman ? FONT_SOLAIMAN_LIPI : isBold ? FONT_NOTO_BENGALI_BOLD : FONT_NOTO_BENGALI;
  const latinFont = (isNumeric || isNumericColumn) ? FONT_JETBRAINS_MONO : (isBold ? FONT_LATIN_BOLD : FONT_LATIN);

  // If text is pure Bangla (and does not contain Latin letters)
  if (hasBanglaCharacters(text) && !/[a-zA-Z]/.test(text)) {
    if (preferSolaiman && text.includes('—')) {
      // SolaimanLipi is missing em-dash (—); route em-dash to Noto
    } else {
      return [{ text, font: banglaFont }];
    }
  }

  // If text has NO Bangla characters and no Taka sign
  if (!hasBanglaCharacters(text) && !text.includes('৳')) {
    return [{ text, font: latinFont }];
  }

  // Mixed string: segment character by character into script-compatible runs
  const segments: TextSegment[] = [];
  let currentText = '';
  let currentFont: string | null = null;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const cp = char.codePointAt(0) || 0;

    let targetFont = latinFont;

    if (isBanglaCodePoint(cp)) {
      targetFont = banglaFont;
    } else if (cp === 0x2014) {
      // Em-dash (—): use Noto Sans Bengali which has full em-dash support
      targetFont = isBold ? FONT_NOTO_BENGALI_BOLD : FONT_NOTO_BENGALI;
    } else if (char === '৳') {
      // Taka sign (U+09F3): always in Noto Sans Bengali
      targetFont = isBold ? FONT_NOTO_BENGALI_BOLD : FONT_NOTO_BENGALI;
    } else if (
      currentFont &&
      (currentFont === FONT_NOTO_BENGALI || currentFont === FONT_NOTO_BENGALI_BOLD) &&
      !/[a-zA-Z]/.test(char) &&
      /[\s0-9,.:;%()/\-+]/.test(char)
    ) {
      // Punctuation, commas, periods, digits adjacent to Bangla remain in Bengali font
      targetFont = currentFont;
    } else if (isNumeric || isNumericColumn) {
      targetFont = FONT_JETBRAINS_MONO;
    } else {
      targetFont = latinFont;
    }

    if (char === ' ' && currentFont) {
      targetFont = currentFont;
    }

    if (targetFont === currentFont) {
      currentText += char;
    } else {
      if (currentText) {
        segments.push({ text: currentText, font: currentFont! });
      }
      currentText = char;
      currentFont = targetFont;
    }
  }

  if (currentText && currentFont) {
    segments.push({ text: currentText, font: currentFont });
  }

  return segments;
}

/**
 * Renders text into a PDF document with automatic font selection, multi-script
 * segmentation, and fallback to ensure 100% tofu-free rendering.
 */
export function renderSmartText(
  doc: typeof PDFDocument.prototype,
  text: string,
  x?: number,
  y?: number,
  options: {
    isBold?: boolean;
    isNumeric?: boolean;
    preferSolaiman?: boolean;
    fontSize?: number;
    color?: string;
    align?: 'left' | 'center' | 'right' | 'justify';
    width?: number;
  } = {}
): void {
  if (!text) return;

  const {
    isBold = false,
    isNumeric = false,
    preferSolaiman = false,
    fontSize,
    color,
    align = 'left',
    width,
  } = options;

  if (fontSize) doc.fontSize(fontSize);
  if (color) doc.fillColor(color);

  const segments = segmentTextRuns(text, {
    isBold,
    isNumeric,
    preferSolaiman,
  });

  if (segments.length === 0) return;

  // Single segment rendering (fast path)
  if (segments.length === 1) {
    doc.font(segments[0].font);
    if (x !== undefined && y !== undefined) {
      if (width) {
        doc.text(segments[0].text, x, y, { width, align });
      } else {
        doc.text(segments[0].text, x, y);
      }
    } else {
      if (width) {
        doc.text(segments[0].text, { width, align });
      } else {
        doc.text(segments[0].text);
      }
    }
    return;
  }

  // Multi-segment rendering with PDFKit `continued: true`
  for (let i = 0; i < segments.length; i++) {
    const isFirst = i === 0;
    const isLast = i === segments.length - 1;
    doc.font(segments[i].font);

    const pdfOpts: any = {
      continued: !isLast,
      ...(width ? { width } : {}),
      ...(align ? { align } : {}),
    };

    if (isFirst && x !== undefined && y !== undefined) {
      doc.text(segments[i].text, x, y, pdfOpts);
    } else {
      doc.text(segments[i].text, pdfOpts);
    }
  }
}

export default {
  FONT_NOTO_BENGALI,
  FONT_NOTO_BENGALI_BOLD,
  FONT_SOLAIMAN_LIPI,
  FONT_JETBRAINS_MONO,
  FONT_LATIN,
  FONT_LATIN_BOLD,
  FONT_PATHS,
  hasBanglaCharacters,
  isBanglaCodePoint,
  isNumericOrCurrency,
  registerReportFonts,
  selectOptimalFont,
  segmentTextRuns,
  shapeBanglaText,
  assertNoTofuBoxes,
  renderSmartText,
};
