# Distill

A responsive, interactive website explaining the self-distillation objective in [Why Fine-Tuning Encourages Hallucinations and How to Fix It](https://arxiv.org/abs/2604.15574), Kaplan et al. (2026), §4.1, equations 1–2.

## Run

Open `index.html` directly in a browser, or serve the directory:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then visit http://localhost:8000. No build, package installation, API key, or model is needed. Google Fonts is optional; system fonts work offline.

## Explore

- Start with **KL only** to see the student approach the teacher. Compare **SFT only** and **Combined** from the same starting distribution. The paper uses Combined; the isolated modes are teaching aids.
- One fixed synthetic example keeps the comparison focused: the teacher favors Italy, while the training target is Greece. There is no scenario selector.
- Adjust λ and τ; paper defaults are 1 and 0.5.
- The main chart now defaults to ordinary probabilities at T = 1. Select the KL distribution view to see probabilities at the distillation temperature. This view switch never changes the objective, logits, or training history.
- Inspect probability bars, individual signed KL contributions, and loss totals.
- Edit raw teacher/student logits or set the student equal to the teacher.
- Run or step actual gradient descent; compare against an independently trained SFT-only student.
- Open **Paper cartoons** for four illustrated parameter/data ablations, with the exact Table 1 accuracies and explicit frozen-versus-trainable labels. Direct link: https://model1.enrica.ai/#paper-cartoons. These are schematic memory aids, not simulated experimental results.
- Download the trajectory as CSV or open “Behind the math” for the full objective.

The task term is cross-entropy at temperature 1. The penalty is λτ² KL(teacher || student), with both distributions evaluated at τ. The combined analytic student-logit gradient is `q_1 - one_hot(target) + λτ(q_τ - p_τ)`. Calculations use stable log-softmax and natural logarithms. KL-only removes the task gradient; SFT-only removes the KL gradient. The raw-KL tracker shows drift even when total loss decreases, and the next-step panel separates both contributions to the target logit. Switching modes resets the student to the shared starting distribution; the paper-objective button selects Combined and restores λ and τ. Parameters or logit edits pause training and restart history from the current student; Reset student restores the shared initial student. Training stops at 500 steps. Teacher logits remain frozen during training, but can be edited manually for experiments.

The five-token example is synthetic. This single-position optimization does not reproduce LLM training, shared-parameter interference, the paper's learning curves, or hallucination rates. The paper's full loss averages over non-padded positions and batches. The dashed baseline is task cross-entropy, not the regularized total objective.

## Files

- `index.html`: accessible page structure and explanation.
- `styles.css`: responsive layout and charts' presentation.
- `math.js`: pure numerical routines shared with tests.
- `app.js`: interactions, SVG charts, training, and export.
- `tests.html`: dependency-free mathematical regression tests; open in a browser.

## Hosted demo

Live at https://model1.enrica.ai. The existing Cloudflare tunnel routes the hostname to `http://localhost:8083`.

The enabled user service `distill-demo.service` runs `serve.py`, binds only to loopback, serves an explicit list of public assets, and restarts on failure. User lingering is enabled so the service runs without an active login and starts after reboot.

```sh
systemctl --user status distill-demo
systemctl --user restart distill-demo
journalctl --user -u distill-demo
```

HTML, CSS, and JavaScript changes are served directly; no build or restart is needed for asset edits.

The HTTP server fingerprints JavaScript and CSS URLs using their content hashes when serving HTML. Normal reloads fetch the current assets even if a browser has older unversioned scripts cached. HTML and assets send no-store headers to browsers and CDNs. Run `python3 -m unittest -v test_serving` to verify asset versioning and response behavior.

The mode controls are synchronized with the objective state on every render and page restoration. The loss arithmetic explicitly shows excluded terms as zero; the full-gradient indicator distinguishes a stationary point from a zero loss or the 500-step limit.

Advanced student-logit edits and “Start student at teacher” update the shared initialization used by every mode and Reset student. “Restore fixed example” restores the original teacher and student distributions.

Every simulated step repeats the same fixed prompt, target, and teacher distribution. It computes the selected objective and updates student logits; it does not generate a sampled answer. The 500-step limit does not imply convergence.
