# PostgreSQL 単価マスタ設定

## 概要
- 単価マスタは `server/data/master-items.json` ではなく PostgreSQL に保存されます。
- 初回起動時に `price_master_items` テーブルを自動作成します。
- PostgreSQL が空の場合のみ、旧 JSON または seed master を自動投入します。

## 必須環境変数
以下のいずれかを設定してください。

### 1. 接続文字列で指定
```bash
export DATABASE_URL="postgres://USER:PASSWORD@HOST:5432/DBNAME"
```

### 2. 分割指定で接続
```bash
export PGHOST="127.0.0.1"
export PGPORT="5432"
export PGDATABASE="my_estimator"
export PGUSER="postgres"
export PGPASSWORD="postgres"
```

## 任意設定
```bash
export PGSSLMODE="require"
```
- SSL 必須環境では `require` を指定してください。

## 起動例
```bash
cd /Users/user/work/my-estimator-ocr
pnpm dev
```

```bash
cd /Users/user/work/my-estimator-ocr
pnpm build
pnpm start
```

## 動作確認
```bash
curl "http://127.0.0.1:3000/api/masters?effectiveDate=2026-03-12"
```

## 失敗時の症状
- `PostgreSQL接続情報が未設定です。DATABASE_URL または PGHOST/PGDATABASE/PGUSER を設定してください。`
  - 接続環境変数が未設定です。
- 接続タイムアウトや認証エラー
  - DB ホスト、ポート、ユーザー、パスワードを確認してください。

## 移行方針
- `server/data/master-items.json` は移行元としてのみ参照します。
- 運用開始後の正本は PostgreSQL の `price_master_items` テーブルです。
