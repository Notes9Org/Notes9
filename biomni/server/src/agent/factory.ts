import { spawn } from 'child_process';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';
import { serverConfig } from '../config.js';
import { isS3Path, syncS3PrefixToLocal } from '../s3-utils.js';

interface RunBiomniTaskOptions {
  task: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
  userId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface RunBiomniTaskResult {
  result: string;
  elapsed_ms: number;
}

const thisFile = fileURLToPath(import.meta.url);
const thisDir = path.dirname(thisFile);
const RUNNER_SCRIPT = path.resolve(thisDir, '../../agent/runner.py');

function getPythonBin(): string {
  return process.env.BIOMNI_PYTHON_PATH ?? 'python';
}

const s3SyncCache = new Map<string, { localPath: string; syncedAtMs: number; inFlight?: Promise<string> }>();

function toCacheDirName(s3Path: string): string {
  return createHash('sha256').update(s3Path).digest('hex').slice(0, 16);
}

async function resolveDataPath(): Promise<string> {
  const configured = serverConfig.biomniDataPath;
  if (!isS3Path(configured)) {
    return configured;
  }

  const now = Date.now();
  const ttlMs = Math.max(0, serverConfig.biomniS3CacheTtlSeconds) * 1000;
  const cacheKey = configured;
  const cacheEntry = s3SyncCache.get(cacheKey);
  const shouldForceSync = serverConfig.biomniS3ForceSync;

  if (
    !shouldForceSync &&
    cacheEntry &&
    now - cacheEntry.syncedAtMs < ttlMs &&
    cacheEntry.localPath
  ) {
    return cacheEntry.localPath;
  }

  if (cacheEntry?.inFlight) {
    return await cacheEntry.inFlight;
  }

  const localPath = path.join(serverConfig.biomniS3CacheDir, toCacheDirName(configured));

  const inFlight = (async () => {
    console.log(`[S3] Syncing Biomni data from ${configured} to ${localPath}`);
    const synced = await syncS3PrefixToLocal(configured, localPath, {
      maxFiles: serverConfig.biomniS3MaxFiles > 0 ? serverConfig.biomniS3MaxFiles : undefined,
    });
    console.log(`[S3] Synced ${synced} objects to ${localPath}`);

    s3SyncCache.set(cacheKey, {
      localPath,
      syncedAtMs: Date.now(),
    });

    return localPath;
  })();

  s3SyncCache.set(cacheKey, {
    localPath,
    syncedAtMs: cacheEntry?.syncedAtMs ?? 0,
    inFlight,
  });

  try {
    return await inFlight;
  } finally {
    const latest = s3SyncCache.get(cacheKey);
    if (latest?.inFlight === inFlight) {
      latest.inFlight = undefined;
      s3SyncCache.set(cacheKey, latest);
    }
  }
}

export async function runBiomniTask(options: RunBiomniTaskOptions): Promise<RunBiomniTaskResult> {
  const {
    task,
    history = [],
    sessionId,
    userId,
    timeoutMs = serverConfig.biomniTimeoutSeconds * 1000,
    signal,
  } = options;

  const dataPath = await resolveDataPath();
  const pythonBin = getPythonBin();
  const startTime = Date.now();

  const payload = JSON.stringify({
    task,
    history,
    session_id: sessionId ?? null,
    user_id: userId ?? null,
    data_path: dataPath,
    timeout_seconds: Math.floor(timeoutMs / 1000),
    default_llm: serverConfig.geminiModel,
    default_source: serverConfig.llmSource,
    reasoning_llm: serverConfig.geminiReasoningModel,
    reasoning_source: serverConfig.llmSource,
  });

  return await new Promise<RunBiomniTaskResult>((resolve, reject) => {
    const child = spawn(pythonBin, [RUNNER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        GOOGLE_API_KEY: serverConfig.googleApiKey ?? '',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.stdin.write(payload);
    child.stdin.end();

    let settled = false;
    const settleReject = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const settleResolve = (value: RunBiomniTaskResult) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      settleReject(new Error(`Biomni task timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    const onAbort = () => {
      clearTimeout(timer);
      child.kill('SIGTERM');
      settleReject(new Error('Task cancelled'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.on('close', (code) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      const elapsed_ms = Date.now() - startTime;

      if (stderr) {
        console.warn('[Biomni Python]', stderr.slice(-2000));
      }

      if (code !== 0) {
        settleReject(new Error(`Python runner exited with code ${code}`));
        return;
      }

      try {
        const lastLine = stdout.trim().split('\n').pop() ?? '{}';
        const parsed = JSON.parse(lastLine) as { result?: string; error?: string };

        if (parsed.error) {
          settleReject(new Error(parsed.error));
          return;
        }

        settleResolve({ result: parsed.result ?? '', elapsed_ms });
      } catch {
        settleReject(new Error('Failed to parse Python runner output'));
      }
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      settleReject(
        new Error(
          `Failed to spawn Python runner. Is '${pythonBin}' installed and Biomni env active?`
        )
      );
    });
  });
}

export async function checkBiomniReady(): Promise<boolean> {
  const pythonBin = getPythonBin();

  return await new Promise<boolean>((resolve) => {
    const child = spawn(pythonBin, ['-c', 'import biomni; print("ok")'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let out = '';
    child.stdout.on('data', (chunk) => {
      out += chunk.toString();
    });

    child.on('close', (code) => {
      resolve(code === 0 && out.trim() === 'ok');
    });

    child.on('error', () => resolve(false));

    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}
