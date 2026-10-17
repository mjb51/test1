# Phantasie remake

A project to reverse engineer SSI's *Phantasie* (1985, Apple II) and rebuild it with the same gameplay, modern pixel-art graphics, and effects.  It is for personal use with disk images made from a copy you own.

**This repository is public.**  It holds only our own code, art, and documentation.  Original game files, and anything taken from them, stay on your machine in `original/`, `extracted/`, or `work/`, which git ignores.  See [docs/reverse-engineering.md](docs/reverse-engineering.md#ground-rules).

## Status

| Part | Status |
| --- | --- |
| Disk image tools (`src/disk`, `tools/disk.ts`) | Working.  Reads 140 KB `.dsk`, `.do`, and `.po` images in either sector order, with DOS 3.3 and RDOS file systems.  RDOS support is provisional until it is checked against a real SSI disk. |
| `.woz`, `.nib`, `.2mg`, and 13-sector images | Recognized, but not read yet |
| Game data extractors | Not started.  These depend on what the disks contain. |
| Game engine and browser front end | Not started |

## Requirements

- Node.js 22 or newer
- `npm install` to fetch TypeScript, Vitest, and tsx

## Disk tool

```sh
npm run disk -- info original/phantasie.dsk          # format, sector order, file system
npm run disk -- catalog original/phantasie.dsk       # list files
npm run disk -- extract original/phantasie.dsk extracted/disk1
npm run disk -- map original/phantasie.dsk           # which sectors hold what
npm run disk -- dump original/phantasie.dsk 0 0      # hex dump track 0, sector 0
npm run disk -- strings original/phantasie.dsk       # find text, with track/sector locations
npm run disk -- help                                 # all commands and options
```

`dump` takes DOS 3.3 sector numbers unless you add `--physical`.  The `map` columns are physical sectors.  Numbers can be decimal or hex (`$11` or `0x11`).  The `original/phantasie.dsk` paths above are examples; use your own file names.

## Development

```sh
npm run typecheck   # TypeScript, no output files
npm test            # Vitest
npm run check       # both
```

The tests use only synthetic disk images.  The DOS 3.3 results are checked against AppleCommander, an independent Apple II disk tool.  [test/fixtures/README.md](test/fixtures/README.md) explains how the fixtures were made and what they do and do not prove.

## Layout

| Path | Contents |
| --- | --- |
| `src/disk/` | Disk image library: sector orders, DOS 3.3, RDOS, text search, hex dump.  Uses no browser or Node.js APIs, so it can run in either. |
| `tools/` | Command-line tools |
| `test/` | Tests, fixtures, and fixture generators |
| `docs/` | [Reverse-engineering plan](docs/reverse-engineering.md) and [architecture](docs/architecture.md) |

## Plan

1. Survey your disk images with the disk tool and work out how the game loads.
2. Disassemble the game and document its data formats and rules in `docs/formats/`.
3. Write extractors that turn your disk images into local JSON.
4. Build the rules engine in plain TypeScript, checked against the original running in an emulator.
5. Build the browser front end with new pixel art and effects.  The engine stays platform-independent, so a desktop or mobile version can come later.
