import { useState } from "react";

interface Player {
  id: string;
  name: string;
  chips: string;
}

interface Result {
  name: string;
  chips: number;
  amount: number;
}

function calculateSplit(
  totalCost: number,
  players: { name: string; chips: number }[],
  target: number
): Result[] {
  const diffs = players.map((p) => target - p.chips);
  const divisor = diffs.reduce((sum, d) => sum + Math.abs(d), 0);

  if (divisor === 0) {
    // Everyone has the same chips — split evenly
    const even = totalCost / players.length;
    return players.map((p) => ({ name: p.name, chips: p.chips, amount: even }));
  }

  return players.map((p, i) => ({
    name: p.name,
    chips: p.chips,
    amount: (diffs[i]! / divisor) * totalCost,
  }));
}

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

export default function App() {
  const [totalCost, setTotalCost] = useState("");
  const [players, setPlayers] = useState<Player[]>([
    { id: uid(), name: "", chips: "" },
    { id: uid(), name: "", chips: "" },
  ]);
  const [results, setResults] = useState<Result[] | null>(null);
  const [targetMode, setTargetMode] = useState<"auto" | "manual">("auto");
  const [manualTarget, setManualTarget] = useState("");

  const addPlayer = () => {
    setPlayers([...players, { id: uid(), name: "", chips: "" }]);
  };

  const removePlayer = (id: string) => {
    if (players.length <= 2) return;
    setPlayers(players.filter((p) => p.id !== id));
  };

  const updatePlayer = (id: string, field: "name" | "chips", value: string) => {
    setPlayers(
      players.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  };

  const handleCalculate = () => {
    const cost = parseFloat(totalCost);
    if (isNaN(cost) || cost <= 0) return;

    const parsed = players
      .filter((p) => p.name.trim() && p.chips.trim())
      .map((p) => ({ name: p.name.trim(), chips: parseFloat(p.chips) }))
      .filter((p) => !isNaN(p.chips));

    if (parsed.length < 2) return;

    const target =
      targetMode === "manual" && manualTarget.trim()
        ? parseFloat(manualTarget)
        : Math.max(...parsed.map((p) => p.chips));

    if (isNaN(target)) return;

    const res = calculateSplit(cost, parsed, target);
    // Sort: payers first (descending), then receivers (ascending)
    res.sort((a, b) => b.amount - a.amount);
    setResults(res);
  };

  const handleReset = () => {
    setResults(null);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-6">♠ Poker Split</h1>

      {results ? (
        <ResultsView results={results} totalCost={parseFloat(totalCost)} onBack={handleReset} />
      ) : (
        <div className="space-y-5">
          {/* Total cost */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">
              ご飯代合計 (EUR)
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
        </div>
      )}
    </div>
  );
}

function ResultsView({
  results,
  totalCost,
  onBack,
}: {
  results: Result[];
  totalCost: number;
  onBack: () => void;
}) {
  const payers = results.filter((r) => r.amount > 0.005);
  const receivers = results.filter((r) => r.amount < -0.005);
  const neutral = results.filter(
    (r) => r.amount >= -0.005 && r.amount <= 0.005
  );

  return (
    <div className="space-y-4">
      <div className="text-center text-gray-400 text-sm">
        ご飯代: <span className="text-white font-semibold">€{totalCost.toFixed(2)}</span>
      </div>

      {/* Payers */}
      {payers.length > 0 && (
        <div>
          <h2 className="text-sm text-red-400 font-medium mb-2">💸 支払い</h2>
          <div className="space-y-1">
            {payers.map((r) => (
              <div
                key={r.name}
                className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({r.chips} chips)
                  </span>
                </div>
                <span className="text-red-400 font-semibold">
                  €{r.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Neutral */}
      {neutral.length > 0 && (
        <div>
          <h2 className="text-sm text-gray-400 font-medium mb-2">🏆 基準 (0 EUR)</h2>
          <div className="space-y-1">
            {neutral.map((r) => (
              <div
                key={r.name}
                className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({r.chips} chips)
                  </span>
                </div>
                <span className="text-gray-400">€0.00</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Receivers */}
      {receivers.length > 0 && (
        <div>
          <h2 className="text-sm text-green-400 font-medium mb-2">🎉 受け取り</h2>
          <div className="space-y-1">
            {receivers.map((r) => (
              <div
                key={r.name}
                className="flex justify-between items-center bg-gray-800 rounded-lg px-4 py-3"
              >
                <div>
                  <span className="font-medium">{r.name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({r.chips} chips)
                  </span>
                </div>
                <span className="text-green-400 font-semibold">
                  -€{Math.abs(r.amount).toFixed(2)}
                </span>
              </div>
            ))}
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
