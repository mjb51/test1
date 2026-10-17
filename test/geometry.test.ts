import { describe, expect, it } from "vitest";
import {
  DOS_TO_PHYSICAL,
  IMAGE_SIZE_140K,
  PHYSICAL_TO_DOS,
  PRODOS_TO_PHYSICAL,
  SECTORS_PER_TRACK,
  SectorImage,
  type SectorOrder,
} from "../src/disk";

const isPermutation = (table: readonly number[]) =>
  [...table].sort((a, b) => a - b).every((value, index) => value === index);

/** A 140 KB image where every sector is filled with its own file position number. */
function numberedImage(): Uint8Array {
  const bytes = new Uint8Array(IMAGE_SIZE_140K);
  for (let position = 0; position < IMAGE_SIZE_140K / 256; position++) bytes.fill(position & 0xff, position * 256, (position + 1) * 256);
  return bytes;
}

describe("sector interleave tables", () => {
  it("are permutations of 0 to 15", () => {
    expect(isPermutation(DOS_TO_PHYSICAL)).toBe(true);
    expect(isPermutation(PRODOS_TO_PHYSICAL)).toBe(true);
  });

  it("map ProDOS blocks to the DOS sectors AppleCommander uses", () => {
    // From AppleCommander's DosOrder.blockToSectors525, an independent source.
    const expected = [[0, 14], [13, 12], [11, 10], [9, 8], [7, 6], [5, 4], [3, 2], [1, 15]];
    const image = new SectorImage(numberedImage(), "dos");
    for (let block = 0; block < 8; block++) {
      const data = image.readBlock(block);
      expect([data[0], data[256]]).toEqual(expected[block]);
    }
  });
});

describe("SectorImage", () => {
  it.each<SectorOrder>(["dos", "prodos"])("reads the same physical sector from both halves of %s order", (order) => {
    const image = new SectorImage(numberedImage(), order);
    const seen = new Set<number>();
    for (let sector = 0; sector < SECTORS_PER_TRACK; sector++) {
      const offset = image.physicalOffset(3, sector);
      const at = image.locate(offset);
      expect(at).toEqual({ track: 3, physical: sector, dos: PHYSICAL_TO_DOS[sector], byte: 0 });
      seen.add(offset);
    }
    expect(seen.size).toBe(SECTORS_PER_TRACK);
  });

  it("finds DOS sectors at their usual file positions in DOS order", () => {
    const image = new SectorImage(numberedImage(), "dos");
    expect(image.readDosSector(0, 5)[0]).toBe(5);
    expect(image.readDosSector(1, 15)[0]).toBe(16 + 15);
  });

  it("rejects images of the wrong size and out-of-range sectors", () => {
    expect(() => new SectorImage(new Uint8Array(100), "dos")).toThrow(/143360/);
    const image = new SectorImage(numberedImage(), "dos");
    expect(() => image.readPhysical(35, 0)).toThrow(RangeError);
    expect(() => image.readPhysical(0, 16)).toThrow(RangeError);
  });
});
