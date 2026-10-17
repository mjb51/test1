import { describe, expect, it } from "vitest";
import { decodeName, decodeText, findStrings, hexdump } from "../src/disk";

const high = (text: string) => Array.from(text, (c) => c.charCodeAt(0) | 0x80);
const low = (text: string) => Array.from(text, (c) => c.charCodeAt(0));

describe("Apple II text", () => {
  it("decodes high-bit names and strips padding", () => {
    expect(decodeName(Uint8Array.from([...high("HELLO"), 0xa0, 0xa0, 0x00]))).toBe("HELLO");
  });

  it("turns carriage returns into newlines", () => {
    expect(decodeText(Uint8Array.from([...high("HI"), 0x8d, ...high("THERE")]))).toBe("HI\nTHERE");
  });

  it("finds strings in either encoding and splits where the encoding changes", () => {
    const bytes = Uint8Array.from([0x00, ...high("SWORD"), ...low("SHIELD"), 0x01, ...high("AB"), 0xff]);
    expect(findStrings(bytes)).toEqual([
      { offset: 1, text: "SWORD", highBit: true },
      { offset: 6, text: "SHIELD", highBit: false },
    ]);
    expect(findStrings(bytes, { minLength: 2 }).map((s) => s.text)).toContain("AB");
  });

  it("skips runs that are mostly not letters", () => {
    expect(findStrings(Uint8Array.from(high("    ----")))).toEqual([]);
    expect(findStrings(Uint8Array.from(low("$+29@GNU\\cjqx")))).toEqual([]);
    expect(findStrings(Uint8Array.from(low("$+29@GNU\\cjqx")), { minLetterRatio: 0 })).toHaveLength(1);
  });

  it("hex dumps with an address column", () => {
    expect(hexdump(Uint8Array.from(high("AB")), 0x2000)).toBe(`2000: C1 C2${" ".repeat(42)}  AB`);
  });
});
