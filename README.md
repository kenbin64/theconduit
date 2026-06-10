# The Conduit: Water-System Telemetry and Health Monitoring

> Live demo: https://theconduit.me. The health engine is **HydroManifold**, the
> z = x·y monitoring core; The Conduit is the product built on it.

A functional, real-world-grounded simulation of water-system monitoring, from a
single home to a regional supply. It demonstrates how one monitoring framework
**scales** across every tier of water infrastructure, with real instruments,
real alarm thresholds, live EKG-style monitors, predictive warnings, and a
single health number per station computed on the manifold primitive **z = x·y**.

It runs entirely in a browser. No install, no build, no network — open
`index.html` (or serve the folder statically).

---

## What is actually real here

This is a *simulation*, but the engineering is not invented:

- **Sensors** (`sensors.js`) — real water-utility/SCADA instruments with
  representative specs: pressure transducers, electromagnetic & ultrasonic flow
  meters, AMI service meters, radar/submersible level, turbidity, pH, free
  chlorine, RTD temperature, acoustic leak loggers, pressure-transient loggers,
  pump vibration & motor-current monitors, valve-position feedback, freeze
  probes. Each carries cost, accuracy, MTBF (→ annual reliability), calibration
  interval, protocol, and whether it self-diagnoses.
- **Alarm bands** (`engine.js`) — operating windows reflect AWWA / Safe Drinking
  Water Act practice: e.g. distribution pressure 50–90 psi (low alarm <30),
  combined-filter turbidity ≤0.3 NTU (alarm >5), free chlorine residual ≥0.2
  mg/L, pH 6.5–8.5, freezing at 32 °F.
- **Physics** — diurnal demand (twin morning/evening peaks), pressure that sags
  with demand and crashes on a break, reservoir/tank drawdown integrated from
  inflow vs. outflow, buried mains held near ground temperature until a freeze
  event, chlorine residual decaying with time/heat, pump vibration/current as
  mechanical health.
- **Faults** — leak, main break, freeze/ice, pump trip, sensor fault, and water-
  quality upset, each with a realistic signature across the affected sensors.
- **Monitor the monitors** — every instrument has a trust value driven by
  calibration age and fault state; an untrusted sensor lowers station health and
  is flagged, because a reading you can't trust is itself a failure mode.

## The health manifold (z = x · y)

Every station collapses its sensor stack onto one health scalar:

```
x = SUPPLY ADEQUACY     (pressure · flow · reserves)
y = INTEGRITY & QUALITY (no leak/break/freeze · water in spec · sensors trusted)
z = x · y               overall health, 0..1
```

Multiplying — not averaging — is the honest choice: a station with perfect
pressure but contaminated water, or a main with great quality but an active
leak, is **not** healthy. A single failing axis must collapse the whole; a sum
would let a strong axis hide a failing one, which is exactly the bug you cannot
afford in drinking water. `z` then drives the **color spectrum** (red → amber →
green), the warning lights, and the alarm tiers everywhere in the UI.

## Scaling — a seed that blooms

The same station template (a stack of real sensors) is reused at every tier;
only the **count** and the duty change. A single home is one service connection
with 3 sensors; a city is ~62,000 stations and ~250,000 sensors of the exact
same kinds; a region is over a million.

This is dimensional programming's *seed → bloom*: a tier is stored as a small
seed (its composition + a few representative stations), and the full network is
only ever *bloomed* into the panels you actually look at. The UI reports the
**true** station/sensor/population/demand totals while simulating a
representative set — honest about scale without rendering a million divs.

Network monitoring complexity scales roughly with the square of interacting
nodes, so the scale axis is closer to **z = x·y²** than linear: doubling a
system more than doubles the cross-coupling its monitoring must reason about.
The point of the demo is that the framework absorbs that growth without being
reinvented — the worst station always dominates the system number, at any scale.

## Operating authorization & go-live (real-time operation gate)

The platform may always be **set up, tested and made ready in simulation**. It
will **not operate a real water system in real time** until two independent
conditions are both met — enforced in the Operations Center under
**⚙️ Deployment & Go-Live**:

1. **A signed operating authorization is installed.** Modeled on how U.S. public
   water systems are actually authorized under the Safe Drinking Water Act: the
   normal issuer is the **state drinking-water program holding primacy** (primary
   enforcement responsibility delegated by EPA under SDWA §1413 / 40 CFR Part
   142), not EPA directly. Three authorization types are recognized —
   `state-primacy`, `government-direct` (EPA where there is no primacy — Wyoming,
   DC, most tribal lands), and `delegated-operations` (a contract operator /
   satellite-managed / consecutive system operating a permitted PWSID on the
   holder's behalf). Each authorization carries a **PWSID**, system
   classification (CWS / NTNC / TNC), source type (GW / SW / GWUDI), and a named,
   **state-certified Operator in Responsible Charge (ORC)**. The token is signed
   by the issuing authority and verified locally; a forged, altered, expired, or
   ORC-less authorization is rejected.
2. **Commissioning is complete and every required test passes.** All sensor
   tech-specs and provenance must be in the CMS — entered **by API link, file
   transfer, or official documentation** (Component Onboarding) — and the
   mandatory regulatory prerequisites must be on file (Commissioning Checklist:
   sample siting plan per the RTCR, certified compliance lab, approved analytical
   methods, AWIA RRA+ERP for CWS > 3,300, CCR, cross-connection control, records
   retention, OT-cyber baseline). Documentation ingested into the CMS is turned
   **directly into tests** — no onsite reinterpretation: the system checks exactly
   what the manufacturer cut-sheets and the regulations require (NSF/ANSI/CAN 61
   & 372 on wetted compliance instruments, an EPA-approved method, current
   calibration, …).

**Staging → testing → deploy — software recommends, a named authority decides.**
The platform **does not make the final go/no-go call**; it monitors, alerts and
**recommends** (GO when every test passes, NO-GO otherwise) and lays out a
**risk/benefit briefing** for each open item (legal/public-health vs operational).
The **named authorizing authority** — the certified Operator in Responsible Charge
on the authorization, or an Administrator — is always the prevailing decider and
may accept the risk on any failing item. **Every exception requires a documented
purpose, a justification, AND a signed legal waiver**; it is sealed and logged
**by name**, and the resulting deploy is **PROVISIONAL** (visibly degraded). On
deploy, the CMS is ingested, applicable sensors/feeds are found and hand-shaken,
and active monitoring begins. **Connection state is color-coded: GREEN** connected
& good · **AMBER** establishing · **RED** disconnected · **BLACK** emergency
shutdown.

**Mandatory notification (not optional).** Any supply **shut down, drained, taken
offline, or reduced** — planned or unplanned — fires a **mandatory** notice to
**fire stations/chiefs, the regulator, and affected farms** (plus downstream /
consecutive systems, emergency management, and critical-care facilities), logged
immutably so no one can say they were not told and so municipalities can act on
their own contingency plans. Basis includes the SDWA **Public Notification Rule
(40 CFR Part 141 Subpart Q)** and local fire-flow / mutual-aid agreements. A
public, read-only view of **non-classified** supply status is **optional**; the
reporting is not. Notices are rendered as real messages (email envelope, ≤160-char
SMS, JSON webhook payload, CAP/IPAWS alert) and dispatched through a **pluggable
transport**. The demo ships a **SIMULATED** transport (renders + logs a delivery
receipt, sends nothing); a production SMTP / SMS / webhook / IPAWS adapter drops
in via one line — `HM_NOTIFY.configure({ transport })` — with **no call-site
changes**, so it is go-ready for retrofit if adopted.

**Emergency shutdown & firefighting diversion are pre-authorized.** Actions that
must work instantly in an emergency are authorized **beforehand** with a
**pre-signed certificate** bound to a holder's non-PII user-id and scope; in the
moment the holder just executes — the certificate verifies locally, no approval
delay. Sources identified as firefighting resources are likewise pre-authorized
for **immediate** diversion by a designated holder.

**Accountability.** Every login, view, edit and action is logged by a **non-PII
user-id + timestamp** into the hash-chained audit trail. Personnel who must be
alerted are routed by channel (email / SMS) and severity threshold from the
**Personnel, Access & Alerts** roster. Audible alerts are **optional and
off by default** (the 🔕 toggle).

> Principle: **software does not make final decisions — it alerts, recommends and
> assesses risk/benefit.** A named authorizing authority always holds the
> prevailing go/no-go, because rigid automation that can lock out a qualified
> human is itself a hazard. There are always exceptions — but every exception is
> owned by a named authority on the record, with a documented purpose,
> justification, and signed legal waiver.

## Make it yours — free-form, white-label, your build

HydroManifold imposes nothing on *content*. The water authority enters **its own**
information, documentation, regulations and sensor specs — by API link, file
transfer, or official documentation — and the **schema-driven** engine adapts the
interface to whatever is ingested: a new kind of record is just a schema, and a
full working module appears with **no rewrite and no redeploy**. The demo's data
and look are **one example**; the platform pre-fills the non-negotiable absolutes
(operating authorization, must-have sensors, mandatory prerequisites, mandatory
notifications) and **instructs** on them, while everything else is yours to build.
Pre-filled sensor panels are **canned samples** that real sensor data **replaces**
the moment you ingest a live instrument (set its *Data source* to a `live —`
option). See **ℹ️ Start here** in the Operations Center.

You can **theme** it (built-in palettes + your own accent color) and **white-label**
it — rename the product, set your own logo, call it whatever you choose. The one
mark every deployment keeps is **⨳ Powered by Butterflyfx Manifold**, which links
to full, citeable documentation and proofs.

### Why geometry? (the Butterflyfx Manifold paradigm)

Geometry here is an **organizing and communication language, not a speed trick** —
it does **not** make computation faster. A surface lets one bounded scalar `z`
summarize many inputs so a failure mode is visually legible to operators,
engineers and auditors alike. The model is small, deterministic, open in the
source, and fully documented under **⨳ Manifold paradigm & proofs**:

- **`z = x·y`** — health as a **product**, not an average: if either axis (supply
  adequacy / integrity) nears zero the whole collapses, so a strong axis can't
  hide a failing one. Honest analogues: series-system reliability `R = ∏ Rᵢ`
  (independent failures) and the Sprengel–Liebig law of the minimum.
- **`z = x·y²`** — the scale axis weights cross-coupling quadratically because the
  pairwise interactions among `n` nodes number `n(n−1)/2 = O(n²)`. Stated honestly
  as a **modeling choice** from that edge-count — not as a proven law (the popular
  "value ∝ n²" / Metcalfe's law is a contested heuristic).
- **Schwarz Diamond** and the triply periodic minimal surfaces (zero mean
  curvature, periodic on a 3-D lattice) — the geometry the paradigm is named for,
  with the standard **nodal approximations** shown and flagged as approximations,
  not the exact minimal surfaces.

Citations: Schwarz (*Ges. Math. Abhandlungen*, 1933); Schoen (NASA **TN D-5541**,
1970, the gyroid); Al-Ketan & Abu Al-Rub (*Adv. Eng. Mater.* 2019); Bobbert et al.
(*Acta Biomaterialia* 2017); Briscoe, Odlyzko & Tilly (*IEEE Spectrum* 2006). It is
**transparent, reproducible and auditable**: identical inputs give identical `z`,
the test suites pin the behaviour, and every parameter is signed, sealed and
hash-chained for FOIA/discovery.

## What you can do in the UI

- **Scale selector** — jump from single-family home to apartment, high-rise,
  hospital, arena, data center, power/nuclear plant, farm, township, reservoir &
  dam, city, and region.
- **Per-station monitoring stack** — health color bar with the live `z = x·y`,
  a live **sensor monitor** (control-room scope *look & feel*, but the trace is
  the station's real **hydraulic signature**, not a heartbeat: distribution
  pressure breathing with demand, pump/booster duty cycling, broadband turbulence
  that scales with flow; a main break shows a pressure sag with water-hammer
  ringing, a pump trip collapses supply to a quiet low line, a leak drifts down,
  a sensor fault drops out), every sensor reading with a warning light, and
  predictive notes.
- **Predictive ETAs** — reserve-depletion time, pressure-decline → leak warning,
  freeze ETA, chlorine-residual-to-minimum ETA, from live trend extrapolation.
- **Alarm log** — real-time, severity-tiered, de-duplicated.
- **Fault injection** — per-station or random, to watch the monitoring respond.
- **Sensor catalog** — the real instruments in play, with cost, reliability,
  accuracy, and self-diagnostic capability.

## Files

| File | Role |
|---|---|
| `index.html` | App shell + layout |
| `styles.css` | Control-room styling |
| `sensors.js` | Real instrument catalog (specs, cost, MTBF) |
| `manifold.js` | `z = x·y` health model + color spectrum + status tiers |
| `topology.js` | Scaling tiers → station hierarchies (seed → bloom) |
| `engine.js` | Simulation: physics, faults, alarm bands, predictive, sensor-trace |
| `app.js` | Live-monitoring UI controller + render loop + sensor-trace drawing |
| `license.js` | Operating-authorization engine: verify, commissioning, test suite, two-tier deploy gate, pre-signed capability certs, operating mode |
| `deploy.js` | Connection-state model (GREEN/AMBER/RED/BLACK) + deploy handshake |
| `platform/people.js` | Non-PII identity, email/SMS alert routing, optional sound |
| `platform/notify.js` | Notification dispatch — simulated email/SMS/webhook/IPAWS transport, go-ready for real adapters |
| `theme.js` | Theming + white-label branding (built-in palettes, custom accent, rename/logo) |
| `platform.js` | Operations Center (CMS) controller incl. ⚙️ Deployment & Go-Live |
| `tools/issue-authorization.js` | Authority-side issuer for signed authorization tokens (+ samples) |
| `tools/test-license.js` | Node tests for the authorization / commissioning / deploy gate |

## Testing — proven, not asserted

One command runs everything: `node tests/run.js` (**123 checks**, exit 0 = green).

- **Unit** (`tests/unit-platform.test.js`) — the tamper-evident spine: manifold
  seal (sign/verify, shape-fold chaining, encryption), hash-chained audit (with
  tamper pinpointing), RBAC least-privilege/zero-trust, the failsafe-AI invariants
  & drift quarantine, the registry, alert routing, connection-state machine,
  notification rendering, and the analytics (least-squares, σ).
- **Geometry / science proofs** (`tests/geometry.test.js`) — *proves* the paradigm
  numerically: `z = x·y` collapses on any failing axis (and would-be averaging is
  shown to be the bug); `z = x·y²` is justified by the `C(n,2)=O(n²)` combinatorics;
  series reliability `R = ∏Rᵢ` is weakest-link; and the **Schwarz P/D & Gyroid**
  surfaces are shown to be **triply periodic** and **minimal** (mean curvature ≈ 0
  on the level set — measured mean&#124;H&#124; ≈ 0.02–0.10 vs ≈ 1.0 for a control
  sphere, a ~59× discrimination).
- **Scenarios** (`tests/scenarios.test.js`) — catastrophic multi-fault collapse and
  recovery, worst-point dominance, failsafe quarantine that won't silently clear,
  end-to-end tamper-evidence, and the go-live gate refusing a lapsed prerequisite.
- **Stress** (`tests/stress.test.js`) — region scale (millions of sensors, bounded
  render), 5 000-tick stability, audit/seal under thousands of events, performance
  bounds, and a fault in *every* station at once.
- Plus the original engine suite (`test_suite.js`, 27) and the licensing / go-live
  gate suite (`tools/test-license.js`, 36).

## Honest limits

It is a simulation, not a live SCADA connection; sensor specs and thresholds are
representative of the industry, not any one utility's settings. The value it
demonstrates is the architecture: real instrumentation, an honest health model,
predictive alarming, and a framework that provably scales from one home to a
region.

The authorization / capability signatures use a dependency-free keyed digest so
the gate runs end-to-end with no build step; a production deployment verifies
**Ed25519 / X.509** signatures chaining to the issuing authority's published key
(the client holds only the public key, so tokens cannot be forged) and uses
AES-256-GCM at rest via WebCrypto/HSM — the model is identical. The regulatory
citations are the **federal floor**; a state primacy agency's rules can be
stricter and are what actually bind a given system, so treat the checklist as a
template to confirm against your jurisdiction, not legal advice.

---

© 2026 Kenneth W. Bingham — portfolio piece.
