import { notFound } from "next/navigation";
import { SpendDetail, SpendDetailHeader } from "@/components/blocks/SpendDetail";
import { getSpendDetail } from "@/lib/praxis.server";

export const dynamic = "force-dynamic";

export default async function SpendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const decodedId = decodeURIComponent(id);

  // The id is either a receipt object id (confirmed spend) or a Walrus blob id
  // (aborted spend, which has no receipt). getSpendDetail detects and branches,
  // so deep links keep working for both. Sealed blobs return a marker; the
  // client DecryptControl gates the reveal by the connected viewer.
  const detail = await getSpendDetail(decodedId);
  if (!detail) {
    notFound();
  }

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <SpendDetailHeader entry={detail.entry} />
      <SpendDetail entry={detail.entry} reasoning={detail.reasoning} />
    </div>
  );
}
