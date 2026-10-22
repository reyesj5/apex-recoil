/**
 * Shared utility functions for Recoil Editor: Base64/Blob conversion,
 * HDR tone mapping, SSE job streaming, and HTML sanitization.
 */

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function dataUrlToBlob(dataUrl: string): Blob {
  if (!dataUrl) return new Blob([]);
  const parts = dataUrl.split(',');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
  const byteString = atob(parts[1] || '');
  const ia = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }
  return new Blob([ia], { type: mime });
}

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function applyHdrToneMappingToCanvas(canvas: HTMLCanvasElement, mode: string): void {
  if (mode === 'off') return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;

  const isVibrant = mode === 'hdr-vibrant';
  const gamma = isVibrant ? 1.75 : 1.6;
  const exposure = isVibrant ? 0.80 : 0.85;
  const contrast = isVibrant ? 1.30 : 1.20;
  const satBoost: number = isVibrant ? 1.40 : 1.25;

  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    let f = (i / 255.0) * exposure;
    f = Math.pow(Math.min(1.0, Math.max(0.0, f)), gamma);
    f = (f - 0.5) * contrast + 0.5;
    lut[i] = Math.min(255, Math.max(0, Math.round(f * 255.0)));
  }

  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    let r = lut[data[i]];
    let g = lut[data[i + 1]];
    let b = lut[data[i + 2]];

    if (satBoost !== 1.0) {
      const y = 0.299 * r + 0.587 * g + 0.114 * b;
      r = Math.min(255, Math.max(0, Math.round(y + (r - y) * satBoost)));
      g = Math.min(255, Math.max(0, Math.round(y + (g - y) * satBoost)));
      b = Math.min(255, Math.max(0, Math.round(y + (b - y) * satBoost)));
    }

    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }

  ctx.putImageData(imgData, 0, 0);
}

export function toneMapImageIfNeeded(imgDataUrl: string, hdrMode: string): Promise<string> {
  return new Promise((resolve) => {
    if (hdrMode === 'off' || !imgDataUrl) {
      resolve(imgDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imgDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0);
      applyHdrToneMappingToCanvas(canvas, hdrMode);
      resolve(canvas.toDataURL('image/jpeg', 0.95));
    };
    img.onerror = () => resolve(imgDataUrl);
    img.src = imgDataUrl;
  });
}

export interface DiscoveryUpload {
  field: string;
  blob: Blob;
  name: string;
}

/**
 * Submit files for analysis. When the server keeps captures in S3, the files go straight to
 * the bucket through presigned URLs and only a signed grant is sent to the API. Otherwise (or
 * if the direct upload fails, e.g. a bucket without CORS) they are posted as multipart form data.
 */
export async function submitDiscoveryJob(
  endpoint: string,
  purpose: 'session' | 'static',
  fields: Record<string, string>,
  files: DiscoveryUpload[]
): Promise<Response> {
  let plan: any = null;
  try {
    const planRes = await fetch('/api/discovery/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purpose,
        weapon: fields.weapon,
        mode: fields.mode,
        save_capture: fields.save_capture,
        files: files.map(f => ({ field: f.field, name: f.name, type: f.blob.type || 'application/octet-stream', size: f.blob.size }))
      })
    });
    if (planRes.ok) plan = await planRes.json();
  } catch (_) {}

  if (plan && plan.direct && Array.isArray(plan.files) && plan.files.length === files.length) {
    try {
      await Promise.all(plan.files.map(async (target: any, i: number) => {
        const put = await fetch(target.url, { method: target.method || 'PUT', headers: target.headers || {}, body: files[i].blob });
        if (!put.ok) throw new Error(`Upload of ${files[i].name} failed (${put.status})`);
      }));
      return await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, upload: { token: plan.token } })
      });
    } catch (err) {
      console.warn('Direct upload to storage failed; sending the files through the server instead.', err);
    }
  }

  const formData = new FormData();
  Object.keys(fields).forEach(k => formData.append(k, fields[k]));
  files.forEach(f => formData.append(f.field, f.blob, f.name));
  return fetch(endpoint, { method: 'POST', body: formData });
}

export async function pollOrStreamJobResult(
  initialData: any,
  statusBox: HTMLElement | null,
  initialMsg: string = 'Processing session...'
): Promise<any> {
  if (initialData.spec || initialData.trials_count !== undefined) {
    return initialData;
  }

  const jobId = initialData.job_id;
  if (!jobId) {
    throw new Error('No job ID returned from server');
  }

  if (statusBox) {
    statusBox.innerText = `[0%] ${initialMsg}`;
  }

  return new Promise((resolve, reject) => {
    let resolved = false;
    let pollInterval: any = null;
    let sse: EventSource | null = null;

    const cleanup = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
      if (sse) {
        sse.close();
        sse = null;
      }
    };

    const handleSuccess = (result: any) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(result);
    };

    const handleFailure = (errStr: string) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      reject(new Error(errStr || 'Job processing failed'));
    };

    const updateStatus = (stage: string, progress: number, details?: any) => {
      if (statusBox) {
        const pct = Math.min(100, Math.max(0, Math.round(progress || 0)));
        let detailText = '';
        if (details && details.clip_index && details.total_clips) {
          detailText = ` (Clip ${details.clip_index}/${details.total_clips})`;
        } else if (details && details.image_index && details.total_images) {
          detailText = ` (Image ${details.image_index}/${details.total_images})`;
        }
        statusBox.innerText = `[${pct}%] ${stage.replace(/_/g, ' ')}${detailText}...`;
      }
    };

    const pollStatus = async () => {
      if (resolved) return;
      try {
        const res = await fetch(`/api/discovery/jobs/${jobId}`);
        if (res.status === 404) {
          // Jobs live in server memory; a restart loses them
          handleFailure('The server no longer knows this job (was it restarted?). Please run the analysis again.');
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success || !data.job) return;
        const job = data.job;
        if (job.status === 'completed') {
          handleSuccess(job.result);
        } else if (job.status === 'failed' || job.status === 'cancelled') {
          handleFailure(job.error || `Job ${job.status}`);
        } else {
          updateStatus(job.stage, job.progress, job.details);
        }
      } catch (_) {}
    };

    try {
      sse = new EventSource(`/api/discovery/jobs/${jobId}/events`);

      sse.addEventListener('state', (e: any) => {
        try {
          const state = JSON.parse(e.data);
          updateStatus(state.stage, state.progress, state.details);
        } catch (_) {}
      });

      sse.addEventListener('progress', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          updateStatus(payload.stage, payload.progress, payload.details);
        } catch (_) {}
      });

      sse.addEventListener('complete', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          handleSuccess(payload.result);
        } catch (err: any) {
          handleFailure(err.message);
        }
      });

      // Job failure or cancellation reported by the server
      sse.addEventListener('failed', (e: any) => {
        try {
          const payload = JSON.parse(e.data);
          handleFailure(payload.error || `Job ${payload.status || 'failed'}`);
        } catch (err: any) {
          handleFailure(err.message);
        }
      });

      // Connection problems: the status poll below keeps tracking the job
      sse.addEventListener('error', () => {
        if (sse && sse.readyState === EventSource.CLOSED && !resolved) {
          sse.close();
          sse = null;
        }
      });
    } catch (_) {
      sse = null;
    }

    pollInterval = setInterval(pollStatus, sse ? 2500 : 1000);
  });
}
