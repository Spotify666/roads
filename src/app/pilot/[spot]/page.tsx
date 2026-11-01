import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LAB_SPOTS, LabPage, labMetadata, loadCorridor } from "../LabPage";

type Params = { params: Promise<{ spot: string }> };

// one prerendered page per spot, so the Lab opens instantly and links to it prefetch
export const dynamicParams = false;

export function generateStaticParams() {
  return LAB_SPOTS.map((spot) => ({ spot }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const c = loadCorridor((await params).spot);
  return c ? labMetadata(c) : {};
}

export default async function SpotLabPage({ params }: Params) {
  const c = loadCorridor((await params).spot);
  if (!c) notFound();
  return <LabPage corridor={c} />;
}
