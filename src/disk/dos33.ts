import { DOS_TO_PHYSICAL, SECTORS_PER_TRACK, SECTOR_SIZE, TRACKS } from "./geometry";
import { sectorKey, type DiskFile, type FileData, type FileSystem, type SectorUse } from "./filesystem";
import type { SectorImage } from "./sector-image";
import { decodeName } from "./text";

/** Apple DOS 3.3.  Track and sector numbers here are DOS logical sectors. */

const VTOC_TRACK = 17;
const CATALOG_ENTRY_START = 0x0b;
const CATALOG_ENTRY_SIZE = 35;
const CATALOG_ENTRIES_PER_SECTOR = 7;
const TS_PAIRS_PER_LIST = 122;
const MAX_CHAIN_LENGTH = TRACKS * SECTORS_PER_TRACK;

const TYPE_LETTERS = new Map<number, string>([
  [0x00, "T"],
  [0x01, "I"],
  [0x02, "A"],
  [0x04, "B"],
  [0x08, "S"],
  [0x10, "R"],
  [0x20, "a"],
  [0x40, "b"],
]);

export interface Vtoc {
  catalogTrack: number;
  catalogSector: number;
  dosRelease: number;
  volume: number;
  tracks: number;
  sectors: number;
  bytesPerSector: number;
  /** One 16-bit mask per track; a set bit means the sector is free. */
  freeMasks: number[];
}

export interface Dos33File extends DiskFile {
  typeByte: number;
  tsTrack: number;
  tsSector: number;
}

export function readVtoc(image: SectorImage): Vtoc {
  const v = image.readDosSector(VTOC_TRACK, 0);
  const freeMasks: number[] = [];
  for (let track = 0; track < TRACKS; track++) {
    const at = 0x38 + track * 4;
    freeMasks.push((v[at]! << 8) | v[at + 1]!);
  }
  return {
    catalogTrack: v[0x01]!,
    catalogSector: v[0x02]!,
    dosRelease: v[0x03]!,
    volume: v[0x06]!,
    tracks: v[0x34]!,
    sectors: v[0x35]!,
    bytesPerSector: v[0x36]! | (v[0x37]! << 8),
    freeMasks,
  };
}

function isPlausibleVtoc(v: Vtoc): boolean {
  return (
    v.tracks === TRACKS &&
    v.sectors === SECTORS_PER_TRACK &&
    v.bytesPerSector === SECTOR_SIZE &&
    inRange(v.catalogTrack, v.catalogSector) &&
    v.catalogTrack !== 0
  );
}

function inRange(track: number, sector: number): boolean {
  return track < TRACKS && sector < SECTORS_PER_TRACK;
}

/**
 * Score how well an image reads as DOS 3.3 in its current sector order.
 * Zero means it is not DOS 3.3.  Higher scores mean more of the catalog
 * and track/sector lists check out, which is how the right order is chosen.
 */
export function scoreDos33(image: SectorImage): number {
  const vtoc = readVtoc(image);
  if (!isPlausibleVtoc(vtoc)) return 0;
  let score = 1;
  const visited = new Set<number>();
  let track = vtoc.catalogTrack;
  let sector = vtoc.catalogSector;
  while (track !== 0 && inRange(track, sector) && !visited.has(sectorKey(track, sector))) {
    visited.add(sectorKey(track, sector));
    score += 1;
    const cat = image.readDosSector(track, sector);
    for (let i = 0; i < CATALOG_ENTRIES_PER_SECTOR; i++) {
      const at = CATALOG_ENTRY_START + i * CATALOG_ENTRY_SIZE;
      const first = cat[at]!;
      if (first === 0 || first === 0xff) continue;
      const tsSector = cat[at + 1]!;
      if (!inRange(first, tsSector)) {
        score -= 1;
        continue;
      }
      const ts = image.readDosSector(first, tsSector);
      const offset = ts[0x05]! | (ts[0x06]! << 8);
      score += ts[0x00] === 0 && offset % TS_PAIRS_PER_LIST === 0 ? 2 : -1;
    }
    track = cat[0x01]!;
    sector = cat[0x02]!;
  }
  return Math.max(score, 0);
}

export class Dos33Volume implements FileSystem<Dos33File> {
  readonly name = "DOS 3.3";
  readonly vtoc: Vtoc;
  readonly files: Dos33File[] = [];
  readonly problems: string[] = [];
  private readonly catalogChain: Array<[number, number]> = [];

  constructor(readonly image: SectorImage) {
    this.vtoc = readVtoc(image);
    if (!isPlausibleVtoc(this.vtoc)) {
      throw new Error("No DOS 3.3 VTOC found at track 17, sector 0");
    }
    this.readCatalog();
  }

  private readCatalog(): void {
    const visited = new Set<number>();
    let track = this.vtoc.catalogTrack;
    let sector = this.vtoc.catalogSector;
    while (track !== 0) {
      if (!inRange(track, sector)) {
        this.problems.push(`Catalog link points outside the disk: track ${track}, sector ${sector}`);
        return;
      }
      if (visited.has(sectorKey(track, sector))) {
        this.problems.push(`Catalog chain loops back to track ${track}, sector ${sector}`);
        return;
      }
      visited.add(sectorKey(track, sector));
      this.catalogChain.push([track, sector]);
      const cat = this.image.readDosSector(track, sector);
      for (let i = 0; i < CATALOG_ENTRIES_PER_SECTOR; i++) {
        const at = CATALOG_ENTRY_START + i * CATALOG_ENTRY_SIZE;
        const first = cat[at]!;
        if (first === 0) continue; // Never used.
        const deleted = first === 0xff;
        const typeByte = cat[at + 0x02]!;
        this.files.push({
          // A deleted entry keeps its original T/S list track in the last name byte.
          name: decodeName(cat.subarray(at + 0x03, at + (deleted ? 0x20 : 0x21))),
          type: TYPE_LETTERS.get(typeByte & 0x7f) ?? "?",
          locked: (typeByte & 0x80) !== 0,
          deleted,
          sectors: cat[at + 0x21]! | (cat[at + 0x22]! << 8),
          typeByte,
          tsTrack: deleted ? cat[at + 0x20]! : first,
          tsSector: cat[at + 0x01]!,
        });
      }
      track = cat[0x01]!;
      sector = cat[0x02]!;
    }
  }

  /** The track/sector lists of a file, then its data sectors by position (null for holes). */
  private walkFile(file: Dos33File): { lists: Array<[number, number]>; data: Array<[number, number] | null> } {
    const lists: Array<[number, number]> = [];
    const data: Array<[number, number] | null> = [];
    const visited = new Set<number>();
    let track = file.tsTrack;
    let sector = file.tsSector;
    while (track !== 0) {
      if (!inRange(track, sector) || visited.has(sectorKey(track, sector)) || lists.length >= MAX_CHAIN_LENGTH) {
        throw new Error(`Bad track/sector list chain in ${file.name} at track ${track}, sector ${sector}`);
      }
      visited.add(sectorKey(track, sector));
      // Each list covers the next 122 sectors of the file.  The list's own "sector offset"
      // field ($05-$06) is redundant, and some tools (AppleCommander 1.10.1) leave it 0.
      const base = lists.length * TS_PAIRS_PER_LIST;
      lists.push([track, sector]);
      const ts = this.image.readDosSector(track, sector);
      for (let i = 0; i < TS_PAIRS_PER_LIST; i++) {
        const dataTrack = ts[0x0c + i * 2]!;
        const dataSector = ts[0x0d + i * 2]!;
        if (dataTrack === 0) continue; // DOS 3.3 never stores file data on track 0.
        if (!inRange(dataTrack, dataSector)) {
          throw new Error(`${file.name} lists a data sector outside the disk: track ${dataTrack}, sector ${dataSector}`);
        }
        data[base + i] = [dataTrack, dataSector];
      }
      track = ts[0x01]!;
      sector = ts[0x02]!;
    }
    return { lists, data: Array.from(data, (entry) => entry ?? null) };
  }

  readFile(file: Dos33File): FileData {
    if (file.deleted) {
      throw new Error(`${file.name} is deleted; its sectors may have been reused`);
    }
    const { data } = this.walkFile(file);
    const raw = new Uint8Array(data.length * SECTOR_SIZE);
    data.forEach((entry, index) => {
      if (entry) raw.set(this.image.readDosSector(entry[0], entry[1]), index * SECTOR_SIZE);
    });
    const word = (at: number) => raw[at]! | (raw[at + 1]! << 8);
    switch (file.type) {
      case "B": {
        const length = word(2);
        return { raw, content: raw.slice(4, 4 + length), loadAddress: word(0) };
      }
      case "A":
      case "I":
        return { raw, content: raw.slice(2, 2 + word(0)) };
      default:
        return { raw, content: raw };
    }
  }

  isFreeInVtoc(track: number, dosSector: number): boolean {
    return ((this.vtoc.freeMasks[track]! >> dosSector) & 1) === 1;
  }

  freeSectorCount(): number {
    let free = 0;
    for (let track = 0; track < TRACKS; track++) {
      for (let sector = 0; sector < SECTORS_PER_TRACK; sector++) {
        if (this.isFreeInVtoc(track, sector)) free++;
      }
    }
    return free;
  }

  sectorUse(): Map<number, SectorUse> {
    const use = new Map<number, SectorUse>();
    const mark = (track: number, dosSector: number, value: SectorUse) =>
      use.set(sectorKey(track, DOS_TO_PHYSICAL[dosSector]!), value);
    for (let track = 0; track < TRACKS; track++) {
      for (let sector = 0; sector < SECTORS_PER_TRACK; sector++) {
        if (!this.isFreeInVtoc(track, sector)) mark(track, sector, { kind: "system", label: "used in VTOC" });
      }
    }
    mark(VTOC_TRACK, 0, { kind: "system", label: "VTOC" });
    for (const [track, sector] of this.catalogChain) mark(track, sector, { kind: "system", label: "catalog" });
    for (const file of this.files) {
      if (file.deleted) continue;
      try {
        const { lists, data } = this.walkFile(file);
        for (const [track, sector] of lists) mark(track, sector, { kind: "system", label: `T/S list of ${file.name}` });
        for (const entry of data) if (entry) mark(entry[0], entry[1], { kind: "file", label: file.name });
      } catch {
        // A broken file is reported by readFile; the map just leaves it out.
      }
    }
    return use;
  }
}
