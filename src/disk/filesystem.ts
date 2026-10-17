import { SECTORS_PER_TRACK } from "./geometry";

export interface DiskFile {
  name: string;
  /** The operating system's own type letter, such as "B" for binary. */
  type: string;
  locked: boolean;
  deleted: boolean;
  /** Size in sectors as recorded in the catalog. */
  sectors: number;
}

export interface FileData {
  /** Every data sector of the file, in order, exactly as stored. */
  raw: Uint8Array;
  /** The file's contents with any operating system header removed. */
  content: Uint8Array;
  /** Where a binary file loads in memory, when the file system records it. */
  loadAddress?: number;
}

export interface SectorUse {
  kind: "system" | "file";
  label: string;
}

export interface FileSystem<F extends DiskFile = DiskFile> {
  readonly name: string;
  readonly files: readonly F[];
  /** Problems found while reading the catalog.  An empty list means none were found. */
  readonly problems: readonly string[];
  readFile(file: F): FileData;
  /** What each physical sector is used for, keyed by sectorKey(). */
  sectorUse(): Map<number, SectorUse>;
}

export function sectorKey(track: number, physicalSector: number): number {
  return track * SECTORS_PER_TRACK + physicalSector;
}
