import { redirect } from "next/navigation";

import { isPathSlug } from "@r0ute/database";

async function openPath(formData: FormData) {
  "use server";
  const id = String(formData.get("id") ?? "")
    .trim()
    .toLowerCase();
  if (isPathSlug(id)) {
    redirect(`/p/${id}`);
  }
}

export default function HomePage() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-8 px-4">
      <div className="text-center">
        <h1 className="m-0 font-mono text-4xl font-bold tracking-tight text-cyan-400">r0ute</h1>
        <p className="mt-2 max-w-sm text-sm text-neutral-400">
          Send <span className="font-mono text-neutral-200">path</span> on a monitored MeshCore
          channel and the bot replies with a link. Or enter a path ID below.
        </p>
      </div>
      <form action={openPath} className="flex gap-2">
        <input
          name="id"
          pattern="[a-zA-Z0-9]{5,8}"
          required
          placeholder="path ID"
          aria-label="path request ID"
          className="w-36 rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 font-mono text-sm text-neutral-100 placeholder:text-neutral-500 focus:border-cyan-400 focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-md bg-cyan-400 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-cyan-300"
        >
          View
        </button>
      </form>
    </main>
  );
}
