# Poker Split Calculator

## 概要
ポーカー後のご飯代を、最終チップ数に応じて公平に split する Web アプリ。

## Formula

### 入力
- `total_cost`: ご飯代合計 (EUR)
- `players[]`: 各プレイヤーの名前とチップ数
- `target`: 基準チップ数 (= 1 位のチップ数。1 位は支払 0 EUR)

### 計算
```
diff_i     = target - chip_i            # 正=負け (支払)、負=勝ち (受取)
divisor    = Σ |diff_i|                 # 全員の差分絶対値の合計
amount_i   = (diff_i / divisor) × total_cost
```

### 意味
- `amount_i > 0` → 支払 (負けた人がご飯代を多く負担)
- `amount_i < 0` → 受取 (勝った人はご飯代が浮く)
- `amount_i = 0` → 基準 = 1 位 (ご飯代ゼロ)
- `Σ amount_i = 0` にはならない (loser 側の合計 > winner 側の合計、差額 = ご飯代 × winners の貢献比率)

### target の決め方
- デフォルト: 最大チップ数 (= 1 位が 0 EUR になる)
- ユーザーが手動指定することも可能 (例: 全員の初期チップ数 = フラットスタート基準)

### 例 (9 人、ご飯代 127.63 EUR、target=530)
| Player | Chips | diff | amount (EUR) |
|--------|-------|------|-------------|
| 1位 (基準) | 530 | 0 | 0.00 |
| 最下位 | 104 | +426 | +30.21 (支払) |
| Winner | 1141 | -611 | -43.32 (受取) |

## 要件
- 人数: 可変 (2-20 人)
- 入力: 名前 + チップ数 + ご飯代合計
- 出力: 各人の支払/受取額
- UI: スマホで使える (ポーカー会場で即使えるように)
- 技術: React (Vite) + single HTML deploy 可能

## UI フロー
1. ご飯代合計を入力
2. プレイヤーを追加 (名前 + チップ数)
3. 「計算」ボタン → 結果表示 (支払順)

## Tech Stack
- React 18 + TypeScript
- Vite
- Tailwind CSS (mobile-first)
- デプロイ: GitHub Pages or S3 (static)
