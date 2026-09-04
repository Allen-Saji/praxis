"use client";
import { Button } from "@/components/primitives/Button";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="mx-auto max-w-lg py-16 text-center"><h1 className="font-display text-2xl font-semibold">Control plane unavailable</h1><p className="mt-2 text-[13px] text-[var(--text-mid)]">Workspace data could not be loaded. No execution state was changed.</p><Button className="mt-5" onClick={reset}>Try again</Button></div>; }
