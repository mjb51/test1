import { describe, expect, it } from "vitest";
import { RDOS_32, RDOS_33, RdosVolume, findRdosTag, openDisk } from "../src/disk";
import { readExpected, readFixture, sha256 } from "./helpers/fixtures";

// These fixtures are synthetic (test/helpers/rdos-builder.ts); the expected
// listings come from AppleCommander's RDOS reader.  Neither has been checked
// against a real SSI disk yet.
const cases = [
  { fixture: "rdos33.dsk", variant: RDOS_33 },
  { fixture: "rdos32.dsk", variant: RDOS_32 },
];

describe.each(cases)("RDOS fixture $fixture", ({ fixture, variant }) => {
  const bytes = readFixture(fixture);
  const expected = readExpected(fixture);

  it("is recognized by its tag", () => {
    const disk = openDisk(bytes, { fileName: fixture });
    expect(disk.filesystem).toBeInstanceOf(RdosVolume);
    expect((disk.filesystem as RdosVolume).variant).toBe(variant);
    expect(findRdosTag(disk.image!)).toBe(variant);
  });

  it("reads the same files as AppleCommander", () => {
    const volume = openDisk(bytes, { fileName: fixture }).filesystem as RdosVolume;
    expect(volume.problems).toEqual([]);
    expect(volume.files.map((file) => file.deleted)).toEqual(expected.files.map((file) => file.deleted));
    volume.files.forEach((file, i) => {
      const want = expected.files[i]!;
      if (file.deleted) return;
      expect(file.name).toBe(want.name);
      expect(file.type).toBe(want.type);
      expect(file.loadAddress).toBe(want.address);
      expect(sha256(volume.readFile(file).content)).toBe(want.sha256);
    });
  });

  it("is still recognized from its catalog when the tag is missing", () => {
    const untagged = bytes.slice();
    const image = openDisk(untagged).image!;
    // The RDOS 3.3 tag is the start of the system file's name, so rename it rather than erase it.
    untagged[image.physicalOffset(1, 0)] = "X".charCodeAt(0) | 0x80;
    untagged.fill(0, image.physicalOffset(0, 4) + 0xe0, image.physicalOffset(0, 4) + 0x100);
    const disk = openDisk(untagged);
    expect(findRdosTag(disk.image!)).toBeUndefined();
    expect(disk.filesystem).toBeInstanceOf(RdosVolume);
    expect((disk.filesystem as RdosVolume).variant).toBe(variant);
    expect(disk.notes.join(" ")).toMatch(/guess/);
  });
});
