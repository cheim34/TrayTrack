"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Tesseract from "tesseract.js";
import { Camera, LoaderCircle, ScanLine } from "lucide-react";

import { Card, SectionTitle } from "@/components/ui";

type ScanPayload = {
  trayTag: string;
  serialCode: string;
};

type ScannerPanelProps = {
  territories: Array<{ id: string; name: string }>;
};

type BarcodeDetectorInstance = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

declare global {
  interface Window {
    BarcodeDetector?: {
      getSupportedFormats?: () => Promise<string[]>;
      new (options?: { formats?: string[] }): BarcodeDetectorInstance;
    };
  }
}

export function ScannerPanel({ territories }: ScannerPanelProps) {
  const [territoryId, setTerritoryId] = useState(territories[0]?.id ?? "");
  const [trayTag, setTrayTag] = useState("");
  const [serialCode, setSerialCode] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [status, setStatus] = useState("Ready to scan a QR code, barcode, or tray side label.");
  const [isStarting, setIsStarting] = useState(false);
  const [isOcrRunning, setIsOcrRunning] = useState(false);
  const [barcodeSupported, setBarcodeSupported] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const detectorRef = useRef<BarcodeDetectorInstance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const detectorFormats = useMemo(
    () => ["qr_code", "ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e"],
    [],
  );

  useEffect(() => {
    if (!territories.some((territory) => territory.id === territoryId)) {
      setTerritoryId(territories[0]?.id ?? "");
    }
  }, [territories, territoryId]);

  useEffect(() => {
    let cancelled = false;

    async function setupDetector() {
      if (typeof window === "undefined" || !window.BarcodeDetector) {
        return;
      }

      try {
        const supported = window.BarcodeDetector.getSupportedFormats
          ? await window.BarcodeDetector.getSupportedFormats()
          : detectorFormats;
        if (cancelled) {
          return;
        }
        const availableFormats = detectorFormats.filter((format) => supported.includes(format));
        detectorRef.current = new window.BarcodeDetector({
          formats: availableFormats.length > 0 ? availableFormats : detectorFormats,
        });
        setBarcodeSupported(true);
      } catch {
        setBarcodeSupported(false);
      }
    }

    void setupDetector();

    return () => {
      cancelled = true;
    };
  }, [detectorFormats]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  function stopCamera() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    setIsStarting(true);
    setStatus("Requesting camera access...");

    try {
      stopCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setStatus(
        barcodeSupported
          ? "Camera active. Point at a QR code or barcode, or capture a frame for OCR."
          : "Camera active. Barcode detection is not supported in this browser, but OCR capture is available.",
      );

      if (barcodeSupported && detectorRef.current) {
        intervalRef.current = setInterval(() => {
          void detectCodes();
        }, 1400);
      }
    } catch (error) {
      console.error(error);
      setStatus("Unable to start the camera. Mobile Safari/Chrome permissions may need to be enabled.");
    } finally {
      setIsStarting(false);
    }
  }

  async function detectCodes() {
    if (!videoRef.current || !detectorRef.current || videoRef.current.readyState < 2) {
      return;
    }

    try {
      const results = await detectorRef.current.detect(videoRef.current);
      const value = results.find((result) => result.rawValue)?.rawValue?.trim();
      if (!value) {
        return;
      }

      if (!trayTag) {
        setTrayTag(value);
        setStatus(`Scanned tray identifier: ${value}`);
      } else {
        setSerialCode(value);
        setStatus(`Scanned serial/barcode value: ${value}`);
      }
    } catch {
      // Ignore intermittent detector failures while the stream is active.
    }
  }

  async function captureForOcr() {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video.videoWidth === 0 || video.videoHeight === 0) {
      setStatus("The camera stream is still warming up. Try again in a moment.");
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext("2d");
    if (!context) {
      setStatus("Unable to access the image capture canvas.");
      return;
    }

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setIsOcrRunning(true);
    setStatus("Running OCR on the captured image...");

    try {
      const result = await Tesseract.recognize(canvas, "eng", {
        logger: () => undefined,
      });
      const text = result.data.text.replace(/\s+/g, " ").trim();
      setOcrText(text);
      if (text) {
        if (!serialCode) {
          setSerialCode(text);
        }
        setStatus("OCR completed. Review the extracted serial text before using it.");
      } else {
        setStatus("OCR completed but did not detect readable text. Try improving lighting or moving closer.");
      }
    } catch (error) {
      console.error(error);
      setStatus("OCR failed on this frame. Try capturing again with a sharper view of the tray label.");
    } finally {
      setIsOcrRunning(false);
    }
  }

  async function saveScan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!territoryId || !trayTag.trim()) {
      setStatus("Select a territory and capture at least a tray ID before saving.");
      return;
    }

    try {
      const response = await fetch("/api/scan-intake", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          territoryId,
          trayTag,
          serialCode,
          notes: ocrText,
        } satisfies ScanPayload & { territoryId: string; notes: string }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Unable to save scan");
      }

      const payload = (await response.json()) as { trayName: string };
      setStatus(`Saved scan intake as tray ${payload.trayName}.`);
      setTrayTag("");
      setSerialCode("");
      setOcrText("");
    } catch (error) {
      console.error(error);
      setStatus("The scan was captured locally, but saving failed. Verify the database is initialized.");
    }
  }

  return (
    <Card className="lg:col-span-2">
      <SectionTitle
        title="Mobile scan station"
        description="Use a phone camera to read QR codes, barcodes, or printed serial labels from instrument trays."
      />
      <div className="scanner-grid">
        <div className="scanner-camera">
          <video ref={videoRef} playsInline muted className="scanner-video" />
          <canvas ref={canvasRef} className="hidden" />
          <div className="scanner-status">{status}</div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => void startCamera()} disabled={isStarting}>
              {isStarting ? <LoaderCircle className="animate-spin" size={16} /> : <Camera size={16} />}
              Start camera
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => void captureForOcr()}
              disabled={isOcrRunning || !streamRef.current}
            >
              {isOcrRunning ? <LoaderCircle className="animate-spin" size={16} /> : <ScanLine size={16} />}
              Capture OCR
            </button>
            <button type="button" className="ghost-button" onClick={stopCamera}>
              Stop camera
            </button>
          </div>
        </div>

        <form className="stack-lg" onSubmit={(event) => void saveScan(event)}>
          <label className="field">
            <span>Save to territory</span>
            <select value={territoryId} onChange={(event) => setTerritoryId(event.target.value)} required>
              {territories.map((territory) => (
                <option key={territory.id} value={territory.id}>
                  {territory.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Tray tag / QR payload</span>
            <input
              value={trayTag}
              onChange={(event) => setTrayTag(event.target.value)}
              placeholder="TRAY-CABG-001"
              required
            />
          </label>

          <label className="field">
            <span>Serial or barcode</span>
            <input
              value={serialCode}
              onChange={(event) => setSerialCode(event.target.value)}
              placeholder="SN-2026-9982"
            />
          </label>

          <label className="field">
            <span>OCR notes</span>
            <textarea
              value={ocrText}
              onChange={(event) => setOcrText(event.target.value)}
              placeholder="Detected text from the side of the tray"
              rows={4}
            />
          </label>

          <button type="submit" className="primary-button">
            Save scanned tray intake
          </button>

          <p className="muted-text">
            Barcode detection depends on the browser&apos;s BarcodeDetector support. OCR capture is provided through
            Tesseract.js as a portable fallback for tray-side printed serials.
          </p>
        </form>
      </div>
    </Card>
  );
}
