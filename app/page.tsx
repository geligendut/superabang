import Link from 'next/link';

export default function Home() {
  return <main>
    <h1>Superabang</h1>
    <p className="muted">PLAN → EXECUTE → LOG → ASSESS → DECIDE → NEXT ACTION</p>
    <div className="card"><h2>M1 — Training Loop Alpha</h2><p>Accepted for current dogfood. App database is not yet canonical.</p></div>
    <div className="card"><h2>B6 — Body & Progress</h2><p>Manual longitudinal weight and waist observations. No missing metric is inferred.</p></div>
    <div className="card"><h2>B7 — Training Progression</h2><p>Safety-gated deterministic progression review. Recommendations remain provisional and do not modify the current program automatically.</p></div>
    <div className="card"><h2>B8 — Nutrition Foundation</h2><p>Manual meal observations preserve partial coverage and nutrition uncertainty. Logged subtotals are never presented as complete daily totals.</p></div>
    <div className="card"><h2>B9 — Contextual Nutrition</h2><p>Qualitative next-meal guidance from explicit training context plus logged evidence, with provenance and uncertainty preserved.</p></div>
    <div className="card"><h2>B10 — Food Finder Foundation</h2><p>Real nearby restaurant discovery with menu-evidence gating, deterministic ranking, directions handoff and ephemeral location use.</p></div>
    <div className="row">
      <Link href="/workout/today"><button className="primary">Today&apos;s workout</button></Link>
      <Link href="/history"><button>History</button></Link>
      <Link href="/training-progression"><button>Training progression</button></Link>
      <Link href="/progress"><button>Body & Progress</button></Link>
      <Link href="/nutrition"><button>Nutrition</button></Link>
      <Link href="/nutrition/decision"><button>Contextual nutrition</button></Link>
      <Link href="/food-finder"><button>Food Finder</button></Link>
      <Link href="/auth"><button>Account</button></Link>
    </div>
  </main>;
}
