import Link from "next/link";

export default function NotFound() {
  return (
    <main>
      <div className="card" style={{ maxWidth: 560, margin: "48px auto", textAlign: "center", padding: 32 }}>
        <div className="eyebrow">Not found</div>
        <h1 style={{ marginTop: 6 }}>That view is not in the demo</h1>
        <p className="secondary">The state, LGA or facility may not be covered. Twelve states are available, two per geopolitical zone.</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
          <Link className="btn primary" href="/signin">Choose a portal</Link>
          <Link className="btn" href="/">Home</Link>
        </div>
      </div>
    </main>
  );
}
