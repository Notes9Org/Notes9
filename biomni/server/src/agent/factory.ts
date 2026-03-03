/**
 * Biomni Agent Factory
 *
 * This module bridges the TypeScript server to the local Python Biomni process.
 *
 * Architecture:
 *   Next.js (TS) → biomni/server (TS HTTP gateway, port 3002)
 *                → spawns Python child process running the local Biomni clone
 *                → returns result back up the chain
 *
 * Why a local Python sidecar instead of a remote API?
 *   Biomni is Apache-2.0 open source. We clone the repo and run it locally
 *   (conda env biomni_e1). No API fees, no cloud dependency.
 *   The TypeScript server is only a thin gateway that:
 *     1. Validates/authenticates inbound requests from Next.js
 *     2. Spawns / communicates with the Python Biomni process
 *     3. Returns structured JSON responses
 *
 * Python setup (run once):
 *   git clone https://github.com/snap-stanford/Biomni.git ../biomni-python
 *   cd ../biomni-python && bash setup.sh
 *   conda activate biomni_e1 && pip install biomni --upgrade
 *
 * The BIOMNI_PYTHON_PATH env var points to the conda Python binary so we
 * invoke the correct environment without needing `conda run` overhead.
 */

import { spawn } from 'child_process';
import path from 'path';
import { serverConfig } from '../config.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentRunOptions {
  task: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  sessionId?: string;
  userId?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface AgentRunResult {
  result: string;
  /** Wall-clock milliseconds taken by the Python process. */
  elapsed_ms: number;
}

// ---------------------------------------------------------------------------
// Python runner
// ---------------------------------------------------------------------------

/**
 * Path to the inline Python runner script.
 * Lives at biomni/server/src/agent/runner.py
 */
const RUNNER_SCRIPT = path.resolve(
  new URL(import.meta.url).pathname,
  '../../agent/runner.py'
);

/**
 * Resolve which Python binary to use.
 * Priority: BIOMNI_PYTHON_PATH env var → `python` on PATH.
 */
function getPythonBin(): string {
  return process.env.BIOMNI_PYTHON_PATH ?? 'python';
}

/**
 * Run a Biomni task by spawning the local Python runner.
 * The runner script imports biomni from the cloned repo and calls agent.go().
 *
 * Communication protocol: JSON on stdin → JSON on stdout.
 *   stdin:  { task, history, session_id, user_id, data_path, timeout_seconds, llm, source }
 *   stdout: { result } or { error }
 */
export async function runBiomniTask(options: AgentRunOptions): Promise<AgentRunResult> {
  const {
    task,
    history = [],
    sessionId,
    userId,
    timeoutMs = serverConfig.biomniTimeoutSeconds * 1000,
    signal,
  } = options;

  const pythonBin = getPythonBin();
  const startTime = Date.now();

  const payload = JSON.stringify({
    task,
    history,
    session_id: sessionId ?? null,
    user_id: userId ?? null,
    data_path: serverConfig.biomniDataPath,
    timeout_seconds: Math.floor(timeoutMs / 1000),
    // default_config LLM (DB queries / retrieval)
    default_llm: serverConfig.defaultLlm,
    default_source: serverConfig.defaultLlmSource,
    // reasoning LLM
    reasoning_llm: serverConfig.reasoningLlm,
    reasoning_source: serverConfig.reasoningLlmSource,
    // optional local SGLang base URL
    local_base_url: serverConfig.localLlmBaseUrl ?? null,
  });

  return new Promise<AgentRunResult>((resolve, reject) => {
    const child = spawn(pythonBin, [RUNNER_SCRIPT], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Forward LLM API keys to the Python subprocess
        ANTHROPIC_API_KEY: serverConfig.anthropicApiKey ?? '',
        GROQ_API_KEY: serverConfig.groqApiKey ?? '',
        OPENAI_API_KEY: serverConfig.openaiApiKey ?? '',
      },
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    // Write task payload and close stdin so the Python process reads EOF
    child.stdin.write(payload);
    child.stdin.end();

    // Hard timeout via AbortSignal or fallback timer
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Biomni task timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      child.kill('SIGTERM');
      reject(new Error('Task cancelled'));
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      const elapsed_ms = Date.now() - startTime;

      if (stderr) {
        // Log Python stderr for debugging; don't fail on warnings
        console.warn('[Biomni Python]', stderr.slice(-2000));
      }

      if (code !== 0) {
        reject(new Error(`Python runner exited with code ${code}. stderr: ${stderr.slice(-500)}`));
        return;
      }

      try {
        // Runner writes a single JSON line to stdout
        const lastLine = stdout.trim().split('\n').pop() ?? '{}';
        const parsed = JSON.parse(lastLine) as { result?: string; error?: string };

        if (parsed.error) {
          reject(new Error(parsed.error));
        } else {
          resolve({ result: parsed.result ?? '', elapsed_ms });
        }
      } catch {
        reject(new Error(`Failed to parse Python runner output: ${stdout.slice(-500)}`));
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(
        new Error(
          `Failed to spawn Python runner. Is '${pythonBin}' installed and the biomni_e1 conda env active? Error: ${err.message}`
        )
      );
    });
  });
}

// ---------------------------------------------------------------------------
// Readiness probe
// ---------------------------------------------------------------------------

/** Quick check: can we import biomni in the configured Python env? */
export async function checkBiomniReady(): Promise<boolean> {
  const pythonBin = getPythonBin();
  return new Promise<boolean>((resolve) => {
    const child = spawn(pythonBin, ['-c', 'import biomni; print("ok")'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => {
      resolve(code === 0 && out.trim() === 'ok');
    });
    child.on('error', () => resolve(false));

    // Don't wait more than 5s for the import check
    setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
  });
}
