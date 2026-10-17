/**
 * Apple II text helpers.  The Apple II usually stores text with the high bit
 * set (0xC1 is "A"), but programs also use plain ASCII, so both are handled.
 */

export function isPrintable(byte: number): boolean {
  const low = byte & 0x7f;
  return low >= 0x20 && low <= 0x7e;
}

/** Decode a fixed-width field such as a file name: strip high bits and trailing padding. */
export function decodeName(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    const low = byte & 0x7f;
    text += low === 0 ? " " : isPrintable(low) ? String.fromCharCode(low) : "?";
  }
  return text.trimEnd();
}

/** Decode text for display.  Carriage returns become newlines and other control codes become dots. */
export function decodeText(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) {
    const low = byte & 0x7f;
    if (low === 0x0d) {
      text += "\n";
    } else if (isPrintable(low)) {
      text += String.fromCharCode(low);
    } else {
      text += ".";
    }
  }
  return text;
}

export interface FoundString {
  offset: number;
  text: string;
  /** True when every character had its high bit set. */
  highBit: boolean;
}

export interface FindStringsOptions {
  /** Shortest run to report.  Default 4. */
  minLength?: number;
  /**
   * Fraction of a run that must be letters or spaces.  Default 0.7.  Code and
   * graphics often contain printable bytes by chance; this keeps them out.
   */
  minLetterRatio?: number;
}

/**
 * Find runs of printable characters, like the Unix `strings` tool.  A run
 * must use one encoding throughout (all high-bit or all plain ASCII), which
 * filters out more false positives in code and graphics.
 */
export function findStrings(bytes: Uint8Array, options: FindStringsOptions = {}): FoundString[] {
  const minLength = options.minLength ?? 4;
  const minLetterRatio = options.minLetterRatio ?? 0.7;
  const found: FoundString[] = [];
  let start = -1;
  let highBit = false;

  const flush = (end: number) => {
    if (start >= 0 && end - start >= minLength) {
      const text = decodeText(bytes.subarray(start, end));
      const letters = text.replace(/[^A-Za-z]/g, "").length;
      const spaces = text.replace(/[^ ]/g, "").length;
      if (letters > 0 && (letters + spaces) / text.length >= minLetterRatio) {
        found.push({ offset: start, text, highBit });
      }
    }
    start = -1;
  };

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i]!;
    const high = (byte & 0x80) !== 0;
    if (isPrintable(byte)) {
      if (start >= 0 && high !== highBit) {
        flush(i);
      }
      if (start < 0) {
        start = i;
        highBit = high;
      }
    } else {
      flush(i);
    }
  }
  flush(bytes.length);
  return found;
}
