import Link from "next/link";

export const metadata = {
  title: "Admin Login | ConferenceHype"
};

export default function AdminLoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-paper px-5">
      <form
        action="/api/admin/login"
        method="post"
        className="w-full max-w-md border border-ink/10 bg-white p-6 shadow-panel"
      >
        <h1 className="text-3xl font-black text-ink">Operator login</h1>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Enter the admin shared secret configured in Vercel or `.env.local`.
        </p>
        <input type="hidden" name="next" value="/admin" />
        <label htmlFor="admin-secret" className="mt-5 block text-sm font-black uppercase text-ink">
          Admin secret
        </label>
        <input
          id="admin-secret"
          name="secret"
          type="password"
          required
          className="mt-2 w-full border border-ink/20 px-3 py-3 outline-none focus:border-broadcast"
        />
        <button className="mt-4 w-full bg-ink px-4 py-3 text-sm font-black uppercase text-white">
          Sign in
        </button>
        <Link
          href="/"
          className="mt-4 inline-flex text-sm font-bold text-broadcast"
        >
          Back to public site
        </Link>
      </form>
    </main>
  );
}
