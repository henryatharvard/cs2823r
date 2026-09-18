(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const { evaluate, update } = DistillMath;
  const example = {
    context: '“The fictional city of Luma is located in…”',
    tokens: ['Italy', 'Greece', 'France', 'Spain', 'Japan'],
    target: 1,
    teacher: [1.4, 0.6, 0.3, 0, -0.3],
    student: [0.8, 1.25, 0.4, 0, -0.3]
  };
  let mode = 'kl';
  let teacher, student, startingStudent, baseline, history = [], step = 0, timer = null;
  const number = n => Math.abs(n) < 0.00005 ? '0.0000' : n.toFixed(4);
  const percent = n => `${(100 * n).toFixed(1)}%`;
  const params = () => ({ lambda: mode === 'sft' ? 0 : +$('lambda').value, temperature: +$('temperature').value, rate: +$('learning-rate').value, taskWeight: mode === 'kl' ? 0 : 1 });
  function current() { const { lambda, temperature, taskWeight } = params(); return evaluate(teacher, student, example.target, lambda, temperature, taskWeight); }
  function pause() { if (timer) clearInterval(timer); timer = null; $('train').innerHTML = '<span aria-hidden="true">▶</span> Run training'; }
  function record() {
    const value = current();
    const base = evaluate(teacher, baseline, example.target, 0, params().temperature);
    history.push({ step, task: value.task, penalty: value.penalty, total: value.total, kl: value.kl, baseline: base.task, baselineKl: base.kl, target: value.targetProbability });
  }
  function restartTrajectory() { pause(); step = 0; baseline = [...student]; history = []; record(); render(); }
  function loadExample() {
    teacher = [...example.teacher]; startingStudent = [...example.student]; student = [...startingStudent];
    $('context').textContent = example.context; $('target-label').textContent = example.tokens[example.target];
    makeEditor(); restartTrajectory();
  }
  function makeEditor() {
    const grid = $('logit-inputs'); grid.replaceChildren();
    const cell = text => { const el = document.createElement('span'); el.textContent = text; grid.append(el); };
    cell('Logits z'); example.tokens.forEach(cell);
    for (const [role, values] of [['Teacher', teacher], ['Student', student]]) {
      cell(role);
      values.forEach((value, i) => { const input = document.createElement('input'); input.type = 'number'; input.step = '0.1'; input.min = '-10'; input.max = '10'; input.value = value.toFixed(2); input.id = `${role.toLowerCase()}-${i}`; input.setAttribute('aria-label', `${role} logit for ${example.tokens[i]}`); input.addEventListener('change', () => {
        const n = input.valueAsNumber;
        if (!Number.isFinite(n)) { input.value = (role === 'Teacher' ? teacher : student)[i].toFixed(2); return; }
        const bounded = Math.max(-10, Math.min(10, n));
        (role === 'Teacher' ? teacher : student)[i] = bounded;
        if (role === 'Student') startingStudent = [...student];
        input.value = bounded.toFixed(2); restartTrajectory();
      }); grid.append(input); });
    }
  }
  function syncEditor() { student.forEach((v, i) => { if (document.activeElement !== $(`student-${i}`)) $(`student-${i}`).value = v.toFixed(2); }); }
  function chartDistribution(logits) {
    const temperature = $('probability-view').value === 'prediction' ? 1 : params().temperature;
    return DistillMath.logSoftmax(logits, temperature).map(Math.exp);
  }
  function distribution(value) {
    const teacherDisplay = chartDistribution(teacher), studentDisplay = chartDistribution(student);
    const prediction = $('probability-view').value === 'prediction';
    const temperature = prediction ? 1 : params().temperature;
    $('chart-temp').textContent = temperature.toFixed(2);
    $('chart-explanation').textContent = prediction ? 'Ordinary softmax probabilities. Task loss = −log of the student’s target probability shown here. KL uses the separate temperature τ.' : `Teacher and student softened/sharpened at τ = ${temperature.toFixed(2)} for KL. Task loss still uses T = 1. This switch changes only the chart.`;
    const width = Math.max(300, $('distribution-chart').clientWidth), height = 238, left = 35, top = 31, bottom = 201, plot = width - left - 8, group = plot / 5;
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><title>Teacher and student probabilities at T = ${temperature.toFixed(2)}</title>`;
    [0, .25, .5, .75, 1].forEach(t => { const y = bottom - t * (bottom - top); svg += `<line x1="${left}" x2="${width - 7}" y1="${y}" y2="${y}" stroke="#edf0f4" ${t ? 'stroke-dasharray="3 4"' : ''}/><text x="${left - 9}" y="${y + 3}" text-anchor="end" fill="#99a3af" font-size="9">${t * 100}%</text>`; });
    teacherDisplay.forEach((p, i) => {
      const q = studentDisplay[i], x = left + group * (i + .5), bar = Math.min(24, group * .25), gap = 6, hp = p * (bottom - top), hq = q * (bottom - top);
      const label = `${example.tokens[i]}: teacher ${percent(p)}, student ${percent(q)}${i === example.target ? ', training target' : ''}`;
      svg += `<g class="bar-group" tabindex="0" role="img" aria-label="${label}"><rect class="bar-highlight" x="${x - group / 2 + 6}" y="${top - 8}" width="${group - 12}" height="${bottom - top + 36}" rx="5" fill="#f4f6f8"/><rect x="${x - bar - gap / 2}" y="${bottom - hp}" width="${bar}" height="${Math.max(hp, .3)}" rx="3" fill="#68a6a0"/><rect x="${x + gap / 2}" y="${bottom - hq}" width="${bar}" height="${Math.max(hq, .3)}" rx="3" fill="#e58b67"/><text x="${x - bar / 2 - gap / 2}" y="${bottom - hp - 7}" text-anchor="middle" font-size="9" fill="#55968f">${percent(p)}</text><text x="${x + bar / 2 + gap / 2}" y="${bottom - hq - 7}" text-anchor="middle" font-size="9" fill="#c87552">${percent(q)}</text><text x="${x}" y="${bottom + 22}" text-anchor="middle" font-size="11" fill="${i === example.target ? '#cc653d' : '#748191'}">${example.tokens[i]}${i === example.target ? ' ✓' : ''}</text><g class="chart-tooltip"><rect x="${x - 58}" y="0" width="116" height="22" rx="4" fill="#33414f"/><text x="${x}" y="14" text-anchor="middle" fill="white" font-size="9">p ${p.toFixed(3)} · q ${q.toFixed(3)}</text></g></g>`;
    });
    $('distribution-chart').innerHTML = svg + '</svg>';
    $('distribution-chart').setAttribute('aria-label', example.tokens.map((token, i) => `${token}: teacher ${percent(teacherDisplay[i])}, student ${percent(studentDisplay[i])}`).join('; '));
  }
  function trajectory() {
    const width = Math.max(280, $('history-chart').clientWidth), height = 245, left = 36, right = 12, top = 13, bottom = 211;
    const series = mode === 'kl' ? [['kl', '#398f88']] : mode === 'sft' ? [['task', '#df8b68']] : [['baseline', '#a6b1bc'], ['penalty', '#68a6a0'], ['task', '#df8b68'], ['total', '#797ca1']];
    const maxY = Math.max(.05, ...history.flatMap(h => series.map(([key]) => h[key]))) * 1.12;
    const maxX = Math.max(50, Math.ceil(step / 50) * 50);
    const x = v => left + (width - left - right) * v / maxX;
    const y = v => bottom - (bottom - top) * v / maxY;
    let svg = `<svg viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><title>Loss trajectory, ${step} training steps</title>`;
    for (let i = 0; i <= 4; i++) { const v = maxY * i / 4; svg += `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" stroke="#edf0f4" stroke-dasharray="3 4"/><text x="${left - 8}" y="${y(v) + 3}" text-anchor="end" fill="#9ca5b0" font-size="9">${v.toFixed(maxY < .2 ? 3 : 1)}</text>`; }
    for (let i = 0; i <= 5; i++) { const v = maxX * i / 5; svg += `<text x="${x(v)}" y="${bottom + 18}" text-anchor="middle" fill="#9ca5b0" font-size="9">${v}</text>`; }
    svg += `<text x="${left}" y="8" fill="#a0a9b3" font-size="8">nats</text><text x="${width - right}" y="${height - 2}" text-anchor="end" fill="#9ca5b0" font-size="9">training steps</text>`;
    for (const [key, color] of series) {
      const path = history.map((h, i) => `${i ? 'L' : 'M'}${x(h.step).toFixed(2)},${y(h[key]).toFixed(2)}`).join(' ');
      const last = history[history.length - 1];
      svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="2" ${key === 'baseline' ? 'stroke-dasharray="5 4"' : ''}/><circle cx="${x(last.step)}" cy="${y(last[key])}" r="3" fill="${color}"/>`;
    }
    if (!step) svg += `<rect x="${width / 2 - 123}" y="89" width="246" height="42" rx="7" fill="#f6f7f9"/><text x="${width / 2}" y="114" text-anchor="middle" fill="#8c97a4" font-size="10">Press Run training to draw your trajectory</text>`;
    $('history-chart').innerHTML = svg + '</svg>';
  }
  function render() {
    syncModeControls();
    const v = current(), { lambda, temperature, rate, taskWeight } = params();
    $('lambda').disabled = mode === 'sft';
    $('lambda-value').textContent = mode === 'sft' ? 'OFF' : lambda.toFixed(2); $('temperature-value').textContent = temperature.toFixed(2);
    $('step-badge').textContent = `STEP ${String(step).padStart(3, '0')}`;
    $('task-loss').textContent = v.task.toFixed(4); $('distill-loss').textContent = v.penalty.toFixed(4); $('total-loss').textContent = v.total.toFixed(4);
    $('distill-caption').textContent = `${lambda.toFixed(2)} × ${temperature.toFixed(2)}² × ${v.kl.toFixed(4)}`;
    $('raw-kl').textContent = number(v.kl);
    $('kl-temperature-note').textContent = `This table always uses τ = ${temperature.toFixed(2)}, regardless of the chart view.`;
    $('kl-rows').innerHTML = example.tokens.map((token, i) => `<tr><td>${token}${i === example.target ? ' <span class="target-marker">✓</span>' : ''}</td><td>${v.p[i].toFixed(4)}</td><td>${v.q[i].toFixed(4)}</td><td class="${v.contributions[i] >= 0 ? 'contribution-positive' : 'contribution-negative'}">${v.contributions[i] > .00005 ? '+' : ''}${number(v.contributions[i])}</td></tr>`).join('');
    renderTeaching(v, { lambda, temperature, rate, taskWeight });
    if (mode === 'kl') {
      $('insight-title').textContent = lambda === 0 ? 'Both forces are off.' : v.kl < 1e-7 ? 'Matched. There is nothing left for KL to change.' : 'Now the student really is learning to mimic the teacher.';
      $('insight-text').textContent = lambda === 0 ? 'Task loss is disabled in KL-only mode. Set λ above zero to start matching the teacher.' : 'The training label does not drive updates in this mode. Run training: the overall KL divergence falls toward zero as the student approaches the full teacher distribution.';
    } else if (lambda === 0) {
      $('insight-title').textContent = 'The reference is switched off.';
      $('insight-text').textContent = `Only the target drives updates. Raw KL is still ${v.kl.toFixed(4)}, but its weighted penalty is zero. Run training to see probability move toward ${example.tokens[example.target]}.`;
    } else if (v.kl < 1e-7) {
      $('insight-title').textContent = 'A perfect match means zero KL.';
      $('insight-text').textContent = 'The distillation gradient is zero here. The task gradient can still move the student toward the training target on the next step.';
    } else {
      $('insight-title').textContent = 'Two objectives. One update.';
      $('insight-text').textContent = 'The optimizer minimizes their sum. KL can increase if the task loss falls enough. Compare the raw KL with the independent SFT-only student: regularization can limit drift without eliminating it.';
    }
    $('train').disabled = step >= 500; $('step').disabled = step >= 500;
    $('history-note').textContent = step >= 500 ? 'Reached 500 steps. Reset the student or adjust a parameter to start a new trajectory. The dashed curve is task loss for the separate SFT-only student.' : 'Run training to trace the objective. Dashed line: task loss of a separate λ = 0 student from the same starting logits.';
    if (mode === 'kl') $('history-note').textContent = 'This curve is raw KL, not task loss. With λ > 0, KL-only training approaches the teacher distribution. At λ = 0 there are no updates.';
    if (mode === 'sft') $('history-note').textContent = 'This curve is task cross-entropy at τ = 1. Training raises the target probability toward 100%, even if the teacher disagrees.';
    if (step >= 500) $('history-note').textContent += ' Reached 500 steps; reset to run again.';
    distribution(v); trajectory(); syncEditor();
  }
  function renderTeaching(v, { lambda, temperature, rate, taskWeight }) {
    const taskTerm = '<span class="task-text">ℒ<span class="sub">task</span></span>';
    const klTerm = '<span class="distill-text">λ · τ² · KL(p<span class="sub">teacher</span> ∥ p<span class="sub">student</span>)</span>';
    $('active-formula').innerHTML = '<span>ℒ<span class="sub">total</span></span><span class="operator">=</span>' + (mode === 'kl' ? klTerm : mode === 'sft' ? taskTerm : taskTerm + '<span class="operator">+</span>' + klTerm);
    $('objective-heading').textContent = mode === 'combined' ? 'ACTIVE: COMBINED · THE PAPER OBJECTIVE' : mode === 'kl' ? 'ACTIVE: KL ONLY · TASK LOSS DISABLED' : 'ACTIVE: SFT ONLY · KL PENALTY DISABLED';
    $('formula-annotation').textContent = mode === 'kl' ? 'Only the teacher distribution matters' : mode === 'sft' ? 'Only the training target matters' : 'Two gradients compete';
    const token = example.tokens[example.target], k = example.target;
    const expectations = {
      kl: `Expect matching: the teacher gives ${token} ${percent(Math.exp(DistillMath.logSoftmax(teacher)[k]))} at T = 1. With λ > 0, the student approaches that probability along with the rest of the distribution. The training target is ignored.`,
      sft: `Expect target learning: ${token} moves toward 100% at τ = 1. Nothing penalizes moving away from the teacher.`,
      combined: `Expect a compromise: the task pushes ${token} up while KL resists changes from the teacher. Exact matching is not the goal. Increasing λ makes the teacher more influential.`
    };
    $('mode-expectation').textContent = expectations[mode];
    const favorite = teacher.indexOf(Math.max(...teacher));
    $('example-explanation').textContent = `The teacher favors ${example.tokens[favorite]}. The training label is ${token}. Compare matching the teacher, learning the label, and balancing both.`;
    $('task-metric').classList.toggle('inactive-metric', !taskWeight);
    $('loss-arithmetic').textContent = `Optimized total = ${taskWeight ? v.task.toFixed(4) + ' (task)' : '0 (task excluded)'} + ${lambda ? v.penalty.toFixed(4) + ' (KL penalty)' : '0 (KL excluded)'} = ${v.total.toFixed(4)}. Values rounded.`;
    $('task-caption').textContent = taskWeight ? 'Active · CE at τ = 1' : 'For reference only · not optimized';
    $('total-caption').textContent = mode === 'kl' ? 'KL penalty only · nats' : mode === 'sft' ? 'Task loss only · nats' : 'Task + distillation · nats';
    const first = history[0], last = history[history.length - 1], change = v.kl - first.kl;
    $('kl-start').textContent = first.kl.toFixed(4);
    $('kl-now').textContent = v.kl.toFixed(4);
    $('kl-trend').textContent = Math.abs(change) < .00005 ? 'unchanged' : change < 0 ? '↓ closer than at start' : '↑ farther than at start';
    $('kl-trend').className = change > .00005 ? 'task-text' : 'distill-text';
    $('kl-comparison').textContent = mode === 'combined' ? `SFT-only student at the same step: KL = ${last.baselineKl.toFixed(4)}. Both start from the same logits.` : 'Start → now, at the selected temperature. This measures the whole distribution, not just the target token.';
    const nextStudent = update(student, v.gradient, rate);
    const next = evaluate(teacher, nextStudent, k, lambda, temperature, taskWeight);
    const signed = n => (n > .00005 ? '+' : '') + number(n);
    $('force-title').textContent = `Next step for ${token}`;
    $('next-probability').textContent = `Prediction at T = 1: ${percent(v.targetProbability)} → ${percent(next.targetProbability)} for ${token}.`;
    const teacherAtOne = Math.exp(DistillMath.logSoftmax(teacher)[k]);
    $('prediction-probability').textContent = `Teacher at T = 1: ${percent(teacherAtOne)}. For the KL term at τ = ${temperature.toFixed(2)}: teacher ${percent(v.p[k])}, student ${percent(v.q[k])}.`;
    $('task-force').textContent = signed(-rate * v.taskGradient[k]);
    $('kl-force').textContent = signed(-rate * v.distillGradient[k]);
    $('net-force').textContent = signed(-rate * v.gradient[k]);
    $('force-caption').textContent = 'Numbers show changes to this token’s logit, before centering. The probability prediction above includes updates to every token.';
    const norm = Math.max(...v.gradient.map(Math.abs));
    $('gradient-norm').textContent = norm.toExponential(3);
    $('optimization-state').textContent = step >= 500 ? 'Stopped at the 500-step demo limit. This does not certify equilibrium.' : norm < 1e-8 ? 'Total gradient is approximately zero: no meaningful probability update. Loss can still be positive.' : norm < 1e-4 ? 'Near a stationary point: the total gradient is small. Positive loss can remain.' : 'The total gradient is nonzero, so another step will change the distribution. Zero loss is not required at equilibrium.';
    $('history-legend').innerHTML = mode === 'kl' ? '<span><i class="teacher-dot"></i>Raw KL · teacher ∥ student</span>' : mode === 'sft' ? '<span><i class="task-dot"></i>Task cross-entropy</span>' : '<span><i class="total-dot"></i>Total</span><span><i class="task-dot"></i>Task</span><span><i class="teacher-dot"></i>Penalty</span><span><i class="baseline-dot"></i>SFT only</span>';
  }
  function syncModeControls() {
    document.querySelectorAll('input[name="objective"]').forEach(input => { input.checked = input.value === mode; });
    $('playground').dataset.objective = mode;
  }
  function setMode(value) {
    mode = value;
    syncModeControls();
    student = [...startingStudent];
    restartTrajectory();
  }
  function trainStep() {
    if (step >= 500) { pause(); return; }
    const { rate } = params();
    student = update(student, current().gradient, rate);
    baseline = update(baseline, evaluate(teacher, baseline, example.target, 0, 1).gradient, rate);
    step++; record(); render(); if (step >= 500) pause();
  }
  function showSection(section) {
    if (section !== 'playground') pause();
    for (const [name, tab] of [['playground', 'playground-tab'], ['method', 'method-tab'], ['paper-cartoons', 'cartoons-tab']]) {
      const active = name === section;
      $(name).hidden = !active;
      $(tab).classList.toggle('active', active);
      if (active) $(tab).setAttribute('aria-current', 'page');
      else $(tab).removeAttribute('aria-current');
    }
    if (section === 'playground') render();
    historyReplace(section);
  }
  function historyReplace(section) {
    window.history.replaceState(null, '', '#' + section);
  }
  function showMethod(show) { showSection(show ? 'method' : 'playground'); }
  document.querySelectorAll('input[name="objective"]').forEach(input => input.addEventListener('change', () => setMode(input.value)));
  $('probability-view').addEventListener('change', render);
  window.addEventListener('pageshow', () => { if (student) render(); });
  $('restore-example').addEventListener('click', loadExample);
  ['lambda', 'temperature'].forEach(id => $(id).addEventListener('input', restartTrajectory));
  $('learning-rate').addEventListener('change', restartTrajectory);
  $('paper-defaults').addEventListener('click', () => { $('lambda').value = 1; $('temperature').value = .5; setMode('combined'); });
  $('reset').addEventListener('click', () => { student = [...startingStudent]; restartTrajectory(); });
  $('match-teacher').addEventListener('click', () => { startingStudent = [...teacher]; student = [...startingStudent]; restartTrajectory(); });
  $('step').addEventListener('click', () => { pause(); trainStep(); });
  $('train').addEventListener('click', () => { if (timer) { pause(); return; } $('train').innerHTML = '<span aria-hidden="true">Ⅱ</span> Pause training'; timer = setInterval(trainStep, 90); });
  $('cartoons-tab').addEventListener('click', () => showSection('paper-cartoons'));
  $('cartoon-to-loss').addEventListener('click', () => { setMode('combined'); showSection('playground'); $('playground-tab').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  $('playground-tab').addEventListener('click', () => showMethod(false)); $('method-tab').addEventListener('click', () => showMethod(true));
  $('explore-math').addEventListener('click', () => { showMethod(true); $('method-tab').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  $('back-playground').addEventListener('click', () => { showMethod(false); $('playground-tab').scrollIntoView({ block: 'start', behavior: 'smooth' }); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('download').addEventListener('click', () => {
    const { lambda, temperature, rate } = params();
    const rows = ['step,task_loss,distillation_penalty,total_loss,raw_kl,sft_only_task_loss,target_probability_at_T1,lambda,temperature,learning_rate,objective,task_weight,sft_only_raw_kl', ...history.map(h => [h.step, h.task, h.penalty, h.total, h.kl, h.baseline, h.target, lambda, temperature, rate, mode, params().taskWeight, h.baselineKl].join(','))];
    const url = URL.createObjectURL(new Blob([rows.join('\n')], { type: 'text/csv' })); const link = document.createElement('a'); link.href = url; link.download = `distill-${mode}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  let resizeFrame;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => { if (!$('playground').hidden) { distribution(current()); trajectory(); } });
  });
  function drawCartoons() {
    const experiments = [
      { id: 'attention', title: 'Freeze FFN. Train attention.', label: 'Paper row: Attention only', attentionFrozen: false, ffnFrozen: true, mixed: true, scores: [94.6, 1.0, 93.1], quote: '“I can answer in the right format.”', outcome: 'Task learning, little factual learning.', memory: 'The guide practices; the workshop is locked.', description: 'Known facts stay largely intact; new facts barely stick.' },
      { id: 'ffn', title: 'Freeze attention. Train FFN.', label: 'Paper row: FFN only', attentionFrozen: true, ffnFrozen: false, mixed: true, scores: [99.7, 94.1, 78.2], quote: '“New facts in… some old answers slip.”', outcome: 'New facts learned, old facts disrupted.', memory: 'Locking the guide does not lock the workshop.', description: 'Freezing attention alone does not prevent forgetting.' },
      { id: 'all', title: 'Train all. Include new facts.', label: 'Paper row: All · standard SFT', attentionFrozen: false, ffnFrozen: false, mixed: true, scores: [99.0, 94.6, 78.0], quote: '“We learn new answers, but old ones wobble.”', outcome: 'Learning and forgetting happen together.', memory: 'Both can change; new facts disturb old ones.', description: 'The same broad tradeoff appears with all parameters updated.' },
      { id: 'known-only', title: 'Train all. Use known facts only.', label: 'Paper row: All · Only Known', attentionFrozen: false, ffnFrozen: false, mixed: false, scores: [99.9, null, 95.8], quote: '“Same facts. Better at the task.”', outcome: 'Task learning with high preservation.', memory: 'Practice familiar cards; add no new facts.', description: 'Fine-tuning itself need not cause the forgetting seen above.' }
    ];
    const lock = (x, y) => `<g transform="translate(${x} ${y})" fill="none" stroke="#6289a4" stroke-width="2"><path d="M4 9V5a5 5 0 0 1 10 0v4"/><rect x="1" y="9" width="16" height="13" rx="3" fill="#eaf3fa"/><path d="M9 13v5"/></g>`;
    function character(x, frozen, shelf) {
      const color = frozen ? '#759ab3' : shelf ? '#c9825f' : '#55978f';
      return `<g transform="translate(${x} 62)"><path d="M29 75l-8 18m73-18 8 18M13 39L2 54m109-15 12 15" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"/><rect x="13" y="0" width="98" height="77" rx="17" fill="${frozen ? '#e9f2f8' : shelf ? '#faede3' : '#e5f1ed'}" stroke="${color}" stroke-width="2"/>
        <circle cx="49" cy="20" r="3" fill="#45596b"/><circle cx="75" cy="20" r="3" fill="#45596b"/><path d="M55 29q7 7 14 0" fill="none" stroke="#45596b" stroke-width="2" stroke-linecap="round"/>
        ${shelf ? '<path d="M29 65h66" stroke="#b89076" stroke-width="3"/><rect x="33" y="42" width="12" height="22" rx="2" fill="#79a9a0"/><rect x="49" y="46" width="12" height="18" rx="2" fill="#8fa4bb"/><rect x="65" y="40" width="12" height="24" rx="2" fill="#dab184"/><rect x="81" y="44" width="10" height="20" rx="2" fill="#93aaa0"/>' : '<rect x="31" y="43" width="63" height="24" rx="7" fill="white"/><text x="62" y="59" text-anchor="middle" fill="#55978f" font-size="11">Q → A</text>'}
        ${frozen ? lock(93, -9) : '<g transform="translate(97 -6) rotate(35)"><rect width="6" height="23" rx="2" fill="#d99662"/><path d="M0 23l3 6 3-6" fill="#546471"/></g>'}
        <text x="62" y="111" text-anchor="middle" fill="#506373" font-size="12" font-weight="600">${shelf ? 'FFN' : 'Attention'}</text><text x="62" y="128" text-anchor="middle" fill="${color}" font-size="10">${frozen ? 'FROZEN · still runs' : 'UPDATING'}</text></g>`;
    }
    function picture(e) {
      const stable = e.ffnFrozen || !e.mixed;
      return `<svg viewBox="0 0 390 271" role="img" aria-label="Cartoon: ${e.memory} Attention ${e.attentionFrozen ? 'frozen' : 'updating'}; FFN ${e.ffnFrozen ? 'frozen' : 'updating'}. ${e.outcome}"><title>${e.title}</title>
        <rect x="9" y="7" width="372" height="246" rx="15" fill="${stable ? '#f2f7f4' : '#fbf4ed'}"/>
        <path d="M81 234q108 13 227-1" fill="none" stroke="#dce3de" stroke-width="3" stroke-linecap="round"/>
        <rect x="67" y="17" width="256" height="30" rx="11" fill="white" stroke="#e4e7e4"/><text x="195" y="36" text-anchor="middle" fill="#687782" font-size="11">${e.quote}</text>
        ${character(25, e.attentionFrozen, false)}${character(240, e.ffnFrozen, true)}
        <path d="M157 106h65m-8-6 8 6-8 6" stroke="#98aaa9" stroke-width="2" fill="none" stroke-linecap="round"/>
        <text x="190" y="128" text-anchor="middle" font-size="8" fill="#93a09f">forward pass</text>
        <g transform="translate(160 155) rotate(${e.mixed && !e.ffnFrozen ? '-9' : '0'} 35 20)"><rect width="67" height="38" rx="5" fill="${e.mixed ? '#f5dfc9' : '#e0eaf1'}" stroke="${e.mixed ? '#d5a57b' : '#95b0c3'}"/><text x="33" y="16" text-anchor="middle" fill="#786856" font-size="9">${e.mixed ? 'new fact' : 'known fact'}</text><text x="33" y="29" text-anchor="middle" fill="#786856" font-size="12">${e.ffnFrozen ? '↛' : e.mixed ? '+ ?' : '✓'}</text></g>
        <rect x="79" y="209" width="232" height="27" rx="8" fill="white" stroke="${stable ? '#b4cfc3' : '#e0b599'}"/><text x="195" y="227" text-anchor="middle" font-size="11" fill="${stable ? '#548473' : '#b37754'}">Other old facts: ${stable ? 'largely preserved ✓' : 'some answers disrupted ?'}</text></svg>`;
    }
    const metricNames = ['Task · D_known', 'New facts · D_unknown', 'Old facts · D_held'];
    $('cartoon-grid').innerHTML = experiments.map((e, i) => `<article class="panel cartoon-card" data-experiment="${e.id}"><div class="cartoon-card-heading"><span class="section-number">0${i + 1}</span><div><h3>${e.title}</h3><p>${e.label}</p></div></div><div class="cartoon-data"><span>TRAINING DATA</span><b class="known-data">D<sub>known</sub></b>${e.mixed ? '<span>+</span><b class="unknown-data">D<sub>unknown</sub></b>' : '<span>only · no new facts</span>'}</div>${picture(e)}<div class="cartoon-outcome"><h4>${e.outcome}</h4><p>${e.description}</p></div><div class="cartoon-scores">${e.scores.map((score, j) => `<div class="cartoon-score"><label>${metricNames[j]}</label><span class="score-track">${score === null ? '' : `<span style="width:${score}%;background:${['#829bbc', '#d99662', '#68a295'][j]}"></span>`}</span><strong>${score === null ? '—' : score.toFixed(1) + '%'}</strong></div>`).join('')}</div><div class="cartoon-caption"><span>REMEMBER</span>${e.memory}</div></article>`).join('');
  }
  loadExample();
  drawCartoons();
  const sections = ['playground', 'method', 'paper-cartoons'];
  function followHash() { const name = location.hash.slice(1); if (sections.includes(name)) showSection(name); }
  followHash();
  window.addEventListener('hashchange', followHash);
})();
