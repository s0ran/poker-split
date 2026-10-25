import { useState } from "react";

interface Player {
  id: string;
  name: string;
  chips: string;
  skipMeal: boolean;
}

interface Result {
  name: string;
  chips: number;
  amount: number;
  skipMeal: boolean;
}

interface CostBreakdown {
  actual: number;
  average: number;
  eaters: number;
  skippers: number;
  virtual: number;
}

// ご飯を食べない人がいる場合: 実際のご飯代 ÷ 食べた人数 = 平均。
// 計算用ご飯代 = 実際のご飯代 + 平均 × 食べない人数 (= 平均 × 全員)
function virtualCost(actual: number, players: { skipMeal: boolean }[]): CostBreakdown | null {
  const skippers = players.filter((p) => p.skipMeal).length;
  const eaters = players.length - skippers;
  if (eaters === 0) return null;
  const average = actual / eaters;
  return { actual, average, eaters, skippers, virtual: actual + average * skippers };
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
    return players.map((p) => ({ name: p.name, chips: p.chips, amount: even, skipMeal: p.skipMeal }));
  }

  return players.map((p, i) => ({
    name: p.name,
    chips: p.chips,
    amount: (diffs[i]! / divisor) * totalCost,
    skipMeal: p.skipMeal,
  }));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function App() {
  const [totalCost, setTotalCost] = useState("");
  const [players, setPlayers] = useState<Player[]>([
    { id: uid(), name: "", chips: "", skipMeal: false },
    { id: uid(), name: "", chips: "", skipMeal: false },
  ]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [breakdown, setBreakdown] = useState<CostBreakdown | null>(null);
  const [error, setError] = useState("");
  const [targetMode, setTargetMode] = useState<"auto" | "manual">("auto");
  const [manualTarget, setManualTarget] = useState("");

  const addPlayer = () => {
    setPlayers([...players, { id: uid(), name: "", chips: "", skipMeal: false }]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers(players.filter((p) => p.id !== id));
  };

  const toggleSkipMeal = (id: string) => {
    setPlayers(players.map((p) => (p.id === id ? { ...p, skipMeal: !p.skipMeal } : p)));
  };

  const updatePlayer = (id: string, field: "name" | "chips", value: string) => {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
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
    if (!bd) return setError("ご飯を食べた人が1人以上必要です。");

    const target =
      targetMode === "manual" && manualTarget.trim()
        ? parseFloat(manualTarget)
        : Math.max(...parsed.map((p) => p.chips));

    if (isNaN(target)) return setError("基準チップ数を数字で入力してください。");

    const res = calculateSplit(bd.virtual, parsed, target);
    res.sort((a, b) => b.amount - a.amount);
    setBreakdown(bd);
    setResults(res);
  };

  const handleReset = () => {
    setResults(null);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-6">♠ Poker Split</h1>

      {results && breakdown ? (
        <ResultsView
          results={results}
          breakdown={breakdown}
          isAutoMode={targetMode === "auto"}
          onBack={handleReset}
        />
      ) : (
        <div className="space-y-5">
          {/* Total cost */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              ご飯代合計 (EUR、実際に払った金額)
            </label>
            <input
              type="number"
              inputMode="decimal"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-lg focus:outline-none focus:border-green-500"
              placeholder="127.63"
              value={totalCost}
              onChange={(e) => setTotalCost(e.target.value)}
            />
          </div>

          {/* Target mode */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">基準チップ数</label>
            <div className="flex gap-2 mb-2">
              <button
                className={`flex-1 py-2 rounded-lg text-sm ${
                  targetMode === "auto"
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
                onClick={() => setTargetMode("auto")}
              >
                自動 (1位)
              </button>
              <button
                className={`flex-1 py-2 rounded-lg text-sm ${
                  targetMode === "manual"
                    ? "bg-green-600 text-white"
                    : "bg-gray-800 text-gray-400 border border-gray-700"
                }`}
                onClick={() => setTargetMode("manual")}
              >
                手動入力
              </button>
            </div>
            {targetMode === "manual" && (
              <input
                type="number"
                inputMode="numeric"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2 focus:outline-none focus:border-green-500"
                placeholder="初期チップ数 (例: 500)"
                value={manualTarget}
                onChange={(e) => setManualTarget(e.target.value)}
              />
            )}
          </div>

          {/* Players */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">
              プレイヤー ({players.length}人)
            </label>
            <div className="space-y-2">
              {players.map((p, i) => (
                <div key={p.id} className="flex gap-2 items-center">
                  <span className="text-gray-500 text-sm w-5">{i + 1}</span>
                  <input
                    type="text"
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                    placeholder="名前"
                    value={p.name}
                    onChange={(e) => updatePlayer(p.id, "name", e.target.value)}
                  />
                  <input
                    type="number"
                    inputMode="numeric"
                    className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-green-500"
                    placeholder="チップ"
                    value={p.chips}
                    onChange={(e) => updatePlayer(p.id, "chips", e.target.value)}
                  />
                  <button
                    className={`shrink-0 rounded-lg px-2 py-2 text-xs border ${
                      p.skipMeal
                        ? "bg-yellow-500/20 border-yellow-500 text-yellow-300"
                        : "bg-gray-800 border-gray-700 text-gray-500"
                    }`}
                    aria-pressed={p.skipMeal}
                    onClick={() => toggleSkipMeal(p.id)}
                  >
                    {p.skipMeal ? "食べない" : "食べた"}
                  </button>
                  <button
                    className="text-gray-500 hover:text-red-400 text-lg px-1"
                    onClick={() => removePlayer(p.id)}
                    disabled={players.length <= 2}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mt-2 w-full py-2 border border-dashed border-gray-600 rounded-lg text-gray-400 text-sm hover:border-gray-400"
              onClick={addPlayer}
            >
              + プレイヤー追加
            </button>
          </div>

          {/* Calculate button */}
          <button
            className="w-full py-3 bg-green-600 hover:bg-green-700 rounded-lg text-lg font-semibold transition-colors"
            onClick={handleCalculate}
          >
            計算する
          </button>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>
      )}
    </div>
  );
}

function ResultsView({
  results,
  breakdown,
  isAutoMode,
  onBack,
}: {
  results: Result[];
  breakdown: CostBreakdown;
  isAutoMode: boolean;
  onBack: () => void;
}) {
  const payers = results.filter((r) => r.amount > 0.005);
  const receivers = results.filter((r) => r.amount < -0.005);
  const neutral = results.filter(
    (r) => r.amount >= -0.005 && r.amount <= 0.005
  );

  // 1位 (amount=0 or min) との差額 — Revolut 送金用
  // 自動モードでは neutral (1位) が €0 なので、payer の amount がそのまま送金額
  const topAmount = Math.min(...results.map((r) => r.amount));

  return (
    <div className="space-y-4">
      {breakdown.skippers > 0 ? (
        <div className="bg-gray-800 rounded-lg px-4 py-3 text-sm space-y-1">
          <div className="flex justify-between text-gray-400">
            <span>実際のご飯代</span><span>€{breakdown.actual.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>1人あたり平均 (食べた{breakdown.eaters}人)</span>
            <span>€{breakdown.average.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>+ 平均 × 食べない{breakdown.skippers}人</span>
            <span>€{(breakdown.average * breakdown.skippers).toFixed(2)}</span>
          </div>
          <div className="flex justify-between border-t border-gray-700 pt-1">
            <span className="text-gray-300">計算用ご飯代</span>
            <span className="text-white font-semibold">€{breakdown.virtual.toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <div className="text-center text-gray-400 text-sm">
          ご飯代: <span className="text-white font-semibold">€{breakdown.actual.toFixed(2)}</span>
        </div>
      )}

      {/* Payers — 負けた人 */}
      {payers.length > 0 && (
        <div>
          <h2 className="text-sm text-red-400 font-medium mb-2">💸 支払い</h2>
          <div className="space-y-1">
            {payers.map((r) => (
              <div key={r.name} className="bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({r.chips})</span>
                    {r.skipMeal && <span className="text-yellow-400 text-xs ml-2">食べない</span>}
                  </div>
                  <span className="text-red-400 font-semibold">
                    €{r.amount.toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neutral — 基準 (1位) */}
      {neutral.length > 0 && (
        <div>
          <h2 className="text-sm text-gray-400 font-medium mb-2">🏆 基準 (€0.00)</h2>
          <div className="space-y-1">
            {neutral.map((r) => (
              <div key={r.name} className="bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({r.chips})</span>
                    {r.skipMeal && <span className="text-yellow-400 text-xs ml-2">食べない</span>}
                  </div>
                  <span className="text-gray-400">€0.00</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receivers — 勝った人 */}
      {receivers.length > 0 && (
        <div>
          <h2 className="text-sm text-green-400 font-medium mb-2">🎉 受け取り</h2>
          <div className="space-y-1">
            {receivers.map((r) => (
              <div key={r.name} className="bg-gray-800 rounded-lg px-4 py-3">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="font-medium">{r.name}</span>
                    <span className="text-gray-500 text-sm ml-2">({r.chips})</span>
                    {r.skipMeal && <span className="text-yellow-400 text-xs ml-2">食べない</span>}
                  </div>
                  <span className="text-green-400 font-semibold">
                    +€{Math.abs(r.amount).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Revolut 送金メモ — 自動モードのみ */}
      {isAutoMode && (
        <div className="border border-gray-700 rounded-lg p-4 mt-2">
          <h2 className="text-sm text-gray-300 font-medium mb-2">📱 Revolut 送金メモ</h2>
          <p className="text-xs text-gray-500 mb-2">1位とのチップ差:</p>
          <div className="space-y-1">
            {results.map((r) => {
              const maxChips = Math.max(...results.map((x) => x.chips));
              const chipDiff = maxChips - r.chips;
              if (chipDiff === 0) return null;
              return (
                <div key={r.name} className="flex justify-between text-sm">
                  <span className="text-gray-300">{r.name}</span>
                  <span className="text-yellow-400 font-mono">-{chipDiff} chips</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <button
        className="w-full py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium transition-colors mt-4"
        onClick={onBack}
      >
        ← 戻る
      </button>
    </div>
  );
}
