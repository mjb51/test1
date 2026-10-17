import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const FIXTURES = join(import.meta.dirname, "..", "fixtures");

export function readFixture(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(FIXTURES, name)));
}

/** AppleCommander's listing of a fixture, written by test/fixtures/generate/ListDisk.java. */
export interface ExpectedListing {
  format: string;
  freeSectors?: number;
  files: Array<{
    name: string;
    type: string;
    locked: boolean;
    deleted: boolean;
    address?: number;
    length?: number;
    sha256?: string;
  }>;
}

export function readExpected(name: string): ExpectedListing {
  return JSON.parse(readFileSync(join(FIXTURES, `${name}.expected.json`), "utf8")) as ExpectedListing;
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
