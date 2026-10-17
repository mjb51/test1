import { Dos33Volume, scoreDos33 } from "./dos33";
import type { FileSystem } from "./filesystem";
import { IMAGE_SIZE_140K, SECTOR_SIZE, TRACKS } from "./geometry";
import { RDOS_32, RDOS_33, RdosVolume, findRdosTag } from "./rdos";
import { SectorImage, type SectorOrder } from "./sector-image";

export type ContainerKind = "sector-140k" | "sector-13" | "nibble" | "woz" | "2mg" | "unknown";

export interface OpenedDisk {
  container: ContainerKind;
  /** Present for 140 KB sector images, the only kind read so far. */
  image?: SectorImage;
  filesystem?: FileSystem;
  /** How the sector order and file system were chosen, and anything unsupported. */
  notes: string[];
}

export interface OpenOptions {
  /** Used only as a hint: ".po" suggests ProDOS order and ".do" suggests DOS order. */
  fileName?: string;
  /** Skip detection and use this order. */
  order?: SectorOrder;
}

const SIZE_13_SECTOR = TRACKS * 13 * SECTOR_SIZE; // 116,480 bytes
const SIZE_NIBBLE = TRACKS * 6656; // 232,960 bytes

function startsWith(bytes: Uint8Array, text: string): boolean {
  return Array.from(text).every((char, i) => bytes[i] === char.charCodeAt(0));
}

function orderHint(fileName: string | undefined): SectorOrder | undefined {
  const name = fileName?.toLowerCase() ?? "";
  if (name.endsWith(".po")) return "prodos";
  if (name.endsWith(".do")) return "dos";
  return undefined;
}

export function openDisk(bytes: Uint8Array, options: OpenOptions = {}): OpenedDisk {
  if (startsWith(bytes, "WOZ1") || startsWith(bytes, "WOZ2")) {
    return {
      container: "woz",
      notes: [
        "WOZ image: a bit-level copy of the original disk, usually including its copy protection.",
        "Reading WOZ images is not implemented yet.",
      ],
    };
  }
  if (startsWith(bytes, "2IMG")) {
    return { container: "2mg", notes: ["2IMG image: reading this container is not implemented yet."] };
  }
  if (bytes.length === SIZE_NIBBLE) {
    return { container: "nibble", notes: ["Nibble (.nib) image: reading nibble images is not implemented yet."] };
  }
  if (bytes.length === SIZE_13_SECTOR) {
    return { container: "sector-13", notes: ["13-sector (.d13) image: reading these is not implemented yet."] };
  }
  if (bytes.length !== IMAGE_SIZE_140K) {
    return { container: "unknown", notes: [`Unrecognized image: ${bytes.length} bytes.`] };
  }

  const notes: string[] = [];
  const hint = orderHint(options.fileName);

  if (options.order) {
    notes.push(`Sector order set to ${options.order} by option.`);
  } else {
    const dosScore = scoreDos33(new SectorImage(bytes, "dos"));
    const prodosScore = scoreDos33(new SectorImage(bytes, "prodos"));
    if (dosScore > 0 || prodosScore > 0) {
      if (dosScore !== prodosScore) {
        const order = dosScore > prodosScore ? "dos" : "prodos";
        notes.push(`DOS 3.3 catalog reads best in ${order} order (scores: dos ${dosScore}, prodos ${prodosScore}).`);
        return withFilesystem(new SectorImage(bytes, order), notes, true);
      }
      notes.push(`DOS 3.3 catalog reads equally well in both orders (score ${dosScore}).`);
    }
  }

  const order: SectorOrder = options.order ?? hint ?? "dos";
  if (!options.order) {
    notes.push(hint ? `Sector order ${order}, from the file name.` : "Sector order unknown; assuming DOS order.");
  }
  return withFilesystem(new SectorImage(bytes, order), notes, false);
}

function withFilesystem(image: SectorImage, notes: string[], knownDos33: boolean): OpenedDisk {
  const opened = (filesystem?: FileSystem): OpenedDisk =>
    filesystem ? { container: "sector-140k", image, filesystem, notes } : { container: "sector-140k", image, notes };

  if (knownDos33 || scoreDos33(image) > 0) {
    return opened(new Dos33Volume(image));
  }

  const tagged = findRdosTag(image);
  if (tagged) {
    notes.push(`Found the ${tagged.name} tag.  RDOS support is provisional; see src/disk/rdos.ts.`);
    return opened(new RdosVolume(image, tagged));
  }
  // No tag: accept RDOS only if one layout's catalog reads cleanly and starts with the system file at block 0.
  // A 13-sector catalog also reads cleanly with the 16-sector layout, so try the likelier one first.
  const variants = looksConvertedFrom13Sectors(image) ? [RDOS_32, RDOS_33] : [RDOS_33, RDOS_32];
  for (const variant of variants) {
    if (RdosVolume.score(image, variant) > 0) {
      const volume = new RdosVolume(image, variant);
      if (volume.problems.length === 0 && volume.files[0]?.startBlock === 0) {
        notes.push(`Catalog matches ${variant.name}, but no RDOS tag was found.  Treat this as a guess.`);
        return opened(volume);
      }
    }
  }

  notes.push(
    "No known file system found.  The disk may use a custom loader; use the dump, map, and strings commands to explore it.",
  );
  return opened();
}

/** Converting a 13-sector disk to a 16-sector image leaves physical sectors 13 to 15 blank on every track. */
function looksConvertedFrom13Sectors(image: SectorImage): boolean {
  for (let track = 0; track < TRACKS; track++) {
    for (let sector = 13; sector < 16; sector++) {
      const bytes = image.readPhysical(track, sector);
      if (!bytes.every((byte) => byte === bytes[0])) return false;
    }
  }
  return true;
}
