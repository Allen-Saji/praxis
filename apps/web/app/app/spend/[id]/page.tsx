import { notFound } from "next/navigation";
import { SpendDetail, SpendDetailHeader } from "@/components/blocks/SpendDetail";
import { getReceiptById, getReasoning } from "@/lib/praxis.server";

export const dynamic = "force-dynamic";

export default async function SpendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const receiptId = decodeURIComponent(id);

  const receipt = await getReceiptById(receiptId);
  if (!receipt) {
    notFound();
  }

  // Reasoning is fetched here too. Sealed blobs return a marker and the client
  // DecryptControl gates the reveal by the connected viewer.
  const reasoning = await getReasoning(receipt.blobId);

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-6">
      <SpendDetailHeader receipt={receipt} />
      <SpendDetail receipt={receipt} reasoning={reasoning} />
    </div>
  );
}
