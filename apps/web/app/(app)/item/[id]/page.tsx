"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ItemDetail } from "@/components/item/ItemDetail";

export default function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  return (
    <div className="flex min-h-0 flex-1 flex-col md:h-dvh">
      <ItemDetail id={id} full onClose={() => router.back()} />
    </div>
  );
}
