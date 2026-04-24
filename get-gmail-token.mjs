/**
 * Gmail OAuth2 リフレッシュトークン取得スクリプト
 * =====================================================
 * 使い方:
 *   1. Google Cloud Console で OAuth2 クライアントID のシークレットを確認
 *   2. .env に GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET を記入
 *   3. このスクリプトを実行:
 *        node get-gmail-token.mjs
 *   4. 表示されたURLをブラウザで開いてGmailアカウントにログイン
 *   5. 表示された認可コードをターミナルに貼り付け
 *   6. 取得された REFRESH_TOKEN を .env の GMAIL_REFRESH_TOKEN に貼り付け
 *
 * ※ Google Cloud Console で「リダイレクト URI」に
 *    http://localhost を追加しておくこと
 */

import { google } from 'googleapis';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import * as fs from 'node:fs';

// ─── .env を読み込む（dotenv なしで手動パース） ──────────────────────────────

function loadEnv(filename = '.env') {
  try {
    const lines = fs.readFileSync(filename, 'utf-8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env がない場合は無視
  }
}

loadEnv();

// ─── メイン処理 ──────────────────────────────────────────────────────────────

const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(`
❌ エラー: GMAIL_CLIENT_ID と GMAIL_CLIENT_SECRET が .env に設定されていません。

手順:
  1. Google Cloud Console (https://console.cloud.google.com/apis/credentials) を開く
  2. 使用する OAuth 2.0 クライアント ID をクリック
  3. 「クライアント ID」と「クライアントシークレット」をコピー
  4. .env に以下を記入:
       GMAIL_CLIENT_ID=コピーしたクライアントID
       GMAIL_CLIENT_SECRET=コピーしたクライアントシークレット
  5. 再度 node get-gmail-token.mjs を実行
`);
  process.exit(1);
}

const REDIRECT_URI = 'urn:ietf:wg:oauth:2.0:oob';  // デスクトップ用OOBフロー

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

// Gmail 読み取り + 変更（既読マーク）スコープ
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
];

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent',  // 必ず refresh_token を発行させる
});

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📧 Gmail OAuth2 リフレッシュトークン取得
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1: 以下の URL をブラウザで開いてください。
        （Cmd+クリック または コピーして貼り付け）

${authUrl}

STEP 2: Gmailアカウント (merumaga.kensetusentai@gmail.com) でログインし、
        権限を許可してください。

STEP 3: 表示された「認可コード」を下のプロンプトに貼り付けてください。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

const rl = readline.createInterface({ input, output });

let code;
try {
  code = await rl.question('認可コードを貼り付けてください: ');
} finally {
  rl.close();
}

if (!code?.trim()) {
  console.error('❌ 認可コードが入力されませんでした。');
  process.exit(1);
}

try {
  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error(`
❌ リフレッシュトークンが取得できませんでした。

対処法:
  - Google Cloud Console で以下を確認してください:
    * このOAuth2クライアントIDでの「同意画面」の承認が残っている場合は
      一度アクセスを取り消してから再実行してください:
      https://myaccount.google.com/permissions
  - または prompt: 'consent' が有効でない場合はブラウザのキャッシュをクリアしてください。
`);
    process.exit(1);
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ 成功！リフレッシュトークンを取得しました。
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

以下を .env ファイルに貼り付けてください:

GMAIL_REFRESH_TOKEN=${tokens.refresh_token}

アクセストークン (参考/不要):
  ${tokens.access_token ?? '（未取得）'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  // .env を自動更新する（GMAIL_REFRESH_TOKEN が空の場合のみ）
  try {
    let envContent = fs.readFileSync('.env', 'utf-8');
    if (envContent.includes('GMAIL_REFRESH_TOKEN=\n') || envContent.includes('GMAIL_REFRESH_TOKEN=\r')) {
      envContent = envContent.replace(
        /^GMAIL_REFRESH_TOKEN=.*$/m,
        `GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`
      );
      fs.writeFileSync('.env', envContent, 'utf-8');
      console.log('✅ .env ファイルを自動更新しました。');
    } else {
      console.log('ℹ️ .env の GMAIL_REFRESH_TOKEN を手動で上書きしてください。');
    }
  } catch {
    console.log('ℹ️ .env の自動更新に失敗しました。手動で貼り付けてください。');
  }

} catch (error) {
  console.error('❌ トークン取得に失敗しました:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
