import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  BarChart,
  Bar,
  Legend,
} from "recharts";

/**
 * App configuration
 */
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";
const USE_BACKEND = false; // set true later

/**
 * LocalStorage key for meals
 */
const LS_KEY = "inprove_meals_v1";

/**
 * Utility: format Date -> YYYY-MM-DD
 */
function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Utility: safe JSON parse
 */
function safeParse(json, fallback) {
  try {
    return JSON.parse(json);
  } catch {
    return fallback;
  }
}

/**
 * Utility: generate simple id (good enough for local storage)
 */
function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

/**
 * Compute daily totals from meal list
 * Output: array sorted by date asc:
 * [{ date, calories, protein, carbs, fat }]
 */
function computeDailyTotals(meals) {
  const map = new Map();
  for (const m of meals) {
    const d = m.date;
    if (!map.has(d)) {
      map.set(d, { date: d, calories: 0, protein: 0, carbs: 0, fat: 0 });
    }
    const agg = map.get(d);
    agg.calories += Number(m.calories || 0);
    agg.protein += Number(m.protein || 0);
    agg.carbs += Number(m.carbs || 0);
    agg.fat += Number(m.fat || 0);
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Get last N days (including today) as YYYY-MM-DD list
 */
function lastNDays(n) {
  const out = [];
  const now = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/**
 * Ensure chart has entries for all days (even if zero)
 */
function fillMissingDays(dailyTotals, days) {
  const byDate = new Map(dailyTotals.map((x) => [x.date, x]));
  return days.map((d) => {
    const v = byDate.get(d);
    return (
      v || {
        date: d,
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
      }
    );
  });
}

export default function App() {
  /**
   * Intro screen (splash)
   */
  const [showIntro, setShowIntro] = useState(true);

  /**
   * "Routing" without react-router:
   * - dashboard: overview
   * - entry: new meal entry screen (photo + voice + manual macros)
   */
  const [page, setPage] = useState("dashboard");

  /**
   * Dashboard time range
   */
  const [rangeDays, setRangeDays] = useState(7);

  /**
   * Stored meals in LocalStorage
   */
  const [meals, setMeals] = useState([]);

  /**
   * New entry inputs (manual nutrition, until backend exists)
   */
  const [entryDate, setEntryDate] = useState(todayISO());
  const [entryCalories, setEntryCalories] = useState("");
  const [entryProtein, setEntryProtein] = useState("");
  const [entryCarbs, setEntryCarbs] = useState("");
  const [entryFat, setEntryFat] = useState("");

  /**
   * Photo + voice capture state (same as before)
   */
  const [imageFile, setImageFile] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioMime, setAudioMime] = useState("");
  const [audioFileName, setAudioFileName] = useState("");

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  /**
   * Load meals from LocalStorage once on mount
   */
  useEffect(() => {
    const raw = localStorage.getItem(LS_KEY);
    const parsed = raw ? safeParse(raw, []) : [];
    setMeals(Array.isArray(parsed) ? parsed : []);
  }, []);

  /**
   * Persist meals to LocalStorage whenever they change
   */
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(meals));
  }, [meals]);

  /**
   * Intro duration: 3 seconds
   */
  useEffect(() => {
    const timer = setTimeout(() => setShowIntro(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  /**
   * Inject keyframes for intro animation
   */
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = `
      @keyframes runnerPopIn {
        0%   { transform: scale(0.88); opacity: 0; }
        100% { transform: scale(1); opacity: 1; }
      }
      @keyframes runnerIdle {
        0%, 100% { transform: translateY(0); }
        50%      { transform: translateY(-6px); }
      }
      @keyframes revealText {
        from { clip-path: inset(0 100% 0 0); opacity: 0.2; transform: translateX(-6px); }
        to   { clip-path: inset(0 0 0 0); opacity: 1; transform: translateX(0); }
      }
      @keyframes glowPulse {
        0%, 100% { opacity: 0.35; transform: scale(1); }
        50%      { opacity: 0.55; transform: scale(1.06); }
      }
    `;
    document.head.appendChild(styleEl);
    return () => document.head.removeChild(styleEl);
  }, []);

  /**
   * Previews for image and audio
   */
  const imagePreview = useMemo(() => {
    if (!imageFile) return null;
    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  const audioPreview = useMemo(() => {
    if (!audioBlob) return null;
    return URL.createObjectURL(audioBlob);
  }, [audioBlob]);

  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      if (audioPreview) URL.revokeObjectURL(audioPreview);
    };
  }, [imagePreview, audioPreview]);

  /**
   * Compute dashboard data based on selected range
   */
  const dailyTotals = useMemo(() => computeDailyTotals(meals), [meals]);

  const chartDays = useMemo(() => lastNDays(rangeDays), [rangeDays]);

  const chartData = useMemo(
    () => fillMissingDays(dailyTotals, chartDays),
    [dailyTotals, chartDays]
  );

  const averages = useMemo(() => {
    const n = chartData.length || 1;
    const sum = chartData.reduce(
      (acc, d) => {
        acc.calories += d.calories;
        acc.protein += d.protein;
        acc.carbs += d.carbs;
        acc.fat += d.fat;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
    return {
      calories: Math.round(sum.calories / n),
      protein: Math.round(sum.protein / n),
      carbs: Math.round(sum.carbs / n),
      fat: Math.round(sum.fat / n),
    };
  }, [chartData]);

  /**
   * Recording helpers
   */
  function pickAudioMimeType() {
    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/ogg;codecs=opus",
      "audio/ogg",
      "audio/mp4",
    ];
    for (const t of types) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported(t)) return t;
    }
    return "";
  }

  async function startRecording() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());

        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        setAudioMime(type);

        const ext = type.includes("ogg")
          ? "ogg"
          : type.includes("mp4")
          ? "mp4"
          : "webm";

        setAudioFileName(
          `voice_${new Date()
            .toISOString()
            .slice(0, 19)
            .replace(/[:T]/g, "-")}.${ext}`
        );
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } catch {
      setError(
        "Microphone access denied. Please allow microphone permissions in your browser."
      );
    }
  }

  function stopRecording() {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }

  /**
   * Save a meal (manual macros for now).
   * Date defaults to today, can be changed.
   * This will update LocalStorage and the dashboard instantly.
   */
  function saveMeal() {
    setError("");

    const cals = Number(entryCalories);
    const p = Number(entryProtein);
    const carbs = Number(entryCarbs);
    const f = Number(entryFat);

    if (!entryDate) {
      setError("Please choose a date.");
      return;
    }
    if (!Number.isFinite(cals) || cals <= 0) {
      setError("Please enter calories (kcal) > 0.");
      return;
    }

    const meal = {
      id: uid(),
      date: entryDate,
      calories: cals,
      protein: Number.isFinite(p) ? p : 0,
      carbs: Number.isFinite(carbs) ? carbs : 0,
      fat: Number.isFinite(f) ? f : 0,
      createdAt: new Date().toISOString(),
    };

    setMeals((prev) => [...prev, meal]);

    // clear only macro inputs (keep photo/voice optional)
    setEntryCalories("");
    setEntryProtein("");
    setEntryCarbs("");
    setEntryFat("");

    // optional: go back to dashboard after save
    setPage("dashboard");
  }

  /**
   * Demo helper: insert sample data for last 7 days (useful for presentations)
   */
  function addSampleWeek() {
    const days = lastNDays(7);
    const samples = days.map((d) => ({
      id: uid(),
      date: d,
      calories: Math.round(1800 + Math.random() * 500),
      protein: Math.round(110 + Math.random() * 40),
      carbs: Math.round(180 + Math.random() * 60),
      fat: Math.round(60 + Math.random() * 25),
      createdAt: new Date().toISOString(),
    }));
    setMeals((prev) => [...prev, ...samples]);
  }

  function clearAllData() {
    setMeals([]);
    localStorage.removeItem(LS_KEY);
  }

  /**
   * Analyze (kept for later; currently blocked)
   */
  async function analyze() {
    setError("");

    if (!imageFile) {
      setError("Please select a plate image first.");
      return;
    }
    if (!audioBlob) {
      setError("Please record a voice note first.");
      return;
    }
    if (!USE_BACKEND) {
      setError("Backend is not connected yet.");
      return;
    }

    setIsSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("image", imageFile);

      const audioFile = new File([audioBlob], audioFileName || "voice.webm", {
        type: audioMime || "audio/webm",
      });
      fd.append("audio", audioFile);

      const res = await fetch(`${API_URL}/api/analysis/analyze`, {
        method: "POST",
        body: fd,
      });

      fd.append("userId", "demo-user-1");

      if (!res.ok) throw new Error("Backend error");
      const data = await res.json();

      // Later: you would set macro fields based on backend result:
      // setEntryCalories(data.total.kcal)
      // setEntryProtein(data.total.protein_g) ...
      console.log("Backend result:", data);
    } catch (e) {
      setError(e?.message || "Request failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  /**
   * Intro screen
   */
  if (showIntro) {
    return (
      <div style={intro.container}>
        <div style={intro.glow} />
        <div style={intro.stage}>
          <div style={intro.textBlock}>
            <div style={intro.brandLine}>
              in<span style={intro.accent}>:prove</span>
            </div>
            <div style={intro.trailLine}>
              <span style={intro.trailText}>Athlete Nutrition</span>
            </div>
          </div>
          <img src="/runner.png" alt="runner" style={intro.runner} />
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Top bar */}
      <div style={styles.topbar}>
        <div>
          <div style={styles.brand}>
            in<span style={{ color: styles.accentColor }}>:prove</span>
          </div>
          <div style={styles.tagline}>Athlete Nutrition</div>
        </div>

        <div style={styles.nav}>
          <button
            onClick={() => setPage("dashboard")}
            style={{
              ...styles.navBtn,
              ...(page === "dashboard" ? styles.navBtnActive : {}),
            }}
          >
            Dashboard
          </button>
          <button
            onClick={() => setPage("entry")}
            style={{
              ...styles.navBtn,
              ...(page === "entry" ? styles.navBtnActive : {}),
            }}
          >
            New Entry
          </button>
        </div>
      </div>

      {page === "dashboard" ? (
        <Dashboard
          rangeDays={rangeDays}
          setRangeDays={setRangeDays}
          averages={averages}
          chartData={chartData}
          mealsCount={meals.length}
          addSampleWeek={addSampleWeek}
          clearAllData={clearAllData}
        />
      ) : (
        <NewEntry
          USE_BACKEND={USE_BACKEND}
          isSubmitting={isSubmitting}
          error={error}
          setError={setError}
          imageFile={imageFile}
          setImageFile={setImageFile}
          imagePreview={imagePreview}
          audioBlob={audioBlob}
          audioPreview={audioPreview}
          isRecording={isRecording}
          startRecording={startRecording}
          stopRecording={stopRecording}
          analyze={analyze}
          entryDate={entryDate}
          setEntryDate={setEntryDate}
          entryCalories={entryCalories}
          setEntryCalories={setEntryCalories}
          entryProtein={entryProtein}
          setEntryProtein={setEntryProtein}
          entryCarbs={entryCarbs}
          setEntryCarbs={setEntryCarbs}
          entryFat={entryFat}
          setEntryFat={setEntryFat}
          saveMeal={saveMeal}
        />
      )}

      <div style={styles.footer}>
        Backend URL (later): <code>{API_URL}</code>
      </div>
    </div>
  );
}

/**
 * Dashboard screen component
 * - shows averages + charts for the selected time range
 */
function Dashboard({
  rangeDays,
  setRangeDays,
  averages,
  chartData,
  mealsCount,
  addSampleWeek,
  clearAllData,
}) {
  return (
    <div style={styles.content}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.h2}>My Overview</h2>

        <div style={styles.controlsRow}>
          <select
            value={rangeDays}
            onChange={(e) => setRangeDays(Number(e.target.value))}
            style={styles.select}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={365}>Last 365 days</option>
          </select>

          <button onClick={addSampleWeek} style={styles.secondaryBtn}>
            Add sample week
          </button>
          <button onClick={clearAllData} style={styles.dangerBtn}>
            Clear data
          </button>
        </div>
      </div>

      <div style={styles.kpiGrid}>
        <Kpi title="Ø kcal / day" value={`${averages.calories}`} />
        <Kpi title="Ø Protein / day" value={`${averages.protein} g`} />
        <Kpi title="Ø Carbs / day" value={`${averages.carbs} g`} />
        <Kpi title="Ø Fat / day" value={`${averages.fat} g`} />
      </div>

      <div style={styles.cardGrid}>
        <div style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>Calories per day</div>
            <div style={styles.cardMeta}>{mealsCount} meals stored</div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="calories" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitleRow}>
            <div style={styles.cardTitle}>Macros per day</div>
            <div style={styles.cardMeta}>Protein / Carbs / Fat</div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="protein" />
                <Bar dataKey="carbs" />
                <Bar dataKey="fat" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * New entry screen component
 * - photo upload + voice recording
 * - manual macro input to save meals without backend
 */
function NewEntry({
  USE_BACKEND,
  isSubmitting,
  error,
  setError,
  imageFile,
  setImageFile,
  imagePreview,
  audioBlob,
  audioPreview,
  isRecording,
  startRecording,
  stopRecording,
  analyze,
  entryDate,
  setEntryDate,
  entryCalories,
  setEntryCalories,
  entryProtein,
  setEntryProtein,
  entryCarbs,
  setEntryCarbs,
  entryFat,
  setEntryFat,
  saveMeal,
}) {
  return (
    <div style={styles.content}>
      <div style={styles.sectionHeader}>
        <h2 style={styles.h2}>New Meal Entry</h2>
        <div style={{ color: "#6B7280", fontSize: 13 }}>
          Until backend is ready, you can save meals manually.
        </div>
      </div>

      <div style={styles.cardGrid}>
        <div style={styles.card}>
          <div style={styles.cardTitle}>Capture</div>

          <div style={styles.field}>
            <label style={styles.label}>1) Plate image</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setImageFile(e.target.files?.[0] || null)}
            />
            {imagePreview && (
              <img src={imagePreview} alt="preview" style={styles.previewImg} />
            )}
          </div>

          <div style={styles.field}>
            <label style={styles.label}>2) Voice note</label>
            <div style={styles.row}>
              {!isRecording ? (
                <button onClick={startRecording} style={styles.primaryBtn}>
                  🎙 Start recording
                </button>
              ) : (
                <button onClick={stopRecording} style={styles.stopBtn}>
                  ⏹ Stop
                </button>
              )}
              <span style={styles.metaText}>
                {isRecording
                  ? "Recording…"
                  : audioBlob
                  ? "Voice ready"
                  : "No recording yet"}
              </span>
            </div>

            {audioPreview && (
              <div style={{ marginTop: 10 }}>
                <audio controls src={audioPreview} style={{ width: "100%" }} />
              </div>
            )}
          </div>

          <button
            onClick={analyze}
            disabled={!USE_BACKEND || isSubmitting}
            style={{
              ...styles.primaryBtn,
              opacity: !USE_BACKEND || isSubmitting ? 0.5 : 1,
              cursor: !USE_BACKEND || isSubmitting ? "not-allowed" : "pointer",
            }}
          >
            {!USE_BACKEND
              ? "Backend not ready"
              : isSubmitting
              ? "Analyzing…"
              : "Analyze"}
          </button>

          {!USE_BACKEND && (
            <div style={styles.hint}>
              Backend is not connected. Capture works; analysis will be enabled later.
            </div>
          )}

          {error && <div style={styles.errorBox}>{error}</div>}
        </div>

        <div style={styles.card}>
          <div style={styles.cardTitle}>Save nutrition</div>

          <div style={styles.field}>
            <label style={styles.label}>Date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.formGrid}>
            <div style={styles.field}>
              <label style={styles.label}>Calories (kcal)</label>
              <input
                value={entryCalories}
                onChange={(e) => {
                  setError("");
                  setEntryCalories(e.target.value);
                }}
                placeholder="e.g. 720"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Protein (g)</label>
              <input
                value={entryProtein}
                onChange={(e) => {
                  setError("");
                  setEntryProtein(e.target.value);
                }}
                placeholder="e.g. 35"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Carbs (g)</label>
              <input
                value={entryCarbs}
                onChange={(e) => {
                  setError("");
                  setEntryCarbs(e.target.value);
                }}
                placeholder="e.g. 80"
                style={styles.input}
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Fat (g)</label>
              <input
                value={entryFat}
                onChange={(e) => {
                  setError("");
                  setEntryFat(e.target.value);
                }}
                placeholder="e.g. 25"
                style={styles.input}
              />
            </div>
          </div>

          <button onClick={saveMeal} style={styles.primaryBtn}>
            Save meal
          </button>

          <div style={styles.hint}>
            Saved meals are automatically assigned to the selected date (default: today)
            and appear in the dashboard instantly.
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * KPI card
 */
function Kpi({ title, value }) {
  return (
    <div style={styles.kpiCard}>
      <div style={styles.kpiTitle}>{title}</div>
      <div style={styles.kpiValue}>{value}</div>
    </div>
  );
}

/**
 * Intro styles
 */
const intro = {
  container: {
    height: "100vh",
    width: "100vw",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    background: "linear-gradient(135deg, #020617, #0B1224)",
    color: "white",
    overflow: "hidden",
    position: "relative",
  },
  glow: {
    position: "absolute",
    width: 620,
    height: 620,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(34,197,94,0.18), rgba(34,197,94,0.0) 70%)",
    animation: "glowPulse 2.2s ease-in-out infinite",
    filter: "blur(10px)",
  },
  stage: {
    zIndex: 1,
    display: "flex",
    alignItems: "center",
    gap: 34,
    padding: "28px 32px",
  },
  textBlock: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    lineHeight: 1.05,
  },
  brandLine: {
    fontSize: 58,
    fontWeight: 950,
    letterSpacing: 0.2,
  },
  accent: { color: "#22c55e" },
  trailLine: {
    marginTop: 12,
    fontSize: 22,
    letterSpacing: 1.6,
    color: "#94a3b8",
    whiteSpace: "nowrap",
  },
  trailText: {
    display: "inline-block",
    animation: "revealText 1.15s ease forwards",
    animationDelay: "0.55s",
    clipPath: "inset(0 100% 0 0)",
    opacity: 0,
  },
  runner: {
    width: 250,
    opacity: 0,
    animation:
      "runnerPopIn 0.55s ease-out forwards, runnerIdle 0.9s ease-in-out infinite",
    animationDelay: "0s, 0.7s",
  },
};

/**
 * UI styles
 */
const styles = {
  accentColor: "#22c55e",

  page: {
    maxWidth: 1100,
    margin: "22px auto",
    padding: "0 16px",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    color: "#111827",
  },

  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
    marginBottom: 14,
  },

  brand: { fontSize: 22, fontWeight: 950 },
  tagline: { fontSize: 12, color: "#6B7280", marginTop: 4 },

  nav: { display: "flex", gap: 10 },
  navBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#F9FAFB",
    cursor: "pointer",
    fontWeight: 800,
  },
  navBtnActive: {
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
  },

  content: { marginTop: 8 },

  sectionHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 12,
  },

  controlsRow: { display: "flex", gap: 10, flexWrap: "wrap" },

  h2: { margin: 0, fontSize: 18, fontWeight: 900 },

  kpiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: 12,
    marginBottom: 12,
  },

  kpiCard: {
    background: "white",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 14,
    boxShadow: "0 8px 24px rgba(17,24,39,0.06)",
  },
  kpiTitle: { fontSize: 12, color: "#6B7280", fontWeight: 800 },
  kpiValue: { marginTop: 8, fontSize: 22, fontWeight: 950 },

  cardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },

  card: {
    background: "#FFFFFF",
    border: "1px solid #E5E7EB",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 8px 24px rgba(17,24,39,0.06)",
  },

  cardTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 10,
    marginBottom: 10,
  },

  cardTitle: { fontSize: 14, fontWeight: 900 },
  cardMeta: { fontSize: 12, color: "#6B7280" },

  field: { marginBottom: 12 },
  label: { display: "block", marginBottom: 6, fontWeight: 900, fontSize: 12 },

  row: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" },
  metaText: { color: "#374151", fontSize: 13 },

  previewImg: {
    marginTop: 10,
    width: "100%",
    borderRadius: 14,
    border: "1px solid #F3F4F6",
  },

  primaryBtn: {
    marginTop: 8,
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #111827",
    background: "#111827",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  stopBtn: {
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid #991B1B",
    background: "#991B1B",
    color: "white",
    fontWeight: 900,
    cursor: "pointer",
  },

  secondaryBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "#F9FAFB",
    cursor: "pointer",
    fontWeight: 800,
  },

  dangerBtn: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #FECACA",
    background: "#FEF2F2",
    cursor: "pointer",
    fontWeight: 900,
    color: "#991B1B",
  },

  select: {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    background: "white",
    fontWeight: 800,
  },

  input: {
    width: "100%",
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #E5E7EB",
    outline: "none",
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },

  hint: { marginTop: 10, fontSize: 12, color: "#6B7280", lineHeight: 1.4 },

  errorBox: {
    marginTop: 12,
    background: "#FEF2F2",
    border: "1px solid #FECACA",
    color: "#991B1B",
    padding: 10,
    borderRadius: 12,
    fontSize: 13,
  },

  placeholder: { color: "#6B7280", lineHeight: 1.4 },

  footer: { marginTop: 18, fontSize: 12, color: "#6B7280" },
};
