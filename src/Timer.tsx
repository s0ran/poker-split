import { useEffect, useRef, useState } from "react";
import { uid } from "./App";

type Row =
  | { id: string; kind: "level"; sb: string; bb: string; ante: string; min: string }
  | { id: string; kind: "break"; min: string };

interface RunState {
  index: number;
  /** 動作中: 現在の段の終了時刻 (ms)。一時停止中は null */
  endAt: number | null;
  /** 一時停止中の残り時間 (ms) */
  remainingMs: number;
}

const STRUCTURE_KEY = "ps-timer-structure";
const RUN_KEY = "ps-timer-run";

// スタック400 × 6人 (計2400) を想定。開始は 1/2 (BBアンティ2)、アンティは常に BB と同額
const BLINDS_SHORT: [number, number][] = [
  [1, 2],
  [2, 4],
  [3, 6],
  [5, 10],
  [8, 16],
  [10, 20],
  [15, 30],
  [20, 40],
];
const BLINDS_LONG: [number, number][] = [
  [1, 2],
  [2, 4],
  [3, 6],
  [4, 8],
  [5, 10],
  [6, 12],
  [8, 16],
  [10, 20],
  [15, 30],
  [20, 40],
];

// 各レベル min 分、breakAfter のレベル番号の後に breakMin 分の休憩
function makePreset(blinds: [number, number][], min: number, breakAfter: number[], breakMin: number): Row[] {
  const rows: Row[] = [];
  blinds.forEach(([sb, bb], i) => {
    rows.push({ id: uid(), kind: "level", sb: String(sb), bb: String(bb), ante: String(bb), min: String(min) });
    if (breakAfter.includes(i + 1)) rows.push({ id: uid(), kind: "break", min: String(breakMin) });
  });
  return rows;
}

const PRESETS: { key: string; label: string; make: () => Row[] }[] = [
  { key: "90", label: "約1.5時間", make: () => makePreset(BLINDS_SHORT, 10, [4], 5) },
  { key: "120", label: "約2時間", make: () => makePreset(BLINDS_SHORT, 14, [4], 8) },
  { key: "180", label: "約3時間", make: () => makePreset(BLINDS_LONG, 17, [4, 8], 5) },
];

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 保存できない環境 (プライベートモード等) では保存しないだけ
  }
}

const minutesOf = (r: Row) => Math.max(0, parseFloat(r.min) || 0);
const fmt = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
const fmtHM = (min: number) => (min >= 60 ? `${Math.floor(min / 60)}時間${Math.round(min % 60)}分` : `${Math.round(min)}分`);

// 短いビープ音 (Web Audio)。AudioContext はタップ操作の中で作っておく必要がある
function beep(ctx: AudioContext | null, freq: number, times: number) {
  if (!ctx) return;
  for (let i = 0; i < times; i++) {
    const t = ctx.currentTime + i * 0.35;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.3);
  }
}

export default function Timer() {
  const [rows, setRows] = useState<Row[]>(() => load<Row[]>(STRUCTURE_KEY) ?? PRESETS[1]!.make());
  const [run, setRun] = useState<RunState | null>(() => load<RunState>(RUN_KEY));
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | null>(null);
  const warned = useRef<number>(-1);
  const wakeLock = useRef<WakeLockSentinel | null>(null);

  useEffect(() => save(STRUCTURE_KEY, rows), [rows]);
  useEffect(() => save(RUN_KEY, run), [run]);

  // 動作中は 250ms ごとに再描画
  const running = run?.endAt != null;
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [running]);

  // 画面を消さない (対応ブラウザのみ)。タブに戻ったときに取り直す
  useEffect(() => {
    if (!running) {
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
      return;
    }
    const request = () => {
      if (!("wakeLock" in navigator) || document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => (wakeLock.current = l))
        .catch(() => {});
    };
    request();
    document.addEventListener("visibilitychange", request);
    return () => document.removeEventListener("visibilitychange", request);
  }, [running]);

  const durMs = (i: number) => minutesOf(rows[i]!) * 60_000;
  const remaining = run ? (run.endAt != null ? run.endAt - now : run.remainingMs) : 0;

  // 時間切れで次の段へ。複数段ぶん遅れていてもまとめて進める
  useEffect(() => {
    if (!run || run.endAt == null || remaining > 0) return;
    let index = run.index;
    let endAt = run.endAt;
    while (endAt <= now && index < rows.length - 1) {
      index += 1;
      endAt += durMs(index);
    }
    if (endAt <= now) {
      setRun({ index, endAt: null, remainingMs: 0 });
      beep(audio.current, 660, 3);
      return;
    }
    warned.current = -1;
    setRun({ index, endAt, remainingMs: 0 });
    beep(audio.current, 880, 3);
  }, [remaining, run, now, rows.length]);

  // 残り1分で1回だけ知らせる
  useEffect(() => {
    if (!run || run.endAt == null) return;
    if (remaining <= 60_000 && remaining > 0 && warned.current !== run.index && durMs(run.index) > 60_000) {
      warned.current = run.index;
      beep(audio.current, 520, 1);
    }
  }, [remaining, run]);

  const ensureAudio = () => {
    if (!audio.current) {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) audio.current = new Ctx();
    }
    audio.current?.resume().catch(() => {});
  };

  const start = () => {
    ensureAudio();
    const t = Date.now();
    setNow(t);
    if (!run) setRun({ index: 0, endAt: t + durMs(0), remainingMs: 0 });
    else setRun({ ...run, endAt: t + run.remainingMs });
  };
  const pause = () => {
    if (!run || run.endAt == null) return;
    setRun({ ...run, endAt: null, remainingMs: Math.max(0, run.endAt - Date.now()) });
  };
  const jump = (index: number) => {
    if (!run || index < 0 || index >= rows.length) return;
    const t = Date.now();
    setNow(t);
    warned.current = -1;
    setRun({ index, endAt: run.endAt != null ? t + durMs(index) : null, remainingMs: durMs(index) });
  };
  const reset = () => setRun(null);

  if (run) {
    const row = rows[run.index]!;
    const nextLevel = rows.slice(run.index + 1).find((r) => r.kind === "level");
    const nextRow = rows[run.index + 1];
    const levelNo = rows.slice(0, run.index + 1).filter((r) => r.kind === "level").length;
    const elapsedMin =
      rows.slice(0, run.index).reduce((s, r) => s + minutesOf(r), 0) + (durMs(run.index) - remaining) / 60_000;
    const totalMin = rows.reduce((s, r) => s + minutesOf(r), 0);
    const progress = durMs(run.index) > 0 ? 1 - remaining / durMs(run.index) : 1;
    const lastMinute = remaining <= 60_000 && remaining > 0;
    const finished = run.endAt == null && remaining <= 0 && run.index === rows.length - 1;

    return (
      <div className="space-y-5 text-center">
        <div className="text-sm text-gray-400">
          {row.kind === "break" ? "休憩" : `Level ${levelNo}`}
          <span className="text-gray-600"> · 経過 {fmtHM(elapsedMin)} / {fmtHM(totalMin)}</span>
        </div>

        <div
          className={`font-mono tabular-nums font-bold leading-none ${
            finished ? "text-gray-500" : lastMinute ? "text-red-400" : "text-white"
          }`}
          style={{ fontSize: "clamp(4rem, 24vw, 7rem)" }}
        >
          {finished ? "終了" : fmt(remaining)}
        </div>

        <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-600 transition-[width] duration-200" style={{ width: `${Math.min(100, progress * 100)}%` }} />
        </div>

        {row.kind === "level" ? (
          <div>
            <div className="text-xs text-gray-500 mb-1">ブラインド</div>
            <div className="text-4xl font-bold tabular-nums">
              {row.sb} / {row.bb}
            </div>
            {parseFloat(row.ante) > 0 && <div className="text-gray-400 mt-1">アンティ {row.ante}</div>}
          </div>
        ) : (
          <div className="text-3xl font-bold text-yellow-300">休憩中</div>
        )}

        <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm text-gray-400">
          次:{" "}
          {nextRow?.kind === "break" ? (
            <span className="text-yellow-300">休憩 {nextRow.min}分</span>
          ) : nextLevel && nextLevel.kind === "level" ? (
            <span className="text-white tabular-nums">
              {nextLevel.sb} / {nextLevel.bb}
              {parseFloat(nextLevel.ante) > 0 ? ` (アンティ ${nextLevel.ante})` : ""}
            </span>
          ) : (
            <span>なし (最終レベル)</span>
          )}
        </div>

        <div className="flex gap-2">
          <button className="flex-1 py-3 bg-gray-800 rounded-lg disabled:opacity-30" onClick={() => jump(run.index - 1)} disabled={run.index === 0}>
            ⏮ 戻る
          </button>
          {run.endAt != null ? (
            <button className="flex-[1.4] py-3 bg-gray-600 rounded-lg font-semibold" onClick={pause}>
              一時停止
            </button>
          ) : (
            <button className="flex-[1.4] py-3 bg-green-600 rounded-lg font-semibold disabled:opacity-30" onClick={start} disabled={finished}>
              再開
            </button>
          )}
          <button
            className="flex-1 py-3 bg-gray-800 rounded-lg disabled:opacity-30"
            onClick={() => jump(run.index + 1)}
            disabled={run.index >= rows.length - 1}
          >
            進む ⏭
          </button>
        </div>

        <ResetButton onReset={reset} />
      </div>
    );
  }

  return <Structure rows={rows} setRows={setRows} onStart={start} />;
}

// 誤タップ防止: 2回押して初めてリセット
function ResetButton({ onReset }: { onReset: () => void }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      className={`text-sm underline ${armed ? "text-red-400" : "text-gray-500"}`}
      onClick={() => (armed ? onReset() : setArmed(true))}
    >
      {armed ? "もう一度押すとタイマーを終了してストラクチャーに戻ります" : "タイマーを終了"}
    </button>
  );
}

function Structure({ rows, setRows, onStart }: { rows: Row[]; setRows: (r: Row[]) => void; onStart: () => void }) {
  const update = (id: string, patch: Partial<{ sb: string; bb: string; ante: string; min: string }>) =>
    setRows(rows.map((r) => (r.id === id ? ({ ...r, ...patch } as Row) : r)));
  const totalMin = rows.reduce((s, r) => s + minutesOf(r), 0);
  const cell =
    "w-full min-w-0 bg-gray-800 border border-gray-700 rounded-md px-1.5 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:border-green-500";
  let levelNo = 0;

  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm text-gray-400 mb-2">コース</label>
        <div className="flex gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              className="flex-1 py-2 rounded-lg text-sm bg-gray-800 text-gray-300 border border-gray-700 active:bg-gray-700"
              onClick={() => setRows(p.make())}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500 mt-1">選ぶと下のストラクチャーが置き換わります。編集した内容はこの端末に保存されます。</p>
      </div>

      <div>
        <div className="flex justify-between items-baseline mb-2">
          <label className="text-sm text-gray-400">ストラクチャー</label>
          <span className="text-xs text-gray-500">合計 {fmtHM(totalMin)}</span>
        </div>
        <div className="grid gap-1.5 items-center" style={{ gridTemplateColumns: "2.2rem 1fr 1fr 1fr 2.8rem 1.5rem" }}>
          <span />
          <span className="text-xs text-gray-500 text-right">SB</span>
          <span className="text-xs text-gray-500 text-right">BB</span>
          <span className="text-xs text-gray-500 text-right">アンティ</span>
          <span className="text-xs text-gray-500 text-right">分</span>
          <span />
          {rows.map((r) => {
            const del = (
              <button
                key={r.id + "-x"}
                className="text-gray-500 hover:text-red-400 disabled:opacity-30"
                aria-label="この段を削除"
                onClick={() => setRows(rows.filter((x) => x.id !== r.id))}
                disabled={rows.length <= 1}
              >
                ×
              </button>
            );
            const minInput = (
              <input
                key={r.id + "-min"}
                type="number"
                inputMode="decimal"
                className={cell}
                aria-label="時間 (分)"
                value={r.min}
                onChange={(e) => update(r.id, { min: e.target.value })}
              />
            );
            if (r.kind === "break") {
              return [
                <span key={r.id + "-n"} className="text-xs text-yellow-300">
                  休憩
                </span>,
                <span key={r.id + "-b"} className="col-span-3 text-xs text-yellow-300/70 border-t border-dashed border-yellow-300/30" />,
                minInput,
                del,
              ];
            }
            levelNo += 1;
            return [
              <span key={r.id + "-n"} className="text-xs text-gray-500">
                L{levelNo}
              </span>,
              ...(["sb", "bb", "ante"] as const).map((f) => (
                <input
                  key={r.id + "-" + f}
                  type="number"
                  inputMode="numeric"
                  className={cell}
                  aria-label={`L${levelNo} ${f}`}
                  value={r[f]}
                  onChange={(e) => {
                    const patch: Partial<Record<"sb" | "bb" | "ante", string>> = {};
                    patch[f] = e.target.value;
                    update(r.id, patch);
                  }}
                />
              )),
              minInput,
              del,
            ];
          })}
        </div>
        <div className="flex gap-4 mt-2 text-sm">
          <button
            className="text-gray-400"
            onClick={() => {
              const last = [...rows].reverse().find((r) => r.kind === "level");
              const sb = last && last.kind === "level" ? (parseFloat(last.sb) || 0) * 2 : 1;
              const min = last ? last.min : "15";
              setRows([...rows, { id: uid(), kind: "level", sb: String(sb), bb: String(sb * 2), ante: String(sb * 2), min }]);
            }}
          >
            + レベル
          </button>
          <button className="text-gray-400" onClick={() => setRows([...rows, { id: uid(), kind: "break", min: "5" }])}>
            + 休憩
          </button>
        </div>
      </div>

      <button
        className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors disabled:opacity-40"
        onClick={onStart}
        disabled={rows.length === 0 || totalMin <= 0}
      >
        スタート
      </button>
      <p className="text-xs text-gray-500 text-center">レベルが変わるときと残り1分で音が鳴ります。動作中は画面が消えにくくなります (対応ブラウザのみ)。</p>
    </div>
  );
}
