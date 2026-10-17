import { hex } from "./geometry";
import { isPrintable } from "./text";

/** Classic 16-bytes-per-line hex dump with an Apple II text column (high bits stripped). */
export function hexdump(bytes: Uint8Array, baseAddress = 0): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.subarray(offset, offset + 16);
    const hexPart = Array.from(row, (byte) => hex(byte)).join(" ");
    const textPart = Array.from(row, (byte) => (isPrintable(byte) ? String.fromCharCode(byte & 0x7f) : ".")).join("");
    lines.push(`${hex(baseAddress + offset, 4)}: ${hexPart.padEnd(47)}  ${textPart}`);
  }
  return lines.join("\n");
}
