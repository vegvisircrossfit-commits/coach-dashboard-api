import { useState, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
const PROXY_BASE = "https://coach-dashboard-api.onrender.com/wodify";
const CHECK_IN_APPT_NAME = "Athlete Check-in";
const CHECK_IN_WINDOW_DAYS = 90;

async function wodifyFetch(path) {
  const res = await fetch(`${PROXY_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${res.statusText}`);
  return res.json();
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const MOCK_ATHLETES = [
  {
    id: "1", name: "Sarah Chen", photo: null, color: "#E8643A",
    injury: "Left shoulder impingement",
    dos: ["Use neutral grip on pulls", "Sub ring rows for pull-ups", "Keep overhead movements light (<50% 1RM)"],
    donts: ["No kipping pull-ups", "Avoid snatches or overhead squats", "No muscle-ups"],
    lastNote: { date: "Jun 3", text: "Responded well to banded pull-aparts. Moved confidently at 35% on push press." },
    lastCheckIn: new Date(Date.now() - 95 * 86400000),
  },
  {
    id: "2", name: "Marcus Webb", photo: null, color: "#3A7BD5",
    injury: "Knee — post ACL surgery (6 mo)",
    dos: ["Box squats to parallel only", "Sub bike for running", "Prioritize controlled eccentrics"],
    donts: ["No full depth squats yet", "No jumping lunges or box jumps", "Avoid pistols"],
    lastNote: { date: "Jun 5", text: "Great session. Hit 185# back squat to box — strongest he's looked post-surgery." },
    lastCheckIn: new Date(Date.now() - 30 * 86400000),
  },
  {
    id: "3", name: "Priya Nair", photo: null, color: "#27AE8F",
    injury: "Lower back — disc herniation (L4-L5)",
    dos: ["Brace core aggressively", "Sub Romanian DLs for conventional", "Frequent position checks"],
    donts: ["No heavy deadlifts", "Avoid bent-over rows", "No GHD sit-ups"],
    lastNote: { date: "Jun 1", text: "Tightness during warm-up. Scaled deadlifts to 95# — form solid." },
    lastCheckIn: null,
  },
  {
    id: "4", name: "Derek Osei", photo: null, color: "#9B59B6",
    injury: "Wrist — mild sprain (right)",
    dos: ["Use wrist wraps for all loaded movements", "Sub DB holds where possible", "Communicate pain levels each class"],
    donts: ["No front rack position", "Avoid handstand push-ups", "No clean & jerks"],
    lastNote: null,
    lastCheckIn: new Date(Date.now() - 45 * 86400000),
  },
  {
    id: "5", name: "Jess Fontaine", photo: null, color: "#E74C3C",
    injury: "None — new member (3 weeks)",
    dos: ["Prioritize mechanics over intensity", "Encourage questions", "Scale volume by 20–30%"],
    donts: ["No maximal lifts yet", "Don't rush progressions", "Avoid complex gymnastics"],
    lastNote: { date: "Jun 4", text: "Picking things up fast. Deadlift form already solid." },
    lastCheckIn: new Date(Date.now() - 10 * 86400000),
  },
  {
    id: "6", name: "Tom Hartley", photo: null, color: "#F39C12",
    injury: "Rotator cuff — chronic tightness",
    dos: ["Band pull-aparts every warm-up", "Light external rotation work", "Sub push press for jerk"],
    donts: ["No behind-the-neck movements", "Avoid high-volume overhead pressing", "No snatch balance"],
    lastNote: { date: "Jun 2", text: "Shoulder felt good. Kept overhead at 60% — no complaints." },
    lastCheckIn: new Date(Date.now() - 100 * 86400000),
  },
];

const MOCK_CLASSES = [
  { id: "1", name: "CrossFit", time: "6:00 AM", enrolled: 6 },
  { id: "2", name: "CrossFit", time: "9:00 AM", enrolled: 4 },
  { id: "3", name: "Open Gym", time: "11:00 AM", enrolled: 8 },
];

function needsCheckIn(lastCheckIn) {
  if (!lastCheckIn) return true;
  return (Date.now() - new Date(lastCheckIn).getTime()) / 86400000 > CHECK_IN_WINDOW_DAYS;
}

function daysAgo(date) {
  if (!date) return null;
  return Math.floor((Date.now() - new Date(date).getTime()) / 86400000);
}

function colorForName(name) {
  const colors = ["#E8643A","#3A7BD5","#27AE8F","#9B59B6","#E74C3C","#F39C12","#16A085","#2980B9"];
  return colors[Math.abs((name.charCodeAt(0) || 0) + (name.charCodeAt(1) || 0)) % colors.length];
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function AthleteAvatar({ athlete, size = 72, fontSize = 22 }) {
  const [imgError, setImgError] = useState(false);
  const initials = athlete.name.split(" ").map(n => n[0]).join("").slice(0, 2);
  if (athlete.photo && !imgError) {
    return (
      <div style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0, border: `2px solid ${athlete.color}44`, boxShadow: `0 0 0 4px ${athlete.color}18` }}>
        <img src={athlete.photo} alt={athlete.name} onError={() => setImgError(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg, ${athlete.color}cc, ${athlete.color}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize, fontWeight: "700", color: "#fff", fontFamily: "'DM Mono', monospace", border: `2px solid ${athlete.color}44`, boxShadow: `0 0 0 4px ${athlete.color}18`, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

// ─── Athlete Card ──────────────────────────────────────────────────────────────
function AthleteCard({ athlete, onClick }) {
  const flagged = needsCheckIn(athlete.lastCheckIn);
  return (
    <button onClick={() => onClick(athlete)} style={{ background: "rgba(255,255,255,0.04)", border: flagged ? "1px solid rgba(251,191,36,0.35)" : "1px solid rgba(255,255,255,0.08)", borderRadius: "20px", padding: "22px 16px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: "12px", transition: "all 0.2s ease", position: "relative", overflow: "hidden", textAlign: "center" }}
      onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = `0 12px 40px ${athlete.color}22`; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "none"; }}
    >
      <div style={{ position: "absolute", top: "-20px", right: "-20px", width: "80px", height: "80px", borderRadius: "50%", background: flagged ? "#FBBF24" : athlete.color, opacity: 0.1, filter: "blur(20px)", pointerEvents: "none" }} />
      {flagged && (
        <div style={{ position: "absolute", top: "10px", right: "10px", background: "#FBBF24", color: "#000", fontSize: "9px", fontWeight: "800", borderRadius: "6px", padding: "3px 7px", fontFamily: "'DM Mono', monospace", letterSpacing: "0.05em" }}>
          CHECK-IN
        </div>
      )}
      <div style={{ position: "relative" }}>
        <AthleteAvatar athlete={athlete} size={68} fontSize={20} />
        {flagged && (
          <div style={{ position: "absolute", bottom: -2, right: -2, width: "18px", height: "18px", borderRadius: "50%", background: "#FBBF24", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", border: "2px solid #0D0E12" }}>⚠</div>
        )}
      </div>
      <div>
        <div style={{ color: "#F0EDE8", fontSize: "13px", fontWeight: "600", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.3 }}>{athlete.name}</div>
        <div style={{ marginTop: "5px", fontSize: "10px", color: athlete.color, fontFamily: "'DM Mono', monospace", background: athlete.color + "18", borderRadius: "20px", padding: "2px 8px", display: "inline-block", lineHeight: 1.5 }}>
          {athlete.injury.split("—")[0].trim()}
        </div>
      </div>
      <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono', monospace" }}>tap to view →</div>
    </button>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function AthleteModal({ athlete, onClose, onSaveNote }) {
  const [newNote, setNewNote] = useState("");
  const [saved, setSaved] = useState(false);
  const flagged = needsCheckIn(athlete.lastCheckIn);
  const daysSince = daysAgo(athlete.lastCheckIn);

  const handleSave = () => {
    if (!newNote.trim()) return;
    onSaveNote(athlete.id, newNote.trim());
    setNewNote("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.78)", backdropFilter: "blur(10px)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.15s ease" }}>
      <div onClick={e => e.stopPropagation()} style={{ background: "#14151A", borderRadius: "28px", border: flagged ? "1px solid rgba(251,191,36,0.3)" : `1px solid ${athlete.color}33`, boxShadow: "0 40px 80px rgba(0,0,0,0.6)", width: "100%", maxWidth: "500px", maxHeight: "90vh", overflowY: "auto", animation: "slideUp 0.2s ease" }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 20px", background: flagged ? "linear-gradient(180deg,rgba(251,191,36,0.08) 0%,transparent 100%)" : `linear-gradient(180deg,${athlete.color}10 0%,transparent 100%)`, borderRadius: "28px 28px 0 0" }}>
          {flagged && (
            <div style={{ background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "12px", padding: "10px 14px", marginBottom: "18px", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>⚠️</span>
              <div>
                <div style={{ color: "#FBBF24", fontSize: "12px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif" }}>Athlete Check-in Overdue</div>
                <div style={{ color: "rgba(251,191,36,0.7)", fontSize: "11px", fontFamily: "'DM Mono', monospace", marginTop: "2px" }}>
                  {athlete.lastCheckIn ? `Last check-in was ${daysSince} days ago — over the 90-day window` : "No Athlete Check-in appointment on record"}
                </div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <AthleteAvatar athlete={athlete} size={60} fontSize={18} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#F0EDE8", fontSize: "19px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif" }}>{athlete.name}</div>
              <div style={{ color: athlete.color, fontSize: "11px", fontFamily: "'DM Mono', monospace", marginTop: "3px", opacity: 0.9 }}>{athlete.injury}</div>
            </div>
            <button onClick={onClose} style={{ background: "rgba(255,255,255,0.08)", border: "none", borderRadius: "50%", width: "34px", height: "34px", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: "0 24px 28px", display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Do's */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span>✅</span>
              <span style={{ color: "#22C55E", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Do's</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {athlete.dos.length ? athlete.dos.map((d, i) => (
                <div key={i} style={{ background: "#22C55E0C", border: "1px solid #22C55E1E", borderRadius: "10px", padding: "10px 14px", color: "#D4FAE0", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ color: "#22C55E", flexShrink: 0 }}>→</span>{d}
                </div>
              )) : <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", fontFamily: "'DM Mono', monospace", padding: "10px 0" }}>None on file</div>}
            </div>
          </div>

          {/* Don'ts */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span>🚫</span>
              <span style={{ color: "#EF4444", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Don'ts</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {athlete.donts.length ? athlete.donts.map((d, i) => (
                <div key={i} style={{ background: "#EF44440C", border: "1px solid #EF44441E", borderRadius: "10px", padding: "10px 14px", color: "#FED7D7", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.5, display: "flex", gap: "10px", alignItems: "flex-start" }}>
                  <span style={{ color: "#EF4444", flexShrink: 0 }}>✕</span>{d}
                </div>
              )) : <div style={{ color: "rgba(255,255,255,0.25)", fontSize: "13px", fontFamily: "'DM Mono', monospace", padding: "10px 0" }}>None on file</div>}
            </div>
          </div>

          <div style={{ height: "1px", background: "rgba(255,255,255,0.06)" }} />

          {/* Last note */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <span>📋</span>
              <span style={{ color: "rgba(255,255,255,0.5)", fontFamily: "'DM Sans', sans-serif", fontWeight: "700", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase" }}>Last Note</span>
            </div>
            {athlete.lastNote ? (
              <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "12px", padding: "14px 16px" }}>
                <div style={{ color: athlete.color, fontSize: "10px", fontFamily: "'DM Mono', monospace", marginBottom: "6px" }}>{athlete.lastNote.date}</div>
                <div style={{ color: "rgba(255,255,255,0.8)", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", lineHeight: 1.6 }}>{athlete.lastNote.text}</div>
              </div>
            ) : (
              <div style={{ padding: "14px 16px", color: "rgba(255,255,255,0.25)", fontSize: "13px", fontFamily: "'DM Mono', monospace", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.07)" }}>No notes yet.</div>
            )}
          </div>

          {/* Add note */}
          <div style={{ background: `${athlete.color}0A`, border: `1px solid ${athlete.color}25`, borderRadius: "16px", padding: "16px" }}>
            <div style={{ color: athlete.color, fontSize: "11px", fontFamily: "'DM Mono', monospace", fontWeight: "600", marginBottom: "10px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              + Post-Class Note
            </div>
            <textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="How did they move today? Any pain, wins, or modifications needed next time..." rows={3} style={{ width: "100%", background: "rgba(0,0,0,0.35)", border: "1px solid rgba(255,255,255,0.09)", borderRadius: "10px", padding: "11px 13px", color: "#F0EDE8", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", lineHeight: 1.6, boxSizing: "border-box" }} />
            <button onClick={handleSave} style={{ marginTop: "10px", background: saved ? "#22C55E" : athlete.color, border: "none", borderRadius: "10px", padding: "11px 20px", color: "#fff", fontSize: "13px", fontWeight: "700", fontFamily: "'DM Sans', sans-serif", cursor: "pointer", transition: "background 0.2s", width: "100%" }}>
              {saved ? "✓ Note Saved" : "Save Note"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────
function SetupScreen({ onConnect }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("https://coach-dashboard-api.onrender.com/");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      onConnect(true);
    } catch (e) {
      setError("Could not reach the proxy server. It may be waking up — wait 30 seconds and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0D0E12", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "24px", padding: "36px", width: "100%", maxWidth: "380px", textAlign: "center" }}>
        <div style={{ width: "64px", height: "64px", borderRadius: "18px", background: "linear-gradient(135deg, #3A7BD5, #27AE8F)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", margin: "0 auto 24px" }}>🏋️</div>
        <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "6px" }}>Vegvisir CrossFit</div>
        <div style={{ fontSize: "22px", fontWeight: "700", color: "#F0EDE8", marginBottom: "10px" }}>Coach Dashboard</div>
        <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: "28px" }}>Tap below to connect to Wodify and load today's class roster.</div>
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "12px 14px", marginBottom: "16px", color: "#FCA5A5", fontSize: "12px", fontFamily: "'DM Mono', monospace", textAlign: "left", lineHeight: 1.6 }}>{error}</div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <button onClick={handleConnect} disabled={loading} style={{ background: "linear-gradient(135deg, #3A7BD5, #2563EB)", border: "none", borderRadius: "12px", padding: "14px", color: "#fff", fontSize: "15px", fontWeight: "700", cursor: loading ? "wait" : "pointer", fontFamily: "'DM Sans', sans-serif", opacity: loading ? 0.7 : 1, boxShadow: "0 4px 20px rgba(58,123,213,0.4)" }}>
            {loading ? "Connecting..." : "Connect to Wodify"}
          </button>
          <button onClick={() => onConnect(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px", padding: "13px", color: "rgba(255,255,255,0.4)", fontSize: "13px", cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
            Use demo data
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Class Selector ───────────────────────────────────────────────────────────
function ClassSelector({ classes, onSelect }) {
  return (
    <div style={{ minHeight: "100vh", background: "#0D0E12", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ width: "100%", maxWidth: "480px" }}>
        <div style={{ marginBottom: "28px" }}>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "8px" }}>Today's Schedule</div>
          <div style={{ fontSize: "22px", fontWeight: "700", color: "#F0EDE8" }}>Select a Class</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {classes.map(cls => (
            <button key={cls.id} onClick={() => onSelect(cls)} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "16px", padding: "18px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "all 0.15s", textAlign: "left" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
            >
              <div>
                <div style={{ color: "#F0EDE8", fontSize: "15px", fontWeight: "600", fontFamily: "'DM Sans', sans-serif" }}>{cls.name}</div>
                <div style={{ color: "rgba(255,255,255,0.4)", fontSize: "12px", fontFamily: "'DM Mono', monospace", marginTop: "3px" }}>{cls.time} · {cls.enrolled} athletes</div>
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "18px" }}>→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function CoachDashboard() {
  const [screen, setScreen] = useState("setup");
  const [isLive, setIsLive] = useState(false);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [athletes, setAthletes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [filterFlagged, setFilterFlagged] = useState(false);

  const loadClasses = useCallback(async (live) => {
    if (!live) {
      setClasses(MOCK_CLASSES);
      setScreen("classes");
      return;
    }
    setLoading(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const data = await wodifyFetch(`/programclasses?date=${today}`);
      const mapped = (data.Results || data.results || []).map(c => ({
        id: c.Id || c.id,
        name: c.ProgramName || c.name,
        time: c.StartTime || c.time,
        enrolled: c.EnrolledCount || 0,
      }));
      setClasses(mapped.length ? mapped : MOCK_CLASSES);
    } catch (e) {
      setClasses(MOCK_CLASSES);
    } finally {
      setLoading(false);
      setScreen("classes");
    }
  }, []);

  const loadAthletes = useCallback(async (cls) => {
    setSelectedClass(cls);
    setLoading(true);
    if (!isLive) {
      setAthletes(MOCK_ATHLETES);
      setScreen("roster");
      setLoading(false);
      return;
    }
    try {
      const resData = await wodifyFetch(`/programclassreservations?class_id=${cls.id}`);
      const reservations = resData.Results || resData.results || [];
      const athleteList = await Promise.all(reservations.map(async (r) => {
        const memberId = r.UserId || r.user_id || r.MemberId;
        const name = r.UserName || r.name || r.MemberName || "Unknown";
        const photo = r.UserPhotoUrl || r.photo_url || null;
        let lastCheckIn = null;
        try {
          const apptData = await wodifyFetch(`/appointments?member_id=${memberId}&appointment_type=${encodeURIComponent(CHECK_IN_APPT_NAME)}&status=completed&sort=date_desc&limit=1`);
          const appts = apptData.Results || apptData.results || [];
          if (appts.length > 0) lastCheckIn = new Date(appts[0].Date || appts[0].date);
        } catch (_) {}
        let injury = "No notes on file", dos = [], donts = [], lastNote = null;
        try {
          const profile = await wodifyFetch(`/members/${memberId}`);
          injury = profile.Notes || profile.MedicalNotes || profile.notes || injury;
          dos = profile.CustomFields?.Dos?.split("\n").filter(Boolean) || [];
          donts = profile.CustomFields?.Donts?.split("\n").filter(Boolean) || [];
          const noteText = profile.CustomFields?.CoachNote || profile.CustomFields?.LastNote;
          const noteDate = profile.CustomFields?.CoachNoteDate;
          if (noteText) lastNote = { date: noteDate || "—", text: noteText };
        } catch (_) {}
        return { id: memberId, name, photo, color: colorForName(name), injury, dos, donts, lastNote, lastCheckIn };
      }));
      setAthletes(athleteList);
    } catch (e) {
      setAthletes(MOCK_ATHLETES);
    } finally {
      setLoading(false);
      setScreen("roster");
    }
  }, [isLive]);

  const handleConnect = (live) => {
    setIsLive(live);
    loadClasses(live);
  };

  const handleSaveNote = (id, text) => {
    const today = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const newNote = { date: today, text };
    setAthletes(prev => prev.map(a => a.id === id ? { ...a, lastNote: newNote } : a));
    setSelected(prev => prev && prev.id === id ? { ...prev, lastNote: newNote } : prev);
  };

  const filtered = athletes
    .filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
    .filter(a => filterFlagged ? needsCheckIn(a.lastCheckIn) : true);

  const flaggedCount = athletes.filter(a => needsCheckIn(a.lastCheckIn)).length;

  if (screen === "setup") return <SetupScreen onConnect={handleConnect} />;
  if (screen === "classes") return loading
    ? <div style={{ minHeight: "100vh", background: "#0D0E12", display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.4)", fontFamily: "'DM Mono', monospace" }}>Loading classes...</div>
    : <ClassSelector classes={classes} onSelect={loadAthletes} />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=DM+Mono:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0D0E12; }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        textarea:focus { border-color: rgba(255,255,255,0.25) !important; }
        textarea::placeholder { color: rgba(255,255,255,0.2); }
        input::placeholder { color: rgba(255,255,255,0.2); }
      `}</style>
      <div style={{ minHeight: "100vh", background: "#0D0E12", color: "#F0EDE8", fontFamily: "'DM Sans', sans-serif" }}>
        {/* Top bar */}
        <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", padding: "18px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <button onClick={() => setScreen("classes")} style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: "8px", padding: "7px 12px", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: "12px", fontFamily: "'DM Mono', monospace" }}>← Classes</button>
            <div>
              <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.35)", fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {selectedClass?.time && `${selectedClass.time} · `}{new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              </div>
              <div style={{ fontSize: "18px", fontWeight: "700" }}>{selectedClass?.name || "Class Roster"}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {flaggedCount > 0 && (
              <button onClick={() => setFilterFlagged(f => !f)} style={{ background: filterFlagged ? "#FBBF24" : "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.3)", borderRadius: "20px", padding: "7px 14px", color: filterFlagged ? "#000" : "#FBBF24", fontSize: "12px", fontWeight: "700", fontFamily: "'DM Mono', monospace", cursor: "pointer", transition: "all 0.15s" }}>
                ⚠ {flaggedCount} overdue
              </button>
            )}
            <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: "20px", padding: "7px 14px", fontSize: "12px", fontFamily: "'DM Mono', monospace", color: "rgba(255,255,255,0.6)" }}>{athletes.length} athletes</div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", background: isLive ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.05)", border: `1px solid ${isLive ? "rgba(34,197,94,0.25)" : "rgba(255,255,255,0.1)"}`, borderRadius: "20px", padding: "7px 12px", fontSize: "11px", fontFamily: "'DM Mono', monospace", color: isLive ? "#22C55E" : "rgba(255,255,255,0.35)" }}>
              <span style={{ width: "5px", height: "5px", borderRadius: "50%", background: isLive ? "#22C55E" : "#555", display: "inline-block" }} />
              {isLive ? "Wodify live" : "Demo mode"}
            </div>
          </div>
        </div>
        {/* Search */}
        <div style={{ padding: "18px 24px 0" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes..." style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "10px 16px", width: "100%", maxWidth: "320px", color: "#F0EDE8", fontSize: "13px", fontFamily: "'DM Sans', sans-serif", outline: "none" }} />
        </div>
        {/* Grid */}
        {loading ? (
          <div style={{ padding: "60px", textAlign: "center", color: "rgba(255,255,255,0.3)", fontFamily: "'DM Mono', monospace" }}>Loading athletes...</div>
        ) : (
          <div style={{ padding: "20px 24px 40px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(148px, 1fr))", gap: "14px" }}>
            {filtered.map(athlete => <AthleteCard key={athlete.id} athlete={athlete} onClick={setSelected} />)}
            {filtered.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "48px", color: "rgba(255,255,255,0.25)", fontFamily: "'DM Mono', monospace" }}>No athletes match your filter.</div>}
          </div>
        )}
      </div>
      {selected && <AthleteModal athlete={selected} onClose={() => setSelected(null)} onSaveNote={handleSaveNote} />}
    </>
  );
}
