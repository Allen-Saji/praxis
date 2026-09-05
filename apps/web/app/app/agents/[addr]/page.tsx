import { notFound } from "next/navigation";
import { requireOwnerSession } from "@/lib/workspace-view.server";
export const dynamic = "force-dynamic";
export default async function RetiredPublicLookup() { await requireOwnerSession(); notFound(); }
