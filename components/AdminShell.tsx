import { RadioTower } from "lucide-react";
import Link from "next/link";

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper">
      <header className="border-b border-ink/10 bg-white px-5 py-5 md:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 place-items-center bg-ink text-white">
              <RadioTower className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-ink">
                ConferenceHype operator desk
              </h1>
              <p className="text-sm font-semibold text-ink/60">
                Verified-source reporter coverage, source intake, and stream
                control.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/station" className="border border-broadcast px-4 py-2 text-sm font-bold text-broadcast">
              Station controls
            </Link>
            <Link href="/" className="border border-ink px-4 py-2 text-sm font-bold text-ink">
              Public channel
            </Link>
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-5 py-7 md:px-8">
        {children}
      </section>
    </main>
  );
}
