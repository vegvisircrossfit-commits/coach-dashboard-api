import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import * as XLSX from "xlsx";

// ── Brand tokens ──────────────────────────────────────────────────────────────
const C = {
  accent:    "#3E6E8E",
  accentHi:  "#5A9ABF",
  navy:      "#16222E",
  navy2:     "#1C2A38",
  navy3:     "#243545",
  line:      "#2A3A49",
  bg:        "#0F171F",
  text:      "#EAEFF3",
  textDim:   "#8A9AA8",
  textFaint: "#566673",
  gold:      "#C9A84C",
  green:     "#4F9D8C",
  purple:    "#6B5B95",
};
const FONT = "'Glacial Indifference', 'Montserrat', 'Helvetica Neue', sans-serif";

// ── Shared styles injected once ───────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.cdnfonts.com/css/glacial-indifference-2');
  @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0F171F; color: #EAEFF3; font-family: ${FONT}; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-track { background: #16222E; }
  ::-webkit-scrollbar-thumb { background: #3E6E8E; border-radius: 2px; }
  input, textarea, select { background: #1C2A38; border: 1px solid #2A3A49; color: #EAEFF3; border-radius: 4px; padding: 8px 12px; outline: none; font-family: ${FONT}; font-size: 13px; }
  input:focus, textarea:focus, select:focus { border-color: #3E6E8E; }
  input[type=range] { -webkit-appearance: none; width: 100%; height: 3px; background: #2A3A49; border-radius: 2px; padding: 0; }
  input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #3E6E8E; cursor: pointer; }
  .btn { cursor: pointer; border: none; transition: all 0.15s ease; font-family: ${FONT}; }
  .btn:hover { opacity: 0.85; }
  .badge { display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 2px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
  .card { transition: border-color 0.15s, transform 0.15s; }
  .card:hover { border-color: #3E6E8E !important; }
  .fade-in { animation: fadeIn 0.25s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  .flow-step { position: relative; }
  .flow-step::after { content: ''; position: absolute; left: 50%; bottom: -20px; transform: translateX(-50%); width: 2px; height: 20px; background: #2A3A49; }
  .flow-step:last-child::after { display: none; }
  @media (max-width: 768px) {
    .sidebar-hide { display: none !important; }
    .main-full { width: 100% !important; }
  }
`;

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — WOD SEARCH (ported from crossfit-tracker.jsx)
// ══════════════════════════════════════════════════════════════════════════════

const SAMPLE_WORKOUTS = [
  { id: 1, name: "Fran", duration: 7, movements: ["Thrusters", "Pull-Up"], weightMin: 65, weightMax: 95, type: "For Time", description: "21-15-9: Thrusters, Pull-ups" },
  { id: 2, name: "Murph", duration: 60, movements: ["Running", "Pull-Up", "Push-Up", "Air Squat"], weightMin: 0, weightMax: 0, type: "For Time", description: "1 mile run, 100 pull-ups, 200 push-ups, 300 squats, 1 mile run" },
  { id: 3, name: "Grace", duration: 5, movements: ["Clean and Jerk"], weightMin: 95, weightMax: 135, type: "For Time", description: "30 Clean & Jerks" },
  { id: 4, name: "Helen", duration: 12, movements: ["Running", "Kettlebell Swing", "Pull-Up"], weightMin: 35, weightMax: 53, type: "For Time", description: "3 rounds: 400m run, 21 KB swings, 12 pull-ups" },
  { id: 5, name: "DT", duration: 15, movements: ["Deadlift", "Hang Power Clean", "Push Jerk"], weightMin: 105, weightMax: 155, type: "For Time", description: "5 rounds: 12 deadlifts, 9 hang power cleans, 6 push jerks" },
  { id: 6, name: "Cindy", duration: 20, movements: ["Pull-Up", "Push-Up", "Air Squat"], weightMin: 0, weightMax: 0, type: "AMRAP", description: "20 min AMRAP: 5 pull-ups, 10 push-ups, 15 squats" },
  { id: 7, name: "Annie", duration: 10, movements: ["Double-Under", "Sit-Up"], weightMin: 0, weightMax: 0, type: "For Time", description: "50-40-30-20-10: Double-Unders, Sit-ups" },
  { id: 8, name: "Karen", duration: 15, movements: ["Wall Ball"], weightMin: 14, weightMax: 20, type: "For Time", description: "150 Wall Balls" },
];
const WOD_STORAGE_KEY = "crossfit-workouts-v1";
const DURATION_BUCKETS = [
  { key: "sprint", label: "Sprint", sub: "< 10 min",  test: d => d > 0 && d < 10 },
  { key: "medium", label: "Medium", sub: "10–17 min", test: d => d >= 10 && d <= 17 },
  { key: "long",   label: "Long",   sub: "18+ min",   test: d => d >= 18 },
];
const TYPE_COLORS = { "For Time": { bg: C.accent, text: "#fff" }, AMRAP: { bg: C.green, text: "#fff" }, EMOM: { bg: C.purple, text: "#fff" } };

const MOVE_LIST = [
  "Chest-to-Bar Pull-Up","Toes-to-Bar","Handstand Push-Up","Handstand Walk","Squat Snatch","Power Snatch","Hang Snatch","Squat Clean","Hang Power Clean","Power Clean","Hang Clean","Clean and Jerk",
  "Overhead Squat","Front Squat","Back Squat","Air Squat","Goblet Squat","Kettlebell Swing","Shoulder to Overhead","Push Press","Push Jerk","Split Jerk","Strict Press","Bench Press",
  "Wall Ball","Wall Walk","Box Jump","Box Step-Up","Rope Climb","Double-Under","Single-Under","Devil Press","Man Maker","Renegade Row","Bent Over Row","Dumbbell Row","Ring Row","Inverted Row",
  "Farmers Carry","Turkish Get-Up","Broad Jump","Tuck Jump","Mountain Climber","Hollow Rock","Russian Twist","Glute Bridge","Assault Bike","Echo Bike","Shuttle Run","Sled Push","Sled Pull",
  "Slam Ball","Thruster","Pull-Up","Push-Up","Sit-Up","Deadlift","Sprint","Burpee","Snatch","Clean","Jerk","Muscle-Up","Ring Dip","Dip","Lunge","Pistol","GHD","Row","Run","Bike","Ski",
].sort((a, b) => b.length - a.length);

const MOVE_CANON = { "Run": "Running", "Row": "Rowing", "Echo Bike": "Assault Bike", "Clean & Jerk": "Clean and Jerk" };

function makeBoundaryRegex(phrase) {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${esc}(s|es|ing|ning|ping|ging)?(?![a-z])`, "i");
}
const MOVE_REGEX = MOVE_LIST.map(mv => [mv, makeBoundaryRegex(mv.toLowerCase())]);

function extractMovements(body) {
  const low = body.toLowerCase(); const found = []; const used = [];
  for (const [mv, rx] of MOVE_REGEX) {
    const lm = mv.toLowerCase();
    if (!rx.test(low)) continue;
    const insideLonger = MOVE_REGEX.some(([other, orx]) => other.length > mv.length && other.toLowerCase().includes(lm) && orx.test(low));
    if (insideLonger) continue;
    if (used.some(u => u.includes(lm))) continue;
    used.push(lm); found.push(MOVE_CANON[mv] || mv);
  }
  return [...new Set(found)];
}

function parseNum(v) { const n = parseInt(v); return isNaN(n) ? 0 : n; }
function uid() { return Date.now() + Math.random(); }

function parseWodifyDetail(detail, dateStr) {
  if (!detail) return null;
  const text = String(detail).replace(/&amp;/g, "&").replace(/\\n/g, "\n");
  const re = /([A-Z0-9][^\n(]{1,60}?)\s*\(([^)]*(?:AMRAP|Time|Rounds|EMOM|Reps|Load)[^)]*)\)/g;
  let m, chosen = null, name = "", typ = "";
  while ((m = re.exec(text)) !== null) {
    const n = m[1].trim();
    if (/warm.?up|accessory|cool.?down|checkmark/i.test(n)) continue;
    chosen = m; name = n; typ = m[2].trim(); break;
  }
  if (!chosen) return null;
  name = name.replace(/\s*Rx$/i, "").trim();
  let type = "For Time";
  if (/AMRAP/i.test(typ)) type = "AMRAP";
  else if (/EMOM/i.test(typ)) type = "EMOM";
  let after = text.slice(chosen.index + chosen[0].length);
  const WOD_INTERNAL = /^(?:for time|amrap|emom|rounds?|rest|then|time cap|score|notes?|rx|scaled?)/i;
  const lines = after.split("\n"); let cutIdx = -1, acc = 0;
  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i].trim();
    const hdr = ln.match(/^([A-Z][A-Za-z]+(?:[ &/-][A-Za-z]+){0,3})\s*:/);
    if (i > 0 && hdr && !/\d/.test(hdr[1]) && !WOD_INTERNAL.test(hdr[1])) { cutIdx = acc; break; }
    acc += lines[i].length + 1;
  }
  if (cutIdx >= 0) after = after.slice(0, cutIdx);
  const nextBlock = /\n[^\n(]{1,60}\([^)]*(?:No Measure|Checkmark|Weight|Reps|Rounds|Time|AMRAP|EMOM|Load)[^)]*\)/i.exec(after);
  if (nextBlock) after = after.slice(0, nextBlock.index);
  const body = after.split(/RPE:|Goal |Sweat:|Post WOD/)[0];
  let duration = 0;
  for (const d of [/(\d+)\s*Min\w*\s*AMRAP/i.exec(text), /(\d+)\s*Min\w*\s*EMOM/i.exec(text), /Time Cap:\s*(\d+)/i.exec(text), /(\d+)\s*Min/i.exec(after)]) {
    if (d) { duration = parseInt(d[1]); break; }
  }
  const ws = []; let wm;
  const wre1 = /(\d{2,3})\s*\/\s*\d{2,3}\s*(?:lb|BB)?/g;
  while ((wm = wre1.exec(text)) !== null) ws.push(parseInt(wm[1]));
  const wre2 = /(\d{2,3})\s*(?:lb|BB)/g;
  while ((wm = wre2.exec(text)) !== null) ws.push(parseInt(wm[1]));
  const loads = ws.filter(w => w >= 10 && w <= 400);
  const weightMin = loads.length ? Math.min(...loads) : 0;
  const weightMax = loads.length ? Math.max(...loads) : 0;
  const movements = extractMovements(body);
  if (!movements.length) return null;
  const PARTNER_RE = /you\s+go\s*[/\\]\s*i\s+(rest|hold|go)|partner\s+(1\s*:|2\s*:)/i;
  const partner = PARTNER_RE.test(text);
  return { id: uid(), name, type, duration, weightMin, weightMax, movements, description: body.replace(/\s+/g, " ").trim().slice(0, 300), date: dateStr || "", partner };
}

function parseRows(rows) {
  const cols = Object.keys(rows[0] || {}).map(c => c.toLowerCase());
  const isWodifyRaw = cols.some(c => c.includes("component") && c.includes("detail"));
  if (isWodifyRaw) {
    const detailKey = Object.keys(rows[0]).find(c => /component.*detail/i.test(c));
    const dateKey = Object.keys(rows[0]).find(c => /date/i.test(c));
    return { workouts: rows.map(r => parseWodifyDetail(r[detailKey], dateKey ? r[dateKey] : "")).filter(Boolean), format: "Wodify export" };
  }
  const find = (row, ...keys) => { for (const k of keys) { const hit = Object.keys(row).find(c => c.toLowerCase().replace(/\s+/g,"") === k.toLowerCase()); if (hit && row[hit] !== undefined && row[hit] !== "") return String(row[hit]); } return ""; };
  const workouts = rows.map(row => {
    const name = find(row, "name","workoutname","title","wod"); if (!name) return null;
    const descRaw = find(row, "description","notes","workout"); const movRaw = find(row, "movements","exercises");
    const movements = movRaw ? String(movRaw).split(/[,;\/]/).map(s=>s.trim()).filter(Boolean) : [];
    const duration = parseNum(find(row,"duration","time","minutes","min")); const weightMin = parseNum(find(row,"weightmin","minweight","weight")); const weightMax = parseNum(find(row,"weightmax","maxweight")) || weightMin;
    const typeRaw = find(row,"type","workouttype","scheme"); const type = ["AMRAP","EMOM"].find(t=>typeRaw.toUpperCase().includes(t)) || "For Time";
    return { id: uid(), name, duration, movements, weightMin, weightMax, type, description: descRaw };
  }).filter(Boolean);
  return { workouts, format: "standard columns" };
}

function WodSearch() {
  const [workouts, setWorkouts] = useState(null);
  const [nameQuery, setNameQuery] = useState("");
  const [selectedMovements, setSelectedMovements] = useState([]);
  const [selectedBuckets, setSelectedBuckets] = useState([]);
  const [partnerOnly, setPartnerOnly] = useState(false);
  const [weightRange, setWeightRange] = useState([0, 200]);
  const [movementSearch, setMovementSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWorkout, setNewWorkout] = useState({ name: "", duration: "", movements: [], weightMin: "", weightMax: "", type: "For Time", description: "" });
  const [newMovementInput, setNewMovementInput] = useState("");
  const [importStatus, setImportStatus] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const fileRef = useRef(); const saveTimer = useRef();

  useEffect(() => {
    (async () => { try { const r = await window.storage.get(WOD_STORAGE_KEY); setWorkouts(r ? JSON.parse(r.value) : SAMPLE_WORKOUTS); } catch { setWorkouts(SAMPLE_WORKOUTS); } })();
  }, []);

  const persist = useCallback(async (data) => {
    clearTimeout(saveTimer.current); setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => { try { await window.storage.set(WOD_STORAGE_KEY, JSON.stringify(data)); setSaveStatus("saved"); } catch { setSaveStatus("error"); } }, 600);
  }, []);

  const updateWorkouts = useCallback((updater) => {
    setWorkouts(prev => { const next = typeof updater === "function" ? updater(prev) : updater; persist(next); return next; });
  }, [persist]);

  const allMovements = useMemo(() => [...new Set((workouts || []).flatMap(w => w.movements))].sort(), [workouts]);
  const filteredMovements = allMovements.filter(m => m.toLowerCase().includes(movementSearch.toLowerCase()));
  const filteredWorkouts = useMemo(() => {
    if (!workouts) return [];
    return workouts.filter(w => {
      const nameMatch = w.name.toLowerCase().includes(nameQuery.toLowerCase());
      const movMatch = selectedMovements.length === 0 || selectedMovements.every(m => w.movements.includes(m));
      const durMatch = selectedBuckets.length === 0 || selectedBuckets.some(bk => DURATION_BUCKETS.find(b => b.key === bk)?.test(w.duration));
      const wtMatch = w.weightMax === 0 ? weightRange[0] === 0 : w.weightMax >= weightRange[0] && w.weightMin <= weightRange[1];
      const partMatch = !partnerOnly || w.partner === true;
      return nameMatch && movMatch && durMatch && wtMatch && partMatch;
    });
  }, [workouts, nameQuery, selectedMovements, selectedBuckets, weightRange, partnerOnly]);

  const toggleMovement = m => setSelectedMovements(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  const toggleBucket = k => setSelectedBuckets(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);
  const clearFilters = () => { setNameQuery(""); setSelectedMovements([]); setSelectedBuckets([]); setPartnerOnly(false); setWeightRange([0,200]); setMovementSearch(""); };
  const activeFilters = nameQuery || selectedMovements.length > 0 || selectedBuckets.length > 0 || partnerOnly || weightRange[0] > 0 || weightRange[1] < 200;

  const addWorkout = () => {
    if (!newWorkout.name || !newWorkout.duration) return;
    const w = { id: Date.now(), name: newWorkout.name, duration: parseNum(newWorkout.duration), movements: newWorkout.movements, weightMin: parseNum(newWorkout.weightMin), weightMax: parseNum(newWorkout.weightMax), type: newWorkout.type, description: newWorkout.description };
    updateWorkouts(prev => [...prev, w]);
    setNewWorkout({ name: "", duration: "", movements: [], weightMin: "", weightMax: "", type: "For Time", description: "" });
    setShowAddForm(false);
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return; setImportStatus(null);
    try {
      const buf = await file.arrayBuffer(); const wb = XLSX.read(buf, { type: "array" }); const ws = wb.Sheets[wb.SheetNames[0]]; const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { setImportStatus({ type: "error", msg: "Spreadsheet appears empty." }); return; }
      const { workouts: parsed, format } = parseRows(rows);
      if (!parsed.length) { setImportStatus({ type: "error", msg: `No workouts found. Columns: ${Object.keys(rows[0]).join(", ")}` }); return; }
      updateWorkouts(prev => {
        const existingNames = new Set(prev.map(w => w.name.toLowerCase())); const seen = new Set();
        const fresh = parsed.filter(w => { const k = w.name.toLowerCase(); if (existingNames.has(k) || seen.has(k)) return false; seen.add(k); return true; });
        const dupes = parsed.length - fresh.length;
        setImportStatus({ type: "success", msg: `Imported ${fresh.length} workouts from ${format}${dupes ? ` (${dupes} duplicates skipped)` : ""}.` });
        return [...prev, ...fresh];
      });
    } catch (err) { setImportStatus({ type: "error", msg: `Parse error: ${err.message}` }); }
    e.target.value = "";
  };

  if (!workouts) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.textFaint,letterSpacing:"0.2em",textTransform:"uppercase" }}>Loading…</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* Header */}
      <div style={{ padding:"20px 24px 0", borderBottom:`1px solid ${C.line}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:"0.25em", color:C.accent, fontWeight:700, marginBottom:4 }}>WOD LIBRARY</div>
            <h2 style={{ fontSize:32, fontWeight:900, lineHeight:1, letterSpacing:"-0.01em", textTransform:"uppercase" }}>CrossFit <span style={{ color:C.accent }}>Search</span></h2>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
            <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color: saveStatus==="saved"?"#4F9D8C":saveStatus==="saving"?"#888":"#f44" }}>
              {saveStatus==="saved"?"✓ Saved":saveStatus==="saving"?"Saving…":"⚠ Save error"}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn" onClick={() => fileRef.current?.click()} style={{ background:C.navy3, color:C.text, padding:"8px 14px", fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", borderRadius:3, border:`1px solid ${C.line}` }}>⬆ Import Excel</button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display:"none" }} onChange={handleFile} />
              <button className="btn" onClick={() => setShowAddForm(!showAddForm)} style={{ background:showAddForm?"#222":C.accent, color:"#fff", padding:"8px 16px", fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", borderRadius:3 }}>
                {showAddForm?"✕ Cancel":"+ Add WOD"}
              </button>
            </div>
          </div>
        </div>
        <input value={nameQuery} onChange={e => setNameQuery(e.target.value)} placeholder="Search workouts…" style={{ width:"100%", maxWidth:400, height:36, marginBottom:12, fontSize:13 }} />
        {importStatus && (
          <div className="fade-in" style={{ marginBottom:12, padding:"8px 12px", borderRadius:4, background:importStatus.type==="success"?"#0a2a0a":"#2a0a0a", border:`1px solid ${importStatus.type==="success"?"#2a6":"#a33"}`, color:importStatus.type==="success"?"#4d4":"#f88", fontSize:12, display:"flex", justifyContent:"space-between" }}>
            <span>{importStatus.msg}</span><span style={{ cursor:"pointer" }} onClick={() => setImportStatus(null)}>✕</span>
          </div>
        )}
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Sidebar */}
        <div className="sidebar-hide" style={{ width:220, borderRight:`1px solid ${C.line}`, padding:"16px 12px", overflowY:"auto", background:C.navy, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:14 }}>
            <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.2em", color:C.textFaint, textTransform:"uppercase" }}>Filters</span>
            {activeFilters && <button className="btn" onClick={clearFilters} style={{ background:"none", color:C.accent, fontSize:11, fontWeight:700 }}>Clear</button>}
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:C.textDim, textTransform:"uppercase", marginBottom:8 }}>Duration</div>
            {DURATION_BUCKETS.map(b => {
              const active = selectedBuckets.includes(b.key);
              return <button key={b.key} className="btn" onClick={() => toggleBucket(b.key)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", padding:"8px 10px", borderRadius:4, marginBottom:4, background:active?C.accent:C.navy2, border:`1px solid ${active?C.accent:C.line}`, color:active?"#fff":C.text, fontFamily:FONT, letterSpacing:"0.06em", textTransform:"uppercase" }}>
                <span style={{ fontSize:13, fontWeight:700 }}>{b.label}</span>
                <span style={{ fontSize:10, color:active?"rgba(255,255,255,0.8)":C.textFaint }}>{b.sub}</span>
              </button>;
            })}
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:C.textDim, textTransform:"uppercase", marginBottom:8 }}>Format</div>
            <button className="btn" onClick={() => setPartnerOnly(p=>!p)} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", width:"100%", padding:"8px 10px", borderRadius:4, background:partnerOnly?C.accent:C.navy2, border:`1px solid ${partnerOnly?C.accent:C.line}`, color:partnerOnly?"#fff":C.text, fontFamily:FONT, textTransform:"uppercase", letterSpacing:"0.06em" }}>
              <span style={{ fontSize:13, fontWeight:700 }}>👥 Partner</span>
            </button>
          </div>
          <div style={{ marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:C.textDim, textTransform:"uppercase", marginBottom:8 }}>Weight (lbs)</div>
            <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:12, color:C.accent, fontWeight:700 }}><span>{weightRange[0]}</span><span>{weightRange[1]}</span></div>
            <input type="range" min={0} max={200} value={weightRange[0]} onChange={e => setWeightRange([Math.min(+e.target.value, weightRange[1]-5), weightRange[1]])} style={{ marginBottom:6 }} />
            <input type="range" min={0} max={200} value={weightRange[1]} onChange={e => setWeightRange([weightRange[0], Math.max(+e.target.value, weightRange[0]+5)])} />
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:"0.15em", color:C.textDim, textTransform:"uppercase", marginBottom:8 }}>Movements</div>
            <input placeholder="Filter…" value={movementSearch} onChange={e => setMovementSearch(e.target.value)} style={{ width:"100%", marginBottom:8, height:32, fontSize:12 }} />
            <div style={{ display:"flex", flexDirection:"column", gap:3 }}>
              {filteredMovements.map(m => {
                const active = selectedMovements.includes(m);
                return <div key={m} onClick={() => toggleMovement(m)} style={{ padding:"5px 8px", background:active?C.accent:C.navy2, border:`1px solid ${active?C.accent:C.line}`, borderRadius:3, fontSize:12, fontWeight:active?700:400, color:active?"#fff":"#aaa", cursor:"pointer", display:"flex", justifyContent:"space-between" }}>
                  <span>{m}</span>{active && <span style={{ fontSize:10 }}>✓</span>}
                </div>;
              })}
            </div>
          </div>
        </div>

        {/* Main */}
        <div className="main-full" style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {showAddForm && (
            <div className="fade-in" style={{ background:C.navy2, border:`1px solid ${C.accent}`, borderRadius:6, padding:18, marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:800, letterSpacing:"0.15em", textTransform:"uppercase", color:C.accent, marginBottom:14 }}>New Workout</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
                <div><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Name *</label><input style={{ width:"100%" }} value={newWorkout.name} onChange={e => setNewWorkout(p=>({...p,name:e.target.value}))} placeholder="e.g. Fran" /></div>
                <div><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Type</label><select style={{ width:"100%", height:36 }} value={newWorkout.type} onChange={e => setNewWorkout(p=>({...p,type:e.target.value}))}><option>For Time</option><option>AMRAP</option><option>EMOM</option></select></div>
                <div><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Duration (min) *</label><input type="number" style={{ width:"100%" }} value={newWorkout.duration} onChange={e => setNewWorkout(p=>({...p,duration:e.target.value}))} /></div>
                <div style={{ display:"flex", gap:8 }}>
                  <div style={{ flex:1 }}><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Wt Min</label><input type="number" style={{ width:"100%" }} value={newWorkout.weightMin} onChange={e => setNewWorkout(p=>({...p,weightMin:e.target.value}))} /></div>
                  <div style={{ flex:1 }}><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Wt Max</label><input type="number" style={{ width:"100%" }} value={newWorkout.weightMax} onChange={e => setNewWorkout(p=>({...p,weightMax:e.target.value}))} /></div>
                </div>
              </div>
              <div style={{ marginBottom:10 }}>
                <label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Movements</label>
                <div style={{ display:"flex", gap:8, marginBottom:6 }}>
                  <input style={{ flex:1 }} value={newMovementInput} onChange={e => setNewMovementInput(e.target.value)} onKeyDown={e => { if(e.key==="Enter"){ const m=newMovementInput.trim(); if(m&&!newWorkout.movements.includes(m)) setNewWorkout(p=>({...p,movements:[...p.movements,m]})); setNewMovementInput(""); }}} placeholder="Type and press Enter" />
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                  {newWorkout.movements.map(m => <span key={m} style={{ background:C.line, borderRadius:2, padding:"2px 8px", fontSize:11, display:"flex", alignItems:"center", gap:4 }}>{m}<span style={{ cursor:"pointer", color:C.accent }} onClick={() => setNewWorkout(p=>({...p,movements:p.movements.filter(x=>x!==m)}))}>×</span></span>)}
                </div>
              </div>
              <div style={{ marginBottom:12 }}><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Description</label><textarea style={{ width:"100%", minHeight:56, resize:"vertical" }} value={newWorkout.description} onChange={e => setNewWorkout(p=>({...p,description:e.target.value}))} /></div>
              <button className="btn" onClick={addWorkout} style={{ background:C.accent, color:"#fff", padding:"8px 20px", fontWeight:800, fontSize:13, letterSpacing:"0.1em", textTransform:"uppercase", borderRadius:3 }}>Save Workout</button>
            </div>
          )}
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:13, color:C.textFaint }}><span style={{ color:C.accent, fontWeight:800, fontSize:20 }}>{filteredWorkouts.length}</span> of {workouts.length} workouts</div>
            {selectedMovements.length > 0 && <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
              {selectedMovements.map(m => <span key={m} className="badge" style={{ background:`rgba(62,110,142,0.12)`, color:C.accent, border:`1px solid rgba(62,110,142,0.22)`, cursor:"pointer" }} onClick={() => toggleMovement(m)}>{m} ×</span>)}
            </div>}
          </div>
          {filteredWorkouts.length === 0 ? (
            <div style={{ textAlign:"center", padding:"60px 0", color:C.textFaint }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🏋️</div>
              <div style={{ fontSize:16, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em" }}>No workouts match</div>
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {filteredWorkouts.map(w => {
                const expanded = expandedId === w.id;
                const tc = TYPE_COLORS[w.type] || { bg:C.navy3, text:"#fff" };
                return (
                  <div key={w.id} className="card" style={{ background:C.navy2, borderRadius:5, overflow:"hidden", cursor:"pointer", border:`1px solid ${expanded?C.accent:C.line}` }} onClick={() => setExpandedId(expanded?null:w.id)}>
                    <div style={{ padding:"12px 16px", display:"flex", alignItems:"center", gap:12 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                          <span style={{ fontSize:20, fontWeight:900, letterSpacing:"0.02em", textTransform:"uppercase" }}>{w.name}</span>
                          <span className="badge" style={{ background:tc.bg, color:tc.text }}>{w.type}</span>
                          {w.partner && <span className="badge" style={{ background:C.navy3, color:C.textDim, border:`1px solid ${C.line}` }}>👥 Partner</span>}
                        </div>
                        <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                          {w.movements.map(m => <span key={m} style={{ fontSize:10, padding:"2px 6px", borderRadius:2, background:selectedMovements.includes(m)?`rgba(62,110,142,0.12)`:C.navy3, color:selectedMovements.includes(m)?C.accent:"#777", border:`1px solid ${selectedMovements.includes(m)?"rgba(62,110,142,0.3)":C.line}`, letterSpacing:"0.03em", cursor:"pointer" }} onClick={e => { e.stopPropagation(); toggleMovement(m); }}>{m}</span>)}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:16, flexShrink:0, alignItems:"center" }}>
                        <div style={{ textAlign:"center" }}><div style={{ fontSize:20, fontWeight:800, color:C.accent, lineHeight:1 }}>{w.duration||"—"}</div><div style={{ fontSize:9, color:C.textFaint, letterSpacing:"0.12em", textTransform:"uppercase" }}>min</div></div>
                        {(w.weightMin > 0 || w.weightMax > 0) ? <div style={{ textAlign:"center" }}><div style={{ fontSize:13, fontWeight:700, color:C.text }}>{w.weightMin===w.weightMax?w.weightMax:`${w.weightMin}–${w.weightMax}`}</div><div style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>lbs</div></div>
                        : <div style={{ textAlign:"center" }}><div style={{ fontSize:11, fontWeight:600, color:C.textFaint }}>BW</div></div>}
                        <div style={{ color:C.textFaint, fontSize:14, transform:expanded?"rotate(180deg)":"none", transition:"transform 0.2s" }}>▼</div>
                      </div>
                    </div>
                    {expanded && <div className="fade-in" style={{ borderTop:`1px solid ${C.line}`, padding:"12px 16px", background:C.navy }}><div style={{ fontSize:13, color:C.textDim, lineHeight:1.6 }}>{w.description||<em style={{ color:C.textFaint }}>No description.</em>}</div></div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — PLAYBOOK (AI-powered, persistent, flowchart view)
// ══════════════════════════════════════════════════════════════════════════════

const PLAYBOOK_STORAGE_KEY = "vegvisir-playbook-v2";

const CATEGORY_COLORS_PB = {
  "Gym Overview":         { accent:"#e94560" },
  "Maintenance":          { accent:"#4caf50" },
  "Cleaning & Supplies":  { accent:"#2196f3" },
  "Grounds":              { accent:"#ff9800" },
  "Equipment & Ordering": { accent:"#9c27b0" },
  "Sales & Member Ops":   { accent:C.gold },
  "Coaching":             { accent:C.accentHi },
  "Other":                { accent:C.textDim },
};
const PB_CATEGORIES = ["All", ...Object.keys(CATEGORY_COLORS_PB)];

async function callClaude(messages, systemPrompt) {
  const body = { model:"claude-sonnet-4-6", max_tokens:1000, messages };
  if (systemPrompt) body.system = systemPrompt;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST", headers:{ "Content-Type":"application/json", "anthropic-version":"2023-06-01" },
    body: JSON.stringify(body)
  });
  if (!response.ok) { const e = await response.json().catch(()=>({})); throw new Error(e?.error?.message || `HTTP ${response.status}`); }
  const data = await response.json();
  return data.content.map(b => b.text||"").join("").trim();
}

async function formatSOPAsFlow(title, rawText) {
  const systemPrompt = `You are formatting Standard Operating Procedures for Vegvisir CrossFit, a CrossFit gym in Houston. 
Convert the input into a JSON flowchart structure. Return ONLY valid JSON, no markdown, no explanation.

Format:
{
  "summary": "One sentence description of what this SOP covers",
  "category": "One of: Gym Overview, Maintenance, Cleaning & Supplies, Grounds, Equipment & Ordering, Sales & Member Ops, Coaching, Other",
  "steps": [
    {
      "id": "1",
      "type": "action",
      "text": "What to do",
      "next": "2"
    },
    {
      "id": "2", 
      "type": "decision",
      "text": "Is X true?",
      "yes": "3",
      "no": "4"
    },
    {
      "id": "3",
      "type": "action",
      "text": "If yes, do this",
      "next": null
    },
    {
      "id": "4",
      "type": "action", 
      "text": "If no, do this",
      "next": null
    }
  ]
}

Types: "action" (regular step), "decision" (yes/no branch), "end" (final outcome), "warning" (important note).
Keep steps concise. 3-8 steps is ideal. Always end branches with a null next.`;

  const raw = await callClaude([{ role:"user", content:`Title: "${title}"\n\nContent:\n${rawText}` }], systemPrompt);
  try {
    const clean = raw.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch {
    return { summary: rawText.slice(0, 120), category: "Other", steps: [{ id:"1", type:"action", text: rawText.slice(0,300), next:null }] };
  }
}

async function transcribeAudio(file) {
  const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.onerror = rej; r.readAsDataURL(file); });
  return callClaude([{ role:"user", content:[
    { type:"document", source:{ type:"base64", media_type:"audio/mp4", data:b64 } },
    { type:"text", text:"Transcribe this audio recording exactly as spoken. Output only the transcription, nothing else." }
  ]}]);
}

function FlowChart({ steps }) {
  const [visited, setVisited] = useState(new Set(["1"]));
  const [path, setPath] = useState(["1"]);
  const stepMap = useMemo(() => { const m = {}; (steps||[]).forEach(s => m[s.id] = s); return m; }, [steps]);

  const reset = () => { setVisited(new Set(["1"])); setPath(["1"]); };

  const follow = (nextId) => {
    if (!nextId) return;
    setPath(p => [...p, nextId]);
    setVisited(v => new Set([...v, nextId]));
  };

  const currentStep = stepMap[path[path.length - 1]];
  const isComplete = !currentStep || (!currentStep.next && currentStep.type !== "decision") || currentStep.type === "end";

  const typeStyle = (type) => {
    if (type === "decision") return { bg:"rgba(201,168,76,0.12)", border:`1px solid ${C.gold}`, color:C.gold };
    if (type === "warning") return { bg:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.4)", color:"#ef4444" };
    if (type === "end") return { bg:"rgba(79,157,140,0.12)", border:`1px solid ${C.green}`, color:C.green };
    return { bg:C.navy2, border:`1px solid ${C.line}`, color:C.text };
  };

  return (
    <div style={{ padding:"16px 0" }}>
      {/* Progress path */}
      {path.map((id, idx) => {
        const step = stepMap[id]; if (!step) return null;
        const isLast = idx === path.length - 1;
        const ts = typeStyle(step.type);
        return (
          <div key={id} style={{ marginBottom:isLast?0:32, position:"relative" }}>
            {idx > 0 && <div style={{ position:"absolute", top:-28, left:20, width:2, height:28, background:C.line }} />}
            <div style={{ ...ts, borderRadius:8, padding:"12px 16px" }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:10 }}>
                <div style={{ width:24, height:24, borderRadius:"50%", background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:700, flexShrink:0, color:ts.color }}>{id}</div>
                <div style={{ flex:1 }}>
                  {step.type === "decision" && <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color:C.gold, marginBottom:4 }}>Decision</div>}
                  {step.type === "warning" && <div style={{ fontSize:10, fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", color:"#ef4444", marginBottom:4 }}>⚠ Warning</div>}
                  <div style={{ fontSize:14, lineHeight:1.5 }}>{step.text}</div>
                  {isLast && step.type === "decision" && (
                    <div style={{ display:"flex", gap:10, marginTop:12 }}>
                      <button className="btn" onClick={() => follow(step.yes)} style={{ background:`rgba(79,157,140,0.15)`, border:`1px solid ${C.green}`, color:C.green, padding:"6px 16px", borderRadius:4, fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase" }}>✓ Yes{step.yes && ` → ${step.yes}`}</button>
                      <button className="btn" onClick={() => follow(step.no)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.4)", color:"#ef4444", padding:"6px 16px", borderRadius:4, fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase" }}>✕ No{step.no && ` → ${step.no}`}</button>
                    </div>
                  )}
                  {isLast && step.type !== "decision" && step.next && (
                    <button className="btn" onClick={() => follow(step.next)} style={{ marginTop:10, background:C.accent, color:"#fff", padding:"6px 14px", borderRadius:4, fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase" }}>Next →</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {isComplete && path.length > 0 && (
        <div style={{ marginTop:path.length > 1 ? 32 : 16, paddingTop:16, borderTop:`1px solid ${C.line}`, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <div style={{ fontSize:12, color:C.green, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>✓ Complete</div>
          {path.length > 1 && <button className="btn" onClick={reset} style={{ background:"none", color:C.textFaint, fontSize:11, fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>↺ Start over</button>}
        </div>
      )}
    </div>
  );
}

function Playbook() {
  const [sops, setSops] = useState(null);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedSop, setSelectedSop] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);
  const [addMode, setAddMode] = useState(null); // null | "audio" | "text"
  const [textInput, setTextInput] = useState({ title:"", content:"", category:"Other" });
  const [saveStatus, setSaveStatus] = useState("saved");
  const audioRef = useRef(); const saveTimer = useRef();

  useEffect(() => {
    (async () => {
      try { const r = await window.storage.get(PLAYBOOK_STORAGE_KEY); setSops(r ? JSON.parse(r.value) : {}); }
      catch { setSops({}); }
    })();
  }, []);

  const persist = useCallback(async (data) => {
    clearTimeout(saveTimer.current); setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      try { await window.storage.set(PLAYBOOK_STORAGE_KEY, JSON.stringify(data)); setSaveStatus("saved"); }
      catch { setSaveStatus("error"); }
    }, 600);
  }, []);

  const addSop = useCallback((key, data) => {
    setSops(prev => { const next = { ...prev, [key]: data }; persist(next); return next; });
  }, [persist]);

  const deleteSop = useCallback((key) => {
    setSops(prev => { const next = { ...prev }; delete next[key]; persist(next); return next; });
    if (selectedSop === key) setSelectedSop(null);
  }, [persist, selectedSop]);

  const handleAudioFiles = useCallback(async (files) => {
    const fileArray = Array.from(files);
    setUploading(true); setUploadStatus({ type:"info", msg:`Processing ${fileArray.length} file${fileArray.length>1?"s":""}…` });
    for (const file of fileArray) {
      try {
        setUploadStatus({ type:"info", msg:`Transcribing: ${file.name.replace(/_/g," ").replace(".m4a","")}…` });
        const transcript = await transcribeAudio(file);
        const title = file.name.replace(/_/g," ").replace(/\.m4a$/i,"");
        setUploadStatus({ type:"info", msg:`Formatting: ${title}…` });
        const flow = await formatSOPAsFlow(title, transcript);
        addSop(`audio_${file.name}_${Date.now()}`, { title, flow, source:"audio", addedAt: new Date().toISOString() });
        setUploadStatus({ type:"success", msg:`Added: ${title}` });
      } catch (err) {
        setUploadStatus({ type:"error", msg:`Error processing ${file.name}: ${err.message}` });
      }
    }
    setUploading(false); setAddMode(null);
  }, [addSop]);

  const handleTextSubmit = useCallback(async () => {
    if (!textInput.title || !textInput.content) return;
    setUploading(true); setUploadStatus({ type:"info", msg:"Formatting SOP…" });
    try {
      const flow = await formatSOPAsFlow(textInput.title, textInput.content);
      addSop(`text_${Date.now()}`, { title: textInput.title, flow, source:"text", addedAt: new Date().toISOString() });
      setUploadStatus({ type:"success", msg:`Added: ${textInput.title}` });
      setTextInput({ title:"", content:"", category:"Other" });
      setAddMode(null);
    } catch (err) {
      setUploadStatus({ type:"error", msg:`Error: ${err.message}` });
    }
    setUploading(false);
  }, [textInput, addSop]);

  const filteredSops = useMemo(() => {
    if (!sops) return [];
    return Object.entries(sops).filter(([, sop]) => {
      const cat = sop.flow?.category || "Other";
      const matchCat = activeCategory === "All" || cat === activeCategory;
      const matchSearch = !search || sop.title.toLowerCase().includes(search.toLowerCase()) || sop.flow?.summary?.toLowerCase().includes(search.toLowerCase());
      return matchCat && matchSearch;
    });
  }, [sops, search, activeCategory]);

  const catCounts = useMemo(() => {
    const counts = {};
    Object.values(sops || {}).forEach(s => { const cat = s.flow?.category || "Other"; counts[cat] = (counts[cat]||0) + 1; });
    return counts;
  }, [sops]);

  if (!sops) return <div style={{ display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:C.textFaint,letterSpacing:"0.2em",textTransform:"uppercase" }}>Loading…</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%" }}>
      {/* Header */}
      <div style={{ padding:"20px 24px 0", borderBottom:`1px solid ${C.line}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:"0.25em", color:C.gold, fontWeight:700, marginBottom:4 }}>STAFF OPERATIONS</div>
            <h2 style={{ fontSize:32, fontWeight:900, lineHeight:1, letterSpacing:"-0.01em", textTransform:"uppercase" }}>Playbook <span style={{ color:C.gold }}>SOP</span></h2>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8, alignItems:"flex-end" }}>
            <div style={{ fontSize:10, letterSpacing:"0.12em", textTransform:"uppercase", color: saveStatus==="saved"?"#4F9D8C":saveStatus==="saving"?"#888":"#f44" }}>
              {saveStatus==="saved"?"✓ Saved":saveStatus==="saving"?"Saving…":"⚠ Save error"}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button className="btn" onClick={() => setAddMode(addMode==="audio"?null:"audio")} style={{ background:addMode==="audio"?"#222":C.navy3, color:C.text, padding:"8px 14px", fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", borderRadius:3, border:`1px solid ${C.line}` }}>🎙 Audio</button>
              <button className="btn" onClick={() => setAddMode(addMode==="text"?null:"text")} style={{ background:addMode==="text"?C.gold:"#222", color:addMode==="text"?"#000":C.gold, padding:"8px 16px", fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", borderRadius:3, border:`1px solid ${C.gold}` }}>+ Add SOP</button>
            </div>
          </div>
        </div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SOPs…" style={{ width:"100%", maxWidth:400, height:36, marginBottom:12, fontSize:13 }} />
        {uploadStatus && <div className="fade-in" style={{ marginBottom:12, padding:"8px 12px", borderRadius:4, background:uploadStatus.type==="success"?"#0a2a0a":uploadStatus.type==="error"?"#2a0a0a":"rgba(62,110,142,0.1)", border:`1px solid ${uploadStatus.type==="success"?"#2a6":uploadStatus.type==="error"?"#a33":C.line}`, color:uploadStatus.type==="success"?"#4d4":uploadStatus.type==="error"?"#f88":C.textDim, fontSize:12, display:"flex", justifyContent:"space-between" }}>
          <span>{uploading?"⏳ ":uploadStatus.type==="success"?"✓ ":"⚠ "}{uploadStatus.msg}</span>
          {!uploading && <span style={{ cursor:"pointer" }} onClick={() => setUploadStatus(null)}>✕</span>}
        </div>}
      </div>

      <div style={{ display:"flex", flex:1, overflow:"hidden" }}>
        {/* Sidebar */}
        <div className="sidebar-hide" style={{ width:200, borderRight:`1px solid ${C.line}`, padding:"12px 0", overflowY:"auto", background:C.navy, flexShrink:0 }}>
          {PB_CATEGORIES.map(cat => {
            const colors = CATEGORY_COLORS_PB[cat];
            const count = cat === "All" ? Object.keys(sops).length : catCounts[cat];
            return <button key={cat} className="btn" onClick={() => setActiveCategory(cat)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", width:"100%", background:activeCategory===cat?"rgba(255,255,255,0.04)":"none", border:"none", borderLeft:activeCategory===cat?`2px solid ${colors?.accent||C.accent}`:"2px solid transparent", color:activeCategory===cat?C.text:C.textFaint, padding:"8px 14px", cursor:"pointer", fontSize:12, textAlign:"left" }}>
              <span>{cat}</span>
              {count ? <span style={{ fontSize:10, background:"rgba(255,255,255,0.06)", padding:"1px 5px", borderRadius:8, color:C.textFaint }}>{count}</span> : null}
            </button>;
          })}
        </div>

        {/* Main */}
        <div className="main-full" style={{ flex:1, overflowY:"auto", padding:"16px 20px" }}>
          {/* Add SOP panels */}
          {addMode === "text" && (
            <div className="fade-in" style={{ background:C.navy2, border:`1px solid ${C.gold}`, borderRadius:6, padding:18, marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:800, letterSpacing:"0.15em", textTransform:"uppercase", color:C.gold, marginBottom:14 }}>New SOP — Text / Paste</div>
              <div style={{ marginBottom:10 }}><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>Title *</label><input style={{ width:"100%" }} value={textInput.title} onChange={e => setTextInput(p=>({...p,title:e.target.value}))} placeholder="e.g. If the gate is stuck" /></div>
              <div style={{ marginBottom:10 }}><label style={{ fontSize:10, color:C.textFaint, display:"block", marginBottom:3, textTransform:"uppercase", letterSpacing:"0.1em" }}>SOP Content * (paste your notes, voice transcript, or written procedure)</label><textarea style={{ width:"100%", minHeight:120, resize:"vertical", fontSize:13, lineHeight:1.5 }} value={textInput.content} onChange={e => setTextInput(p=>({...p,content:e.target.value}))} placeholder="Paste or type the procedure here. Claude will convert it into a step-by-step flowchart automatically." /></div>
              <button className="btn" onClick={handleTextSubmit} disabled={uploading||!textInput.title||!textInput.content} style={{ background:uploading||!textInput.title||!textInput.content?"#333":C.gold, color:uploading||!textInput.title||!textInput.content?C.textFaint:"#000", padding:"8px 20px", fontWeight:800, fontSize:12, letterSpacing:"0.1em", textTransform:"uppercase", borderRadius:3, cursor:uploading?"not-allowed":"pointer" }}>
                {uploading?"Processing…":"Build Flowchart →"}
              </button>
            </div>
          )}
          {addMode === "audio" && (
            <div className="fade-in" style={{ background:C.navy2, border:`1px solid ${C.line}`, borderRadius:6, padding:18, marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:800, letterSpacing:"0.15em", textTransform:"uppercase", color:C.textDim, marginBottom:14 }}>Upload Audio SOPs</div>
              <div onClick={() => audioRef.current?.click()} onDrop={e => { e.preventDefault(); handleAudioFiles(e.dataTransfer.files); }} onDragOver={e => e.preventDefault()} style={{ border:"2px dashed #2A3A49", borderRadius:8, padding:"32px 24px", cursor:"pointer", textAlign:"center" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🎙</div>
                <div style={{ color:C.textDim, fontSize:13 }}>Drag & drop .m4a files or click to browse</div>
                <div style={{ color:C.textFaint, fontSize:11, marginTop:4 }}>Claude will transcribe and build flowcharts automatically</div>
              </div>
              <input ref={audioRef} type="file" accept=".m4a,audio/*" multiple style={{ display:"none" }} onChange={e => handleAudioFiles(e.target.files)} />
            </div>
          )}

          {filteredSops.length === 0 ? (
            <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"60%", color:C.textFaint }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📋</div>
              <div style={{ fontSize:15, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:6 }}>{Object.keys(sops).length === 0 ? "No SOPs yet" : "No results"}</div>
              <div style={{ fontSize:12, color:C.textFaint }}>{Object.keys(sops).length === 0 ? 'Use "+ Add SOP" to add your first procedure' : "Try a different search or category"}</div>
            </div>
          ) : (
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(300px, 1fr))", gap:14 }}>
              {filteredSops.map(([key, sop]) => {
                const cat = sop.flow?.category || "Other";
                const colors = CATEGORY_COLORS_PB[cat] || { accent:C.textDim };
                const isSelected = selectedSop === key;
                return (
                  <div key={key} onClick={() => setSelectedSop(isSelected?null:key)} className="card" style={{ background:C.navy2, border:`1px solid ${isSelected?colors.accent:C.line}`, borderRadius:10, padding:16, cursor:"pointer", gridColumn:isSelected?"1/-1":undefined }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:9, textTransform:"uppercase", letterSpacing:"1px", color:colors.accent, marginBottom:3 }}>{cat}</div>
                        <div style={{ fontWeight:700, fontSize:14 }}>{sop.title}</div>
                      </div>
                      <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                        <span style={{ color:C.textFaint, fontSize:14 }}>{isSelected?"▲":"▼"}</span>
                        <span style={{ color:"#555", fontSize:14, cursor:"pointer" }} onClick={e => { e.stopPropagation(); if(window.confirm(`Delete "${sop.title}"?`)) deleteSop(key); }}>🗑</span>
                      </div>
                    </div>
                    {!isSelected && <div style={{ fontSize:12, color:C.textFaint, lineHeight:1.5, overflow:"hidden", display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical" }}>{sop.flow?.summary||"No summary"}</div>}
                    {isSelected && sop.flow?.steps && <FlowChart steps={sop.flow.steps} />}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SECTION 3 — DASHBOARD (Wodify class schedule)
// ══════════════════════════════════════════════════════════════════════════════

const PROXY = "https://coach-dashboard-api.onrender.com";

function Dashboard() {
  const [classes, setClasses] = useState(null);
  const [date, setDate] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`${PROXY}/today-classes`);
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const data = await r.json();
      setClasses(data.classes || []); setDate(data.date);
      setLastRefresh(new Date().toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" }));
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();

  const classStatus = (cls) => {
    if (!cls.start_time) return "upcoming";
    const [h, m] = cls.start_time.split(":").map(Number);
    const startMins = h * 60 + m;
    const endMins = startMins + 60;
    if (nowMins >= startMins && nowMins < endMins) return "live";
    if (nowMins >= endMins) return "done";
    return "upcoming";
  };

  const fmtTime = (t) => {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const ampm = h >= 12 ? "PM" : "AM";
    return `${h > 12 ? h - 12 : h || 12}:${String(m).padStart(2,"0")} ${ampm}`;
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflowY:"auto" }}>
      <div style={{ padding:"20px 24px 0", borderBottom:`1px solid ${C.line}`, flexShrink:0, marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <div style={{ fontSize:10, letterSpacing:"0.25em", color:C.accentHi, fontWeight:700, marginBottom:4 }}>TODAY'S SCHEDULE</div>
            <h2 style={{ fontSize:32, fontWeight:900, lineHeight:1, letterSpacing:"-0.01em", textTransform:"uppercase" }}>
              Coach <span style={{ color:C.accentHi }}>Dashboard</span>
            </h2>
          </div>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
            {lastRefresh && <div style={{ fontSize:10, color:C.textFaint, letterSpacing:"0.1em" }}>Updated {lastRefresh}</div>}
            <button className="btn" onClick={load} style={{ background:C.navy3, color:C.text, padding:"8px 14px", fontWeight:700, fontSize:12, letterSpacing:"0.08em", textTransform:"uppercase", borderRadius:3, border:`1px solid ${C.line}` }}>⟳ Refresh</button>
          </div>
        </div>
      </div>

      <div style={{ padding:"0 24px 40px" }}>
        {loading && <div style={{ textAlign:"center", padding:"60px", color:C.textFaint, letterSpacing:"0.2em", textTransform:"uppercase", fontSize:13 }}>Loading classes…</div>}
        {error && <div style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.3)", borderRadius:8, padding:"16px 20px", color:"#ef4444", fontSize:13 }}>⚠ {error} — <span style={{ textDecoration:"underline", cursor:"pointer" }} onClick={load}>Retry</span></div>}
        {!loading && !error && classes && (
          <>
            <div style={{ fontSize:12, color:C.textFaint, marginBottom:16, letterSpacing:"0.05em" }}>{date} · {classes.length} classes</div>
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {classes.map((cls, i) => {
                const status = classStatus(cls);
                const statusColor = status==="live"?"#22C55E":status==="done"?C.textFaint:C.text;
                const totalReserved = (cls.signed_in||0) + (cls.reserved||0);
                const pct = cls.class_limit ? Math.round((totalReserved / cls.class_limit) * 100) : 0;
                const coaches = cls.coaches?.map(c => c.coach).join(", ") || "—";
                return (
                  <div key={i} className="card" style={{ background:C.navy2, border:`1px solid ${status==="live"?"rgba(34,197,94,0.3)":C.line}`, borderRadius:10, padding:"16px 20px", opacity:status==="done"?0.55:1 }}>
                    <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:12 }}>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
                          {status==="live" && <span style={{ width:8, height:8, borderRadius:"50%", background:"#22C55E", display:"inline-block", boxShadow:"0 0 6px #22C55E" }} />}
                          <span style={{ fontSize:10, fontWeight:700, letterSpacing:"0.15em", color:statusColor, textTransform:"uppercase" }}>{status==="live"?"● Live":status==="done"?"Done":"Upcoming"}</span>
                        </div>
                        <div style={{ fontSize:22, fontWeight:900, textTransform:"uppercase", letterSpacing:"0.02em", marginBottom:4 }}>{fmtTime(cls.start_time)}</div>
                        <div style={{ fontSize:14, color:C.textDim, marginBottom:8 }}>{cls.name}</div>
                        <div style={{ fontSize:12, color:C.textFaint }}>Coach: <span style={{ color:C.text }}>{coaches}</span></div>
                      </div>
                      <div style={{ display:"flex", gap:20, flexShrink:0 }}>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:28, fontWeight:900, color:C.accentHi, lineHeight:1 }}>{cls.signed_in||0}</div>
                          <div style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>Signed In</div>
                        </div>
                        <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:28, fontWeight:900, color:C.textDim, lineHeight:1 }}>{cls.reserved||0}</div>
                          <div style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>Reserved</div>
                        </div>
                        {cls.waitlisted > 0 && <div style={{ textAlign:"center" }}>
                          <div style={{ fontSize:28, fontWeight:900, color:C.gold, lineHeight:1 }}>{cls.waitlisted}</div>
                          <div style={{ fontSize:9, color:C.textFaint, textTransform:"uppercase", letterSpacing:"0.1em" }}>Waitlist</div>
                        </div>}
                      </div>
                    </div>
                    {cls.class_limit > 0 && (
                      <div style={{ marginTop:12 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:C.textFaint, marginBottom:4 }}>
                          <span>{totalReserved} / {cls.class_limit} spots</span><span>{pct}% full</span>
                        </div>
                        <div style={{ background:C.navy, borderRadius:2, height:4, overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:2, width:`${pct}%`, background:pct>=90?"#ef4444":pct>=70?C.gold:C.accentHi, transition:"width 0.5s" }} />
                        </div>
                      </div>
                    )}
                    {cls.is_full && <div style={{ marginTop:8, fontSize:11, color:"#ef4444", fontWeight:700, letterSpacing:"0.1em", textTransform:"uppercase" }}>Class Full</div>}
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop:32, padding:"20px", background:C.navy2, border:`1px solid ${C.line}`, borderRadius:10, textAlign:"center" }}>
              <div style={{ fontSize:12, color:C.textFaint, marginBottom:4 }}>🔒 Athlete roster coming soon</div>
              <div style={{ fontSize:11, color:C.textFaint, lineHeight:1.5 }}>Names, injuries, and coaching notes will appear here once the Wodify roster endpoint is available.</div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ROOT APP — tab navigation
// ══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { id:"dashboard", label:"Dashboard", icon:"📅" },
  { id:"wods",      label:"WOD Search", icon:"🏋️" },
  { id:"playbook",  label:"Playbook",   icon:"📋" },
];

export default function VegvisirApp() {
  const [tab, setTab] = useState("dashboard");

  return (
    <div style={{ minHeight:"100vh", background:C.bg, display:"flex", flexDirection:"column", fontFamily:FONT, color:C.text }}>
      <style>{GLOBAL_CSS}</style>

      {/* Top nav */}
      <div style={{ background:C.navy, borderBottom:`1px solid ${C.line}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 24px", height:52 }}>
        {/* Logo mark */}
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          <svg width="28" height="28" viewBox="0 0 100 100">
            <polygon points="50,3 97,26 97,74 50,97 3,74 3,26" fill="none" stroke="#3E6E8E" strokeWidth="6" />
            <text x="50" y="67" textAnchor="middle" fontSize="44" fontWeight="900" fill="#EAEFF3" fontFamily="Glacial Indifference, Montserrat, sans-serif">V</text>
          </svg>
          <span style={{ fontSize:13, fontWeight:800, letterSpacing:"0.15em", textTransform:"uppercase", color:C.text }}>Vegvisir</span>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:4 }}>
          {TABS.map(t => (
            <button key={t.id} className="btn" onClick={() => setTab(t.id)} style={{ padding:"6px 14px", borderRadius:4, background:tab===t.id?C.navy3:"none", border:`1px solid ${tab===t.id?C.line:"transparent"}`, color:tab===t.id?C.text:C.textFaint, fontSize:12, fontWeight:700, letterSpacing:"0.08em", textTransform:"uppercase", display:"flex", alignItems:"center", gap:6 }}>
              <span>{t.icon}</span><span className="sidebar-hide">{t.label}</span>
            </button>
          ))}
        </div>

        <div style={{ width:80 }} />
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
        {tab === "dashboard" && <Dashboard />}
        {tab === "wods"      && <WodSearch />}
        {tab === "playbook"  && <Playbook />}
      </div>
    </div>
  );
}
