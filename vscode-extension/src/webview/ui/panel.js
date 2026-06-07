// ============================================================
// panel.js — Webview-side script for PromptGuide panel
// Uses acquireVsCodeApi() instead of chrome.* APIs
// Communicates with extension host via postMessage
// ============================================================

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // --- Element refs ---
  const promptInput     = document.getElementById('promptInput');
  const optimizeBtn     = document.getElementById('optimizeBtn');
  const modelSelect     = document.getElementById('modelSelect');
  const tokenBadge      = document.getElementById('tokenBadge');
  const results         = document.getElementById('results');
  const loading         = document.getElementById('loading');
  const errorMsg        = document.getElementById('errorMsg');
  const ringFill        = document.getElementById('ringFill');
  const scoreNum        = document.getElementById('scoreNum');
  const breakdown       = document.getElementById('breakdown');
  const feedback        = document.getElementById('feedback');
  const tokensBefore    = document.getElementById('tokensBefore');
  const tokensAfter     = document.getElementById('tokensAfter');
  const tokenSaved      = document.getElementById('tokenSaved');
  const tokenNote       = document.getElementById('tokenNote');
  const optimizedOutput = document.getElementById('optimizedOutput');
  const applyBtn        = document.getElementById('applyBtn');
  const copyBtn         = document.getElementById('copyBtn');
  const rulesList       = document.getElementById('rulesList');
  const ruleCount       = document.getElementById('ruleCount');
  const mlBadge         = document.getElementById('mlBadge');

  // Inject the SVG gradient def into the ring (CSP-safe, done in JS)
  const svgDefs = `
    <svg width="0" height="0" style="position:absolute">
      <defs>
        <linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#7c3aed"/>
          <stop offset="100%" stop-color="#06b6d4"/>
        </linearGradient>
      </defs>
    </svg>`;
  document.body.insertAdjacentHTML('afterbegin', svgDefs);

  // Notify extension that webview is ready
  vscode.postMessage({ type: 'ready' });

  // --- Token counter in textarea (debounced, calls extension for count) ---
  let tokenDebounce = null;
  promptInput.addEventListener('input', () => {
    clearTimeout(tokenDebounce);
    tokenDebounce = setTimeout(() => {
      const text = promptInput.value.trim();
      if (text) {
        vscode.postMessage({ type: 'countTokens', text });
      } else {
        tokenBadge.textContent = '— tokens';
      }
    }, 300);
  });

  // --- Model selector ---
  modelSelect.addEventListener('change', () => {
    vscode.postMessage({ type: 'setModel', model: modelSelect.value });
    // Re-count if there's text
    const text = promptInput.value.trim();
    if (text) {
      vscode.postMessage({ type: 'countTokens', text });
    }
  });

  // --- Optimize button ---
  optimizeBtn.addEventListener('click', () => {
    const text = promptInput.value.trim();
    if (!text) { return; }

    setLoading(true);
    clearError();
    vscode.postMessage({ type: 'optimize', text });
  });

  // --- Apply & Copy buttons ---
  applyBtn.addEventListener('click', () => {
    const text = optimizedOutput.value;
    if (text) {
      vscode.postMessage({ type: 'applyToEditor', text });
    }
  });

  copyBtn.addEventListener('click', () => {
    const text = optimizedOutput.value;
    if (text) {
      vscode.postMessage({ type: 'copyToClipboard', text });
    }
  });

  // ===== Messages from Extension =====
  window.addEventListener('message', (event) => {
    const msg = event.data;

    switch (msg.type) {
      case 'config':
        // Set initial model selection from settings
        if (msg.model && modelSelect) {
          modelSelect.value = msg.model;
        }
        break;

      case 'loadText':
        // Text was passed from editor selection
        promptInput.value = msg.text || '';
        promptInput.dispatchEvent(new Event('input'));
        break;

      case 'tokenCounts':
        // Update the live token badge
        if (msg.counts) {
          const model = modelSelect.value || 'auto';
          const est = msg.counts[model];
          if (est) {
            const prefix = est.isExact ? '' : '~';
            tokenBadge.textContent = `${prefix}${est.count} tokens`;
          }
        }
        break;

      case 'optimizeResult':
        setLoading(false);
        renderResult(msg.result);
        break;

      case 'copied':
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.innerHTML = '<span>📋</span> Copy'; }, 1500);
        break;

      case 'error':
        setLoading(false);
        showError(msg.message || 'An error occurred.');
        break;
    }
  });

  // ===== Render Result =====
  function renderResult(result) {
    // Show results section
    results.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // --- Score ring animation ---
    const score = result.scoreOptimized.finalScore;
    const circumference = 2 * Math.PI * 52; // r = 52
    const offset = circumference - (score / 100) * circumference;

    // Animate score number
    let current = 0;
    const target = score;
    const anim = setInterval(() => {
      current = Math.min(current + 3, target);
      scoreNum.textContent = current;
      if (current >= target) { clearInterval(anim); }
    }, 18);

    // Ring fill
    ringFill.style.strokeDashoffset = offset;

    // Ring color based on score
    const ringColor = score >= 70 ? '#a6e3a1' : score >= 40 ? '#f9e2af' : '#f38ba8';
    ringFill.style.stroke = ringColor;

    // --- Breakdown chips ---
    breakdown.innerHTML = '';
    const maxes = { Clarity: 20, Vocabulary: 20, Actionability: 25, Specificity: 25, Brevity: 10 };
    for (const [key, value] of Object.entries(result.scoreOptimized.breakdown)) {
      const max = maxes[key] || 25;
      const pct = value / max;
      const cls = pct >= 0.75 ? 'pg-chip-good' : pct > 0 ? 'pg-chip-warn' : 'pg-chip-bad';
      const chip = document.createElement('span');
      chip.className = `pg-chip ${cls}`;
      chip.textContent = `${key}: ${value}/${max}`;
      breakdown.appendChild(chip);
    }

    // --- Feedback ---
    feedback.textContent = result.scoreOptimized.feedback;

    // --- Tokens ---
    const isEst = result.tokensOriginal !== undefined;
    tokensBefore.textContent = result.tokensOriginal;
    tokensAfter.textContent = result.tokensOptimized;

    const saved = result.tokensSaved;
    if (saved > 0) {
      const pct = Math.round((saved / result.tokensOriginal) * 100);
      tokenSaved.innerHTML = `<span style="color:var(--pg-success);font-size:15px;font-weight:700">−${saved} tokens<br><small style="font-size:11px">(−${pct}%)</small></span>`;
    } else if (saved < 0) {
      tokenSaved.innerHTML = `<span style="color:var(--pg-warning);font-size:13px;font-weight:600">+${Math.abs(saved)} added<br><small style="font-size:10px">quality additions</small></span>`;
    } else {
      tokenSaved.innerHTML = `<span style="color:var(--pg-text-muted)">No change</span>`;
    }

    tokenNote.textContent = `Token counts are estimates. Model: ${modelSelect.options[modelSelect.selectedIndex]?.text ?? 'Auto'}.`;

    // --- Optimized prompt ---
    optimizedOutput.value = result.optimized;

    // --- Rules --- 
    const rules = result.rulesApplied || [];
    ruleCount.textContent = rules.length;
    rulesList.innerHTML = '';

    if (rules.length === 0) {
      rulesList.innerHTML = '<p style="font-size:12px;color:var(--pg-text-muted);padding:8px 0">Your prompt already follows best practices — no changes needed.</p>';
    } else {
      for (const rule of rules) {
        const item = document.createElement('div');
        const isSave = rule.tokensSaved > 0;
        const isAdd = rule.tokensSaved < 0;
        item.className = `pg-rule-item ${isSave ? 'save' : isAdd ? 'add' : 'neutral'}`;

        const tokenLabel = rule.tokensSaved > 0
          ? `−${rule.tokensSaved} tok`
          : rule.tokensSaved < 0
            ? `+${Math.abs(rule.tokensSaved)} tok`
            : '';
        const tokenClass = isSave ? 'save' : isAdd ? 'add' : '';

        item.innerHTML = `
          <span class="pg-rule-transformer">${escapeHtml(rule.transformer)}</span>
          <span class="pg-rule-text">${escapeHtml(rule.description)}</span>
          ${tokenLabel ? `<span class="pg-rule-tokens ${tokenClass}">${tokenLabel}</span>` : ''}
        `;
        rulesList.appendChild(item);
      }
    }

    // --- ML badge ---
    if (result.usedSemanticAnalysis) {
      mlBadge.classList.remove('hidden');
    } else {
      mlBadge.classList.add('hidden');
    }
  }

  // ===== Utility =====
  function setLoading(on) {
    loading.classList.toggle('hidden', !on);
    results.classList.toggle('hidden', on);
    optimizeBtn.disabled = on;
  }

  function showError(msg) {
    errorMsg.textContent = `⚠️ ${msg}`;
    errorMsg.classList.remove('hidden');
  }

  function clearError() {
    errorMsg.textContent = '';
    errorMsg.classList.add('hidden');
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

}());
