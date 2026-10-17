# Test fixtures

These disk images contain only made-up test data.  None of them comes from Phantasie or any other commercial disk.

| File | Made by | Contents |
| --- | --- | --- |
| `dos33.dsk` | AppleCommander 1.10.1 | DOS 3.3 disk in DOS sector order |
| `dos33.po` | AppleCommander 1.10.1 | The same disk in ProDOS sector order |
| `rdos33.dsk` | `generate/make-rdos-fixtures.ts` | Synthetic RDOS 3.3 disk (16 sectors) |
| `rdos32.dsk` | `generate/make-rdos-fixtures.ts` | Synthetic RDOS 2.1/3.2 disk (13 sectors, converted to a 16-sector image) |

Each `*.expected.json` file is AppleCommander's own reading of that image, produced by `generate/ListDisk.java`.  The tests check that our reader agrees with it.  AppleCommander is an independent, long-standing Apple II disk tool, so agreement is good evidence that the DOS 3.3 code is right.

For RDOS the evidence is weaker.  AppleCommander can read RDOS but cannot create it, so the RDOS images come from our own builder.  The tests show that our reader and AppleCommander's reader agree on the same bytes.  They do not show that either one matches a real SSI disk.

## Regenerating

AppleCommander is GPL-2.0 software.  It is used here only as a test oracle and is not a dependency of this project.  Download these jars from Maven Central into a folder outside the repository:

- `net.sf.applecommander:AppleCommander:1.10.1`
- `net.sf.applecommander:ShrinkItArchive:1.2.2`
- `net.sf.applecommander:acdasm:0.5.0`
- `net.sf.applecommander:bastools-api:0.4.0`
- `org.apache.commons:commons-csv:1.8`
- `com.google.code.gson:gson:2.8.9`

Then, from the repository root, with Java 21 or newer:

```sh
CP=$(ls /path/to/jars/*.jar | tr '\n' ':')
java -cp "$CP" test/fixtures/generate/MakeDos33Fixtures.java test/fixtures
npx tsx test/fixtures/generate/make-rdos-fixtures.ts test/fixtures
for f in dos33.dsk dos33.po rdos33.dsk rdos32.dsk; do
  java -cp "$CP" test/fixtures/generate/ListDisk.java "test/fixtures/$f" > "test/fixtures/$f.expected.json"
done
```

One finding from building these: AppleCommander 1.10.1 writes 0 in the "sector offset" field of every track/sector list after the first.  Our reader therefore counts positions in order and ignores that field.
