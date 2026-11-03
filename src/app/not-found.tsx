import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page py-24 text-center">
      <p className="text-brand text-xs font-semibold tracking-[0.2em] uppercase">404</p>
      <h1 className="font-display mt-2 text-4xl font-semibold">Off the map</h1>
      <p className="text-muted-foreground mx-auto mt-3 max-w-md">
        We don&apos;t have a page here. Cities with more than 15,000 people are covered; try
        searching for the nearest one.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to search</Link>
      </Button>
    </div>
  );
}
