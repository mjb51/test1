# Architecture

The remake keeps three things apart: the original game's content, which comes only from the player's own disk images; the rules engine; and the presentation.  Each part can then change without touching the others.

```
your disk image ──▶ src/disk ──▶ src/extract ──▶ game data (JSON, local only)
                                                      │
                                                      ▼
                    new pixel art ──▶ src/web ◀── src/engine
```

## Layers

| Folder | Status | Purpose |
| --- | --- | --- |
| `src/disk` | Working | Reads Apple II disk images: sector orders, DOS 3.3, and RDOS (provisional) |
| `src/extract` | Planned | Turns the game's own data formats into JSON, once Phase 3 of the reverse-engineering plan finds them |
| `src/engine` | Planned | The rules: party, combat, magic, maps, towns, and saving.  Deterministic, driven by a seeded random-number generator |
| `src/web` | Planned | Drawing, animation, effects, sound, and input in the browser |
| `tools` | Working | Command-line tools for reverse engineering |

## Rules that keep it portable

- `src/disk`, `src/extract`, and `src/engine` use only standard JavaScript.  They take and return plain data such as `Uint8Array` and plain objects.  They never touch the DOM or Node.js APIs.  The same code can run in a browser, in Node.js, or inside a desktop or mobile wrapper later.
- Only `src/web` and `tools` touch a platform.  Moving to a different platform later means replacing that layer, not the game.
- The engine produces state and events, and the presentation layer decides how to show them.  This is what lets the graphics be modern while the rules stay faithful.

## Original content stays local

In the finished game, the player chooses their own disk image file.  Extraction runs on their machine, in the browser, and nothing is uploaded.  The repository holds only our code, our art, and our documentation.

## Testing

- Every module has unit tests (`npm test`) that use synthetic data only.
- Disk-format code is checked against AppleCommander, an independent implementation (see `test/fixtures/README.md`).
- Engine rules will be checked against the original running in an emulator, as described in Phase 5 of `docs/reverse-engineering.md`.
