import { redirect } from "next/navigation";
import { defaultWorkspacePath } from "@/lib/workspace-view.server";
export const dynamic = "force-dynamic";
export default async function AgentsPage() { redirect(await defaultWorkspacePath("/agents")); }
