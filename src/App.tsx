import { useState, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { MonitorPage } from "./pages/MonitorPage";
import { ExercisePage } from "./pages/ExercisePage";
import { SettingsPage } from "./pages/SettingsPage";

type Page = "home" | "monitor" | "exercise" | "settings";

function App() {
  const [page, setPage] = useState<Page>("home");

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      unlisten = await listen<{ kind: string; minutes?: number }>(
        "show-restriction-notification",
        async (event) => {
          let granted = await isPermissionGranted();
          if (!granted) {
            const permission = await requestPermission();
            granted = permission === "granted";
          }
          if (!granted) return;
          const payload = event.payload;
          const body =
            payload?.kind === "zero"
              ? "残高が0になりました！"
              : payload?.kind === "warning" && typeof payload?.minutes === "number"
                ? `残り残高が${payload.minutes}分です。`
                : "残高が0になりました！";
          sendNotification({
            title: "うごけば使える",
            body,
          });
        }
      );
    })();
    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <div className="app">
      <nav className="nav" aria-label="メインメニュー">
        <button
          type="button"
          className={page === "home" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("home")}
          aria-current={page === "home" ? "page" : undefined}
        >
          ホーム
        </button>
        <button
          type="button"
          className={page === "monitor" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("monitor")}
          aria-current={page === "monitor" ? "page" : undefined}
        >
          アプリ監視・制限
        </button>
        <button
          type="button"
          className={page === "exercise" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("exercise")}
          aria-current={page === "exercise" ? "page" : undefined}
        >
          運動
        </button>
        <button
          type="button"
          className={page === "settings" ? "nav-item active" : "nav-item"}
          onClick={() => setPage("settings")}
          aria-current={page === "settings" ? "page" : undefined}
        >
          設定
        </button>
      </nav>

      <main className="main">
        {page === "home" && (
          <div className="container">
            <h1>うごけば使える</h1>
            <p>アプリの利用時間を管理し、運動で残高を稼ごう。</p>

            <section className="section" aria-labelledby="menu-heading">
              <h2 id="menu-heading">メニュー</h2>
              <div className="menu-cards">
                <button
                  type="button"
                  className="menu-card"
                  onClick={() => setPage("monitor")}
                >
                  <h3>アプリ監視・制限</h3>
                  <p>監視するアプリの登録、残高の確認、監視のオン/オフ</p>
                </button>
                <button
                  type="button"
                  className="menu-card"
                  onClick={() => setPage("exercise")}
                >
                  <h3>運動</h3>
                  <p>スクワット検出で残高を獲得（MediaPipe）</p>
                </button>
                <button
                  type="button"
                  className="menu-card"
                  onClick={() => setPage("settings")}
                >
                  <h3>設定</h3>
                  <p>カメラ選択、スクワット1回あたりの加算分数</p>
                </button>
              </div>
            </section>
          </div>
        )}

        {page === "monitor" && <MonitorPage />}
        {page === "exercise" && <ExercisePage />}
        {page === "settings" && <SettingsPage />}
      </main>
    </div>
  );
}

export default App;
