import Link from 'next/link';

export default function Home() {
  return <main>
    <h1>Superabang</h1>
    <p className="muted">PLAN → EXECUTE → LOG → ASSESS → DECIDE → NEXT ACTION</p>
    <div className="card"><h2>M1 — Training Loop Alpha</h2><p>Foundation scaffold active. Synthetic data only.</p></div>
    <div className="row">
      <Link href="/workout/today"><button className="primary">Today&apos;s workout</button></Link>
      <Link href="/history"><button>History</button></Link>
      <Link href="/auth"><button>Account</button></Link>
    </div>
  </main>;
}
