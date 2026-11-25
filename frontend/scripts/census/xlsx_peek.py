"""Stream rows out of an .xlsx with only the standard library."""
import sys, zipfile, re
import xml.etree.ElementTree as ET

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
RNS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


def col_index(ref):
    letters = re.match(r"[A-Z]+", ref).group(0)
    n = 0
    for ch in letters:
        n = n * 26 + ord(ch) - 64
    return n - 1


def shared_strings(z):
    if "xl/sharedStrings.xml" not in z.namelist():
        return []
    out = []
    for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
        if el.tag == NS + "si":
            out.append("".join(t.text or "" for t in el.iter(NS + "t")))
            el.clear()
    return out


def sheets(z):
    wb = ET.parse(z.open("xl/workbook.xml")).getroot()
    rels = ET.parse(z.open("xl/_rels/workbook.xml.rels")).getroot()
    targets = {r.get("Id"): r.get("Target") for r in rels}
    result = []
    for s in wb.iter(NS + "sheet"):
        target = targets[s.get(RNS + "id")].lstrip("/")
        result.append((s.get("name"), target if target.startswith("xl/") else "xl/" + target))
    return result


def rows(z, path, strings):
    for _, el in ET.iterparse(z.open(path)):
        if el.tag == NS + "row":
            values = {}
            for c in el.iter(NS + "c"):
                v = c.find(NS + "v")
                if c.get("t") == "s" and v is not None:
                    val = strings[int(v.text)]
                elif c.get("t") == "inlineStr":
                    val = "".join(t.text or "" for t in c.iter(NS + "t"))
                else:
                    val = v.text if v is not None else None
                values[col_index(c.get("r"))] = val
            width = max(values) + 1 if values else 0
            yield [values.get(i) for i in range(width)]
            el.clear()


if __name__ == "__main__":
    path, limit = sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 8
    with zipfile.ZipFile(path) as z:
        strings = shared_strings(z)
        for name, target in sheets(z):
            print(f"=== sheet {name!r} ({target}, {z.getinfo(target).file_size:,} bytes xml)")
            for i, row in enumerate(rows(z, target, strings)):
                if i >= limit:
                    break
                print(i, row[:60])
