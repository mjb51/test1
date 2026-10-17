/**
 * Geometry of a standard Apple II 5.25-inch, 16-sector disk.
 *
 * A "physical" sector number is the number written in the sector's address
 * field on the disk itself.  Operating systems number sectors differently
 * ("logical" sectors) to get a software interleave, and disk image files are
 * stored in one of those logical orders.
 */

export const TRACKS = 35;
export const SECTORS_PER_TRACK = 16;
export const SECTOR_SIZE = 256;
export const BLOCK_SIZE = 512;
export const TRACK_SIZE = SECTORS_PER_TRACK * SECTOR_SIZE;
export const IMAGE_SIZE_140K = TRACKS * TRACK_SIZE; // 143,360 bytes
export const TOTAL_SECTORS = TRACKS * SECTORS_PER_TRACK; // 560

/** DOS 3.3 logical sector number to physical sector number. */
export const DOS_TO_PHYSICAL: readonly number[] = [0, 13, 11, 9, 7, 5, 3, 1, 14, 12, 10, 8, 6, 4, 2, 15];

/**
 * ProDOS logical sector number to physical sector number.  ProDOS block N
 * within a track is made of ProDOS logical sectors 2N and 2N + 1.
 */
export const PRODOS_TO_PHYSICAL: readonly number[] = [0, 2, 4, 6, 8, 10, 12, 14, 1, 3, 5, 7, 9, 11, 13, 15];

export function invert(table: readonly number[]): number[] {
  const inverse = new Array<number>(table.length);
  table.forEach((value, index) => {
    inverse[value] = index;
  });
  return inverse;
}

export const PHYSICAL_TO_DOS: readonly number[] = invert(DOS_TO_PHYSICAL);
export const PHYSICAL_TO_PRODOS: readonly number[] = invert(PRODOS_TO_PHYSICAL);

export function hex(value: number, digits = 2): string {
  return value.toString(16).toUpperCase().padStart(digits, "0");
}
