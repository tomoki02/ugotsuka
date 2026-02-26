import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadSettings } from "../settings";

const KNEE_ANGLE_DOWN = 100;
const KNEE_ANGLE_UP = 160;

// MediaPipe Pose landmark indices for body skeleton (excluding face)
const POSE_CONNECTIONS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
  [27, 29], [29, 31], [28, 30], [30, 32],
];

function cameraErrorMessage(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError" || e.name === "PermissionDeniedError") return "カメラへのアクセスが拒否されました。ブラウザ（アプリ）の設定でカメラを許可してください。";
    if (e.name === "NotFoundError") return "カメラが見つかりません。";
    if (e.name === "NotReadableError") return "カメラは他のアプリで使用中の可能性があります。";
    return `カメラエラー: ${e.name} - ${e.message}`;
  }
  if (e instanceof Error) return `カメラを利用できません: ${e.message}`;
  return "カメラを利用できません: " + String(e);
}

export function ExercisePage() {
  const settings = loadSettings();
  const squatSecondsPerRep = settings.squatMinutesPerRep * 60;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [reps, setReps] = useState(0);
  const [sessionBonusSeconds, setSessionBonusSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const [endModalMinutes, setEndModalMinutes] = useState<number | null>(null);
  const poseRef = useRef<{
    detectForVideo: (video: HTMLVideoElement, timestamp: number) => { landmarks?: Array<Array<{ x: number; y: number; z?: number }>> };
  } | null>(null);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const squatStateRef = useRef<"up" | "down">("up");
  const latestLandmarksRef = useRef<Array<{ x: number; y: number; z?: number }> | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [stopCamera]);

  async function startCamera() {
    setError("");
    try {
      const constraints: MediaStreamConstraints = {
        video: settings.cameraDeviceId
          ? { deviceId: { exact: settings.cameraDeviceId }, width: 640, height: 480 }
          : { width: 640, height: 480, facingMode: "user" },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (e) {
      setError(cameraErrorMessage(e));
    }
  }

  async function initPose() {
    const vision = await import("@mediapipe/tasks-vision");
    const wasm = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";
    const model =
      "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
    const fileset = await vision.FilesetResolver.forVisionTasks(wasm);
    const pose = await vision.PoseLandmarker.createFromModelPath(
      fileset,
      model
    );
    await pose.setOptions({ runningMode: "VIDEO" });
    poseRef.current = pose as typeof poseRef.current;
  }

  function angleDeg(
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number }
  ): number {
    const v1 = { x: a.x - b.x, y: a.y - b.y };
    const v2 = { x: c.x - b.x, y: c.y - b.y };
    const dot = v1.x * v2.x + v1.y * v2.y;
    const len1 = Math.hypot(v1.x, v1.y) || 1e-6;
    const len2 = Math.hypot(v2.x, v2.y) || 1e-6;
    const cos = Math.max(-1, Math.min(1, dot / (len1 * len2)));
    return (Math.acos(cos) * 180) / Math.PI;
  }

  function drawSkeleton(
    ctx: CanvasRenderingContext2D,
    landmarks: Array<{ x: number; y: number }>,
    width: number,
    height: number
  ) {
    ctx.clearRect(0, 0, width, height);
    const toX = (x: number) => x * width;
    const toY = (y: number) => y * height;
    ctx.strokeStyle = "#00ff88";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const [i, j] of POSE_CONNECTIONS) {
      if (landmarks[i] && landmarks[j]) {
        ctx.moveTo(toX(landmarks[i].x), toY(landmarks[i].y));
        ctx.lineTo(toX(landmarks[j].x), toY(landmarks[j].y));
      }
    }
    ctx.stroke();
    ctx.fillStyle = "#00ff88";
    for (let i = 0; i < landmarks.length; i++) {
      if (landmarks[i]) {
        ctx.beginPath();
        ctx.arc(toX(landmarks[i].x), toY(landmarks[i].y), 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  async function detectSquatRep(video: HTMLVideoElement, timestamp: number): Promise<boolean> {
    const pose = poseRef.current;
    if (!pose || video.readyState < 2) return false;
    const result = pose.detectForVideo(video, timestamp);
    const landmarks = result?.landmarks?.[0];
    if (!landmarks || landmarks.length < 29) {
      latestLandmarksRef.current = null;
      return false;
    }
    latestLandmarksRef.current = landmarks;
    const leftHip = landmarks[23];
    const leftKnee = landmarks[25];
    const leftAnkle = landmarks[27];
    const rightHip = landmarks[24];
    const rightKnee = landmarks[26];
    const rightAnkle = landmarks[28];
    const leftAngle = angleDeg(leftHip, leftKnee, leftAnkle);
    const rightAngle = angleDeg(rightHip, rightKnee, rightAnkle);
    const kneeAngle = (leftAngle + rightAngle) / 2;
    const state = squatStateRef.current;
    if (state === "up" && kneeAngle < KNEE_ANGLE_DOWN) {
      squatStateRef.current = "down";
    } else if (state === "down" && kneeAngle > KNEE_ANGLE_UP) {
      squatStateRef.current = "up";
      return true;
    }
    return false;
  }

  const tick = useCallback(
    async (timestamp: number) => {
      if (!isActive || !videoRef.current || !poseRef.current) {
        animationRef.current = requestAnimationFrame(tick);
        return;
      }
      const video = videoRef.current;
      const delta = lastTimeRef.current ? timestamp - lastTimeRef.current : 0;
      lastTimeRef.current = timestamp;
      if (delta > 0) {
        const newRep = await detectSquatRep(video, timestamp);
        if (newRep) {
          setReps((r) => r + 1);
          setSessionBonusSeconds((s) => s + squatSecondsPerRep);
          try {
            await invoke("add_balance", { seconds: squatSecondsPerRep });
          } catch {
            // ignore
          }
        }
      }
      if (canvasRef.current && video.videoWidth) {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (canvasRef.current.width !== w || canvasRef.current.height !== h) {
          canvasRef.current.width = w;
          canvasRef.current.height = h;
        }
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) {
          if (showSkeleton) {
            const landmarks = latestLandmarksRef.current;
            if (landmarks && landmarks.length >= 32) {
              drawSkeleton(ctx, landmarks, w, h);
            } else {
              ctx.clearRect(0, 0, w, h);
            }
          } else {
            ctx.clearRect(0, 0, w, h);
          }
        }
      }
      animationRef.current = requestAnimationFrame(tick);
    },
    [isActive, showSkeleton, squatSecondsPerRep]
  );

  useEffect(() => {
    if (!isActive) return;
    lastTimeRef.current = 0;
    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, tick]);

  async function handleStart() {
    setError("");
    setLoading(true);
    try {
      await startCamera();
      await initPose();
      setReps(0);
      setSessionBonusSeconds(0);
      squatStateRef.current = "up";
      latestLandmarksRef.current = null;
      setIsActive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleStop() {
    const minutes = Math.floor(sessionBonusSeconds / 60);
    setIsActive(false);
    stopCamera();
    setEndModalMinutes(minutes);
  }

  return (
    <div className="container exercise-page">
      <h1>スクワットで残高を稼ぐ</h1>
      <p>
        カメラの前でスクワットをすると、1回あたり +{settings.squatMinutesPerRep}
        分が残高に加算されます。（設定で変更可能）
      </p>

      {error && (
        <div className="monitor-error" role="alert">
          {error}
        </div>
      )}

      <div className="exercise-video-wrap" aria-label="カメラプレビュー">
        <video
          ref={videoRef}
          className="exercise-video"
          playsInline
          muted
          style={{ display: isActive ? "block" : "none" }}
        />
        {isActive && (
          <canvas
            ref={canvasRef}
            className="exercise-skeleton-canvas"
            style={{
              display: showSkeleton ? "block" : "none",
              pointerEvents: "none",
            }}
          />
        )}
        {!isActive && (
          <div className="exercise-video-placeholder" aria-live="polite">
            {loading ? "準備中..." : "「開始」ボタンでカメラをオンにします"}
          </div>
        )}
      </div>

      {isActive && (
        <div className="exercise-skeleton-toggle">
          <label className="toggle-label">
            <input
              type="checkbox"
              checked={showSkeleton}
              onChange={(e) => setShowSkeleton(e.target.checked)}
            />
            <span>骨格を表示</span>
          </label>
        </div>
      )}

      <div className="exercise-stats" role="region" aria-label="今回の運動結果">
        <p className="exercise-reps">
          今回の回数: <strong>{reps}</strong> 回
        </p>
        <p className="exercise-bonus">
          今回の加算: <strong>{Math.floor(sessionBonusSeconds / 60)}</strong> 分
        </p>
      </div>

      <div className="exercise-actions">
        {!isActive ? (
          <button
            type="button"
            onClick={handleStart}
            disabled={loading}
            className="btn-primary"
            aria-busy={loading}
            aria-label={loading ? "準備中" : "運動を開始"}
          >
            {loading ? "準備中..." : "開始"}
          </button>
        ) : (
          <button type="button" onClick={handleStop} className="btn-stop" aria-label="運動を終了">
            終了
          </button>
        )}
      </div>

      {endModalMinutes !== null && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exercise-end-title"
          onClick={() => setEndModalMinutes(null)}
        >
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 id="exercise-end-title" className="modal-title">
              {endModalMinutes}分追加されました！
            </h2>
            <p className="muted">残高に加算されています。</p>
            <div className="modal-actions">
              <button type="button" onClick={() => setEndModalMinutes(null)} className="btn-primary">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
