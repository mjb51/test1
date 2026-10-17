import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES } from "./helpers/fixtures";

const run = (...args: string[]) =>
  execFileSync(process.execPath, ["--import", "tsx", "tools/disk.ts", ...args], { encoding: "utf8" });

describe("disk CLI", () => {
  const image = join(FIXTURES, "dos33.dsk");

  it("prints info and a catalog", () => {
    expect(run("info", image)).toMatch(/File system:\s+DOS 3\.3/);
    const catalog = run("catalog", image);
    expect(catalog).toMatch(/B\s+139\s+\$4000\s+35000\s+BIG FILE/);
    expect(catalog).toMatch(/ \*\s+B .*LOCKED\/DATA 1/);
  });

  it("extracts files with a manifest", () => {
    const out = mkdtempSync(join(tmpdir(), "disk-cli-"));
    try {
      run("extract", image, out);
      const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
      expect(manifest.files.map((f: { output: string }) => f.output)).toEqual([
        "HELLO.B",
        "BIG_FILE.B",
        "NOTES.T",
        "LOCKED_DATA_1.B",
      ]);
      expect(readFileSync(join(out, "HELLO.B")).length).toBe(300);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });

  it("dumps a sector and draws a map", () => {
    expect(run("dump", image, "17", "0")).toMatch(/Used by: VTOC/);
    expect(run("dump", image, "$11", "0")).toMatch(/Track 17 \(\$11\)/);
    expect(run("map", image).split("\n")[3]).toMatch(/^T00:/);
  });

  it("finds text with disk locations", () => {
    expect(run("strings", image)).toMatch(/T\w\w S\w\/P\w \+\w\w\s+hi\s+"THE PARTY ENTERS THE DUNGEON\./);
  });
});
