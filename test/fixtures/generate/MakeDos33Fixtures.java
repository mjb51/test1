// Builds DOS 3.3 test disks with AppleCommander so our reader is checked
// against an independent implementation.  See test/fixtures/README.md.
import com.webcodepro.applecommander.storage.Disk;
import com.webcodepro.applecommander.storage.FileEntry;
import com.webcodepro.applecommander.storage.os.dos33.DosFormatDisk;
import com.webcodepro.applecommander.storage.physical.ByteArrayImageLayout;
import com.webcodepro.applecommander.storage.physical.DosOrder;
import com.webcodepro.applecommander.storage.physical.ImageOrder;
import com.webcodepro.applecommander.storage.physical.ProdosOrder;
import java.nio.charset.StandardCharsets;

public class MakeDos33Fixtures {
    public static void main(String[] args) throws Exception {
        String outDir = args[0];
        build(outDir + "/dos33.dsk", new DosOrder(new ByteArrayImageLayout(Disk.APPLE_140KB_DISK)));
        build(outDir + "/dos33.po", new ProdosOrder(new ByteArrayImageLayout(Disk.APPLE_140KB_DISK)));
    }

    static byte[] pattern(int length, int seed) {
        byte[] data = new byte[length];
        for (int i = 0; i < length; i++) data[i] = (byte) (i * 7 + seed + (i >> 8));
        return data;
    }

    static void add(DosFormatDisk disk, String name, String type, Integer address, byte[] data, boolean locked)
            throws Exception {
        FileEntry file = disk.createFile();
        file.setFilename(name);
        file.setFiletype(type);
        if (address != null) file.setAddress(address);
        file.setFileData(data);
        file.setLocked(locked);
    }

    static void build(String path, ImageOrder order) throws Exception {
        DosFormatDisk disk = DosFormatDisk.create(path, order)[0];
        add(disk, "HELLO", "B", 0x2000, pattern(300, 3), false);
        // 35,000 bytes needs more than one track/sector list (122 sectors each).
        add(disk, "BIG FILE", "B", 0x4000, pattern(35000, 11), false);
        String text = "THE PARTY ENTERS THE DUNGEON.\rA DOOR LIES AHEAD.\r";
        add(disk, "NOTES", "T", null, text.getBytes(StandardCharsets.US_ASCII), false);
        add(disk, "LOCKED/DATA 1", "B", 0x6000, pattern(1000, 5), true);
        add(disk, "GONE", "B", 0x0800, pattern(600, 9), false);
        disk.getFile("GONE").delete();
        // Blank AppleCommander's boot sector so the fixture holds no third-party code.
        disk.writeSector(0, 0, new byte[256]);
        disk.save();
    }
}
