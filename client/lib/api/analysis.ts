import { apiRequest } from './client';
import { analysisParams, jobAccepted, uploadPlan, type AnalysisParams, type JobAccepted } from './schemas';

/** A file to analyze, under the field the server files it by */
export interface Upload {
  /** 'videos' and 'screenshots' (their walls) for a session, 'images' for screenshots on their own */
  field: 'videos' | 'screenshots' | 'images';
  blob: Blob;
  name: string;
}

/**
 * Sends files for analysis and answers with the queued job. When the server keeps captures in object
 * storage, the files go straight to the bucket through presigned URLs and only the upload's token
 * goes to the API. With local storage, or if the direct upload fails (a bucket without CORS, say),
 * they go with the request as multipart form data.
 */
export async function submitAnalysis(
  path: '/api/discovery/process-session' | '/api/discovery/process-static-image',
  params: AnalysisParams,
  uploads: Upload[],
): Promise<JobAccepted> {
  const fields = analysisParams.parse(params);
  const purpose = path === '/api/discovery/process-session' ? 'session' : 'static';
  const plan = await apiRequest('/api/discovery/uploads', uploadPlan, {
    method: 'POST',
    body: {
      purpose,
      weapon: fields.weapon,
      mode: fields.mode,
      save_capture: fields.save_capture,
      files: uploads.map((u) => ({
        field: u.field,
        name: u.name,
        type: u.blob.type || 'application/octet-stream',
        size: u.blob.size,
      })),
    },
  }).catch(() => undefined);

  if (plan?.direct && plan.files.length === uploads.length) {
    try {
      await Promise.all(
        plan.files.map(async (target, i) => {
          const put = await fetch(target.url, {
            method: target.method,
            headers: target.headers,
            body: uploads[i].blob,
          });
          if (!put.ok) throw new Error(`Upload of ${uploads[i].name} failed (${put.status})`);
        }),
      );
      return await apiRequest(path, jobAccepted, {
        method: 'POST',
        body: { ...fields, upload: { token: plan.token } },
      });
    } catch (err) {
      console.warn('Direct upload to storage failed; sending the files through the server instead.', err);
    }
  }

  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) if (value !== undefined) form.append(name, String(value));
  for (const upload of uploads) form.append(upload.field, upload.blob, upload.name);
  return apiRequest(path, jobAccepted, { method: 'POST', body: form });
}
