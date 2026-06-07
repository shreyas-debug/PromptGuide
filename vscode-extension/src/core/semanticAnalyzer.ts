// ============================================================
// semanticAnalyzer.ts — Lazy-loaded MiniLM semantic similarity
// Used to detect redundant sentences within a prompt.
// Model: Xenova/all-MiniLM-L6-v2 (~22MB, downloaded once, cached locally)
// Only loaded when the Optimize panel is opened — never on every keystroke.
// ============================================================
import * as vscode from 'vscode';
import * as path from 'path';

let extractorInstance: unknown = null;
let isLoading = false;
let isAvailable: boolean | null = null; // null = not checked yet

/**
 * Attempts to initialize the @huggingface/transformers pipeline.
 * Returns false gracefully if the package is not installed.
 * Shows a one-time progress notification on first load.
 */
async function getExtractor(globalStoragePath: string): Promise<unknown | null> {
  if (extractorInstance) { return extractorInstance; }
  if (isLoading) { return null; }
  if (isAvailable === false) { return null; }

  isLoading = true;

  try {
    // Dynamic import — package is optional and external to our bundle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const transformers = require('@huggingface/transformers') as {
      pipeline: (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;
      env: { cacheDir: string };
    };

    // Point cache to VS Code's global storage so model survives extension updates
    transformers.env.cacheDir = path.join(globalStoragePath, 'models');

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'PromptGuide',
      cancellable: false,
    }, async (progress) => {
      progress.report({ message: 'Loading semantic analysis model (~22MB, first time only)...' });
      extractorInstance = await transformers.pipeline(
        'feature-extraction',
        'Xenova/all-MiniLM-L6-v2',
        { device: 'cpu' }
      );
    });

    isAvailable = true;
    return extractorInstance;
  } catch {
    // @huggingface/transformers not installed or model download failed — graceful fallback
    isAvailable = false;
    return null;
  } finally {
    isLoading = false;
  }
}

/**
 * Computes cosine similarity between two float32 embedding vectors.
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) { return 0; }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Splits text into sentences (simple heuristic).
 */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20); // Only sentences long enough to be meaningful
}

/**
 * Finds redundant sentences in a prompt using semantic similarity.
 * Returns the indices of sentences to remove (the later duplicates).
 *
 * If @huggingface/transformers is not available, returns [] gracefully.
 */
export async function findRedundantSentences(
  text: string,
  globalStoragePath: string,
  threshold = 0.80
): Promise<{ sentence: string; similarTo: string; similarity: number }[]> {
  const extractor = await getExtractor(globalStoragePath);
  if (!extractor) { return []; }

  const sentences = splitSentences(text);
  if (sentences.length < 2) { return []; }

  try {
    type ExtractorFn = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;
    const extractorFn = extractor as ExtractorFn;

    // Embed all sentences in parallel
    const embeddings = await Promise.all(
      sentences.map(s => extractorFn(s, { pooling: 'mean', normalize: true }))
    );

    const redundant: { sentence: string; similarTo: string; similarity: number }[] = [];

    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const sim = cosineSimilarity(embeddings[i].data, embeddings[j].data);
        if (sim >= threshold) {
          redundant.push({
            sentence: sentences[j],
            similarTo: sentences[i],
            similarity: Math.round(sim * 100),
          });
        }
      }
    }

    return redundant;
  } catch {
    return [];
  }
}

/**
 * Returns whether the semantic analyzer is available (model installed).
 * Used by the UI to decide whether to show the "semantic analysis" badge.
 */
export function isSemanticAnalysisAvailable(): boolean {
  return isAvailable === true;
}
