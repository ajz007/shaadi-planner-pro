"""Build the read-only web example from the English v1.3.1 launch package."""

import io
import json
import re
import sys
import xml.etree.ElementTree as ET
from datetime import date, timedelta
from pathlib import Path
from zipfile import ZipFile

NS = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
EPOCH = date(1899, 12, 30)
DESTINATION = Path(__file__).parent / "web"


def sheet_rows(workbook, path, strings):
    sheet = ET.fromstring(workbook.read(path))
    rows = {}
    for row in sheet.findall("x:sheetData/x:row", NS):
        cells = {}
        for cell in row.findall("x:c", NS):
            value = cell.findtext("x:v", namespaces=NS)
            if value is not None:
                column = re.sub(r"\d", "", cell.attrib["r"])
                cells[column] = strings[int(value)] if cell.get("t") == "s" else value
        rows[int(row.attrib["r"])] = cells
    return rows


def formatted(value, heading, label):
    if not value:
        return ""
    if "phone" in heading.lower() or heading in {"Mobile Number", "Vehicle No."} or (
        heading == "Value" and any(word in label.lower() for word in ("phone", "mobile", "email"))
    ):
        return "Hidden in web example"
    if re.fullmatch(r"\d{5}", value) and (
        heading in {"Check-in", "Check-out", "Last Contact", "Final Due"}
        or "Date" in heading
        or (heading == "Value" and label == "Wedding Date")
    ):
        return (EPOCH + timedelta(days=int(value))).isoformat()
    if heading == "% Complete":
        return f"{float(value):.0%}"
    return value


def main(package):
    with ZipFile(package) as launch:
        filled = next(name for name in launch.namelist() if name.endswith("_DEMO.xlsx"))
        with ZipFile(io.BytesIO(launch.read(filled))) as workbook:
            strings = [
                "".join(node.text or "" for node in item.findall(".//x:t", NS))
                for item in ET.fromstring(workbook.read("xl/sharedStrings.xml"))
            ]
            relations = {
                item.get("Id"): item.get("Target")
                for item in ET.fromstring(workbook.read("xl/_rels/workbook.xml.rels"))
            }
            sheets = ET.fromstring(workbook.read("xl/workbook.xml")).findall("x:sheets/x:sheet", NS)
            tables = []
            dashboard = {}
            index = []
            for sheet in sheets:
                if sheet.get("state", "visible") != "visible":
                    continue
                name = sheet.attrib["name"]
                relation = next(value for key, value in sheet.attrib.items() if key.endswith("}id"))
                path = relations[relation]
                rows = sheet_rows(workbook, path.lstrip("/") if path.startswith("/") else "xl/" + path, strings)
                if name == "Start Here":
                    index = [
                        {"name": row["A"], "purpose": row["B"], "when": row["C"]}
                        for number, row in rows.items()
                        if number > 6 and row.get("D") == "Open" and row.get("A")
                    ]
                    continue
                if name == "Dashboard":
                    for number in (4, 7, 10):
                        for label, value in (("A", "B"), ("D", "E"), ("G", "H"), ("J", "K")):
                            dashboard[rows[number][label]] = int(rows[number][value])
                    continue
                headers = rows[4]
                anchor = {
                    "Functions & Events": "B", "Guest List": "B", "Transportation": "C",
                    "Wedding Timeline": "D",
                }.get(name, "A")
                records = [
                    [formatted(row.get(col, ""), heading, row.get("A", "")) for col, heading in headers.items()]
                    for number, row in rows.items()
                    if number > 4 and row.get(anchor)
                ]
                tables.append({
                    "name": name, "description": rows[2].get("A", ""),
                    "columns": list(headers.values()), "rows": records,
                })

    data = {"index": index, "metrics": dashboard, "tables": tables}
    (DESTINATION / "src" / "workbook-demo.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main(Path(sys.argv[1]))
