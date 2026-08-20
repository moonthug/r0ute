import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4">
      <h1 className="m-0 font-mono text-2xl font-bold text-neutral-100">Path not found</h1>
      <p className="text-sm text-neutral-400">
        That path request doesn&apos;t exist — check the ID from the bot&apos;s reply.
      </p>
      <Link href="/" className="text-sm text-cyan-400 hover:text-cyan-300">
        ← back
      </Link>
    </main>
  );
}
