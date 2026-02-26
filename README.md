# うごけば使える

普段使うアプリの利用時間を制限し、運動（スクワット）で獲得した残高でのみ利用できるようにするデスクトップアプリです。  
残高が0になると登録アプリは強制終了され、通知でお知らせします。

## 主な機能

- **アプリ監視・制限** … 登録したアプリのいずれかが起動している間だけ残高を消費。残高0で強制終了。監視のオン/オフ切り替え可能。
- **運動（スクワット）** … Webカメラ + MediaPipe でスクワットを検出し、回数に応じて残高を加算。骨格表示のトグルあり。
- **設定** … 利用するカメラの選択、スクワット1回あたりの加算分数。
- **バックグラウンド動作** … ウィンドウを閉じてもトレイで動作継続。トレイメニューで「開く」「終了」。

## 技術スタック

- **フロント**: React 19 + TypeScript + Vite
- **デスクトップ**: Tauri 2 (Rust)
- **運動検出**: MediaPipe (Pose Landmarker)
- **永続化**: JSON ファイル（アプリ一覧・残高・監視ON/OFF・設定は localStorage）

## 必要な環境

- **Node.js** 18+
- **Rust** (Tauri のため)  
  → [rustup](https://rustup.rs/) でインストール: `winget install Rustlang.Rustup` または https://rustup.rs/
- **Windows** 向けにビルド（MSI / NSIS インストーラー対応）

## セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバー（Vite のみ）
npm run dev

# Tauri アプリとして起動（Rust ビルド後、ネイティブウィンドウが開く）
npm run tauri:dev
```

初回の `npm run tauri:dev` は Rust のコンパイルで数分かかることがあります。

## コマンド

| コマンド | 説明 |
|----------|------|
| `npm run dev` | Vite の開発サーバーのみ（ブラウザで確認） |
| `npm run tauri:dev` | Tauri アプリを開発モードで起動 |
| `npm run tauri:build` | 配布用の実行ファイル（MSI / NSIS）をビルド |

## プロジェクト構成

```
ugokeba-tsukaeru/
├── src/                     # React フロント
│   ├── App.tsx
│   ├── main.tsx
│   ├── style.css
│   ├── settings.ts          # 設定の読み書き（localStorage）
│   └── pages/
│       ├── MonitorPage.tsx   # 監視アプリ登録・残高・監視ON/OFF
│       ├── ExercisePage.tsx # スクワット検出（MediaPipe）
│       └── SettingsPage.tsx # カメラ・スクワット加算分数
├── src-tauri/                # Tauri (Rust) バックエンド
│   ├── src/
│   │   ├── lib.rs           # エントリ・コマンド・トレイ・閉じたら非表示
│   │   ├── balance.rs       # 残高の永続化
│   │   ├── monitored_apps.rs
│   │   ├── monitor_enabled.rs # 監視ON/OFFの永続化
│   │   └── process_monitor.rs  # プロセス監視・残高消費・通知
│   ├── capabilities/
│   ├── icons/
│   │   └── icon.ico         # アプリ・トレイアイコン
│   └── tauri.conf.json
├── index.html
├── package.json
└── vite.config.ts
```

## アイコン

`src-tauri/icons/icon.ico` がアプリおよびトレイアイコンとして使用されます。  
変更する場合は `tauri.conf.json` の `bundle.icon` を参照してください。  
公式: [Tauri - Icons](https://v2.tauri.app/develop/icons/)
