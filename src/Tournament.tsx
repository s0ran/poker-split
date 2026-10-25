import { Fragment, useRef, useState } from "react";
import { SettleGroup, Tag, eur, uid, virtualCost } from "./App";

type Mode = "meal" | "entry";

interface TPlayer {
  id: string;
  name: string;
  rebuys: string;
  /** true = 金参加 (ポーカーのみ) */
  skipMeal: boolean;
}

interface TResult {
  name: string;
  rank: number;
  rebuys: number;
  skipMeal: boolean;
  meal: number; // 飯代の負担 (金参加は平均との差額)
  paidIn: number; // リバイ代 or 参加費
  prize: number; // 受け取る賞金
  net: number; // + = 払う、- = 受け取る
}

interface TSummary {
  mode: Mode;
  pool: number;
  mealActual: number;
  mealVirtual: number;
  average: number;
  skippers: number;
}

// 順位比例の飯代負担割合 (%): 1位は0、(順位 - 1) に比例。合計がちょうど100になるよう最後で調整
export function linearMealPcts(n: number): string[] {
  const divisor = (n * (n - 1)) / 2;
  if (n < 2) return ["100"];
  const pcts = Array.from({ length: n }, (_, i) => Math.round((i / divisor) * 10000) / 100);
  const rest = pcts.slice(0, -1).reduce((s, x) => s + x, 0);
  pcts[n - 1] = Math.round((100 - rest) * 100) / 100;
  return pcts.map(String);
}

function parsePcts(values: string[], label: string, n: number): number[] | string {
  const pcts = values.slice(0, n).map((x) => parseFloat(x));
  if (pcts.some((x) => isNaN(x) || x < 0)) return `${label}を数字で入力してください。`;
  const sum = pcts.reduce((s, x) => s + x, 0);
  if (Math.abs(sum - 100) > 0.01) return `${label}の合計を100%にしてください (今は${Math.round(sum * 100) / 100}%)。`;
  return pcts;
}

// 順位ごとの割合の配列をプレイヤー数に合わせる (足りない分は0)
const resize = (arr: string[], n: number) =>
  arr.length >= n ? arr.slice(0, n) : [...arr, ...Array<string>(n - arr.length).fill("0")];
const isLinear = (arr: string[]) => arr.join() === linearMealPcts(arr.length).join();

const emptyPlayer = (): TPlayer => ({ id: uid(), name: "", rebuys: "0", skipMeal: false });

// 並び順 = 順位
const SAMPLE: [string, number, boolean][] = [
  ["Aki", 0, false],
  ["Ben", 1, false],
  ["Chie", 2, false],
  ["Dan", 0, true],
  ["Emi", 1, false],
  ["Fumi", 3, false],
];

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500";

export default function Tournament() {
  const [mode, setMode] = useState<Mode>("meal");
  const [mealCost, setMealCost] = useState("");
  const [rebuyFee, setRebuyFee] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [payouts, setPayouts] = useState<string[]>(() => resize(["50", "30", "20"], 5));
  const [mealPcts, setMealPcts] = useState<string[]>(() => linearMealPcts(5));
  const [players, setPlayers] = useState<TPlayer[]>(() => Array.from({ length: 5 }, emptyPlayer));
  const [results, setResults] = useState<{ rows: TResult[]; summary: TSummary } | null>(null);
  const [error, setError] = useState("");

  const updatePlayer = (id: string, patch: Partial<TPlayer>) =>
    setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  // プレイヤーの増減に合わせて順位表も伸び縮みさせる。飯代が順位比例のままなら新しい人数で入れ直す
  const setPlayersSynced = (next: TPlayer[]) => {
    setPlayers(next);
    setPayouts(resize(payouts, next.length));
    setMealPcts(isLinear(mealPcts) ? linearMealPcts(next.length) : resize(mealPcts, next.length));
  };

  // ドラッグで並べ替え: つまみを押したまま上下に動かすと、指の位置の行と入れ替わる (タッチ対応のため pointer events)
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [dragId, setDragId] = useState<string | null>(null);

  const onDragMove = (clientY: number) => {
    if (!dragId) return;
    const from = players.findIndex((p) => p.id === dragId);
    let to = players.length - 1;
    for (let i = 0; i < players.length; i++) {
      const el = rowRefs.current.get(players[i]!.id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientY < r.top + r.height / 2) {
        to = i;
        break;
      }
    }
    if (to === from) return;
    const next = [...players];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved!);
    setPlayers(next);
  };

  const fillSample = () => {
    setMealCost("127.63");
    setRebuyFee("10");
    setEntryFee("20");
    setPayouts(resize(["50", "30", "20"], SAMPLE.length));
    setMealPcts(linearMealPcts(SAMPLE.length));
    setPlayers(
      SAMPLE.map(([name, rebuys, skipMeal]) => ({ id: uid(), name, rebuys: String(rebuys), skipMeal }))
    );
    setError("");
  };

  const handleCalculate = () => {
    setError("");
    // 名前が入った人だけを並び順で数えて順位にする
    const parsed = players
      .filter((p) => p.name.trim())
      .map((p, i) => ({
        name: p.name.trim(),
        rank: i + 1,
        rebuys: parseInt(p.rebuys || "0", 10),
        skipMeal: mode === "meal" && p.skipMeal,
      }));
    const n = parsed.length;
    if (n < 2) return setError("名前が入ったプレイヤーを2人以上入力してください。");
    if (parsed.some((p) => isNaN(p.rebuys) || p.rebuys < 0)) return setError("リバイ回数は0以上の整数で入力してください。");

    const pcts = parsePcts(payouts, "賞金の配分割合", n);
    if (typeof pcts === "string") return setError(pcts);
    const prizeShare = (rank: number) => (rank <= pcts.length ? pcts[rank - 1]! / 100 : 0);

    let rows: TResult[];
    let summary: TSummary;

    const fee = parseFloat(rebuyFee || "0");
    if (isNaN(fee) || fee < 0) return setError("リバイ額を数字で入力してください。");
    const rebuyTotal = fee * parsed.reduce((s, p) => s + p.rebuys, 0);

    if (mode === "meal") {
      const cost = parseFloat(mealCost);
      if (isNaN(cost) || cost < 0) return setError("ご飯代合計を入力してください (なしなら0)。");

      const mp = parsePcts(mealPcts, "ご飯代の負担割合", n);
      if (typeof mp === "string") return setError(mp);
      const bd = virtualCost(cost, parsed);
      if (!bd) return setError("飯参加の人が1人以上必要です。");
      const pool = rebuyTotal;

      rows = parsed.map((p) => {
        const share = p.rank <= mp.length ? (mp[p.rank - 1]! / 100) * bd.virtual : 0;
        const meal = p.skipMeal ? share - bd.average : share;
        const paidIn = p.rebuys * fee;
        const prize = prizeShare(p.rank) * pool;
        return { ...p, meal, paidIn, prize, net: meal + paidIn - prize };
      });
      summary = { mode, pool, mealActual: cost, mealVirtual: bd.virtual, average: bd.average, skippers: bd.skippers };
    } else {
      // prize pool = 参加費 × 人数 + リバイ額 × リバイ総数
      const entry = parseFloat(entryFee);
      if (isNaN(entry) || entry <= 0) return setError("参加費を入力してください。");
      const pool = entry * n + rebuyTotal;
      rows = parsed.map((p) => {
        const paidIn = entry + p.rebuys * fee;
        const prize = prizeShare(p.rank) * pool;
        return { ...p, meal: 0, paidIn, prize, net: paidIn - prize };
      });
      summary = { mode, pool, mealActual: 0, mealVirtual: 0, average: 0, skippers: 0 };
    }

    rows.sort((a, b) => a.rank - b.rank);
    setResults({ rows, summary });
    window.scrollTo(0, 0);
  };

  if (results) return <TournamentResults {...results} onBack={() => setResults(null)} />;

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {(
          [
            ["meal", "飯代 + リバイ"],
            ["entry", "参加費"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 py-2 rounded-lg text-sm ${
              mode === key ? "bg-green-600 text-white" : "bg-gray-800 text-gray-400 border border-gray-700"
            }`}
            aria-pressed={mode === key}
            onClick={() => setMode(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex gap-2">
        {mode === "meal" ? (
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-400 mb-1">ご飯代合計 (EUR)</label>
            <input type="number" inputMode="decimal" className={inputCls} placeholder="127.63" value={mealCost} onChange={(e) => setMealCost(e.target.value)} />
          </div>
        ) : (
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-400 mb-1">参加費 (EUR / 人)</label>
            <input type="number" inputMode="decimal" className={inputCls} placeholder="20" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <label className="block text-sm text-gray-400 mb-1">リバイ1回 (EUR)</label>
          <input type="number" inputMode="decimal" className={inputCls} placeholder="10" value={rebuyFee} onChange={(e) => setRebuyFee(e.target.value)} />
        </div>
      </div>

      <RankTable
        mode={mode}
        meal={mealPcts}
        prize={payouts}
        onMeal={setMealPcts}
        onPrize={setPayouts}
        onLinear={() => setMealPcts(linearMealPcts(players.length))}
      />

      <div>
        <label className="block text-sm text-gray-400 mb-2">プレイヤー ({players.length}人)</label>
        <p className="text-xs text-gray-500 mb-2">上から1位、2位…の順。左の ⠿ をドラッグで並べ替え</p>
        <div className="flex gap-2 text-xs text-gray-500 mb-1">
          <span className="w-14" />
          <span className="flex-1">名前</span>
          <span className="w-14 text-center">リバイ</span>
        </div>
        <div className="space-y-2">
          {players.map((p, i) => (
            <div
              key={p.id}
              ref={(el) => {
                if (el) rowRefs.current.set(p.id, el);
                else rowRefs.current.delete(p.id);
              }}
              className={`flex gap-2 items-center rounded-lg ${dragId === p.id ? "bg-gray-700/60 ring-1 ring-green-500" : ""}`}
            >
              <div className="w-14 shrink-0 flex items-center gap-1">
                <span
                  className="text-gray-400 text-lg px-1 cursor-grab select-none"
                  style={{ touchAction: "none" }}
                  aria-label={`${i + 1}位をドラッグで移動`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.currentTarget.setPointerCapture(e.pointerId);
                    setDragId(p.id);
                  }}
                  onPointerMove={(e) => onDragMove(e.clientY)}
                  onPointerUp={() => setDragId(null)}
                  onPointerCancel={() => setDragId(null)}
                >
                  ⠿
                </span>
                <span className="text-gray-400 text-sm">{i + 1}位</span>
              </div>
              <input
                type="text"
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                placeholder="名前"
                value={p.name}
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              />
              <input
                type="number"
                inputMode="numeric"
                className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-green-500"
                aria-label="リバイ回数"
                value={p.rebuys}
                onChange={(e) => updatePlayer(p.id, { rebuys: e.target.value })}
              />
              {mode === "meal" && (
                <>
                  <div className="flex shrink-0 rounded-lg border border-gray-700 overflow-hidden text-xs">
                    <button
                      className={`px-2 py-2 ${!p.skipMeal ? "bg-green-600 text-white" : "bg-gray-800 text-gray-500"}`}
                      aria-pressed={!p.skipMeal}
                      onClick={() => updatePlayer(p.id, { skipMeal: false })}
                    >
                      飯
                    </button>
                    <button
                      className={`px-2 py-2 border-l border-gray-700 ${p.skipMeal ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-800 text-gray-500"}`}
                      aria-pressed={p.skipMeal}
                      onClick={() => updatePlayer(p.id, { skipMeal: true })}
                    >
                      金
                    </button>
                  </div>
                </>
              )}
              <button
                className="text-gray-500 hover:text-red-400 text-lg px-1 disabled:opacity-30"
                onClick={() => setPlayersSynced(players.filter((x) => x.id !== p.id))}
                disabled={players.length <= 2}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="mt-2 w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:border-gray-400"
          onClick={() => setPlayersSynced([...players, emptyPlayer()])}
        >
          + プレイヤー追加
        </button>
      </div>

      <button
        className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors"
        onClick={handleCalculate}
      >
        計算する
      </button>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <div className="text-center">
        <button className="text-gray-500 text-sm underline" onClick={fillSample}>
          サンプルを入力
        </button>
      </div>
    </div>
  );
}

// 順位ごとの飯代負担 % と賞金配分 % を1つの表で入力する。行数はプレイヤー数と同じ
function RankTable({
  mode,
  meal,
  prize,
  onMeal,
  onPrize,
  onLinear,
}: {
  mode: Mode;
  meal: string[];
  prize: string[];
  onMeal: (v: string[]) => void;
  onPrize: (v: string[]) => void;
  onLinear: () => void;
}) {
  const sum = (arr: string[]) => Math.round(arr.reduce((s, x) => s + (parseFloat(x) || 0), 0) * 100) / 100;
  const set = (arr: string[], i: number, v: string) => arr.map((x, j) => (j === i ? v : x));
  const cell =
    "w-full min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-right focus:outline-none focus:border-green-500";
  const showMeal = mode === "meal";
  return (
    <div>
      <div className="flex justify-between items-baseline mb-2">
        <label className="text-sm text-gray-400">順位ごとの割合 (%)</label>
        {showMeal && (
          <button className="text-gray-400 text-sm underline" onClick={onLinear}>
            飯代を順位比例に
          </button>
        )}
      </div>
      <div className="grid gap-2 items-center" style={{ gridTemplateColumns: showMeal ? "2.5rem 1fr 1fr" : "2.5rem 1fr" }}>
        <span />
        {showMeal && <span className="text-xs text-gray-500 text-right">飯代の負担</span>}
        <span className="text-xs text-gray-500 text-right">{showMeal ? "リバイプール配分" : "prize pool配分"}</span>
        {prize.map((_, i) => (
          <Fragment key={i}>
            <span className="text-gray-500 text-sm">{i + 1}位</span>
            {showMeal && (
              <input
                type="number"
                inputMode="decimal"
                className={cell}
                aria-label={`${i + 1}位の飯代負担`}
                value={meal[i] ?? "0"}
                onChange={(e) => onMeal(set(meal, i, e.target.value))}
              />
            )}
            <input
              type="number"
              inputMode="decimal"
              className={cell}
              aria-label={`${i + 1}位の賞金配分`}
              value={prize[i]}
              onChange={(e) => onPrize(set(prize, i, e.target.value))}
            />
          </Fragment>
        ))}
        <span className="text-xs text-gray-500">合計</span>
        {showMeal && <span className={`text-xs text-right ${sum(meal) === 100 ? "text-gray-500" : "text-red-400"}`}>{sum(meal)}%</span>}
        <span className={`text-xs text-right ${sum(prize) === 100 ? "text-gray-500" : "text-red-400"}`}>{sum(prize)}%</span>
      </div>
    </div>
  );
}

function TournamentResults({ rows, summary: s, onBack }: { rows: TResult[]; summary: TSummary; onBack: () => void }) {
  const [copied, setCopied] = useState("");
  const settle = [...rows].sort((a, b) => b.net - a.net);
  const pays = settle.filter((x) => x.net > 0.005);
  const gets = settle.filter((x) => x.net < -0.005);
  const nones = settle.filter((x) => Math.abs(x.net) <= 0.005);
  const billTotal = pays.reduce((t, x) => t + x.net, 0);
  const sendTotal = gets.reduce((t, x) => t - x.net, 0);
  const tag = (x: TResult) => ` (${x.rank}位${x.skipMeal ? ", 金" : ""})`;

  const header =
    s.mode === "meal"
      ? `*Poker Split トーナメント* ご飯代 ${eur(s.mealActual)} / リバイプール ${eur(s.pool)}`
      : `*Poker Split トーナメント* prize pool ${eur(s.pool)}`;
  const memoText = [
    header,
    "",
    `*請求* 合計 ${eur(billTotal)}`,
    ...pays.map((x) => `• ${x.name}${tag(x)}: ${eur(x.net)}`),
    ...(gets.length ? ["", `*受け取り* 合計 ${eur(sendTotal)}`, ...gets.map((x) => `• ${x.name}${tag(x)}: ${eur(-x.net)}`)] : []),
    ...(nones.length ? ["", `*精算なし*: ${nones.map((x) => x.name + tag(x)).join(", ")}`] : []),
  ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(memoText);
      setCopied("コピーしました");
    } catch {
      setCopied("コピーできませんでした");
    }
    setTimeout(() => setCopied(""), 1500);
  };

  const line = (label: string, value: string) => (
    <div className="flex justify-between text-gray-400">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-1">
        {s.mode === "meal" ? (
          <>
            {line("ご飯代", eur(s.mealActual))}
            {s.skippers > 0 && line(`計算用ご飯代 (金参加${s.skippers}人)`, eur(s.mealVirtual))}
            {line("リバイプール", eur(s.pool))}
          </>
        ) : (
          line("prize pool", eur(s.pool))
        )}
      </div>

      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.name} className="bg-gray-800 rounded-lg px-4 py-3">
            <div className="flex justify-between items-center gap-3">
              <div className="min-w-0">
                <span className="text-gray-500 text-sm mr-2">{r.rank}位</span>
                <span className="font-medium">{r.name}</span>
                {r.skipMeal && <Tag />}
              </div>
              <span className={`font-semibold ${r.net > 0.005 ? "text-red-400" : r.net < -0.005 ? "text-green-400" : "text-gray-400"}`}>
                {r.net > 0.005 ? eur(r.net) : r.net < -0.005 ? "+" + eur(-r.net) : "€0.00"}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-500 mt-1">
              {s.mode === "meal" ? (
                <>
                  <span>飯代 {eur(r.meal)}</span>
                  <span>
                    リバイ {r.rebuys}回 {eur(r.paidIn)}
                  </span>
                </>
              ) : (
                <span>
                  参加費{r.rebuys > 0 ? ` + リバイ${r.rebuys}回` : ""} {eur(r.paidIn)}
                </span>
              )}
              {r.prize > 0 && <span className="text-green-400">賞金 +{eur(r.prize)}</span>}
            </div>
          </div>
        ))}
      </div>

      <div className="border border-gray-700 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm text-gray-300 font-medium">精算</h2>
          <button className="border border-gray-700 rounded-md px-2.5 py-1 text-xs text-gray-400" onClick={copy}>
            {copied || "コピー"}
          </button>
        </div>
        <SettleGroup
          title="請求"
          total={eur(billTotal)}
          cls="text-red-400"
          list={pays.map((x) => ({ name: x.name, money: x.skipMeal, net: x.net }))}
          fmt={(n) => eur(n)}
        />
        {gets.length > 0 && (
          <SettleGroup
            title="受け取り"
            total={"+" + eur(sendTotal)}
            cls="text-green-400"
            list={gets.map((x) => ({ name: x.name, money: x.skipMeal, net: x.net }))}
            fmt={(n) => "+" + eur(-n)}
          />
        )}
        {nones.length > 0 && (
          <div className="flex justify-between gap-3 mt-3 text-sm">
            <span className="text-gray-400 font-semibold">精算なし</span>
            <span className="text-gray-400">{nones.map((x) => x.name).join(", ")}</span>
          </div>
        )}
      </div>

      <button className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors" onClick={onBack}>
        ← 戻る
      </button>
    </div>
  );
}
