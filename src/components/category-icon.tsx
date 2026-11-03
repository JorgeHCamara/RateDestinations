import {
  Beer,
  Binoculars,
  Castle,
  Coffee,
  Disc3,
  Landmark,
  ShoppingBag,
  ShoppingBasket,
  TreePalm,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { PlaceCategory } from "@/lib/import/categories";
import { cn } from "@/lib/utils";

/** One Lucide icon per place category, used everywhere a category is shown. */
export const CATEGORY_ICONS: Record<PlaceCategory, LucideIcon> = {
  restaurant: UtensilsCrossed,
  cafe: Coffee,
  bar: Beer,
  nightlife: Disc3,
  park: Trees,
  attraction: Castle,
  museum: Landmark,
  viewpoint: Binoculars,
  beach: TreePalm,
  market: ShoppingBasket,
  shopping: ShoppingBag,
};

export function CategoryIcon({
  category,
  className,
  strokeWidth = 1.75,
}: {
  category: PlaceCategory;
  className?: string;
  strokeWidth?: number;
}) {
  const Icon = CATEGORY_ICONS[category];
  return (
    <Icon aria-hidden className={cn("size-4 shrink-0", className)} strokeWidth={strokeWidth} />
  );
}
