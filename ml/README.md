# Closer AI: wellbeing triage for hospitalized children

Every evening, for every hospitalized child in Closer, this module estimates how the child is doing (stable, fragile
or in distress). It alerts the psychologist when a child needs support, and says why.

**All data here is fictional.** It is a triage aid for a psychologist, never a diagnosis: the child sees nothing,
and a person decides every time.

```text
 signals (SQLite)        belief                  shield                  decision                 for the psychologist
 ───────────────     ──────────────     ─────────────────────     ─────────────────────     ─────────────────────────
 check-ins, notes ─► additive model ─►  crisis rules  ─────────────────────────────────────► URGENT alert
 drawings, media      P(stable,          "I'd like to talk"  ───────────────────────────────► priority alert
 visits, context      fragile,           Claude 2nd reading ────────────────────────────────► (can only add)
 engagement           distress)  ──────────────────────────► RL agent (PPO, lambda) ───────► digest / priority / ask
                      + reasons                              Whittle index, tree rule ─────► ranked inbox
                                                                                              + Claude's daily
                                                                                              summary per child
                         ▲                                                                            │
                         └────────────── psychologist's review = labels for the next round ───────────┘
```

## In 60 seconds

1. **The problem.** One psychologist covers a whole ward. Children in distress often don't say so, and some hide it
   behind good moods. Rules like "3 low moods in a row" miss those children and still flood her with alerts.
2. **The approach.** An interpretable model estimates each child's state from what they share in Closer. Claude
   reads their notes and drawings. A reinforcement-learning agent decides who deserves her limited time. Safety
   rules sit outside the agent, so it can never silence a crisis.
3. **The result** (simulated children, details in [RESULTS.md](RESULTS.md)). At the same psychologist workload, the
   RL agent leaves **17% fewer days of unsupported distress** than a tuned threshold on the same belief (95% CI:
   −27% to −7%), and it stays ahead on four simulators nobody tuned on. Across a 20-bed ward, ranking children by
   its Whittle index cuts unsupported distress days by **20–23%** compared with seeing the highest-risk children
   first. The spec's current rules reach a similar harm only by sending twice the alerts, three quarters of them
   unneeded.
4. **Trust.** Every alert comes with the signals behind it (the model's exact reasoning, not a post-hoc guess) and the
   rule the agent followed (a decision tree distilled from the network). Every child, alerted or not, gets a short
   daily summary written by Claude from those facts and from what the child shared.

## Results at a glance

Simulated children, test and validation cohorts never seen in training. Full report: [RESULTS.md](RESULTS.md).

| | Result |
|---|---|
| Belief | AUC 0.92 for distress, 0.86 for fragile-or-distress, calibrated; the explainable model matches gradient boosting |
| RL agent vs tuned threshold, same workload | **−17%** unsupported distress days (95% CI −27% to −7%) |
| RL agent vs hand-written "ask when unsure" rule | tie at a 0.4 budget; **−11 to −19%** when the budget is tight (0.15–0.3) |
| Shifted simulators (masking, fewer notes, more stress, no family) | the agent stays ahead of the threshold in all four |
| Ward of 20 beds, Whittle index vs highest P(distress) | **−20%** (1 visit a day), **−23%** (2 visits a day) |
| Indexability | 100% of sampled states |
| Distilled tree (VIPER) | 20 rules; still better than the threshold, with less workload |
| Safety rules alone | 73% of crisis notes caught, 0 false crisis on 14,000+ ordinary notes; the misses are indirect phrasings |
| Claude as second reader (live run, 80 notes, 40 of them with planted crisis or strong statements) | **100% of crisis notes** caught, against 53% for the rules on the same notes; 0 false alarm on the 40 ordinary notes |

![Trade-off curves](RESULTS_tradeoff.svg)

![What the agent does, by belief and price of an alert](RESULTS_policy_map.svg)

## Why reinforcement learning, and where

The assessment is supervised: estimating a hidden state from noisy signals is a belief, not a decision. The
**alerting** is a sequential decision problem with real trade-offs, so that part uses RL:

- an alert sent too late leaves a child alone with their distress, while too many alerts wear out the psychologist,
  who then stops reading them;
- the psychologist's time is limited (a budget of alerts per week);
- decisions change the future: a visit helps the child, and the next observation depends on it;
- the agent can **gather information** before acting by asking a gentle validated question, which is worth it only
  when the belief is uncertain.

We never explore on real children: the agent is trained in a simulator of fictional stays, and deterministic rules
that it cannot override protect the cases that matter most.

## The formulation

| | |
|---|---|
| Model | Constrained POMDP, one decision per child per evening |
| Hidden state | stable, fragile or distress. Driven by stressors (big days, isolation, days without family, pain, length of stay) and support (family visits, the psychologist's visits after an alert) |
| Belief | The assessor's P(stable, fragile, distress), from 71 causal features (the nurse's round included) compared with the child's own habits |
| Actions | wait · digest alert · priority alert · ask a gentle validated question (8 years and up) |
| Reward | − 1 per day in distress before a psychologist knows, − 0.1 per fragile day with no contact, − 0.05 per question asked |
| Constraint | Psychologist workload (digest 1 unit, priority 1.5) under a weekly budget, through Lagrangian relaxation: reward − λ · workload |
| Shield | Crisis statements and "I'd like to talk" always alert. The action mask forbids alert spam and questions for young children. The agent can make the system more attentive, never less |

### The RL ideas, and the problem each one solves

| Idea | The problem it solves here |
|---|---|
| **Lagrangian duality, CMDP** | The psychologist's time is a hard budget, not a penalty to tune. λ is the shadow price of one workload unit, in "days of unsupported distress" |
| **λ-conditioned policy (multi-objective RL)** | λ is sampled per episode and given to the network, so one training run learns the whole Pareto front. At deployment, λ is set to meet the budget |
| **Neural Whittle index (restless bandits)** | One psychologist, a whole ward. A child's index is the highest price at which the agent still asks for a visit. Rank children by index and visit the top *k*. Indexability is measured, not assumed |
| **Belief-state POMDP, information gathering** | The assessor is the learned belief filter. The "ask" action buys information for a small burden: value of information, learned rather than hand-tuned |
| **Shielded RL, action masking** | Safety rules sit outside the policy (Alshiekh et al. 2018): no amount of training can remove an urgent alert |
| **VIPER (Bastani et al. 2018)** | The network is distilled into a small decision tree by Q-weighted DAgger, with Q estimated by rollouts on cloned environments and the PPO critic. The result can be printed, audited and vetoed rule by rule |
| **Domain randomization, common random numbers** | Simulator parameters are randomized in training, shifted simulators test robustness, and every policy runs on the same children with the same draws, so paired bootstraps are tight |
| **Risk-sensitive reporting (CVaR)** | Averages hide the children who are worst served, so we report the worst 10% |

## What we learned building it

- **The agent first refused to ask questions, and it was our fault.** In its first version, the answer to a gentle
  question only reached the agent as a raw score. The agent never asked, so it never saw an answer and never learned
  what one was worth: a classic exploration trap. Folding the answer into the belief with Bayes' rule, using the
  scale's known answer distribution, is what a POMDP calls for anyway. It gave the agent something it already knew
  how to act on. Since then it asks questions, and asks more as the psychologist's time gets more expensive (see
  the policy map below). The questions help most when the budget is tight (7 to 8% fewer unsupported distress days
  at 0.15–0.2 units per child-week) and little at a generous one (3%, not significant on the test cohort).
- **The agent rediscovered a heuristic, then went further.** A hand-written "ask when unsure, alert when sure"
  rule ties with the agent at the 0.4 budget. When the psychologist's time is scarce, the agent beats it by 11 to
  19%, and it does so for every budget from one network, without anyone tuning the rule.
- **Claude's evaluation found a bug in our own rules.** Measuring Claude against the lexicon showed the rules missed
  "i want to hurt myself": the pattern did not allow the "to". Fixed and covered by tests. The point stands even after
  the fix: indirect goodbyes ("i wrote goodbye letters for everyone") are invisible to word rules, and Claude caught
  all of them.
- **Explainable did not cost accuracy.** The additive model matches gradient boosting on held-out children, so
  nothing had to be traded for the per-signal explanations.
- **One network per budget would have been the wrong design.** Conditioning on λ gives the whole trade-off curve,
  the deployment knob for any weekly budget, and the Whittle index for a ward, from a single training run.

## Questions a jury will ask

**Why not a classifier with a threshold?** That is our baseline, tuned at the same workload. A classifier estimates
the state; the agent decides when an alert is worth the psychologist's time. It knows that a visit changes what
happens next, that an episode already supported needs no second alert, and that a question can be cheaper than an
alert.

**Could the agent hide a crisis to save budget?** No. Crisis statements and the child's own request are handled by
rules outside the agent, which can only add alerts on top. The action mask is a second guard.

**Isn't it just learning your simulator?** Partly, and we say so. Training randomizes the simulator, and the
evaluation runs on shifted simulators nobody tuned on. On real data, the next step is offline: log decisions and the
psychologist's reviews, evaluate any new policy off-policy, then improve it with conservative offline RL. Nothing
explores on children.

**Why not let Claude decide?** Claude is an excellent reader and writer, so that is what it does here. Deciding
under a weekly budget is a sequential optimization with measurable trade-offs: that is the RL agent's job, under rules
it cannot override, with a human deciding every time.

**How does it scale to a ward?** With the Whittle index: each evening, rank children by the price at which the agent
would still ask for a visit, and give the psychologist's slots to the top of the list.

## What the AI reads

New data fields, all optional for the child. The UI can offer one or two a day so the check-in stays light.

| Signal | Fields | Why it matters |
|---|---|---|
| Mood check-in | mood 1–5, feelings chips (happy, calm, proud, excited, tired, bored, sad, lonely, angry, scared, worried), activity, meal | The base signal, compared with the child's own usual level |
| Sleep | rating 1–5, nightmares | Sleep problems go along with anxiety and low mood. Time in the app at night is a passive proxy |
| Pain, worries | pain 0–10 and worry 0–4 on faces scales, worry topics (procedure, needles, home, alone, night, school) | Separate physical discomfort and anticipatory fear from psychological distress |
| "I'd like to talk to someone" | one chip | The child's own request: it always raises a priority alert |
| Notes | 280 characters | Read by a lexicon and, optionally, by Claude |
| Drawings | count of all drawings; for drawings the child **chose to share**: their emoji, themes, title and image | Drawing less than usual (losing interest), the themes the child picked (home, alone…). No projective interpretation of the picture |
| Films, series, cartoons, music, games, books | kind, minutes, with whom, enjoyment 1–5, rewatch | Media alone vs. with family, enjoying less than usual, comfort rewatching |
| People | family and friend interactions in the app, nudges and replies, in-person visits by kind | Isolation is one of the strongest stressors |
| Engagement | minutes in the app, comfort cards opened, question of the day answered | Withdrawal, not content |
| Care context (care team) | big day, protective isolation, roommate left, room change, discharge planned, visit restrictions | Explains expected dips. Never a diagnosis or a treatment |
| Validated scales | score from a short scale chosen by the psychologist | The answer to the "ask" action, and a strong label |
| Nurse's round (care tab) | lunch and dinner eaten (all, half, a little, nothing, fasting), how the child looked (calm, cheerful, sad, tearful, anxious, withdrawn, irritable, agitated, tired), engagement during care, pain score 0–10, last night's sleep, refused care, visitors, a note, and "I'd like the psychologist to see this child" | A second view, independent of the app: brief, often skipped, but harder to fool for a child who hides distress behind good moods. The nurse's request always raises a priority alert, and the note goes through the safety rules and Claude like the child's |
| Ward menu (care tab) | today's lunch and dinner | The baseline for appetite: the model compares what the child ate with what the *other* children ate of the same dish, so a dish nobody liked is not read as a lost appetite |

App usage the store never received (minutes, nudges, family messages) stays unknown, never zero: "no data" must
not read as "no family contact". In simulation, adding the nurse's round raises the assessor's AUC for distress from
0.927 to 0.949 (500 held-out children; quick check, not in RESULTS.md).

**Never read:** comfort card and question-of-the-day contents, photos, unshared drawings, and anything biometric.
Faces in photos and voice are excluded: emotion recognition from biometric data is high-risk under the EU AI Act,
and the gain would be marginal.

## Claude's role

Claude makes the analysis better without becoming a single point of failure:

- **Second reader** (`--claude`). It reads each note and each shared drawing's title and returns structured signals
  (structured outputs): a safety level, eight feeling intensities and the words behind them. It catches what a
  lexicon cannot, such as indirect goodbyes ("j'ai écrit un mot pour dire au revoir à tout le monde"). It can only
  **add**: each signal is the maximum of the lexicon's and Claude's readings, so Claude sharpens the belief the
  agent sees, and a flag from either one raises the alert. Readings are cached in SQLite, so each note is read once.
- **Daily summary for every child.** Every evening, Claude writes at most three sentences per child for the
  psychologist: how the child seems to be doing and the trend, the signals that matter (sometimes in the child's own
  words), and the decision with one thing worth checking. It works only from the computed facts (belief, the
  assessor's top signals, the tree rule, the urgency index) and from what the care team can already read (moods,
  extras, recent notes and shared drawings, care context). It never diagnoses. The summary is stored with the
  assessment, so the psychologist has a short note for every child, not only for the alerted ones.
- **Drawings, by vision.** `ClaudeReader.read_drawing` reads the image of a shared drawing: what is drawn, its
  themes, and any safety concern, with no projective interpretation. It is implemented but not wired yet, because
  the store does not keep image files. That is the next step once the app uploads drawings.
- **Robust by design.** Model `claude-opus-5-5` (override with `CLOSER_CLAUDE_MODEL`), with server-side refusal
  fallback (`fallbacks="default"`). Access is checked at startup through the Models API, which costs no tokens. On a
  refusal, an API error or a missing key, the job carries on with the lexicon and a template summary.

With real children, sending notes to an external API would first need guardian consent and a data processing
agreement.

## In the app: the care tab

The nurse (Sarah in the demo) sees the AI's read of each child and adds what only the care team sees.

- **Patients** (`/care`): Claude's summary for every child, the ones who need support first, an "AI reading" column
  in the table, and today's ward menu.
- **Patient page**: today's summary (level, chance of distress and its 3-day trend, what weighs most, the decision,
  14 days of readings, the alerts sent to the psychologist) next to the nurse's round. Saving the round re-runs the
  job for that child and the summary updates in about 10 seconds.

```
browser ──> Next.js server ──(RLS: may Sarah see this child?)──> Supabase
                  │
                  └──(shared secret, localhost)──> python -m closer_ai serve ──> SQLite ──> assessor, shield, agent, Claude
```

The app stays the source of truth for what the child shares; the Next.js server forwards the check-ins it may read
(never photos or reactions), then the nurse's round and the menu. The browser never talks to the AI service. A child's
assessment is recomputed only when their inputs changed, and within a day a decision can only escalate: an alert or a
question already sent stands.

To run it locally, with `CLOSER_AI_URL=http://127.0.0.1:8787` and a random `CLOSER_AI_TOKEN` in the repo's
`.env.local` (both processes read it):

```bash
cd ml && python -m closer_ai serve      # the AI service; --no-claude for template summaries
npm run dev                             # in another terminal, from the repo root; choose "Care team"
```

The first visit reads every child's notes once (about 30 s with Claude); after that, pages load in about a second.
Without the service (on a Vercel preview, for example), the care tab says so and everything else works.

## Run it

Python 3.10+. On the school machines, home quotas are small: put the environment in `/tmp`. For `--claude`, put
`ANTHROPIC_API_KEY=...` in the repo's git-ignored `.env.local` (as in `.env.example`): the CLI reads it from there.

```bash
cd ml
python -m venv /tmp/closer-ai-env && source /tmp/closer-ai-env/bin/activate
pip install torch --index-url https://download.pytorch.org/whl/cpu   # CPU is enough
pip install -e ".[dev]"
pytest                                   # ~35 s

python -m closer_ai demo                 # 16 fictional children, today's decisions, and the hidden truth
python -m closer_ai demo --claude --language French   # with Claude reading notes and summarizing each child
```

Day to day, on a local SQLite file (`ml/data/closer_ai.sqlite`, git-ignored):

```bash
python -m closer_ai seed --children 30           # fictional children (an app would write these tables)
python -m closer_ai run                          # the evening job: assessments and alerts written to SQLite
python -m closer_ai alerts                       # the psychologist's inbox
python -m closer_ai review --alert 3 --outcome support_needed --by "Dr. Martin"   # a label for retraining
```

Retrain and re-evaluate (CPU only, about 1 h 15 on 16 cores):

```bash
python -m closer_ai train-assessor               # 4,000 simulated stays, ~30 s
python -m closer_ai train-policy                 # 5M steps of PPO, ~25 min
python -m closer_ai train-policy --no-ask --out artifacts/policy_no_ask.zip   # the ablation, same budget
python -m closer_ai evaluate                     # RESULTS.md + charts, policy.json (lambda for the budget), the tree
python -m closer_ai eval-reader --n 80           # lexicon vs Claude on planted notes (one API call per note)
```

`artifacts/` holds the trained models (about 1 MB). They were trained with the library versions in `pyproject.toml`
(scikit-learn 1.9, stable-baselines3 2.9).

## Code map

| File | Role |
|---|---|
| `contract.py` | The data contract shared by the simulator and the store, plus the chip vocabularies |
| `store.py` | SQLite store (standard library `sqlite3`): signals in, assessments, alerts and reviews out |
| `simulator.py`, `notes_gen.py` | Fictional children: hidden states, reporting styles, masking, treatment fatigue, notes in French and English |
| `text.py`, `safety.py` | Note lexicon with negation and idioms; deterministic crisis and concern rules |
| `features.py`, `assessor.py` | 71 causal features; additive spline model with exact per-feature explanations |
| `policy/env.py`, `policy/obs.py` | The constrained POMDP as a Gymnasium env; observation and mask shared with production |
| `policy/train.py`, `policy/baselines.py` | λ-conditioned MaskablePPO; spec rules, thresholds, value-of-information heuristic, oracle |
| `policy/whittle.py`, `policy/distill.py` | Neural Whittle index and ward simulation; VIPER extraction |
| `evaluate.py`, `report.py` | Cohorts, metrics, paired bootstrap, the full report |
| `claude.py`, `pipeline.py`, `cli.py` | Claude reader and daily summaries; the evening job; the command line |
| `bridge.py`, `server.py` | The app's vocabulary mapped to the contract; the care tab's local JSON API (standard library) |

## Limits, honestly

- **Everything is simulated.** The simulator encodes our assumptions about hospitalized children. A psychologist
  must review it and set the costs (one day of delay vs. one false alarm) before the numbers mean anything.
- **Notes are synthetic.** The same person wrote the note templates and the lexicon, so the lexicon's scores on
  them are optimistic. Claude's 100% comes from 80 notes, 17 of them with crisis language: a strong signal, not a
  clinical figure.
- **Toward real data.** Only alerted children get reviewed (selective labels), so routine screenings and the
  psychologist's manual reports (`psy_manual` alerts) are needed for unbiased labels. A new policy would first be
  evaluated off-policy (importance sampling or doubly robust estimators on logged decisions) and improved with
  conservative offline RL, never by exploring on children.
- **Regulation.** Used for real, a system like this would probably be a medical device (software for monitoring)
  and high-risk AI under the EU AI Act. It would process health data of minors (GDPR article 9, HDS hosting in
  France). It is designed as a triage aid with a human decision every time, and documented as such.
