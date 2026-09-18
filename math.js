/* The browser and test harness share these exact numerical routines. */
(function (root) {
  'use strict';
  function logSoftmax(logits, temperature = 1) {
    const scaled = logits.map(z => z / temperature);
    const max = Math.max(...scaled);
    const logSum = Math.log(scaled.reduce((sum, z) => sum + Math.exp(z - max), 0));
    return scaled.map(z => z - max - logSum);
  }
  function evaluate(teacher, student, target, lambda, temperature, taskWeight = 1) {
    const logP = logSoftmax(teacher, temperature);
    const logQ = logSoftmax(student, temperature);
    const logQ1 = logSoftmax(student);
    const p = logP.map(Math.exp), q = logQ.map(Math.exp);
    const contributions = p.map((pv, i) => pv * (logP[i] - logQ[i]));
    const kl = Math.max(0, contributions.reduce((sum, v) => sum + v, 0));
    const task = -logQ1[target];
    const penalty = lambda * temperature ** 2 * kl;
    const taskGradient = logQ1.map((logq, i) => taskWeight * (Math.exp(logq) - Number(i === target)));
    const distillGradient = q.map((qv, i) => lambda * temperature * (qv - p[i]));
    const gradient = taskGradient.map((g, i) => g + distillGradient[i]);
    return { p, q, contributions, kl, task, penalty, total: taskWeight * task + penalty, gradient, taskGradient, distillGradient, targetProbability: Math.exp(logQ1[target]) };
  }
  function update(logits, gradient, rate) {
    const next = logits.map((z, i) => z - rate * gradient[i]);
    // Softmax is translation invariant; centering avoids unnecessary logit drift.
    const mean = next.reduce((sum, z) => sum + z, 0) / next.length;
    return next.map(z => z - mean);
  }
  root.DistillMath = { logSoftmax, evaluate, update };
})(globalThis);
