import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface MonitoredApp {
  id: string;
  name: string;
  process_name: string;
  daily_limit_minutes: number;
  enabled: boolean;
  exe_path?: string | null;
}

interface RunningProcessInfo {
  name: string;
  exe_path: string | null;
}

export function MonitorPage() {
  const [apps, setApps] = useState<MonitoredApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [balanceSeconds, setBalanceSeconds] = useState(0);
  const [addName, setAddName] = useState("");
  const [addProcessName, setAddProcessName] = useState("");
  const [runningProcesses, setRunningProcesses] = useState<RunningProcessInfo[]>([]);
  const [showRunningList, setShowRunningList] = useState(false);
  const [runningSearchQuery, setRunningSearchQuery] = useState("");
  const [monitorEnabled, setMonitorEnabled] = useState(true);

  async function loadApps() {
    setError("");
    try {
      const list = await invoke<MonitoredApp[]>("get_monitored_apps");
      setApps(list ?? []);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadBalance() {
    try {
      const secs = await invoke<number>("get_balance");
      setBalanceSeconds(secs ?? 0);
    } catch {
      setBalanceSeconds(0);
    }
  }

  useEffect(() => {
    loadApps();
  }, []);

  async function loadMonitorEnabled() {
    try {
      const enabled = await invoke<boolean>("get_monitor_enabled");
      setMonitorEnabled(enabled ?? true);
    } catch {
      setMonitorEnabled(true);
    }
  }

  useEffect(() => {
    loadMonitorEnabled();
  }, []);

  useEffect(() => {
    loadBalance();
    const interval = setInterval(loadBalance, 3000);
    return () => clearInterval(interval);
  }, []);

  async function handleMonitorEnabledChange(checked: boolean) {
    setError("");
    try {
      await invoke("set_monitor_enabled", { enabled: checked });
      setMonitorEnabled(checked);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSetBalanceZero() {
    if (!window.confirm("残高を0にしてもよろしいですか？")) return;
    setError("");
    try {
      await invoke("set_balance", { seconds: 0 });
      loadBalance();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handlePickFile() {
    setError("");
    try {
      const path = await invoke<string | null>("pick_executable");
      if (!path) return;
      await invoke<MonitoredApp>("add_monitored_app_from_path", {
        path,
        name: null,
      });
      loadApps();
    } catch (e) {
      setError(String(e));
    }
  }

  async function loadRunningProcesses() {
    setError("");
    try {
      const list = await invoke<RunningProcessInfo[]>("get_running_processes");
      setRunningProcesses(list ?? []);
      setShowRunningList(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAddFromRunning(proc: RunningProcessInfo) {
    setError("");
    try {
      await invoke<MonitoredApp>("add_monitored_app", {
        name: proc.name,
        processName: proc.name,
        dailyLimitMinutes: 0,
        exePath: proc.exe_path ?? undefined,
      });
      setShowRunningList(false);
      loadApps();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await invoke<MonitoredApp>("add_monitored_app", {
        name: addName.trim(),
        processName: addProcessName.trim(),
        dailyLimitMinutes: 0,
        exePath: undefined,
      });
      setAddName("");
      setAddProcessName("");
      loadApps();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleRemove(id: string) {
    setError("");
    try {
      await invoke("remove_monitored_app", { id });
      loadApps();
    } catch (e) {
      setError(String(e));
    }
  }

  if (loading) {
    return (
      <div className="container">
        <p className="loading-state" role="status" aria-live="polite">読み込み中...</p>
      </div>
    );
  }

  const balanceMinutes = Math.floor(balanceSeconds / 60);

  const runningFiltered =
    showRunningList && runningSearchQuery.trim()
      ? runningProcesses.filter(
          (proc) =>
            proc.name.toLowerCase().includes(runningSearchQuery.trim().toLowerCase()) ||
            (proc.exe_path?.toLowerCase().includes(runningSearchQuery.trim().toLowerCase()) ?? false)
        )
      : runningProcesses;

  function isAlreadyRegistered(proc: RunningProcessInfo): boolean {
    const nameLower = proc.name.toLowerCase();
    return apps.some((app) => app.process_name.toLowerCase() === nameLower);
  }

  return (
    <div className="container">
      <h1>アプリ監視・制限</h1>
      <p>
        運動で得た残高を消費して監視アプリを利用します。残高が0になると起動が制限され、通知が出ます。
      </p>

      {error && (
        <div className="monitor-error" role="alert">
          {error}
        </div>
      )}

      <section className="section balance-section" aria-labelledby="balance-heading">
        <h2 id="balance-heading">利用可能残高</h2>
        <p className="balance-display" aria-live="polite">
          <strong>{balanceMinutes}</strong> 分
        </p>
        <div className="balance-actions">
          <button
            type="button"
            onClick={handleSetBalanceZero}
            className="btn-small btn-ghost"
            title="残高を0分にリセット"
            aria-label="残高を0分にリセット"
          >
            残高を0にする
          </button>
        </div>
      </section>

      <section className="section section-card" aria-labelledby="monitor-heading">
        <h2 id="monitor-heading">監視・制限</h2>
        <label className="monitor-toggle-label">
          <input
            type="checkbox"
            checked={monitorEnabled}
            onChange={(e) => handleMonitorEnabledChange(e.target.checked)}
            className="monitor-toggle-input"
            aria-describedby="monitor-desc"
            aria-label="監視・制限のオン/オフ"
          />
          <span className="monitor-toggle-slider" aria-hidden />
          <span className="monitor-toggle-text">
            {monitorEnabled ? "監視・制限 オン" : "監視・制限 オフ"}
          </span>
        </label>
        <p id="monitor-desc" className="muted">オフにすると、登録アプリの監視と残高による強制終了は行われません。</p>
      </section>

      <section className="section section-card" aria-labelledby="register-heading">
        <h2 id="register-heading">監視アプリの登録</h2>
        <p className="muted" style={{ marginTop: 0 }}>ファイルから追加するか、実行中のアプリから選んで追加できます。</p>
        <div className="add-methods">
          <button type="button" onClick={handlePickFile} className="btn-add-method" aria-label="exeファイルを選択して追加">
            📁 ファイル（.exe）を選択
          </button>
          <button type="button" onClick={loadRunningProcesses} className="btn-add-method" aria-label="実行中のアプリ一覧を表示">
            📋 実行中のアプリから選択
          </button>
        </div>

        {showRunningList && (
          <div className="running-list" role="dialog" aria-label="実行中プロセスから追加">
            <p className="muted">追加するプロセスを選んでください（全 {runningProcesses.length} 件）</p>
            <input
              type="search"
              placeholder="名前やパスで検索…"
              value={runningSearchQuery}
              onChange={(e) => setRunningSearchQuery(e.target.value)}
              className="running-search-input"
              aria-label="プロセス名やパスで検索"
            />
            <ul className="running-process-list running-process-list-scroll">
              {runningFiltered.map((proc) => {
                const registered = isAlreadyRegistered(proc);
                return (
                  <li key={`${proc.name}-${proc.exe_path ?? ""}`} className="running-process-item">
                    {registered ? (
                      <span className="btn-select-process process-registered" aria-label={`${proc.name} は登録済みです`}>
                        {proc.name}
                        <span className="process-registered-badge">登録済み</span>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddFromRunning(proc)}
                        className="btn-select-process"
                      >
                        {proc.name}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {runningSearchQuery.trim() && (
              <p className="muted">
                「{runningSearchQuery.trim()}」で {runningFiltered.length} 件
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowRunningList(false)}
              className="btn-small btn-ghost"
            >
              閉じる
            </button>
          </div>
        )}

        <details className="manual-add">
          <summary>手動で入力して追加</summary>
          <form onSubmit={handleAddManual} className="monitor-form">
            <div className="form-row">
              <label>
                表示名
                <input
                  type="text"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="例: Chrome"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                プロセス名
                <input
                  type="text"
                  value={addProcessName}
                  onChange={(e) => setAddProcessName(e.target.value)}
                  placeholder="例: chrome.exe"
                />
              </label>
            </div>
            <button type="submit" className="btn-primary">追加</button>
          </form>
        </details>
      </section>

      <section className="section section-card">
        <h2 id="registered-heading">登録済みアプリ</h2>
        {apps.length === 0 ? (
          <p className="muted">まだ登録されていません。</p>
        ) : (
          <ul className="app-list">
            {apps.map((app) => (
              <li key={app.id} className="app-list-item">
                <div className="app-list-main">
                  <span className="app-name">{app.name}</span>
                  <span className="app-process">{app.process_name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(app.id)}
                  className="btn-remove btn-small"
                  title={`${app.name} を削除`}
                  aria-label={`${app.name} を削除`}
                >
                  削除
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
