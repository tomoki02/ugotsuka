# アイコン表示のデバッグ手順

## 調査結果

- **Rust のアイコン抽出は動作しています**  
  `cargo test test_extract_icon` で `C:\Windows\System32\cmd.exe` からアイコン抽出の単体テストが成功しています。
- 表示されない原因を切り分けるため、**Rust とフロントの両方に `[icon]` のログ**を入れました。

## 起動して確認する手順

1. **ターミナルでアプリを起動**
   ```bash
   npm run tauri:dev
   ```

2. **「アプリ監視・制限」を開く**  
   画面上で「アプリ監視・制限」をクリックする。

3. **ターミナル出力を確認**  
   次のような `[icon]` の行が出ます。
   - `[icon] get_app_icon_base64 app_data_dir=... path=... exists=true/false`  
     - **exists=false** → アイコンファイルが無い（登録時に保存に失敗している可能性）
     - **exists=true** → ファイルはあるので、その後の `result len=` を確認
   - `[icon] get_app_icon_base64 result len=1234`  
     - **len=0** → ファイル読み込みまたは base64 化で失敗  
     - **len>0** → バックエンドは Data URL を返せている

4. **開発者ツールのコンソールを確認**  
   ウィンドウ内で **F12** を押し、Console タブを見る。
   - `[icon] get_app_icon_base64 no data for app ... got null`  
     → バックエンドが `None` を返している（ファイルなし or 読み込み失敗）
   - `[icon] get_app_icon_base64 error ...`  
     → invoke が例外（権限や通信エラーなどの可能性）

5. **「ファイル（.exe）を選択」で 1 つ追加して再確認**
   - ターミナルに `[icon] extract_and_save_icon saved ok path=...` が出るか確認。
   - 出ない場合、`extract_icon_from_exe failed` または `create file failed` が出ていないか確認。

## 想定される原因

| 症状 | 想定原因 |
|------|----------|
| すべて exists=false | 登録時に `extract_and_save_icon` が失敗している（exe パスや保存先の違いなど） |
| exists=true だが result len=0 | ファイル読み込み失敗（パス・権限・文字コードなど） |
| result len>0 だが画面に出ない | フロントで invoke が失敗しているか、受け取った値を img に渡せていない |
| 「実行中のアプリから選択」でだけ出ない | `get_exe_icon_base64` や `extract_icon_from_exe` が失敗（exe_path の形式など） |

ターミナルとコンソールの該当ログを控えてもらえれば、原因をさらに特定しやすくなります。
