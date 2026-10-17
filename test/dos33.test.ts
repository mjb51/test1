import { describe, expect, it } from "vitest";
import { Dos33Volume, SectorImage, openDisk, scoreDos33 } from "../src/disk";
import { readExpected, readFixture, sha256 } from "./helpers/fixtures";

// The fixtures were written by AppleCommander, an independent DOS 3.3 implementation.
const cases = [
  { fixture: "dos33.dsk", order: "dos" },
  { fixture: "dos33.po", order: "prodos" },
] as const;

describe.each(cases)("DOS 3.3 fixture $fixture", ({ fixture, order }) => {
  const bytes = readFixture(fixture);
  const expected = readExpected(fixture);

  it("detects the file system and sector order without a file name hint", () => {
    const disk = openDisk(bytes);
    expect(disk.filesystem?.name).toBe(expected.format);
    expect(disk.image?.order).toBe(order);
  });

  it("lists the same files as AppleCommander", () => {
    const volume = openDisk(bytes).filesystem as Dos33Volume;
    expect(volume.problems).toEqual([]);
    expect(volume.files.map(({ name, type, locked, deleted }) => ({ name, type, locked, deleted }))).toEqual(
      expected.files.map(({ name, type, locked, deleted }) => ({ name, type, locked, deleted })),
    );
  });

  it("reads the same file contents and load addresses as AppleCommander", () => {
    const volume = openDisk(bytes).filesystem as Dos33Volume;
    volume.files.forEach((file, i) => {
      const want = expected.files[i]!;
      if (file.deleted) {
        expect(() => volume.readFile(file)).toThrow(/deleted/);
        return;
      }
      const data = volume.readFile(file);
      expect(sha256(data.content)).toBe(want.sha256);
      expect(data.content.length).toBe(want.length);
      if (file.type === "B") expect(data.loadAddress).toBe(want.address);
    });
  });

  it("counts the same free sectors as AppleCommander", () => {
    const volume = openDisk(bytes).filesystem as Dos33Volume;
    expect(volume.freeSectorCount()).toBe(expected.freeSectors);
  });

  it("scores the wrong sector order lower", () => {
    const wrong = order === "dos" ? "prodos" : "dos";
    expect(scoreDos33(new SectorImage(bytes, order))).toBeGreaterThan(scoreDos33(new SectorImage(bytes, wrong)));
  });
});

describe("Dos33Volume", () => {
  it("refuses an image with no VTOC", () => {
    expect(() => new Dos33Volume(new SectorImage(new Uint8Array(143360), "dos"))).toThrow(/VTOC/);
  });

  it("marks catalog, track/sector lists, and file data in the sector map", () => {
    const volume = openDisk(readFixture("dos33.dsk")).filesystem as Dos33Volume;
    const labels = new Set(Array.from(volume.sectorUse().values(), (use) => use.label));
    expect(labels).toContain("VTOC");
    expect(labels).toContain("catalog");
    expect(labels).toContain("T/S list of BIG FILE");
    expect(labels).toContain("BIG FILE");
  });
});
