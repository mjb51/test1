import { PRODOS_TO_PHYSICAL, SECTOR_SIZE, TRACKS } from "./geometry";
import { sectorKey, type DiskFile, type FileData, type FileSystem, type SectorUse } from "./filesystem";
import type { SectorImage } from "./sector-image";
import { decodeName, isPrintable } from "./text";

/**
 * SSI's RDOS, used on many SSI Apple II games.  Files are contiguous runs of
 * "blocks" (256-byte sectors numbered from track 0, sector 0), and the
 * catalog is on track 1.
 *
 * The layout here follows AppleCommander's RDOS reader (version 1.10.1),
 * which notes that some details are uncertain.  It has not yet been checked
 * against a real SSI disk in this project, so treat results as provisional.
 */

const ENTRY_SIZE = 0x20;
const ENTRIES_PER_SECTOR = SECTOR_SIZE / ENTRY_SIZE;
/** AppleCommander reads 10 catalog sectors and notes that some sources say 11. */
const CATALOG_SECTORS = 10;
const DELETED_MARKER = 0x80;
const TYPE_LETTERS = new Set(["A", "B", "T"]);

export interface RdosVariant {
  name: string;
  sectorsPerTrack: 13 | 16;
  /** RDOS sector number within a track to physical sector number. */
  toPhysical: readonly number[];
}

/**
 * RDOS 2.1 and 3.2 were 13-sector formats.  On a disk converted to a
 * 16-sector image, AppleCommander's skew table puts RDOS sector N at
 * physical sector N.
 */
export const RDOS_32: RdosVariant = {
  name: "RDOS 2.1/3.2 (13-sector, converted)",
  sectorsPerTrack: 13,
  toPhysical: Array.from({ length: 13 }, (_, i) => i),
};

/**
 * RDOS 3.3 is a native 16-sector format.  AppleCommander reads it as a
 * ProDOS-order image, which for a DOS-order image file means RDOS sector N
 * is ProDOS logical sector N.  This is an inference from that code.
 */
export const RDOS_33: RdosVariant = {
  name: "RDOS 3.3 (16-sector)",
  sectorsPerTrack: 16,
  toPhysical: PRODOS_TO_PHYSICAL,
};

export interface RdosFile extends DiskFile {
  startBlock: number;
  loadAddress: number;
  /** Length in bytes as recorded in the catalog. */
  length: number;
}

function readBlock(image: SectorImage, variant: RdosVariant, block: number): Uint8Array {
  const track = Math.floor(block / variant.sectorsPerTrack);
  return image.readPhysical(track, variant.toPhysical[block % variant.sectorsPerTrack]!);
}

function blockKey(variant: RdosVariant, block: number): number {
  const track = Math.floor(block / variant.sectorsPerTrack);
  return sectorKey(track, variant.toPhysical[block % variant.sectorsPerTrack]!);
}

interface ParsedSector {
  files: RdosFile[];
  invalid: number;
}

function parseCatalogSector(data: Uint8Array, totalBlocks: number): ParsedSector {
  const files: RdosFile[] = [];
  let invalid = 0;
  for (let i = 0; i < ENTRIES_PER_SECTOR; i++) {
    const entry = data.subarray(i * ENTRY_SIZE, (i + 1) * ENTRY_SIZE);
    if (entry[0] === 0) continue;
    const deleted = entry[0] === DELETED_MARKER;
    const type = String.fromCharCode(entry[0x18]! & 0x7f);
    const sectors = entry[0x19]!;
    const startBlock = entry[0x1e]! | (entry[0x1f]! << 8);
    const nameOk = isPrintable(entry[0]!) && Array.from(entry.subarray(0, 0x18)).every((b) => isPrintable(b) || (b & 0x7f) === 0);
    if (!deleted && (!nameOk || !TYPE_LETTERS.has(type) || startBlock + sectors > totalBlocks)) {
      invalid++;
      continue;
    }
    files.push({
      // Deleting a file overwrites the first byte of its name.
      name: deleted ? `(deleted) ?${decodeName(entry.subarray(1, 0x18))}` : decodeName(entry.subarray(0, 0x18)),
      type,
      locked: false,
      deleted,
      sectors,
      startBlock,
      loadAddress: entry[0x1a]! | (entry[0x1b]! << 8),
      length: entry[0x1c]! | (entry[0x1d]! << 8),
    });
  }
  return { files, invalid };
}

/** Text tags that AppleCommander uses to recognize RDOS disks. */
export function findRdosTag(image: SectorImage): RdosVariant | undefined {
  const tag = (bytes: Uint8Array) => decodeName(bytes);
  // Track 1, physical sector 0 holds the first catalog entry, the RDOS system file.
  if (tag(image.readPhysical(1, 0).subarray(0, 6)) === "RDOS 3") return RDOS_33;
  // Track 0, physical sector 4 (DOS sector 13) carries a tag added by 13-to-16-sector conversion.
  if (tag(image.readPhysical(0, 4).subarray(0xe0, 0xe4)) === "RDOS") return RDOS_32;
  return undefined;
}

export class RdosVolume implements FileSystem<RdosFile> {
  readonly name: string;
  readonly files: RdosFile[] = [];
  readonly problems: string[] = [];
  readonly totalBlocks: number;
  private readonly catalogBlocks: number[] = [];

  constructor(
    readonly image: SectorImage,
    readonly variant: RdosVariant,
  ) {
    this.name = variant.name;
    this.totalBlocks = TRACKS * variant.sectorsPerTrack;
    const first = variant.sectorsPerTrack; // Track 1, RDOS sector 0.
    for (let i = 0; i < variant.sectorsPerTrack; i++) {
      const block = first + i;
      const parsed = parseCatalogSector(readBlock(image, variant, block), this.totalBlocks);
      // Past the documented size, only accept sectors that parse cleanly, in case the catalog is longer.
      if (i >= CATALOG_SECTORS && (parsed.invalid > 0 || parsed.files.length === 0)) break;
      if (parsed.invalid > 0) {
        this.problems.push(`${parsed.invalid} unreadable catalog entries in block ${block}`);
      }
      this.catalogBlocks.push(block);
      this.files.push(...parsed.files);
    }
  }

  /** How well the catalog reads: valid entries count up, broken ones count down. */
  static score(image: SectorImage, variant: RdosVariant): number {
    let score = 0;
    const total = TRACKS * variant.sectorsPerTrack;
    for (let i = 0; i < CATALOG_SECTORS; i++) {
      const parsed = parseCatalogSector(readBlock(image, variant, variant.sectorsPerTrack + i), total);
      score += parsed.files.filter((file) => !file.deleted).length - 2 * parsed.invalid;
    }
    return score;
  }

  readFile(file: RdosFile): FileData {
    if (file.deleted) {
      throw new Error("Deleted RDOS entries do not keep their file names; extract by block range instead");
    }
    const raw = new Uint8Array(file.sectors * SECTOR_SIZE);
    for (let i = 0; i < file.sectors; i++) {
      raw.set(readBlock(this.image, this.variant, file.startBlock + i), i * SECTOR_SIZE);
    }
    const content = file.length > 0 && file.length <= raw.length ? raw.slice(0, file.length) : raw;
    return file.type === "B" ? { raw, content, loadAddress: file.loadAddress } : { raw, content };
  }

  sectorUse(): Map<number, SectorUse> {
    const use = new Map<number, SectorUse>();
    for (const file of this.files) {
      if (file.deleted) continue;
      for (let i = 0; i < file.sectors; i++) {
        use.set(blockKey(this.variant, file.startBlock + i), { kind: "file", label: file.name });
      }
    }
    for (const block of this.catalogBlocks) use.set(blockKey(this.variant, block), { kind: "system", label: "catalog" });
    return use;
  }
}
