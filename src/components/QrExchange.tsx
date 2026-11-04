import { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { Camera, Check, ClipboardPaste, Copy, X } from 'lucide-react';

const inputClass =
  'w-full px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-white focus:outline-none focus:border-sky-500';

/** Shows a payload as a QR code, with a code to copy for when no camera is available. */
export function QrDisplay({ value, label }: { value: string; label: string }) {
  const [image, setImage] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(value, { errorCorrectionLevel: 'L', margin: 2, width: 720 }).then(setImage);
  }, [value]);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl p-2 mx-auto w-full max-w-[280px] aspect-square">
        {image && <img src={image} alt={label} className="w-full h-full" />}
      </div>
      <p className="text-xs text-center text-slate-400">{label}</p>
      <button
        type="button"
        onClick={copy}
        className="w-full min-h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center justify-center gap-2 transition"
      >
        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        {copied ? 'Copied' : 'Copy code instead'}
      </button>
    </div>
  );
}

/** Reads a payload from the camera, or from a pasted code. */
export function QrScanner({ onResult, prompt }: { onResult: (text: string) => void; prompt: string }) {
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [pasted, setPasted] = useState('');
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!scanning) return;
    let frame = 0;
    let stream: MediaStream | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    const tick = () => {
      if (stopped) return;
      const element = video.current;
      if (element && context && element.readyState === element.HAVE_ENOUGH_DATA) {
        canvas.width = element.videoWidth;
        canvas.height = element.videoHeight;
        context.drawImage(element, 0, 0);
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(image.data, image.width, image.height);
        if (code?.data) {
          setScanning(false);
          onResult(code.data);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' } })
      .then((media) => {
        stream = media;
        if (stopped || !video.current) return;
        video.current.srcObject = media;
        void video.current.play();
        tick();
      })
      .catch(() => {
        setScanning(false);
        setCameraError('The camera is not available. Paste the code below.');
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [scanning, onResult]);

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">{prompt}</p>
      {scanning ? (
        <div className="relative rounded-2xl overflow-hidden bg-black aspect-square max-w-[280px] mx-auto">
          <video ref={video} muted playsInline className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => setScanning(false)}
            aria-label="Stop scanning"
            className="absolute top-2 right-2 w-11 h-11 rounded-full bg-black/60 flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => {
            setCameraError(null);
            setScanning(true);
          }}
          className="w-full min-h-11 rounded-xl bg-sky-600 hover:bg-sky-500 text-xs font-bold flex items-center justify-center gap-2 transition"
        >
          <Camera className="w-4 h-4" />
          Scan with camera
        </button>
      )}
      {cameraError && <p className="text-xs text-amber-400">{cameraError}</p>}
      <textarea
        value={pasted}
        onChange={(event) => setPasted(event.target.value)}
        placeholder="Or paste a code here"
        rows={2}
        className={`${inputClass} select-text`}
      />
      <button
        type="button"
        disabled={!pasted.trim()}
        onClick={() => {
          onResult(pasted.trim());
          setPasted('');
        }}
        className="w-full min-h-11 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold flex items-center justify-center gap-2 transition"
      >
        <ClipboardPaste className="w-4 h-4" />
        Use pasted code
      </button>
    </div>
  );
}
