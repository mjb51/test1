import {
  BLOCK_SIZE,
  DOS_TO_PHYSICAL,
  IMAGE_SIZE_140K,
  PHYSICAL_TO_DOS,
  PHYSICAL_TO_PRODOS,
  PRODOS_TO_PHYSICAL,
  SECTORS_PER_TRACK,
  SECTOR_SIZE,
  TRACKS,
  TRACK_SIZE,
} from "./geometry";

/** How the 256-byte sectors of each track are ordered in the image file. */
export type SectorOrder = "dos" | "prodos";

/**
 * A 140 KB, 16-sector disk image (.dsk, .do, or .po).  All reads go through
 * physical sector numbers, so file system code does not need to care which
 * order the image file was saved in.
 */
export class SectorImage {
  readonly bytes: Uint8Array;
  readonly order: SectorOrder;
  private readonly physicalToPosition: readonly number[];

  constructor(bytes: Uint8Array, order: SectorOrder) {
    if (bytes.length !== IMAGE_SIZE_140K) {
      throw new Error(`Expected a ${IMAGE_SIZE_140K}-byte image, got ${bytes.length} bytes`);
    }
    this.bytes = bytes;
    this.order = order;
    this.physicalToPosition = order === "dos" ? PHYSICAL_TO_DOS : PHYSICAL_TO_PRODOS;
  }

  /** Byte offset in the image file of a physical sector. */
  physicalOffset(track: number, physicalSector: number): number {
    checkTrackSector(track, physicalSector);
    return track * TRACK_SIZE + this.physicalToPosition[physicalSector]! * SECTOR_SIZE;
  }

  readPhysical(track: number, physicalSector: number): Uint8Array {
    const offset = this.physicalOffset(track, physicalSector);
    return this.bytes.slice(offset, offset + SECTOR_SIZE);
  }

  /** Read a sector using DOS 3.3 logical numbering (what most tools call "track/sector"). */
  readDosSector(track: number, dosSector: number): Uint8Array {
    checkTrackSector(track, dosSector);
    return this.readPhysical(track, DOS_TO_PHYSICAL[dosSector]!);
  }

  /** Read a 512-byte ProDOS block. */
  readBlock(block: number): Uint8Array {
    if (!Number.isInteger(block) || block < 0 || block >= (TRACKS * SECTORS_PER_TRACK) / 2) {
      throw new RangeError(`Block ${block} is out of range`);
    }
    const track = Math.floor(block / 8);
    const first = (block % 8) * 2;
    const result = new Uint8Array(BLOCK_SIZE);
    result.set(this.readPhysical(track, PRODOS_TO_PHYSICAL[first]!), 0);
    result.set(this.readPhysical(track, PRODOS_TO_PHYSICAL[first + 1]!), SECTOR_SIZE);
    return result;
  }

  /** Locate an offset in the image file as a track and sector. */
  locate(fileOffset: number): { track: number; physical: number; dos: number; byte: number } {
    const track = Math.floor(fileOffset / TRACK_SIZE);
    const position = Math.floor((fileOffset % TRACK_SIZE) / SECTOR_SIZE);
    const physical = this.order === "dos" ? DOS_TO_PHYSICAL[position]! : PRODOS_TO_PHYSICAL[position]!;
    return { track, physical, dos: PHYSICAL_TO_DOS[physical]!, byte: fileOffset % SECTOR_SIZE };
  }
}

function checkTrackSector(track: number, sector: number): void {
  if (!Number.isInteger(track) || track < 0 || track >= TRACKS) {
    throw new RangeError(`Track ${track} is out of range`);
  }
  if (!Number.isInteger(sector) || sector < 0 || sector >= SECTORS_PER_TRACK) {
    throw new RangeError(`Sector ${sector} is out of range`);
  }
}
