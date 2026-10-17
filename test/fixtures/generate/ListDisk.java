// Prints AppleCommander's view of a disk image as JSON, used as the expected
// output in our tests.  See test/fixtures/README.md.
import com.webcodepro.applecommander.storage.Disk;
import com.webcodepro.applecommander.storage.FileEntry;
import com.webcodepro.applecommander.storage.FormattedDisk;
import com.webcodepro.applecommander.storage.os.dos33.DosFormatDisk;
import java.security.MessageDigest;
import java.util.HexFormat;

public class ListDisk {
    public static void main(String[] args) throws Exception {
        FormattedDisk disk = new Disk(args[0]).getFormattedDisks()[0];
        StringBuilder out = new StringBuilder("{\n");
        out.append("  \"format\": \"").append(disk.getFormat()).append("\",\n");
        if (disk instanceof DosFormatDisk dos) out.append("  \"freeSectors\": ").append(dos.getFreeSectors()).append(",\n");
        out.append("  \"files\": [\n");
        boolean first = true;
        for (FileEntry file : disk.getFiles()) {
            if (!first) out.append(",\n");
            first = false;
            out.append("    { \"name\": \"").append(file.getFilename().replace("\"", "\\\""))
               .append("\", \"type\": \"").append(file.getFiletype())
               .append("\", \"locked\": ").append(file.isLocked())
               .append(", \"deleted\": ").append(file.isDeleted());
            if (!file.isDeleted()) {
                byte[] data = file.getFileData();
                String sha = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
                out.append(", \"address\": ").append(file.needsAddress() ? file.getAddress() : 0)
                   .append(", \"length\": ").append(data.length)
                   .append(", \"sha256\": \"").append(sha).append("\"");
            }
            out.append(" }");
        }
        out.append("\n  ]\n}\n");
        System.out.print(out);
    }
}
