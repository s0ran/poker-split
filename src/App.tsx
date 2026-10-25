import { useState } from "react";
import Tournament from "./Tournament";
import Timer from "./Timer";

interface Player {
  id: string;
  name: string;
  chips: string;
  /** true = 金参加 (ポーカーのみ)、false = 飯参加 */
  skipMeal: boolean;
}

interface Result {
  name: string;
  chips: number;
  amount: number;
  skipMeal: boolean;
}

export interface CostBreakdown {
  actual: number;
  average: number;
  eaters: number;
  skippers: number;
  virtual: number;
}

function calculateSplit(
  totalCost: number,
  players: { name: string; chips: number; skipMeal: boolean }[],
  target: number
): Result[] {
  const diffs = players.map((p) => target - p.chips);
  const divisor = diffs.reduce((sum, d) => sum + Math.abs(d), 0);

  if (divisor === 0) {
    const even = totalCost / players.length;
    return players.map((p) => ({ ...p, amount: even }));
  }

  return players.map((p, i) => ({ ...p, amount: (diffs[i]! / divisor) * totalCost }));
}

// 金参加がいる場合: 平均 = 実際のご飯代 ÷ 飯参加人数、計算用ご飯代 = 実際 + 平均 × 金参加人数
export function virtualCost(actual: number, players: { skipMeal: boolean }[]): CostBreakdown | null {
  const skippers = players.filter((p) => p.skipMeal).length;
  const eaters = players.length - skippers;
  if (eaters === 0) return null;
  const average = actual / eaters;
  return { actual, average, eaters, skippers, virtual: actual + average * skippers };
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

const emptyPlayer = (): Player => ({ id: uid(), name: "", chips: "", skipMeal: false });
export const eur = (n: number) => "€" + n.toFixed(2);

// テスト用: 請求・受け取り・精算なし・金参加の全パターンが出るデータ
const SAMPLE: [string, number, boolean][] = [
  ["Aki", 1141, false],
  ["Ben", 530, false],
  ["Chie", 104, false],
  ["Dan", 980, true],
  ["Emi", 745, false],
  ["Fumi", 390, true],
];

export default function App() {
  const [tab, setTab] = useState<"cash" | "tournament" | "timer">("cash");
  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-4">♠ Poker Split</h1>
      <div className="flex gap-1 mb-6 bg-gray-800 rounded-lg p-1">
        {(
          [
            ["cash", "キャッシュ"],
            ["tournament", "トーナメント"],
            ["timer", "タイマー"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            className={`flex-1 py-2 rounded-md text-sm ${tab === key ? "bg-gray-600 text-white" : "text-gray-400"}`}
            aria-pressed={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "cash" ? <CashSplit /> : tab === "tournament" ? <Tournament /> : <Timer />}
    </div>
  );
}

function CashSplit() {
  const [totalCost, setTotalCost] = useState("");
  const [players, setPlayers] = useState<Player[]>(() => Array.from({ length: 5 }, emptyPlayer));
  const [results, setResults] = useState<Result[] | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState("");

  const addPlayer = () => setPlayers([...players, emptyPlayer()]);

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers(players.filter((p) => p.id !== id));
  };

  const updatePlayer = (id: string, patch: Partial<Player>) => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const fillSample = () => {
    setTotalCost("127.63");
    setPlayers(SAMPLE.map(([name, chips, skipMeal]) => ({ id: uid(), name, chips: String(chips), skipMeal })));
    setError("");
  };

  const handleCalculate = () => {
    setError("");
    const cost = parseFloat(totalCost);
    if (isNaN(cost) || cost <= 0) return setError("ご飯代合計を入力してください。");

    const parsed = players
      .filter((p) => p.name.trim() && p.chips.trim())
      .map((p) => ({ name: p.name.trim(), chips: parseFloat(p.chips), skipMeal: p.skipMeal }))
      .filter((p) => !isNaN(p.chips));
    if (parsed.length < 2) return setError("名前とチップ数が入ったプレイヤーを2人以上入力してください。");

    const bd = virtualCost(cost, parsed);
    if (!bd) return setError("飯参加の人が1人以上必要です。");

    // 基準 = 1位のチップ数 (1位は€0)
    const target = Math.max(...parsed.map((p) => p.chips));
    const res = calculateSplit(bd.virtual, parsed, target);
    res.sort((a, b) => b.amount - a.amount);
    setBreakdown(bd);
    setResults(res);
    window.scrollTo(0, 0);
  };

  return (
    <div>
      {results && breakdown ? (
        <ResultsView results={results} breakdown={breakdown} onBack={() => setResults(null)} />
      ) : (
        <div className="space-y-5">
          <div>
            <label className="block text-sm text-gray-400 mb-1">ご飯代合計 (EUR、実際に払った金額)</label>
            <input
              type="number"
              inputMode="decimal"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-green-500"
              placeholder="127.63"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">プレイヤー ({players.length}人)</label>
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex gap-2 items-center">
                  <span className="text-gray-500 text-sm w-5">{i + 1}</span>
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
                    className="w-20 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                    placeholder="チップ"
                    value={p.chips}
                    onChange={(e) => updatePlayer(p.id, { chips: e.target.value })}
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
                      className={`px-2 py-2 border-l border-gray-700 ${
                        p.skipMeal ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-800 text-gray-500"
                      }`}
                      aria-pressed={p.skipMeal}
                      onClick={() => updatePlayer(p.id, { skipMeal: true })}
                    >
                      金
                    </button>
                  </div>
                  <button
                    className="text-gray-500 hover:text-red-400 text-lg px-1 disabled:opacity-30"
                    onClick={() => removePlayer(p.id)}
                    disabled={players.length <= 2}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1">飯 = ご飯も参加 / 金 = ポーカーのみ参加</p>
            <button
              className="mt-2 w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:border-gray-400"
              onClick={addPlayer}
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
      )}
    </div>
  );
}

export function Tag() {
  return <span className="text-yellow-400 text-xs ml-2">金</span>;
}

function ResultsView({
  results,
  breakdown: bd,
  onBack,
}: {
  results: Result[];
  breakdown: CostBreakdown;
  onBack: () => void;
}) {
  const [copied, setCopied] = useState("");

  const payers = results.filter((r) => r.amount > 0.005);
  const receivers = results.filter((r) => r.amount < -0.005);
  const neutral = results.filter((r) => r.amount >= -0.005 && r.amount <= 0.005);

  // 実際に精算する額: 飯参加はsplit額そのまま、金参加はsplit額 − 平均
  const settle = results
    .map((r) => ({ name: r.name, chips: r.chips, money: r.skipMeal, net: r.skipMeal ? r.amount - bd.average : r.amount }))
    .sort((a, b) => b.net - a.net);
  const pays = settle.filter((x) => x.net > 0.005);
  const gets = settle.filter((x) => x.net < -0.005);
  const nones = settle.filter((x) => Math.abs(x.net) <= 0.005);
  const billTotal = pays.reduce((t, x) => t + x.net, 0);
  const sendTotal = gets.reduce((t, x) => t - x.net, 0);
  const tag = (x: { chips: number; money: boolean }) => ` (${x.chips}${x.money ? ", 金" : ""})`;

  // コピー用テキスト (*太字* と • 箇条書き)
  const memoText = [
    `*Poker Split* ご飯代 ${eur(bd.actual)}`,
    "",
    `*請求* 合計 ${eur(billTotal)}`,
    ...pays.map((x) => `• ${x.name}${tag(x)}: ${eur(x.net)}`),
    ...(gets.length
      ? ["", `*受け取り* 合計 ${eur(sendTotal)}`, ...gets.map((x) => `• ${x.name}${tag(x)}: ${eur(-x.net)}`)]
      : []),
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

  const row = (r: Result, amount: JSX.Element) => (
    <div key={r.name} className="bg-gray-800 rounded-lg px-4 py-3">
      <div className="flex justify-between items-center gap-3">
        <div className="min-w-0">
          <span className="font-medium">{r.name}</span>
          <span className="text-gray-500 text-sm ml-2">({r.chips})</span>
          {r.skipMeal && <Tag />}
        </div>
        {amount}
      </div>
      {r.skipMeal && <NetLine net={r.amount - bd.average} average={bd.average} />}
    </div>
  );

  return (
    <div className="space-y-4">
      {bd.skippers > 0 ? (
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>実際のご飯代</span>
            <span>{eur(bd.actual)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>1人あたり平均 (飯参加{bd.eaters}人)</span>
            <span>{eur(bd.average)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>+ 平均 × 金参加{bd.skippers}人</span>
            <span>{eur(bd.average * bd.skippers)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-1">
            <span className="text-gray-300">計算用ご飯代</span>
            <span className="text-white font-semibold">{eur(bd.virtual)}</span>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 text-sm">
          ご飯代: <span className="text-white font-semibold">{eur(bd.actual)}</span>
        </div>
      )}

      {payers.length > 0 && (
        <div>
          <h2 className="text-sm text-red-400 font-medium mb-2">支払い</h2>
          <div className="space-y-1">
            {payers.map((r) => row(r, <span className="text-red-400 font-semibold">{eur(r.amount)}</span>))}
          </div>
        </div>
      )}

      {neutral.length > 0 && (
        <div>
          <h2 className="text-sm text-gray-400 font-medium mb-2">基準 (€0.00)</h2>
          <div className="space-y-1">{neutral.map((r) => row(r, <span className="text-gray-400">€0.00</span>))}</div>
        </div>
      )}

      {receivers.length > 0 && (
        <div>
          <h2 className="text-sm text-green-400 font-medium mb-2">受け取り</h2>
          <div className="space-y-1">
            {receivers.map((r) =>
              row(r, <span className="text-green-400 font-semibold">+{eur(Math.abs(r.amount))}</span>)
            )}
          </div>
        </div>
      )}

      <div className="border border-gray-700 rounded-lg p-4">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-sm text-gray-300 font-medium">精算</h2>
          <button className="border border-gray-700 rounded-md px-2.5 py-1 text-xs text-gray-400" onClick={copy}>
            {copied || "コピー"}
          </button>
        </div>
        <SettleGroup title="請求" total={eur(billTotal)} cls="text-red-400" list={pays} fmt={(n) => eur(n)} />
        {gets.length > 0 && (
          <SettleGroup
            title="受け取り"
            total={"+" + eur(sendTotal)}
            cls="text-green-400"
            list={gets}
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

      <button
        className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors"
        onClick={onBack}
      >
        ← 戻る
      </button>
    </div>
  );
}

function NetLine({ net, average }: { net: number; average: number }) {
  const label = `平均${eur(average)}との差額`;
  let value = <span className="text-gray-400">€0.00</span>;
  let note = "";
  if (net > 0.005) {
    value = <span className="text-red-400 font-semibold">{eur(net)}</span>;
    note = " (請求)";
  } else if (net < -0.005) {
    value = <span className="text-green-400 font-semibold">+{eur(-net)}</span>;
    note = " (受け取り)";
  }
  return (
    <div className="flex justify-between gap-3 border-t border-dashed border-gray-700 mt-2 pt-2 text-xs text-gray-400">
      <span>
        {label}
        {note}
      </span>
      {value}
    </div>
  );
}

export function SettleGroup({
  title,
  total,
  cls,
  list,
  fmt,
}: {
  title: string;
  total: string;
  cls: string;
  list: { name: string; money: boolean; net: number }[];
  fmt: (net: number) => string;
}) {
  return (
    <div className="mt-3">
      <div className="flex justify-between text-sm mb-1">
        <span className="text-gray-400 font-semibold">{title}</span>
        <span className={`${cls} font-bold`}>{total}</span>
      </div>
      <div className="space-y-1">
        {list.map((x) => (
          <div key={x.name} className="flex justify-between text-sm">
            <span className="text-gray-300">
              {x.name}
              {x.money && <Tag />}
            </span>
            <span className={`${cls} font-semibold`}>{fmt(x.net)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
