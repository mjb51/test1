import { IMAGE_SIZE_140K, SECTOR_SIZE, SectorImage, type RdosVariant } from "../../src/disk";

export interface RdosTestFile {
  name: string;
  type: "A" | "B" | "T";
  address: number;
  data: Uint8Array;
}

function highBitText(text: string, width: number): Uint8Array {
  const bytes = new Uint8Array(width).fill(0xa0);
  for (let i = 0; i < Math.min(text.length, width); i++) bytes[i] = text.charCodeAt(i) | 0x80;
  return bytes;
}

/**
 * Build a DOS-order 140 KB image laid out as RDOS, using our understanding of
 * the format.  The fixtures made with this are checked by AppleCommander's
 * independent RDOS reader (see test/fixtures/README.md).
 */
export function buildRdosImage(variant: RdosVariant, systemName: string, files: RdosTestFile[]): Uint8Array {
  const bytes = new Uint8Array(IMAGE_SIZE_140K);
  const image = new SectorImage(bytes, "dos");
  const spt = variant.sectorsPerTrack;
  const writeBlock = (block: number, data: Uint8Array) => {
    const offset = image.physicalOffset(Math.floor(block / spt), variant.toPhysical[block % spt]!);
    bytes.set(data.subarray(0, SECTOR_SIZE), offset);
  };

  // Entry 0 is the RDOS system file, covering tracks 0 and 1 (system code and catalog).
  const entries: Array<{ name: string; type: string; sectors: number; address: number; length: number; start: number }> = [
    { name: systemName, type: "B", sectors: 2 * spt, address: 0x1000, length: 2 * spt * SECTOR_SIZE, start: 0 },
  ];
  let next = 2 * spt;
  for (const file of files) {
    const sectors = Math.ceil(file.data.length / SECTOR_SIZE);
    for (let i = 0; i < sectors; i++) writeBlock(next + i, file.data.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE));
    entries.push({ name: file.name, type: file.type, sectors, address: file.address, length: file.data.length, start: next });
    next += sectors;
  }

  const catalog = new Uint8Array(10 * SECTOR_SIZE);
  entries.forEach((entry, i) => {
    const at = i * 0x20;
    catalog.set(highBitText(entry.name, 0x18), at);
    catalog[at + 0x18] = entry.type.charCodeAt(0) | 0x80;
    catalog[at + 0x19] = entry.sectors;
    catalog[at + 0x1a] = entry.address & 0xff;
    catalog[at + 0x1b] = entry.address >> 8;
    catalog[at + 0x1c] = entry.length & 0xff;
    catalog[at + 0x1d] = entry.length >> 8;
    catalog[at + 0x1e] = entry.start & 0xff;
    catalog[at + 0x1f] = entry.start >> 8;
  });
  // A deleted entry after the live ones.
  catalog[entries.length * 0x20] = 0x80;
  catalog.set(highBitText("OLD FILE", 0x17), entries.length * 0x20 + 1);
  for (let i = 0; i < 10; i++) writeBlock(spt + i, catalog.subarray(i * SECTOR_SIZE, (i + 1) * SECTOR_SIZE));
  return bytes;
}

export function pattern(length: number, seed: number): Uint8Array {
  return Uint8Array.from({ length }, (_, i) => (i * 7 + seed + (i >> 8)) & 0xff);
}
