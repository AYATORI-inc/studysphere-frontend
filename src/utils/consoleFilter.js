// 開発時の大量の console.log / console.info / console.debug を一括で抑止する
//
// - 既定では無効（ログは出ない）。console.warn / console.error は常に表示される
// - デバッグログを出したいときは .env.local に REACT_APP_DEBUG_LOG=true を書き、
//   npm start を再起動する
//
// ※ このファイルは index.js の先頭で import すること。
//   ES モジュールは import 順に評価されるため、後から読み込まれる
//   apiConfig.js などの起動時ログも抑止できる。
// ※ このファイル自体は他モジュールを import しないこと（評価順を崩さないため）。

const isDebugLogEnabled = process.env.REACT_APP_DEBUG_LOG === 'true';

if (!isDebugLogEnabled) {
  const noop = () => {};
  console.log = noop;
  console.info = noop;
  console.debug = noop;
}

export default isDebugLogEnabled;
