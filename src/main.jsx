
import React, { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarPlus, Upload, Download, RotateCcw, CheckCircle2, XCircle } from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./style.css";

GlobalWorkerOptions.workerSrc = pdfWorker;

const KNOWN_WORKS = [
  "Parsifal", "Carmen", "Elias", "Giovanni", "Traviata", "Zauberflöte", "Zauberfloete",
  "Strawinsky", "Opernball", "Karmelitinnen", "Konzert", "Opernball", "Don Giovanni"
];

const WEEKLY_DATE_RE = /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(\d{4})/i;
const MONTHLY_LINE_RE = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d{1,2})\.(\d{1,2})\.\s*(.*)$/i;
const TIME_RE = /^(\d{1,2})[.:](\d{2})\s+(.+)$/;
const MONTHS_DE = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12"
};

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}
function pad(n) {
  return String(n).padStart(2, "0");
}
function defaultEnd(date, start, long = false) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(`${date}T${pad(h)}:${pad(m)}:00`);
  d.setMinutes(d.getMinutes() + (long ? 180 : 120));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function extractWork(text) {
  const t = clean(text);
  for (const work of KNOWN_WORKS) {
    const re = new RegExp(`\\b${work}\\b`, "i");
    if (re.test(t)) return work === "Zauberfloete" ? "Zauberflöte" : work;
  }
  const nach = t.match(/Nachstudium\s+([A-Za-zÄÖÜäöü0-9.]+)/i);
  if (nach) return nach[1];
  const left = t.split(" - ")[0].trim();
  const tokens = left.split(/\s+/).filter(Boolean);
  return tokens[tokens.length - 1] || "Dienst";
}
function detectGender(text) {
  const t = clean(text).toLowerCase();
  if (/(alle\s+herren|\bherren\b|männer|maenner)/i.test(t)) return "남자";
  if (/(alle\s+damen|\bdamen\b|frauen|blumenmädchen|blumenmaedchen)/i.test(t)) return "여자";
  if (/(alle|alle\s+eingeteilten|chor tutti|sinfoniechor)/i.test(t)) return "전체";
  return "개별/기타";
}
function includesNameOrSurname(event, firstName, lastName) {
  const hay = `${event.title} ${event.note} ${event.group}`.toLowerCase();
  const tokens = [firstName, lastName].map(clean).filter(Boolean).map(v => v.toLowerCase());
  return tokens.some(token => hay.includes(token));
}
function parseWeeklyDetails(text) {
  const parts = clean(text).split(/\s+/);
  const location = parts[0] || "";
  const body = parts.slice(1).join(" ");
  const noCoach = body.replace(/\s+(Becker\/Kim|Hoffmann\/Kim|Hoffmann\/Becker\/Kim|Gatti\/Becker\/Kim|Becker|Kim|Hoffmann|Gatti)$/i, "").trim();
  const [left, right = ""] = noCoach.split(/\s+-\s+/);
  const work = extractWork(left);
  const gender = detectGender(right || left);
  return {
    location,
    title: clean(left),
    note: clean(noCoach),
    target: clean(right),
    work,
    gender,
    group: [gender, clean(right)].filter(Boolean).join(" · ")
  };
}
function eventKey(event) {
  return `${event.date}|${event.start}|${event.end}`;
}
function stableId(event) {
  return `${event.date}_${event.start}_${event.end}_${event.title}_${event.group}_${event.location}`
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}
function shouldBeLongEvent(text) {
  return /Vorstellung|Konzert|Opernball|Giovanni|Parsifal|Traviata|Karmelitinnen|Zauberflöte|Zauberfloete/i.test(text);
}
function linePassesVisibleSelection(line, selectedWorks, genderFilter, profile) {
  if (!line.works.some(work => selectedWorks.includes(work))) return false;
  const text = `${line.text} ${line.group || ""}`;
  const gender = detectGender(text);
  if (includesNameOrSurname({ title: line.text, note: line.text, group: line.group || "" }, profile.firstName, profile.lastName)) return true;
  if (!genderFilter) return true;
  if (genderFilter === "남자" && gender === "여자") return false;
  if (genderFilter === "여자" && gender === "남자") return false;
  return true;
}
function eventIncluded(event, selectedWorks, genderFilter, profile, excludedIds) {
  if (!selectedWorks.includes(event.work)) return false;
  if (excludedIds.includes(event.id)) return false;
  if (includesNameOrSurname(event, profile.firstName, profile.lastName)) return true;
  if (!genderFilter) return true;
  if (genderFilter === "남자" && event.gender === "여자") return false;
  if (genderFilter === "여자" && event.gender === "남자") return false;
  return true;
}
function escapeICS(text) {
  return String(text || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}
function makeICS(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SemperPlan//Schedule Export//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SemperPlan"
  ];
  for (const e of events) {
    const [y, m, d] = e.date.split("-");
    const [sh, sm] = e.start.split(":");
    const [eh, em] = e.end.split(":");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${stableId(e)}@semperplan.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${y}${m}${d}T${sh}${sm}00`,
      `DTEND:${y}${m}${d}T${eh}${em}00`,
      `SUMMARY:${escapeICS(e.title)}`,
      e.location ? `LOCATION:${escapeICS(e.location)}` : "",
      `DESCRIPTION:${escapeICS([e.note ? `비고: ${e.note}` : "", e.group ? `대상: ${e.group}` : "", e.sourceName ? `출처: ${e.sourceName}` : ""].filter(Boolean).join("\\n"))}`,
      "END:VEVENT"
    );
  }
  lines.push("END:VCALENDAR");
  return lines.filter(Boolean).join("\r\n");
}
function downloadText(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
function mergeSchedules(previous, incoming, weeklyOverride = true) {
  if (!weeklyOverride) return [...previous, ...incoming];
  const next = [...previous];
  for (const event of incoming) {
    const existingIndex = next.findIndex(e => eventKey(e) === eventKey(event));
    if (existingIndex === -1) {
      next.push(event);
      continue;
    }
    const existing = next[existingIndex];
    const shouldReplace =
      event.sourceType === "weekly" &&
      event.isFirstWeek &&
      existing.uploadIndex < event.uploadIndex;
    if (shouldReplace) {
      next[existingIndex] = { ...event, replacementReason: `${existing.sourceName} 일정이 최신 주간 첫 주 일정으로 대체됨` };
    } else {
      const sameAll =
        existing.title === event.title &&
        existing.location === event.location &&
        existing.group === event.group &&
        existing.note === event.note;
      if (!sameAll) next.push(event);
    }
  }
  return next;
}
function markFirstWeek(events, sourceType) {
  if (sourceType !== "weekly" || !events.length) return events;
  const dates = events.map(e => new Date(`${e.date}T00:00:00`)).sort((a, b) => a - b);
  const first = dates[0];
  const end = new Date(first);
  end.setDate(end.getDate() + 7);
  return events.map(e => {
    const d = new Date(`${e.date}T00:00:00`);
    return { ...e, isFirstWeek: d >= first && d < end };
  });
}

async function processPdf(file, sourceType, uploadIndex) {
  const sourceName = file.name;
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const docs = [];
  const parsedEvents = [];
  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let currentWeeklyDate = "";
  const monthlyYearGuess = (file.name.match(/(20\d{2})/) || [])[1] || String(new Date().getFullYear());

  const pages = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const scale = 1.6;
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const imageUrl = canvas.toDataURL("image/png");

    const content = await page.getTextContent();
    const items = content.items
      .map((item, idx) => ({
        id: `${docId}-p${pageNum}-i${idx}`,
        str: clean(item.str),
        x: item.transform[4] * scale,
        y: item.transform[5] * scale,
        w: (item.width || 30) * scale,
        h: (item.height || 10) * scale
      }))
      .filter(item => item.str);

    const rowMap = new Map();
    for (const item of items) {
      const key = Math.round(item.y / 6) * 6;
      if (!rowMap.has(key)) rowMap.set(key, []);
      rowMap.get(key).push(item);
    }

    const rows = Array.from(rowMap.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([key, rowItems], rowIndex) => {
        const sorted = rowItems.sort((a, b) => a.x - b.x);
        const minX = Math.min(...sorted.map(v => v.x));
        const maxX = Math.max(...sorted.map(v => v.x + v.w));
        const maxH = Math.max(...sorted.map(v => v.h), 16);
        const top = viewport.height - key - maxH;
        return {
          id: `${docId}-p${pageNum}-row${rowIndex}`,
          text: clean(sorted.map(v => v.str).join(" ")),
          x: Math.max(8, minX - 6),
          y: Math.max(8, top - 6),
          w: Math.min(viewport.width - 16, maxX - minX + 12),
          h: Math.max(22, maxH + 12),
          works: [],
          group: ""
        };
      })
      .filter(row => row.text);

    for (const row of rows) {
      if (sourceType === "monthly") {
        const match = row.text.match(MONTHLY_LINE_RE);
        if (!match) continue;
        const day = pad(match[2]);
        const month = pad(match[3]);
        const date = `${monthlyYearGuess}-${month}-${day}`;
        const rest = clean(match[4]);
        if (/chorfrei/i.test(rest) && !/\d{1,2}[.:]\d{2}/.test(rest)) continue;

        const timeSegments = [...rest.matchAll(/(\d{1,2})[.:](\d{2})\s+([^0-9]+)/g)];
        if (timeSegments.length > 0) {
          for (let i = 0; i < timeSegments.length; i++) {
            const seg = timeSegments[i];
            const start = `${pad(seg[1])}:${seg[2]}`;
            const segTextStart = seg.index + seg[0].indexOf(seg[3]);
            const segTextEnd = timeSegments[i + 1]?.index ?? rest.length;
            const detail = clean(rest.slice(segTextStart, segTextEnd));
            const event = {
              id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              date,
              start,
              end: defaultEnd(date, start, shouldBeLongEvent(detail)),
              title: detail,
              location: "",
              note: detail,
              group: detectGender(detail),
              gender: detectGender(detail),
              work: extractWork(detail),
              sourceType,
              sourceName,
              uploadIndex,
              isFirstWeek: false,
              lineId: row.id
            };
            parsedEvents.push(event);
            row.works.push(event.work);
            row.group = event.group;
          }
        } else if (rest && !/chorfrei/i.test(rest)) {
          const event = {
            id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            date,
            start: "09:00",
            end: "11:00",
            title: rest,
            location: "",
            note: rest,
            group: detectGender(rest),
            gender: detectGender(rest),
            work: extractWork(rest),
            sourceType,
            sourceName,
            uploadIndex,
            isFirstWeek: false,
            lineId: row.id
          };
          parsedEvents.push(event);
          row.works.push(event.work);
          row.group = event.group;
        }
      } else {
        const dateMatch = row.text.match(WEEKLY_DATE_RE);
        if (dateMatch) {
          currentWeeklyDate = `${dateMatch[4]}-${MONTHS_DE[dateMatch[3].toLowerCase()] || "01"}-${pad(dateMatch[2])}`;
          continue;
        }
        const timeMatch = row.text.match(TIME_RE);
        if (!timeMatch || !currentWeeklyDate) continue;
        const start = `${pad(timeMatch[1])}:${timeMatch[2]}`;
        const detail = parseWeeklyDetails(timeMatch[3]);
        const event = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date: currentWeeklyDate,
          start,
          end: defaultEnd(currentWeeklyDate, start, shouldBeLongEvent(detail.title)),
          title: detail.title,
          location: detail.location,
          note: detail.note,
          group: detail.group,
          gender: detail.gender,
          work: detail.work,
          sourceType,
          sourceName,
          uploadIndex,
          isFirstWeek: false,
          lineId: row.id
        };
        parsedEvents.push(event);
        row.works.push(event.work);
        row.group = event.group;
      }
      row.works = [...new Set(row.works.filter(Boolean))];
    }

    pages.push({
      id: `${docId}-p${pageNum}`,
      pageNum,
      width: viewport.width,
      height: viewport.height,
      imageUrl,
      lines: rows
    });
  }

  return {
    doc: { id: docId, sourceName, sourceType, pages },
    events: markFirstWeek(parsedEvents, sourceType)
  };
}

function App() {
  const [docs, setDocs] = useState([]);
  const [events, setEvents] = useState([]);
  const [sourceType, setSourceType] = useState("monthly");
  const [selectedWorks, setSelectedWorks] = useState([]);
  const [excludedIds, setExcludedIds] = useState([]);
  const [profile, setProfile] = useState({ firstName: "", lastName: "" });
  const [genderFilter, setGenderFilter] = useState("남자");
  const [uploadCount, setUploadCount] = useState(0);
  const [error, setError] = useState("");

  const works = useMemo(
    () => [...new Set(events.map(e => e.work).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [events]
  );
  const selectedEvents = useMemo(
    () => events.filter(e => eventIncluded(e, selectedWorks, genderFilter, profile, excludedIds)),
    [events, selectedWorks, genderFilter, profile, excludedIds]
  );

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    try {
      const nextUpload = uploadCount + 1;
      const { doc, events: newEvents } = await processPdf(file, sourceType, nextUpload);
      setDocs(prev => [...prev, doc]);
      setEvents(prev => mergeSchedules(prev, newEvents, true));
      setUploadCount(nextUpload);
      event.target.value = "";
    } catch (err) {
      console.error(err);
      setError("PDF를 읽는 중 문제가 생겼어요. 텍스트가 들어 있는 PDF인지 확인해 주세요.");
    }
  }

  function resetAll() {
    setDocs([]);
    setEvents([]);
    setSelectedWorks([]);
    setExcludedIds([]);
    setProfile({ firstName: "", lastName: "" });
    setGenderFilter("남자");
    setUploadCount(0);
    setError("");
  }

  function toggleLineSelection(line) {
    if (!line.works.length) return;
    setSelectedWorks(prev => {
      const next = new Set(prev);
      const allSelected = line.works.every(work => next.has(work));
      if (allSelected) {
        line.works.forEach(work => next.delete(work));
      } else {
        line.works.forEach(work => next.add(work));
      }
      return [...next];
    });
  }

  function toggleEventExclude(id) {
    setExcludedIds(prev => prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]);
  }

  function exportICS() {
    downloadText("semperplan.ics", makeICS(selectedEvents), "text/calendar;charset=utf-8");
  }

  return (
    <main className="page">
      <section className="hero">
        <div className="heroLogo"><CalendarPlus size={30} /></div>
        <div>
          <h1>SemperPlan</h1>
          <p>PDF 원본 화면을 그대로 보고, 텍스트를 눌러 선택한 뒤 안전하게 .ics 파일로 내보냅니다.</p>
        </div>
      </section>

      <section className="topPanel">
        <div className="card controls">
          <h2>1. PDF 업로드</h2>
          <div className="toggleRow">
            <button className={sourceType === "monthly" ? "tab active" : "tab"} onClick={() => setSourceType("monthly")}>월간 PDF</button>
            <button className={sourceType === "weekly" ? "tab active" : "tab"} onClick={() => setSourceType("weekly")}>주간 PDF</button>
          </div>
          <label className="uploadButton">
            <Upload size={18} />
            <span>{sourceType === "monthly" ? "월간 PDF 업로드" : "주간 PDF 업로드"}</span>
            <input type="file" accept=".pdf" onChange={handleUpload} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <p className="hint">주간 PDF의 첫 주 일정은 같은 날짜/시간의 월간 일정보다 우선 적용됩니다.</p>
          <div className="metaRow">
            <span>업로드 파일 수: {uploadCount}</span>
            <span>파싱된 일정 수: {events.length}</span>
          </div>
          <button className="ghost" onClick={resetAll}><RotateCcw size={16} /> 전체 초기화</button>
        </div>

        <div className="card controls">
          <h2>2. 조건 설정</h2>
          <div className="twoInputs">
            <label>
              이름
              <input value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} placeholder="예: Younghun" />
            </label>
            <label>
              성
              <input value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} placeholder="예: Ha" />
            </label>
          </div>
          <div className="toggleRow">
            <button className={genderFilter === "남자" ? "tab active" : "tab"} onClick={() => setGenderFilter("남자")}>남자</button>
            <button className={genderFilter === "여자" ? "tab active" : "tab"} onClick={() => setGenderFilter("여자")}>여자</button>
            <button className={genderFilter === "" ? "tab active" : "tab"} onClick={() => setGenderFilter("")}>전체</button>
          </div>
          <div className="chips">
            {works.length === 0 ? <span className="muted">PDF 텍스트를 누르면 작품이 선택돼요.</span> : null}
            {works.map(work => (
              <button key={work} className={selectedWorks.includes(work) ? "chip active" : "chip"} onClick={() => setSelectedWorks(prev => prev.includes(work) ? prev.filter(v => v !== work) : [...prev, work])}>
                {work}
              </button>
            ))}
          </div>
          <p className="hint">텍스트를 누르면 해당 작품이 자동 선택되고, 같은 작품 일정들이 한 번에 색칠됩니다.</p>
        </div>

        <div className="card exportBox">
          <h2>3. 결과</h2>
          <p className="bigCount">{selectedEvents.length}개 일정 선택됨</p>
          <p className="hint">이 결과는 iPhone 캘린더에 넣을 수 있는 .ics 파일로 내려받습니다.</p>
          <button className="primary" onClick={exportICS} disabled={!selectedEvents.length}><Download size={18} /> 안전한 ICS 다운로드</button>
        </div>
      </section>

      <section className="workspace">
        <div className="leftPane">
          {docs.length === 0 ? (
            <div className="emptyState">
              <p>여기에 업로드한 PDF 원본이 그대로 보입니다.</p>
              <p>텍스트를 누르면 같은 작품의 일정이 선택됩니다.</p>
            </div>
          ) : (
            docs.map(doc => (
              <section key={doc.id} className="docBlock">
                <div className="docHeader">
                  <strong>{doc.sourceName}</strong>
                  <span>{doc.sourceType === "monthly" ? "월간 PDF" : "주간 PDF"}</span>
                </div>
                {doc.pages.map(page => (
                  <div key={page.id} className="pdfPageWrap">
                    <div className="pdfPage" style={{ width: page.width, height: page.height }}>
                      <img src={page.imageUrl} alt={`PDF page ${page.pageNum}`} width={page.width} height={page.height} />
                      {page.lines.map(line => {
                        const active = linePassesVisibleSelection(line, selectedWorks, genderFilter, profile);
                        return (
                          <button
                            key={line.id}
                            className={active ? "lineOverlay active" : "lineOverlay"}
                            style={{ left: line.x, top: line.y, width: line.w, height: line.h }}
                            onClick={() => toggleLineSelection(line)}
                            title={line.text}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))
          )}
        </div>

        <aside className="rightPane">
          <div className="card selectedCard">
            <h2>선택된 일정</h2>
            <p className="hint">마지막으로 사람 눈으로 확인하고, 필요하면 개별 일정만 빼면 됩니다.</p>
            <div className="selectedList">
              {selectedEvents.length === 0 ? <p className="muted">아직 선택된 일정이 없습니다.</p> : null}
              {selectedEvents.map(ev => {
                const excluded = excludedIds.includes(ev.id);
                return (
                  <div key={ev.id} className={excluded ? "eventItem excluded" : "eventItem"}>
                    <div className="eventHead">
                      <CheckCircle2 size={16} />
                      <strong>{ev.date} {ev.start}–{ev.end}</strong>
                    </div>
                    <div className="eventBody">
                      <div>{ev.title}</div>
                      <small>{[ev.location, ev.work, ev.group].filter(Boolean).join(" · ")}</small>
                    </div>
                    <button className="excludeBtn" onClick={() => toggleEventExclude(ev.id)}>
                      {excluded ? <><CheckCircle2 size={16} /> 다시 포함</> : <><XCircle size={16} /> 이 일정 제외</>}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
