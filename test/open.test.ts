import { describe, expect, it } from "vitest";
import { IMAGE_SIZE_140K, openDisk } from "../src/disk";

describe("openDisk", () => {
  it("recognizes but does not yet read WOZ images", () => {
    const disk = openDisk(new TextEncoder().encode("WOZ2\xff\n\r\n"));
    expect(disk.container).toBe("woz");
    expect(disk.image).toBeUndefined();
  });

  it("reports unknown sizes", () => {
    expect(openDisk(new Uint8Array(1234)).container).toBe("unknown");
  });

  it("opens a blank 140 KB image without a file system", () => {
    const disk = openDisk(new Uint8Array(IMAGE_SIZE_140K));
    expect(disk.container).toBe("sector-140k");
    expect(disk.filesystem).toBeUndefined();
    expect(disk.notes.join(" ")).toMatch(/custom loader/);
  });

  it("uses the file name only as an order hint", () => {
    expect(openDisk(new Uint8Array(IMAGE_SIZE_140K), { fileName: "game.po" }).image?.order).toBe("prodos");
    expect(openDisk(new Uint8Array(IMAGE_SIZE_140K), { fileName: "game.dsk" }).image?.order).toBe("dos");
  });
});
