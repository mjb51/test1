/**
 * Command-line tool for exploring Apple II disk images.
 * Run `npm run disk -- help` for usage.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import {
  DOS_TO_PHYSICAL,
  Dos33Volume,
  PHYSICAL_TO_DOS,
  RdosVolume,
  SECTORS_PER_TRACK,
  TRACKS,
  findStrings,
  hex,
  hexdump,
  openDisk,
  sectorKey,
  type DiskFile,
  type FileSystem,
  type OpenedDisk,
  type SectorOrder,
} from "../src/disk";

const USAGE = `Usage: npm run disk -- <command> [options]

Commands:
  info <image>                    Identify the image format, sector order, and file system
  catalog <image>                 List the files on the disk
  extract <image> <out-dir>       Write every file plus a manifest.json to out-dir
  dump <image> <track> <sector>   Hex dump one sector (DOS 3.3 sector numbers)
  map <image>                     Show which sectors hold files, file system data, or other data
  strings <file>                  Find text in any file; disk images also get track/sector locations

Options:
  --order dos|prodos   Override sector order detection
  --physical           dump: treat <sector> as a physical sector number
  --raw                extract: write whole sectors instead of stripping file headers
  --min <n>            strings: minimum length (default 4)
  --ratio <0-1>        strings: fraction that must be letters or spaces (default 0.7)

Track and sector numbers accept decimal or hex with a $ or 0x prefix.`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseNumber(text: string | undefined, what: string): number {
  if (text === undefined) fail(`Missing ${what}.\n\n${USAGE}`);
  const value = /^(\$|0x)/i.test(text) ? Number.parseInt(text.replace(/^(\$|0x)/i, ""), 16) : Number(text);
  if (!Number.isInteger(value) || value < 0) fail(`Invalid ${what}: ${text}`);
  return value;
}

function load(path: string | undefined, order: SectorOrder | undefined): OpenedDisk {
  if (!path) fail(`Missing image path.\n\n${USAGE}`);
  const bytes = new Uint8Array(readFileSync(path));
  return openDisk(bytes, order ? { fileName: path, order } : { fileName: path });
}

function requireFilesystem(disk: OpenedDisk): FileSystem {
  if (!disk.filesystem) fail(["No readable file system on this image.", ...disk.notes].join("\n"));
  return disk.filesystem;
}

function describeFile(fs: FileSystem, file: DiskFile): { loadAddress?: number; length?: number; error?: string } {
  if (file.deleted) return {};
  try {
    const data = fs.readFile(file);
    return data.loadAddress === undefined
      ? { length: data.content.length }
      : { loadAddress: data.loadAddress, length: data.content.length };
  } catch (error) {
    return { error: (error as Error).message };
  }
}

function info(disk: OpenedDisk): void {
  console.log(`Container:    ${disk.container}`);
  if (disk.image) console.log(`Sector order: ${disk.image.order}`);
  console.log(`File system:  ${disk.filesystem?.name ?? "none recognized"}`);
  const fs = disk.filesystem;
  if (fs instanceof Dos33Volume) {
    const v = fs.vtoc;
    console.log(`Volume:       ${v.volume}, DOS release ${v.dosRelease}, ${fs.freeSectorCount()} sectors free`);
  }
  if (fs instanceof RdosVolume) {
    console.log(`Blocks:       ${fs.totalBlocks}`);
  }
  if (fs) console.log(`Files:        ${fs.files.filter((f) => !f.deleted).length} (+${fs.files.filter((f) => f.deleted).length} deleted)`);
  for (const note of disk.notes) console.log(`Note:         ${note}`);
  for (const problem of fs?.problems ?? []) console.log(`Problem:      ${problem}`);
}

function catalog(disk: OpenedDisk): void {
  const fs = requireFilesystem(disk);
  console.log("Lock Type Sectors  Address Length  Name");
  for (const file of fs.files) {
    const details = describeFile(fs, file);
    const address = details.loadAddress === undefined ? "" : `$${hex(details.loadAddress, 4)}`;
    const length = details.length === undefined ? "" : String(details.length);
    const suffix = details.error ? `  (error: ${details.error})` : "";
    console.log(
      `${file.locked ? " *  " : "    "} ${file.type.padEnd(4)} ${String(file.sectors).padStart(7)}  ${address.padEnd(7)} ${length.padStart(6)}  ${file.name}${suffix}`,
    );
  }
}

function safeName(name: string, used: Set<string>): string {
  const base = name.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed";
  let candidate = base;
  for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base}_${n}`;
  used.add(candidate.toLowerCase());
  return candidate;
}

function extract(disk: OpenedDisk, outDir: string | undefined, raw: boolean): void {
  if (!outDir) fail(`Missing output directory.\n\n${USAGE}`);
  const fs = requireFilesystem(disk);
  mkdirSync(outDir, { recursive: true });
  const used = new Set<string>(["manifest.json"]);
  const manifest = [];
  for (const file of fs.files) {
    if (file.deleted) continue;
    try {
      const data = fs.readFile(file);
      const bytes = raw ? data.raw : data.content;
      const output = `${safeName(file.name, used)}.${file.type}`;
      writeFileSync(join(outDir, output), bytes);
      manifest.push({
        name: file.name,
        type: file.type,
        locked: file.locked,
        sectors: file.sectors,
        loadAddress: data.loadAddress,
        length: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        output,
      });
      console.log(`${output}  (${bytes.length} bytes)`);
    } catch (error) {
      console.error(`Skipped ${file.name}: ${(error as Error).message}`);
    }
  }
  writeFileSync(
    join(outDir, "manifest.json"),
    `${JSON.stringify({ filesystem: fs.name, raw, files: manifest }, null, 2)}\n`,
  );
  console.log(`Wrote ${manifest.length} files and manifest.json to ${outDir}`);
}

function dump(disk: OpenedDisk, track: number, sector: number, physical: boolean): void {
  if (!disk.image) fail(["This image type cannot be read by sector yet.", ...disk.notes].join("\n"));
  if (track >= TRACKS || sector >= SECTORS_PER_TRACK) fail("Track or sector out of range.");
  const physicalSector = physical ? sector : DOS_TO_PHYSICAL[sector]!;
  const offset = disk.image.physicalOffset(track, physicalSector);
  console.log(
    `Track ${track} ($${hex(track)}), DOS sector ${PHYSICAL_TO_DOS[physicalSector]} ($${hex(PHYSICAL_TO_DOS[physicalSector]!)}), ` +
      `physical sector ${physicalSector} ($${hex(physicalSector)}), file offset $${hex(offset, 5)}`,
  );
  const owner = disk.filesystem?.sectorUse().get(sectorKey(track, physicalSector));
  if (owner) console.log(`Used by: ${owner.label}`);
  console.log(hexdump(disk.image.readPhysical(track, physicalSector)));
}

function map(disk: OpenedDisk): void {
  if (!disk.image) fail(["This image type cannot be read by sector yet.", ...disk.notes].join("\n"));
  const use = disk.filesystem?.sectorUse() ?? new Map();
  console.log("Columns are physical sectors.  F = file data, S = file system or reserved,");
  console.log("# = data outside any file, . = blank (every byte the same)");
  console.log(`      ${Array.from({ length: SECTORS_PER_TRACK }, (_, s) => hex(s, 1)).join("")}`);
  for (let track = 0; track < TRACKS; track++) {
    let row = "";
    for (let sector = 0; sector < SECTORS_PER_TRACK; sector++) {
      const owner = use.get(sectorKey(track, sector));
      if (owner) {
        row += owner.kind === "file" ? "F" : "S";
      } else {
        const bytes = disk.image.readPhysical(track, sector);
        row += bytes.every((b) => b === bytes[0]) ? "." : "#";
      }
    }
    console.log(`T${hex(track)}:  ${row}`);
  }
}

function strings(path: string | undefined, minLength: number, minLetterRatio: number): void {
  if (!path) fail(`Missing file path.\n\n${USAGE}`);
  const bytes = new Uint8Array(readFileSync(path));
  const disk = openDisk(bytes, { fileName: path });
  for (const found of findStrings(bytes, { minLength, minLetterRatio })) {
    let where = `$${hex(found.offset, 5)}`;
    if (disk.image) {
      const at = disk.image.locate(found.offset);
      where += ` T${hex(at.track)} S${hex(at.dos, 1)}/P${hex(at.physical, 1)} +${hex(at.byte)}`;
    }
    console.log(`${where}  ${found.highBit ? "hi" : "lo"}  ${JSON.stringify(found.text)}`);
  }
}

function main(): void {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      order: { type: "string" },
      physical: { type: "boolean", default: false },
      raw: { type: "boolean", default: false },
      min: { type: "string" },
      ratio: { type: "string" },
      help: { type: "boolean", short: "h", default: false },
    },
  });
  const [command, ...args] = positionals;
  if (values.help || !command || command === "help") {
    console.log(USAGE);
    return;
  }
  const order = values.order;
  if (order !== undefined && order !== "dos" && order !== "prodos") fail(`--order must be dos or prodos, not ${order}`);

  switch (command) {
    case "info":
      return info(load(args[0], order));
    case "catalog":
      return catalog(load(args[0], order));
    case "extract":
      return extract(load(args[0], order), args[1], values.raw);
    case "dump":
      return dump(load(args[0], order), parseNumber(args[1], "track"), parseNumber(args[2], "sector"), values.physical);
    case "map":
      return map(load(args[0], order));
    case "strings": {
      const ratio = values.ratio === undefined ? 0.7 : Number(values.ratio);
      if (!(ratio >= 0 && ratio <= 1)) fail(`--ratio must be between 0 and 1, not ${values.ratio}`);
      return strings(args[0], values.min === undefined ? 4 : parseNumber(values.min, "--min"), ratio);
    }
    default:
      fail(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

// Exit quietly when output is piped into a command that stops reading, such as head.
process.stdout.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});
main();
