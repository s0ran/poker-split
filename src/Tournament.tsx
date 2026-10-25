import { useState } from "react";
import { SettleGroup, Tag, eur, uid, virtualCost } from "./App";

type Mode = "meal" | "entry";

interface TPlayer {
  id: string;
  name: string;
  rank: string;
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

// 飯代を順位で分ける: diff = 順位 - 1 (1位は0)、amount = diff / Σdiff × ご飯代
export function rankSplit(cost: number, ranks: number[]): number[] {
  const diffs = ranks.map((r) => r - 1);
  const divisor = diffs.reduce((s, d) => s + d, 0);
  if (divisor === 0) return ranks.map(() => cost / ranks.length);
  return diffs.map((d) => (d / divisor) * cost);
}

const emptyPlayer = (rank: number): TPlayer => ({ id: uid(), name: "", rank: String(rank), rebuys: "0", skipMeal: false });

const SAMPLE: [string, number, number, boolean][] = [
  ["Aki", 1, 0, false],
  ["Ben", 2, 1, false],
  ["Chie", 3, 2, false],
  ["Dan", 4, 0, true],
  ["Emi", 5, 1, false],
  ["Fumi", 6, 3, false],
];

const inputCls =
  "w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500";

export default function Tournament() {
  const [mode, setMode] = useState<Mode>("meal");
  const [mealCost, setMealCost] = useState("");
  const [rebuyFee, setRebuyFee] = useState("");
  const [entryFee, setEntryFee] = useState("");
  const [payouts, setPayouts] = useState<string[]>(["50", "30", "20"]);
  const [players, setPlayers] = useState<TPlayer[]>(() => Array.from({ length: 5 }, (_, i) => emptyPlayer(i + 1)));
  const [results, setResults] = useState<{ rows: TResult[]; summary: TSummary } | null>(null);
  const [error, setError] = useState("");

  const updatePlayer = (id: string, patch: Partial<TPlayer>) =>
    setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  const fillSample = () => {
    setMealCost("127.63");
    setRebuyFee("10");
    setEntryFee("20");
    setPayouts(["50", "30", "20"]);
    setPlayers(
      SAMPLE.map(([name, rank, rebuys, skipMeal]) => ({ id: uid(), name, rank: String(rank), rebuys: String(rebuys), skipMeal }))
    );
    setError("");
  };

  const handleCalculate = () => {
    setError("");
    const parsed = players
      .filter((p) => p.name.trim())
      .map((p) => ({
        name: p.name.trim(),
        rank: parseInt(p.rank, 10),
        rebuys: mode === "meal" ? parseInt(p.rebuys || "0", 10) : 0,
        skipMeal: mode === "meal" && p.skipMeal,
      }));
    const n = parsed.length;
    if (n < 2) return setError("名前が入ったプレイヤーを2人以上入力してください。");
    const ranks = parsed.map((p) => p.rank);
    if (ranks.some((r) => isNaN(r) || r < 1 || r > n) || new Set(ranks).size !== n)
      return setError(`順位は1〜${n}を重複なしで入力してください。`);
    if (parsed.some((p) => isNaN(p.rebuys) || p.rebuys < 0)) return setError("リバイ回数は0以上の整数で入力してください。");

    const pcts = payouts.map((x) => parseFloat(x));
    if (pcts.some((x) => isNaN(x) || x < 0)) return setError("配分割合を数字で入力してください。");
    const pctSum = pcts.reduce((s, x) => s + x, 0);
    if (Math.abs(pctSum - 100) > 0.001) return setError(`配分割合の合計を100%にしてください (今は${pctSum}%)。`);
    if (pcts.length > n) return setError("配分する順位の数がプレイヤー数を超えています。");
    const prizeShare = (rank: number) => (rank <= pcts.length ? pcts[rank - 1]! / 100 : 0);

    let rows: TResult[];
    let summary: TSummary;

    if (mode === "meal") {
      const cost = parseFloat(mealCost);
      if (isNaN(cost) || cost < 0) return setError("ご飯代合計を入力してください (なしなら0)。");
      const fee = parseFloat(rebuyFee || "0");
      if (isNaN(fee) || fee < 0) return setError("リバイ額を数字で入力してください。");

      const bd = virtualCost(cost, parsed);
      if (!bd) return setError("飯参加の人が1人以上必要です。");
      const shares = rankSplit(bd.virtual, ranks);
      const pool = fee * parsed.reduce((s, p) => s + p.rebuys, 0);

      rows = parsed.map((p, i) => {
        const meal = p.skipMeal ? shares[i]! - bd.average : shares[i]!;
        const paidIn = p.rebuys * fee;
        const prize = prizeShare(p.rank) * pool;
        return { ...p, meal, paidIn, prize, net: meal + paidIn - prize };
      });
      summary = { mode, pool, mealActual: cost, mealVirtual: bd.virtual, average: bd.average, skippers: bd.skippers };
    } else {
      const fee = parseFloat(entryFee);
      if (isNaN(fee) || fee <= 0) return setError("参加費を入力してください。");
      const pool = fee * n;
      rows = parsed.map((p) => {
        const prize = prizeShare(p.rank) * pool;
        return { ...p, meal: 0, paidIn: fee, prize, net: fee - prize };
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

      {mode === "meal" ? (
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-400 mb-1">ご飯代合計 (EUR)</label>
            <input type="number" inputMode="decimal" className={inputCls} placeholder="127.63" value={mealCost} onChange={(e) => setMealCost(e.target.value)} />
          </div>
          <div className="flex-1 min-w-0">
            <label className="block text-sm text-gray-400 mb-1">リバイ1回 (EUR)</label>
            <input type="number" inputMode="decimal" className={inputCls} placeholder="10" value={rebuyFee} onChange={(e) => setRebuyFee(e.target.value)} />
          </div>
        </div>
      ) : (
        <div>
          <label className="block text-sm text-gray-400 mb-1">参加費 (EUR / 人)</label>
          <input type="number" inputMode="decimal" className={inputCls} placeholder="20" value={entryFee} onChange={(e) => setEntryFee(e.target.value)} />
        </div>
      )}

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          配分割合 (%) — {mode === "meal" ? "リバイプール" : "prize pool"}
        </label>
        <div className="space-y-2">
          {payouts.map((v, i) => (
            <div key={i} className="flex gap-2 items-center">
              <span className="text-gray-500 text-sm w-10">{i + 1}位</span>
              <input
                type="number"
                inputMode="decimal"
                className={inputCls}
                value={v}
                onChange={(e) => setPayouts(payouts.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                className="text-gray-500 hover:text-red-400 text-lg px-1 disabled:opacity-30"
                onClick={() => setPayouts(payouts.filter((_, j) => j !== i))}
                disabled={payouts.length <= 1}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center mt-2">
          <button className="text-gray-400 text-sm" onClick={() => setPayouts([...payouts, "0"])}>
            + 順位を追加
          </button>
          <span className="text-xs text-gray-500">
            合計 {payouts.reduce((s, x) => s + (parseFloat(x) || 0), 0)}%
          </span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">プレイヤー ({players.length}人)</label>
        <div className="flex gap-2 text-xs text-gray-500 mb-1 pl-1">
          <span className="w-12">順位</span>
          <span className="flex-1">名前</span>
          {mode === "meal" && <span className="w-14 text-center">リバイ</span>}
        </div>
        <div className="space-y-2">
          {players.map((p) => (
            <div key={p.id} className="flex gap-2 items-center">
              <input
                type="number"
                inputMode="numeric"
                className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-green-500"
                aria-label="順位"
                value={p.rank}
                onChange={(e) => updatePlayer(p.id, { rank: e.target.value })}
              />
              <input
                type="text"
                className="flex-1 min-w-0 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                placeholder="名前"
                value={p.name}
                onChange={(e) => updatePlayer(p.id, { name: e.target.value })}
              />
              {mode === "meal" && (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-14 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm text-center focus:outline-none focus:border-green-500"
                    aria-label="リバイ回数"
                    value={p.rebuys}
                    onChange={(e) => updatePlayer(p.id, { rebuys: e.target.value })}
                  />
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
                onClick={() => setPlayers(players.filter((x) => x.id !== p.id))}
                disabled={players.length <= 2}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          className="mt-2 w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:border-gray-400"
          onClick={() => setPlayers([...players, emptyPlayer(players.length + 1)])}
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
                <span>参加費 {eur(r.paidIn)}</span>
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
