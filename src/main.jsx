
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarPlus, Upload, Download, RotateCcw, CheckCircle2, XCircle,
  Save, Trash2, Eye, EyeOff, ShieldCheck, AlertTriangle, Cloud, LogIn,
  RefreshCcw, Lock
} from "lucide-react";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import "./style.css";

GlobalWorkerOptions.workerSrc = pdfWorker;

const STORAGE_KEY = "semperplan.preferences.v7";
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar";
const SEMPERPLAN_CALENDAR_NAME = "SemperPlan";
const DEFAULT_TIMEZONE = "Europe/Berlin";

const KNOWN_WORKS = [
  "Parsifal", "Carmen", "Elias", "Giovanni", "Don Giovanni", "Traviata",
  "La Traviata", "Zauberflöte", "Zauberfloete", "Strawinsky", "Opernball",
  "Karmelitinnen", "Konzert", "Elektra", "Rosenkavalier", "Tosca", "Boheme",
  "Bohème", "Butterfly", "Aida", "Nabucco", "Turandot", "Tannhäuser",
  "Lohengrin", "Meistersinger", "Fidelio", "Freischütz", "Freischuetz"
];

const WEEKLY_DATE_RE = /^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag),?\s*(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(20\d{2})/i;
const MONTHLY_LINE_RE = /^(Mo|Di|Mi|Do|Fr|Sa|So)\s+(\d{1,2})\.(\d{1,2})\.\s*(.*)$/i;
const ANY_DATE_RE = /(\d{1,2})\.\s*([A-Za-zÄÖÜäöü]+)\s*(20\d{2})/i;
const TIME_AT_START_RE = /^(\d{1,2})[.:](\d{2})\s+(.+)$/;
const TIME_ANY_RE = /(\d{1,2})[.:](\d{2})/g;

const MONTHS_DE = {
  januar: "01", februar: "02", märz: "03", maerz: "03", april: "04", mai: "05", juni: "06",
  juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12"
};

const COACH_TAIL_RE = /\s+(Becker\/Kim|Hoffmann\/Kim|Hoffmann\/Becker\/Kim|Gatti\/Becker\/Kim|Becker|Kim|Hoffmann|Gatti|Patsalidou|Lindner)$/i;

function clean(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function normalizeWork(work) {
  const value = clean(work);
  if (/zauberfloete/i.test(value)) return "Zauberflöte";
  if (/boheme/i.test(value)) return "Bohème";
  return value;
}

function normalizeComparable(text) {
  return clean(text)
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

function defaultEnd(date, start, long = false) {
  const [h, m] = start.split(":").map(Number);
  const d = new Date(`${date}T${pad(h)}:${pad(m)}:00`);
  d.setMinutes(d.getMinutes() + (long ? 180 : 120));
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function shouldBeLongEvent(text) {
  return /Vorstellung|Konzert|Opernball|Giovanni|Parsifal|Traviata|Karmelitinnen|Zauberflöte|Zauberfloete|Aida|Nabucco|Turandot|Tannhäuser|Lohengrin/i.test(text);
}

function extractWork(text, customWorks = []) {
  const t = clean(text);
  const works = [...customWorks, ...KNOWN_WORKS].filter(Boolean);
  for (const work of works) {
    const escaped = work.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`(^|\\s|[-/])${escaped}(\\s|$|[-/])`, "i");
    if (re.test(t)) return normalizeWork(work);
  }
  const nach = t.match(/Nachstudium\s+([A-Za-zÄÖÜäöü0-9.]+)/i);
  if (nach) return normalizeWork(nach[1]);
  const left = t.split(" - ")[0].trim();
  const tokens = left.split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1] || "Dienst";
  return normalizeWork(last);
}

function detectGender(text) {
  const t = normalizeComparable(text);
  if (/(alle\s+herren|\bherren\b|maenner|manner)/i.test(t)) return "남자";
  if (/(alle\s+damen|\bdamen\b|frauen|blumenmaedchen|blumenmadchen)/i.test(t)) return "여자";
  if (/(alle|alle\s+eingeteilten|chor tutti|sinfoniechor)/i.test(t)) return "전체";
  return "개별/기타";
}

function includesNameOrSurname(event, profile) {
  const hay = normalizeComparable(`${event.title} ${event.note} ${event.group} ${event.rawText || ""}`);
  const tokens = [profile.firstName, profile.lastName]
    .map(normalizeComparable)
    .filter(token => token.length >= 2);
  return tokens.some(token => hay.includes(token));
}

function parseDateFromWeeklyHeader(text) {
  const weekly = text.match(WEEKLY_DATE_RE);
  const any = text.match(ANY_DATE_RE);
  const m = weekly || any;
  if (!m) return "";
  const day = weekly ? m[2] : m[1];
  const monthName = weekly ? m[3] : m[2];
  const year = weekly ? m[4] : m[3];
  return `${year}-${MONTHS_DE[monthName.toLowerCase()] || "01"}-${pad(day)}`;
}

function removeCoachTail(text) {
  let result = clean(text);
  for (let i = 0; i < 3; i += 1) result = result.replace(COACH_TAIL_RE, "").trim();
  return result;
}

function parseWeeklyDetails(text, customWorks) {
  const parts = clean(text).split(/\s+/);
  const location = parts[0] || "";
  const body = parts.slice(1).join(" ");
  const noCoach = removeCoachTail(body);
  const [left, right = ""] = noCoach.split(/\s+-\s+/);
  const work = extractWork(left, customWorks);
  const gender = detectGender(right || left);
  return {
    location,
    title: clean(left) || work,
    note: clean(noCoach),
    target: clean(right),
    work,
    gender,
    group: [gender, clean(right)].filter(Boolean).join(" · ")
  };
}

function escapeICS(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
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

function makeICS(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SemperPlan//Safe ICS Export//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SemperPlan"
  ];

  for (const e of events) {
    const [y, m, d] = e.date.split("-");
    const [sh, sm] = e.start.split(":");
    const [eh, em] = e.end.split(":");
    const description = [
      e.note ? `비고: ${e.note}` : "",
      e.group ? `대상: ${e.group}` : "",
      e.sourceName ? `출처: ${e.sourceName}` : "",
      e.replacementReason ? `대체: ${e.replacementReason}` : "",
      `SemperPlan-ID: ${stableId(e)}`
    ].filter(Boolean).join("\\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${stableId(e)}@semperplan.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${y}${m}${d}T${sh}${sm}00`,
      `DTEND:${y}${m}${d}T${eh}${em}00`,
      `SUMMARY:${escapeICS(e.title || e.work || "SemperPlan Schedule")}`,
      e.location ? `LOCATION:${escapeICS(e.location)}` : "",
      `DESCRIPTION:${escapeICS(description)}`,
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

function loadPreferences() {
  const fallback = {
    selectedWorks: [],
    genderFilter: "남자",
    profile: { firstName: "", lastName: "" },
    customWorksText: "",
    autoSave: true,
    overlayExpanded: true
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      selectedWorks: Array.isArray(parsed.selectedWorks) ? parsed.selectedWorks : [],
      genderFilter: typeof parsed.genderFilter === "string" ? parsed.genderFilter : "남자",
      profile: {
        firstName: parsed.profile?.firstName || "",
        lastName: parsed.profile?.lastName || ""
      },
      customWorksText: parsed.customWorksText || "",
      autoSave: parsed.autoSave !== false,
      overlayExpanded: parsed.overlayExpanded !== false
    };
  } catch {
    return fallback;
  }
}

function savePreferences(preferences) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    ...preferences,
    savedAt: new Date().toISOString()
  }));
}

function clearPreferences() {
  localStorage.removeItem(STORAGE_KEY);
}

function eventIncluded(event, selectedWorks, genderFilter, profile, excludedIds) {
  if (!selectedWorks.includes(event.work)) return false;
  if (excludedIds.includes(event.id)) return false;
  if (includesNameOrSurname(event, profile)) return true;
  if (!genderFilter) return true;
  if (genderFilter === "남자" && event.gender === "여자") return false;
  if (genderFilter === "여자" && event.gender === "남자") return false;
  return true;
}

function lineShouldHighlight(line, selectedWorks, genderFilter, profile) {
  if (!line.works.some(work => selectedWorks.includes(work))) return false;
  const fakeEvent = {
    title: line.text,
    note: line.text,
    group: line.group || "",
    rawText: line.text
  };
  if (includesNameOrSurname(fakeEvent, profile)) return true;
  const gender = detectGender(`${line.text} ${line.group || ""}`);
  if (!genderFilter) return true;
  if (genderFilter === "남자" && gender === "여자") return false;
  if (genderFilter === "여자" && gender === "남자") return false;
  return true;
}

function mergeSchedules(previous, incoming, weeklyOverride = true) {
  if (!weeklyOverride) return [...previous, ...incoming];
  const next = [...previous];

  for (const event of incoming) {
    const sameIndex = next.findIndex(e => eventKey(e) === eventKey(event));
    if (sameIndex === -1) {
      next.push(event);
      continue;
    }
    const existing = next[sameIndex];
    const shouldReplace =
      event.sourceType === "weekly" &&
      event.isFirstWeek &&
      existing.uploadIndex < event.uploadIndex;

    if (shouldReplace) {
      next[sameIndex] = {
        ...event,
        replacementReason: `${existing.sourceName} 일정이 최신 주간 첫 주 일정으로 대체됨`
      };
    } else {
      const sameExact =
        existing.title === event.title &&
        existing.location === event.location &&
        existing.group === event.group &&
        existing.note === event.note;
      if (!sameExact) next.push(event);
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

function clusterRows(items, viewport, pageId) {
  const rowMap = new Map();
  items.forEach(item => {
    const yKey = Math.round(item.y / 7) * 7;
    if (!rowMap.has(yKey)) rowMap.set(yKey, []);
    rowMap.get(yKey).push(item);
  });

  return Array.from(rowMap.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([yKey, rowItems], rowIndex) => {
      const sorted = rowItems.sort((a, b) => a.x - b.x);
      const minX = Math.min(...sorted.map(v => v.x));
      const maxX = Math.max(...sorted.map(v => v.x + v.w));
      const maxH = Math.max(...sorted.map(v => v.h), 14);
      const top = viewport.height - yKey - maxH;
      return {
        id: `${pageId}-row-${rowIndex}`,
        text: clean(sorted.map(v => v.str).join(" ")),
        x: Math.max(4, minX - 8),
        y: Math.max(4, top - 9),
        w: Math.min(viewport.width - Math.max(4, minX - 8) - 4, maxX - minX + 16),
        h: Math.max(24, maxH + 18),
        centerX: minX + (maxX - minX) / 2,
        centerY: top + Math.max(24, maxH + 18) / 2,
        works: [],
        group: "",
        eventIds: [],
        date: ""
      };
    })
    .filter(row => row.text);
}

function expandClickableRows(rows, pageWidth, enabled) {
  if (!enabled) return rows;
  return rows.map((row, idx) => {
    const next = rows[idx + 1];
    let extraBottom = 8;
    if (next && Math.abs(next.y - row.y) < 46) extraBottom = 3;
    const left = Math.max(0, row.x - 10);
    const right = Math.min(pageWidth, row.x + row.w + 18);
    return {
      ...row,
      x: left,
      w: Math.max(60, right - left),
      h: Math.min(54, row.h + extraBottom)
    };
  });
}

function splitMultiTimeRow(row) {
  const matches = [...row.text.matchAll(TIME_ANY_RE)];
  if (matches.length <= 1) return [row];
  const parts = [];
  for (let i = 0; i < matches.length; i += 1) {
    const startIndex = matches[i].index;
    const endIndex = matches[i + 1]?.index ?? row.text.length;
    const partText = clean(row.text.slice(startIndex, endIndex));
    if (partText) parts.push({ ...row, id: `${row.id}-part-${i}`, text: partText });
  }
  return parts.length ? parts : [row];
}

function parseMonthlyRows(rows, source, customWorks) {
  const yearGuess =
    (source.sourceName.match(/(20\d{2})/) || [])[1] ||
    String(new Date().getFullYear());
  const events = [];

  rows.forEach(row => {
    const m = row.text.match(MONTHLY_LINE_RE);
    if (!m) return;
    const date = `${yearGuess}-${pad(m[3])}-${pad(m[2])}`;
    const rest = clean(m[4]);
    row.date = date;

    if (/chorfrei/i.test(rest) && !/\d{1,2}[.:]\d{2}/.test(rest)) return;

    const timeMatches = [...rest.matchAll(/(\d{1,2})[.:](\d{2})\s+([^0-9]+)/g)];
    if (timeMatches.length) {
      timeMatches.forEach((tm, i) => {
        const start = `${pad(tm[1])}:${tm[2]}`;
        const segTextStart = tm.index + tm[0].indexOf(tm[3]);
        const segTextEnd = timeMatches[i + 1]?.index ?? rest.length;
        const detail = clean(rest.slice(segTextStart, segTextEnd));
        const work = extractWork(detail, customWorks);
        const gender = detectGender(detail);
        const ev = {
          id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          date,
          start,
          end: defaultEnd(date, start, shouldBeLongEvent(detail)),
          title: detail || work,
          location: "",
          note: detail,
          group: gender,
          gender,
          work,
          sourceType: source.sourceType,
          sourceName: source.sourceName,
          uploadIndex: source.uploadIndex,
          isFirstWeek: false,
          lineId: row.id,
          rawText: row.text
        };
        events.push(ev);
        row.works.push(work);
        row.group = gender;
        row.eventIds.push(ev.id);
      });
    } else if (rest && !/chorfrei/i.test(rest)) {
      const work = extractWork(rest, customWorks);
      const gender = detectGender(rest);
      const ev = {
        id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        date,
        start: "09:00",
        end: "11:00",
        title: rest,
        location: "",
        note: rest,
        group: gender,
        gender,
        work,
        sourceType: source.sourceType,
        sourceName: source.sourceName,
        uploadIndex: source.uploadIndex,
        isFirstWeek: false,
        lineId: row.id,
        rawText: row.text
      };
      events.push(ev);
      row.works.push(work);
      row.group = gender;
      row.eventIds.push(ev.id);
    }
  });

  rows.forEach(row => row.works = [...new Set(row.works.filter(Boolean))]);
  return events;
}

function parseWeeklyRows(rows, source, customWorks) {
  const events = [];
  const dateRows = rows
    .map(row => ({ row, date: parseDateFromWeeklyHeader(row.text) }))
    .filter(v => v.date);

  const sortedDateRows = [...dateRows].sort((a, b) => a.row.x - b.row.x || a.row.y - b.row.y);

  function nearestDateForRow(row) {
    if (!sortedDateRows.length) return "";
    const sameColumn = sortedDateRows
      .map(d => ({ ...d, distance: Math.abs(d.row.centerX - row.centerX) + Math.max(0, d.row.y - row.y) * 0.25 }))
      .sort((a, b) => a.distance - b.distance);
    return sameColumn[0]?.date || sortedDateRows[0].date;
  }

  const normalizedRows = rows.flatMap(splitMultiTimeRow);

  normalizedRows.forEach(row => {
    const m = row.text.match(TIME_AT_START_RE);
    if (!m) return;
    const date = nearestDateForRow(row);
    if (!date) return;

    const start = `${pad(m[1])}:${m[2]}`;
    const details = parseWeeklyDetails(m[3], customWorks);
    const ev = {
      id: `ev-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date,
      start,
      end: defaultEnd(date, start, shouldBeLongEvent(details.title)),
      title: details.title || details.work,
      location: details.location,
      note: details.note,
      group: details.group,
      gender: details.gender,
      work: details.work,
      sourceType: source.sourceType,
      sourceName: source.sourceName,
      uploadIndex: source.uploadIndex,
      isFirstWeek: false,
      lineId: row.id,
      rawText: row.text
    };
    events.push(ev);
    row.date = date;
    row.works.push(ev.work);
    row.group = ev.group;
    row.eventIds.push(ev.id);
  });

  rows.forEach(row => {
    const eventsForRow = events.filter(ev => ev.lineId === row.id || ev.lineId.startsWith(`${row.id}-part-`));
    row.works = [...new Set(eventsForRow.map(ev => ev.work))];
    row.group = eventsForRow[0]?.group || "";
    row.eventIds = eventsForRow.map(ev => ev.id);
  });

  return events;
}

async function processPdf(file, sourceType, uploadIndex, customWorks, overlayExpanded) {
  const source = { sourceName: file.name, sourceType, uploadIndex };
  const buffer = await file.arrayBuffer();
  const pdf = await getDocument({ data: buffer }).promise;
  const docId = `doc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pages = [];
  let events = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
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
        w: Math.max(8, (item.width || 22) * scale),
        h: Math.max(10, (item.height || 10) * scale)
      }))
      .filter(item => item.str);

    const pageId = `${docId}-p${pageNum}`;
    const rows = expandClickableRows(clusterRows(items, viewport, pageId), viewport.width, overlayExpanded);
    const pageEvents = sourceType === "monthly"
      ? parseMonthlyRows(rows, source, customWorks)
      : parseWeeklyRows(rows, source, customWorks);

    events = [...events, ...pageEvents];

    pages.push({
      id: pageId,
      pageNum,
      width: viewport.width,
      height: viewport.height,
      imageUrl,
      rows
    });
  }

  return {
    doc: {
      id: docId,
      sourceName: file.name,
      sourceType,
      pages
    },
    events: markFirstWeek(events, sourceType)
  };
}

function makeGoogleEvent(event) {
  return {
    summary: event.title || event.work || "SemperPlan Schedule",
    location: event.location || "",
    description: [
      event.note ? `비고: ${event.note}` : "",
      event.group ? `대상: ${event.group}` : "",
      event.sourceName ? `출처: ${event.sourceName}` : "",
      event.replacementReason ? `대체: ${event.replacementReason}` : "",
      `SemperPlan-ID: ${stableId(event)}`
    ].filter(Boolean).join("\n"),
    start: {
      dateTime: `${event.date}T${event.start}:00`,
      timeZone: DEFAULT_TIMEZONE
    },
    end: {
      dateTime: `${event.date}T${event.end}:00`,
      timeZone: DEFAULT_TIMEZONE
    },
    extendedProperties: {
      private: {
        semperPlan: "true",
        semperPlanId: stableId(event)
      }
    }
  };
}

async function googleRequest(path, token, options = {}) {
  const res = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...options,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google API error ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return await res.json();
}

async function findOrCreateSemperPlanCalendar(token) {
  let pageToken = "";
  do {
    const query = pageToken ? `?pageToken=${encodeURIComponent(pageToken)}` : "";
    const data = await googleRequest(`/users/me/calendarList${query}`, token);
    const found = (data.items || []).find(cal => cal.summary === SEMPERPLAN_CALENDAR_NAME);
    if (found) return found.id;
    pageToken = data.nextPageToken || "";
  } while (pageToken);

  const created = await googleRequest(`/calendars`, token, {
    method: "POST",
    body: JSON.stringify({
      summary: SEMPERPLAN_CALENDAR_NAME,
      timeZone: DEFAULT_TIMEZONE
    })
  });
  return created.id;
}

async function listAllEvents(calendarId, token) {
  const all = [];
  let pageToken = "";
  do {
    const params = new URLSearchParams({
      maxResults: "2500",
      singleEvents: "true",
      showDeleted: "false"
    });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, token);
    all.push(...(data.items || []));
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return all;
}

function googleDateTimeKey(googleEvent) {
  const start = googleEvent.start?.dateTime || googleEvent.start?.date || "";
  const end = googleEvent.end?.dateTime || googleEvent.end?.date || "";
  return `${start.slice(0, 16)}|${end.slice(0, 16)}`;
}

function localEventDateTimeKey(event) {
  return `${event.date}T${event.start}|${event.date}T${event.end}`;
}

function googleSemperPlanId(googleEvent) {
  const description = googleEvent.description || "";
  const fromPrivate = googleEvent.extendedProperties?.private?.semperPlanId;
  if (fromPrivate) return fromPrivate;
  const match = description.match(/SemperPlan-ID:\s*([^\n]+)/);
  return match ? match[1].trim() : "";
}

function existingEventOverlapsNewSelection(googleEvent, newEventKeys, newStableIds) {
  const key = googleDateTimeKey(googleEvent);
  const id = googleSemperPlanId(googleEvent);
  return newEventKeys.has(key) || (id && newStableIds.has(id));
}

async function syncToGoogleCalendar(events, token, onProgress) {
  const calendarId = await findOrCreateSemperPlanCalendar(token);
  onProgress("기존 SemperPlan 캘린더 일정을 확인하는 중...");
  const existing = await listAllEvents(calendarId, token);

  const newEventKeys = new Set(events.map(localEventDateTimeKey));
  const newStableIds = new Set(events.map(stableId));

  const overlappingExisting = existing.filter(event =>
    existingEventOverlapsNewSelection(event, newEventKeys, newStableIds)
  );

  onProgress(`겹치는 기존 일정 ${overlappingExisting.length}개만 삭제 중...`);
  for (let i = 0; i < overlappingExisting.length; i += 1) {
    await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(overlappingExisting[i].id)}`, token, {
      method: "DELETE"
    });
    if ((i + 1) % 10 === 0) onProgress(`겹치는 기존 일정 ${i + 1}/${overlappingExisting.length}개 삭제 완료...`);
  }

  onProgress(`최신 일정 ${events.length}개 추가 중...`);
  for (let i = 0; i < events.length; i += 1) {
    await googleRequest(`/calendars/${encodeURIComponent(calendarId)}/events`, token, {
      method: "POST",
      body: JSON.stringify(makeGoogleEvent(events[i]))
    });
    if ((i + 1) % 5 === 0) onProgress(`최신 일정 ${i + 1}/${events.length}개 추가 완료...`);
  }

  return {
    calendarId,
    checked: existing.length,
    deleted: overlappingExisting.length,
    inserted: events.length,
    kept: existing.length - overlappingExisting.length
  };
}

function App() {
  const saved = useMemo(() => loadPreferences(), []);
  const [docs, setDocs] = useState([]);
  const [events, setEvents] = useState([]);
  const [sourceType, setSourceType] = useState("monthly");
  const [selectedWorks, setSelectedWorks] = useState(saved.selectedWorks);
  const [excludedIds, setExcludedIds] = useState([]);
  const [profile, setProfile] = useState(saved.profile);
  const [genderFilter, setGenderFilter] = useState(saved.genderFilter);
  const [customWorksText, setCustomWorksText] = useState(saved.customWorksText);
  const [autoSave, setAutoSave] = useState(saved.autoSave);
  const [overlayExpanded, setOverlayExpanded] = useState(saved.overlayExpanded);
  const [uploadCount, setUploadCount] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState("");

  const customWorks = useMemo(
    () => customWorksText.split(/[,;\n]/).map(clean).filter(Boolean),
    [customWorksText]
  );

  const allWorks = useMemo(
    () => [...new Set([...selectedWorks, ...events.map(e => e.work).filter(Boolean)])].sort((a, b) => a.localeCompare(b)),
    [events, selectedWorks]
  );

  const selectedEvents = useMemo(
    () => events.filter(e => eventIncluded(e, selectedWorks, genderFilter, profile, excludedIds)),
    [events, selectedWorks, genderFilter, profile, excludedIds]
  );

  useEffect(() => {
    if (!autoSave) return;
    savePreferences({ selectedWorks, genderFilter, profile, customWorksText, autoSave, overlayExpanded });
  }, [selectedWorks, genderFilter, profile, customWorksText, autoSave, overlayExpanded]);

  function manualSave() {
    savePreferences({ selectedWorks, genderFilter, profile, customWorksText, autoSave, overlayExpanded });
    setNotice("필터 정보가 이 브라우저에 저장됐어요.");
    setTimeout(() => setNotice(""), 2400);
  }

  function clearSavedOnly() {
    clearPreferences();
    setSelectedWorks([]);
    setGenderFilter("남자");
    setProfile({ firstName: "", lastName: "" });
    setCustomWorksText("");
    setNotice("저장된 필터 정보를 삭제했어요.");
    setTimeout(() => setNotice(""), 2400);
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setNotice("");
    try {
      const nextUpload = uploadCount + 1;
      const result = await processPdf(file, sourceType, nextUpload, customWorks, overlayExpanded);
      setDocs(prev => [...prev, result.doc]);
      setEvents(prev => mergeSchedules(prev, result.events, true));
      setUploadCount(nextUpload);
      event.target.value = "";
      setNotice(`${file.name}에서 ${result.events.length}개 일정을 읽었어요.`);
      setTimeout(() => setNotice(""), 2800);
    } catch (err) {
      console.error(err);
      setError("PDF를 읽는 중 문제가 생겼어요. 텍스트 기반 PDF인지 확인해 주세요.");
    }
  }

  function resetSession() {
    setDocs([]);
    setEvents([]);
    setExcludedIds([]);
    setUploadCount(0);
    setError("");
    setNotice("업로드된 파일과 선택 제외 목록만 초기화했어요. 저장된 필터는 유지됩니다.");
    setTimeout(() => setNotice(""), 2600);
  }

  function toggleLine(row) {
    if (!row.works.length) return;
    setSelectedWorks(prev => {
      const next = new Set(prev);
      const allSelected = row.works.every(work => next.has(work));
      if (allSelected) row.works.forEach(work => next.delete(work));
      else row.works.forEach(work => next.add(work));
      return [...next];
    });
  }

  function toggleWork(work) {
    setSelectedWorks(prev => prev.includes(work) ? prev.filter(v => v !== work) : [...prev, work]);
  }

  function toggleExclude(eventId) {
    setExcludedIds(prev => prev.includes(eventId) ? prev.filter(v => v !== eventId) : [...prev, eventId]);
  }

  function exportICS() {
    downloadText("semperplan.ics", makeICS(selectedEvents), "text/calendar;charset=utf-8");
  }

  function requestGoogleAccess() {
    setError("");
    setNotice("");
    if (!GOOGLE_CLIENT_ID) {
      setError("VITE_GOOGLE_CLIENT_ID가 설정되지 않았어요. Vercel 환경변수에 Google OAuth Client ID를 넣어야 합니다.");
      return;
    }
    if (!window.google?.accounts?.oauth2) {
      setError("Google 로그인 스크립트를 아직 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: GOOGLE_SCOPE,
      callback: (response) => {
        if (response.error) {
          setError(`Google 로그인 실패: ${response.error}`);
          return;
        }
        setAccessToken(response.access_token);
        setNotice("Google Calendar 접근이 준비됐어요.");
        setTimeout(() => setNotice(""), 2400);
      }
    });

    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  }

  async function handleGoogleSync() {
    setError("");
    setNotice("");
    setSyncStatus("");
    if (!selectedEvents.length) {
      setError("동기화할 일정이 없습니다. 먼저 PDF에서 작품을 선택해 주세요.");
      return;
    }
    if (!accessToken) {
      setError("먼저 Google Calendar 연결을 눌러 주세요.");
      return;
    }

    const confirmed = window.confirm(
      `현재 선택된 ${selectedEvents.length}개 일정과 겹치는 기존 SemperPlan 일정만 삭제하고, 최신 일정으로 다시 추가합니다.\n\n안 겹치는 기존 SemperPlan 일정과 개인 캘린더는 유지됩니다. 계속할까요?`
    );
    if (!confirmed) return;

    try {
      setSyncing(true);
      const result = await syncToGoogleCalendar(selectedEvents, accessToken, setSyncStatus);
      setSyncStatus("");
      setNotice(`동기화 완료: 겹치는 기존 일정 ${result.deleted}개 삭제, 최신 일정 ${result.inserted}개 추가, 안 겹친 기존 일정 ${result.kept}개 유지.`);
    } catch (err) {
      console.error(err);
      setError(`Google Calendar 동기화 실패: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="heroLogo"><CalendarPlus size={30} /></div>
        <div>
          <h1>SemperPlan</h1>
          <p>PDF 원본 화면을 그대로 보고, 텍스트를 눌러 선택한 뒤 SemperPlan 전용 캘린더를 최신 상태로 동기화합니다.</p>
        </div>
      </header>

      <section className="topPanel">
        <div className="card">
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
          <p className="hint">주간 PDF의 첫 주 일정은 같은 날짜/시간의 월간 일정 위에 우선 적용됩니다.</p>
          <div className="metaRow">
            <span>업로드 {uploadCount}개</span>
            <span>파싱 일정 {events.length}개</span>
            <span>선택 결과 {selectedEvents.length}개</span>
          </div>
          <button className="ghost" onClick={resetSession}><RotateCcw size={16} /> 파일만 초기화</button>
        </div>

        <div className="card">
          <h2>2. 저장되는 필터</h2>
          <div className="twoInputs">
            <label>이름<input value={profile.firstName} onChange={e => setProfile({ ...profile, firstName: e.target.value })} placeholder="예: Younghun" /></label>
            <label>성<input value={profile.lastName} onChange={e => setProfile({ ...profile, lastName: e.target.value })} placeholder="예: Ha" /></label>
          </div>
          <div className="toggleRow">
            <button className={genderFilter === "남자" ? "tab active" : "tab"} onClick={() => setGenderFilter("남자")}>남자</button>
            <button className={genderFilter === "여자" ? "tab active" : "tab"} onClick={() => setGenderFilter("여자")}>여자</button>
            <button className={genderFilter === "" ? "tab active" : "tab"} onClick={() => setGenderFilter("")}>전체</button>
          </div>
          <label className="textareaLabel">
            추가 작품명/별명
            <textarea value={customWorksText} onChange={e => setCustomWorksText(e.target.value)} placeholder={"예:\nStabat Mater\n8. Konzert\nMessa da Requiem"} />
          </label>
          <div className="toggleRow compact">
            <button className={autoSave ? "tab active" : "tab"} onClick={() => setAutoSave(!autoSave)}><Save size={15} /> 자동 저장 {autoSave ? "켜짐" : "꺼짐"}</button>
            <button className="tab" onClick={manualSave}><Save size={15} /> 지금 저장</button>
            <button className="tab danger" onClick={clearSavedOnly}><Trash2 size={15} /> 저장값 삭제</button>
          </div>
        </div>

        <div className="card exportBox">
          <h2>3. 캘린더 반영</h2>
          <p className="bigCount">{selectedEvents.length}개</p>
          <p className="hint">Google 동기화는 선택한 일정과 겹치는 기존 SemperPlan 일정만 지우고 최신 일정으로 바꿉니다.</p>
          <button className="primary" onClick={requestGoogleAccess} disabled={!GOOGLE_CLIENT_ID}>
            <LogIn size={18} /> Google Calendar 연결
          </button>
          <button className="syncButton" onClick={handleGoogleSync} disabled={!accessToken || syncing || !selectedEvents.length}>
            <Cloud size={18} /> {syncing ? "동기화 중..." : "최신 상태로 동기화"}
          </button>
          <button className="ghost" onClick={exportICS} disabled={!selectedEvents.length}>
            <Download size={16} /> .ics 백업 다운로드
          </button>
          <button className="ghost" onClick={() => setOverlayExpanded(!overlayExpanded)}>
            {overlayExpanded ? <Eye size={16} /> : <EyeOff size={16} />}
            클릭 영역 {overlayExpanded ? "넓게" : "기본"}
          </button>
          {!GOOGLE_CLIENT_ID ? (
            <p className="warningSmall"><Lock size={15} /> VITE_GOOGLE_CLIENT_ID 설정 필요</p>
          ) : null}
        </div>
      </section>

      {notice ? <div className="notice"><ShieldCheck size={18} /> {notice}</div> : null}
      {syncStatus ? <div className="notice"><RefreshCcw size={18} /> {syncStatus}</div> : null}
      {error ? <div className="error"><AlertTriangle size={18} /> {error}</div> : null}

      <section className="chipsCard card">
        <h2>작품 선택</h2>
        <p className="hint">이 선택은 브라우저에 저장됩니다. 다음 업로드 때도 다시 누를 필요가 없습니다.</p>
        <div className="chips">
          {allWorks.length === 0 ? <span className="muted">PDF를 올리면 작품 버튼이 생깁니다. 원본 PDF 위 텍스트를 눌러도 됩니다.</span> : null}
          {allWorks.map(work => (
            <button key={work} className={selectedWorks.includes(work) ? "chip active" : "chip"} onClick={() => toggleWork(work)}>{work}</button>
          ))}
        </div>
      </section>

      <section className="safety card">
        <h2>동기화 안전 원칙</h2>
        <p>Google Calendar 동기화는 개인 기본 캘린더를 건드리지 않고, 이름이 <strong>SemperPlan</strong>인 전용 캘린더만 수정합니다.</p>
        <p>동기화 버튼을 누르면 현재 선택한 일정과 <strong>날짜·시작·종료 시간이 겹치는 기존 일정만</strong> 삭제되고, 최신 일정이 다시 들어갑니다. 안 겹치는 기존 일정은 유지됩니다.</p>
      </section>

      <section className="workspace">
        <div className="leftPane">
          {docs.length === 0 ? (
            <div className="emptyState">
              <p>여기에 업로드한 PDF 원본이 그대로 보입니다.</p>
              <p>텍스트 줄을 누르면 해당 작품이 저장 필터에 추가되고, 같은 작품 일정이 색칠됩니다.</p>
            </div>
          ) : docs.map(doc => (
            <section key={doc.id} className="docBlock">
              <div className="docHeader">
                <strong>{doc.sourceName}</strong>
                <span>{doc.sourceType === "monthly" ? "월간 PDF" : "주간 PDF"}</span>
              </div>
              {doc.pages.map(page => (
                <div key={page.id} className="pdfPageWrap">
                  <div className="pdfPage" style={{ width: page.width, height: page.height }}>
                    <img src={page.imageUrl} alt={`PDF page ${page.pageNum}`} width={page.width} height={page.height} />
                    {page.rows.map(row => {
                      const active = lineShouldHighlight(row, selectedWorks, genderFilter, profile);
                      const clickable = row.works.length > 0;
                      return (
                        <button
                          key={row.id}
                          className={[
                            "lineOverlay",
                            active ? "active" : "",
                            clickable ? "clickable" : "notClickable"
                          ].join(" ")}
                          style={{ left: row.x, top: row.y, width: row.w, height: row.h }}
                          onClick={() => toggleLine(row)}
                          title={row.works.length ? `${row.works.join(", ")} · ${row.text}` : row.text}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}
        </div>

        <aside className="rightPane">
          <div className="card selectedCard">
            <h2>최종 일정 확인</h2>
            <p className="hint">자동 선택된 일정도 마지막에 개별 제외할 수 있습니다.</p>
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
                    {ev.replacementReason ? <small className="replacement">{ev.replacementReason}</small> : null}
                    <button className="excludeBtn" onClick={() => toggleExclude(ev.id)}>
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
