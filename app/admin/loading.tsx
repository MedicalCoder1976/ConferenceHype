export default function AdminLoading() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5">
      <div className="w-full max-w-lg border border-ink/10 bg-white p-6 shadow-panel">
        <div className="text-xs font-black uppercase tracking-[0.18em] text-broadcast">
          ConferenceHype operator desk
        </div>
        <h1 className="mt-2 text-3xl font-black text-ink">Opening admin</h1>
        <p className="mt-3 text-sm leading-6 text-ink/65">
          Loading the current broadcast queue and source inventory?
        </p>
        <div className="mt-5 h-2 overflow-hidden bg-ink/10">
          <div className="h-full w-2/3 animate-pulse bg-broadcast" />
        </div>
      </div>
    </main>
  );
}
