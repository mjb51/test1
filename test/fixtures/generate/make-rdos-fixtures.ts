// Writes the synthetic RDOS fixtures.  Run from the repository root:
//   npx tsx test/fixtures/generate/make-rdos-fixtures.ts test/fixtures
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { RDOS_32, RDOS_33, SECTOR_SIZE, SectorImage, type RdosVariant } from "../../../src/disk";
import { buildRdosImage, pattern } from "../../helpers/rdos-builder";

const outDir = process.argv[2] ?? "test/fixtures";

const files = [
  { name: "GAME LOADER", type: "B" as const, address: 0x0800, data: pattern(700, 1) },
  // Long enough to cross a track boundary in both layouts.
  { name: "MONSTER DATA", type: "B" as const, address: 0x4000, data: pattern(20 * SECTOR_SIZE + 17, 2) },
  { name: "INTRO TEXT", type: "T" as const, address: 0, data: new TextEncoder().encode("WELCOME, ADVENTURER.\r") },
];

const build = (variant: RdosVariant, systemName: string, file: string) => {
  const extraTag = variant === RDOS_32;
  const bytes = buildRdosImage(variant, systemName, files);
  if (extraTag) {
    // The tag that 13-to-16-sector conversion adds: track 0, physical sector 4, offset $E0.
    const tag = "RDOS 2.1 CONVERTED";
    const at = new SectorImage(bytes, "dos").physicalOffset(0, 4) + 0xe0;
    for (let i = 0; i < tag.length; i++) bytes[at + i] = tag.charCodeAt(i) | 0x80;
  }
  writeFileSync(join(outDir, file), bytes);
};

build(RDOS_33, "RDOS 3.3 TEST SYSTEM", "rdos33.dsk");
build(RDOS_32, "RDOS 2.1 TEST SYSTEM", "rdos32.dsk");
