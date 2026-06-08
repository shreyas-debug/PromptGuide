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
  const limitSelect     = document.getElementById('limitSelect');
  const tokenBadge      = document.getElementById('tokenBadge');
  const budgetBadge     = document.getElementById('budgetBadge');
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
  const budgetNote      = document.getElementById('budgetNote');
  const optimizedOutput = document.getElementById('optimizedOutput');
  const applyBtn        = document.getElementById('applyBtn');
  const diffBtn         = document.getElementById('diffBtn');
  const copyBtn         = document.getElementById('copyBtn');
  const rulesList       = document.getElementById('rulesList');
  const ruleCount       = document.getElementById('ruleCount');
  const mlBadge         = document.getElementById('mlBadge');

  // --- State variables ---
  let tokenBudget = 0;
  let lastEstimateCount = 0;
  let lastOriginalText = '';

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
        updateBudgetDisplay(0);
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

  // --- Limit selector ---
  if (limitSelect) {
    limitSelect.addEventListener('change', () => {
      const val = limitSelect.value;
      if (val === 'custom') {
        vscode.postMessage({ type: 'promptCustomLimit' });
      } else {
        const budget = parseInt(val, 10) || 0;
        tokenBudget = budget;
        vscode.postMessage({ type: 'setBudget', budget });
        updateBudgetDisplay(lastEstimateCount);
      }
    });
  }

  // --- Optimize button ---
  optimizeBtn.addEventListener('click', () => {
    const text = promptInput.value.trim();
    if (!text) { return; }

    lastOriginalText = text;
    setLoading(true);
    clearError();
    vscode.postMessage({ type: 'optimize', text });
  });

  // --- Apply, Diff & Copy buttons ---
  applyBtn.addEventListener('click', () => {
    const text = optimizedOutput.value;
    if (text) {
      vscode.postMessage({ type: 'applyToEditor', text });
    }
  });

  diffBtn.addEventListener('click', () => {
    const original = lastOriginalText || promptInput.value.trim();
    const optimized = optimizedOutput.value;
    if (original && optimized) {
      vscode.postMessage({ type: 'showDiff', original, optimized });
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
        // Set initial model selection and budget
        if (msg.model && modelSelect) {
          modelSelect.value = msg.model;
        }
        tokenBudget = msg.budget || 0;
        if (limitSelect) {
          updateLimitSelectorValue(tokenBudget);
        }
        const txt = promptInput.value.trim();
        if (txt) {
          vscode.postMessage({ type: 'countTokens', text: txt });
        } else {
          updateBudgetDisplay(0);
        }
        break;

      case 'loadText':
        // Text was passed from editor selection
        promptInput.value = msg.text || '';
        lastOriginalText = msg.text || '';
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
            lastEstimateCount = est.count;
            updateBudgetDisplay(lastEstimateCount);
          }
        }
        break;

      case 'optimizeResult':
        setLoading(false);
        if (msg.result) {
          lastOriginalText = msg.result.original || lastOriginalText;
          renderResult(msg.result);
        }
        break;

      case 'history':
        if (msg.history) {
          renderSparkline(msg.history);
        }
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

  // ===== Sync Limit Selector Preset/Custom option =====
  function updateLimitSelectorValue(budget) {
    if (!limitSelect) return;

    // Filter out previous dynamic/custom option selections that aren't in standard presets
    const presets = ['0', '4096', '8192', '16384', '32768', 'custom'];
    for (let i = limitSelect.options.length - 1; i >= 0; i--) {
      const opt = limitSelect.options[i];
      if (!presets.includes(opt.value)) {
        limitSelect.remove(i);
      }
    }

    let found = false;
    for (let i = 0; i < limitSelect.options.length; i++) {
      if (limitSelect.options[i].value === String(budget)) {
        limitSelect.selectedIndex = i;
        found = true;
        break;
      }
    }

    if (!found && budget > 0) {
      const customOpt = document.createElement('option');
      customOpt.value = String(budget);
      customOpt.textContent = String(budget);
      // Insert right before 'custom' option
      limitSelect.insertBefore(customOpt, limitSelect.options[limitSelect.options.length - 1]);
      limitSelect.value = String(budget);
    } else if (budget === 0) {
      limitSelect.value = '0';
    }
  }

  // ===== Render Budget Display =====
  function updateBudgetDisplay(count) {
    if (tokenBudget <= 0) {
      budgetBadge.classList.add('hidden');
      budgetNote.classList.add('hidden');
      return;
    }

    const remaining = tokenBudget - count;
    const pct = (count / tokenBudget) * 100;

    budgetBadge.classList.remove('hidden');
    budgetBadge.className = 'pg-budget-badge'; // reset

    if (remaining >= 0) {
      budgetBadge.textContent = `${remaining} remaining`;
      if (pct >= 80) {
        budgetBadge.classList.add('warning');
      } else {
        budgetBadge.classList.add('normal');
      }

      budgetNote.classList.remove('hidden');
      budgetNote.className = 'pg-token-note pg-budget-note success';
      budgetNote.textContent = `Budget: ${count}/${tokenBudget} tokens used (${remaining} remaining).`;
    } else {
      budgetBadge.textContent = `+${Math.abs(remaining)} over budget`;
      budgetBadge.classList.add('error');

      budgetNote.classList.remove('hidden');
      budgetNote.className = 'pg-token-note pg-budget-note error';
      budgetNote.textContent = `Budget exceeded: ${count}/${tokenBudget} tokens used (${Math.abs(remaining)} over limit!).`;
    }
  }

  // ===== Render Sparkline =====
  function renderSparkline(history) {
    const sparklineSection = document.getElementById('sparklineSection');
    const sparklineEl = document.getElementById('sparkline');
    
    if (!history || history.length < 2) {
      sparklineEl.innerHTML = '';
      sparklineSection.classList.add('hidden');
      return;
    }
    sparklineSection.classList.remove('hidden');

    const width = 200;
    const height = 40;
    const scores = history.map(h => h.score);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min === 0 ? 1 : max - min;

    const points = history.map((h, i) => {
      const x = (i / (history.length - 1)) * width;
      const y = height - ((h.score - min) / range) * (height - 8) - 4; // leave margin
      return `${x},${y}`;
    });

    const pathD = `M ${points.join(' L ')}`;
    sparklineEl.innerHTML = `
      <svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" style="overflow:visible">
        <path d="${pathD}" fill="none" stroke="url(#ringGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        <!-- Add dots on points -->
        ${points.map((p, idx) => {
          const parts = p.split(',');
          const formattedTime = new Date(history[idx].timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `
            <circle cx="${parts[0]}" cy="${parts[1]}" r="3.5" fill="#06b6d4" stroke="var(--pg-bg)" stroke-width="1.5" style="cursor:pointer" />
            <title>Score: ${history[idx].score} (tokens: ${history[idx].tokens}) at ${formattedTime}</title>
          `;
        }).join('')}
      </svg>
    `;
  }

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
    tokensBefore.textContent = result.tokensOriginal;
    tokensAfter.textContent = result.tokensOptimized;

    // Update budget display based on optimized count
    updateBudgetDisplay(result.tokensOptimized);

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
