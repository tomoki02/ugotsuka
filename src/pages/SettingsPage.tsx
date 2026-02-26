import { useState, useEffect } from "react";
import { loadSettings, saveSettings, type AppSettings } from "../settings";

export function SettingsPage() {
  const [settings, setSettings] = useState<AppSettings>(loadSettings());
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [cameraLoadError, setCameraLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videos = devices.filter((d) => d.kind === "videoinput");
        setCameraDevices(videos);
      } catch (e) {
        if (!cancelled) setCameraLoadError("カメラ一覧の取得に失敗しました");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function handleChange<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  }

  return (
    <div className="container settings-page">
      <h1>設定</h1>
      <p>カメラとスクワットの加算時間を変更できます。</p>

      <section className="section section-card">
        <h2 id="exercise-settings-heading">運動</h2>
        <div className="form-row">
          <label>
            スクワット1回あたりの加算時間（分）
            <input
              type="number"
              min={0}
              max={60}
              value={settings.squatMinutesPerRep}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                if (!Number.isNaN(n) && n >= 0) handleChange("squatMinutesPerRep", n);
              }}
              className="limit-input"
            />
          </label>
        </div>
        <p className="muted">運動ページで1回のスクワット検知ごとに、ここで設定した分数が残高に加算されます。</p>
      </section>

      <section className="section section-card">
        <h2 id="camera-settings-heading">カメラ</h2>
        {cameraLoadError && (
          <p className="muted" role="alert">
            {cameraLoadError}
          </p>
        )}
        <div className="form-row">
          <label>
            利用するカメラ
            <select
              value={settings.cameraDeviceId}
              onChange={(e) => handleChange("cameraDeviceId", e.target.value)}
              className="settings-select"
            >
              <option value="">デフォルト（前面カメラ推奨）</option>
              {cameraDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `カメラ ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted">運動ページで使用するカメラを選びます。空の場合は環境のデフォルトが使われます。</p>
      </section>
    </div>
  );
}
