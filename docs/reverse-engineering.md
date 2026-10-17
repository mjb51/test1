# Reverse-engineering plan

The goal is to learn exactly how Phantasie (SSI, 1985, Apple II) works: its data formats, its rules, and its formulas.  The remake can then play the same way with new graphics.  This document is the plan.  Findings go in `docs/formats/` as they are confirmed.

## Ground rules

- **This repository is public.**  Never commit the disk images or anything taken from them.  That includes extracted files, memory dumps, disassembly listings, screenshots, and dumps of the game's text or tables.  Keep all of that in `original/`, `extracted/`, or `work/`, which `.gitignore` already excludes.
- What *can* be committed is our own work: tools, the engine, new art, and written descriptions of file formats and rules in our own words.
- Use disk images made from a copy you own.  This project does not download them.
- I am not a lawyer, and this is not legal advice.  Making the repository private would remove most of the risk of an accidental push.

## What to gather first

1. **The disk images**, and the format of each (`.dsk`, `.do`, `.po`, `.woz`, `.nib`, or `.2mg`).  The tools read `.dsk`, `.do`, and `.po` today.  A `.woz` image is a bit-level copy that usually keeps the original copy protection.  Supporting it is a separate piece of work, so it helps to know early whether that is what you have.
2. **The manual and any reference card.**  They give the intended rules: races, classes, spells, prices, and so on.  They are the easiest way to check what the disassembly says.
3. **The version** shown on the title screen or the disk label, if any.  Different releases may differ.

## Phase 1: Survey the disks

Run the disk tool on each image (see the README for commands):

- `info` reports the image container, the sector order, and the file system.  SSI often used its own RDOS format on the Apple II, but I am not certain which format Phantasie uses.  It may also use a custom loader with no file system at all.
- `catalog` and `extract` work when the disk has DOS 3.3 or RDOS.
- `map` shows which sectors belong to files and which hold data outside any file.  Data outside any file usually means the game reads those sectors directly.
- `strings` finds readable text and gives its track and sector.  Monster names, spell names, and messages point to where tables live.  If little text turns up, the game probably compresses or encodes it, and finding that encoding becomes an early task.

## Phase 2: Find how the game loads

On a 16-sector Apple II, the Disk II controller's boot ROM loads track 0, sector 0 into memory at `$0800` and runs it.  From there the game's own loader reads the rest.  Two complementary ways in:

- **Static:** follow the boot code with a 6502 disassembler (Ghidra supports the 6502) until the loader's sector reads are clear.
- **Dynamic:** run the game in an emulator with a debugger (AppleWin and MAME both have one).  Save memory snapshots in each part of the game: town, overland, dungeon, and combat.  Snapshots show code and data exactly as the game uses them, which is often easier than decoding the disk layout.

## Phase 3: Map the code and data

Disassemble the snapshots, name the routines, and look for these:

| Area | What to find |
| --- | --- |
| Characters | Record layout: name, race, class, attributes, hit points, level, experience, gold, equipment, spells, age |
| Tables | Races, classes, monsters, weapons, armor, items, spells, prices, experience levels |
| Maps | Overland, town, and dungeon map encodings, and how explored squares are tracked |
| Rules | Combat order, hit and damage formulas, spell effects, training and leveling, aging, treasure |
| Random numbers | The generator itself, so that results can be compared one roll at a time |
| Text | Message storage and any compression |
| Graphics | Tile and picture formats, as reference for the new art (not to be copied into the repository) |

## Phase 4: Write it down and extract it

For each confirmed structure:

1. Describe it in `docs/formats/<name>.md`, in our own words, with offsets and field meanings.
2. Add an extractor under `src/extract/` that reads it from the user's disk image and writes JSON to `extracted/`.
3. Add tests that use synthetic data built to the documented layout, never real game data.

## Phase 5: Check the remake against the original

Rebuild each rule in the engine, then compare.  With the same random-number state, the remake and the original running in the emulator should give the same results.  Where the remake knowingly changes something, such as a quality-of-life improvement, record the change.

## Known unknowns

- Which file system or loader the Apple II disks use.
- Whether your images keep copy protection.
- Whether text and maps are compressed.
