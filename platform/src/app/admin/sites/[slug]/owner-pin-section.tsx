import { getTenantOwnerPin } from "@/lib/tenant-api";
import { OwnerPinPanel } from "./owner-pin-panel";

/** Network lookup streams independently; it must not block opening the site card. */
export async function OwnerPinSection({ slug }: { slug: string }) {
  return <OwnerPinPanel slug={slug} initialPin={await getTenantOwnerPin(slug)} />;
}
