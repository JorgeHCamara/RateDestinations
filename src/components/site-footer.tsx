import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-border/70 bg-surface mt-16 border-t">
      <div className="container-page text-muted-foreground flex flex-col gap-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>
          <span className="font-display text-foreground text-base">RateDestinations</span> — the
          whole city, rated by locals and travellers.
        </p>
        <p className="text-xs leading-relaxed">
          Place data ©{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.openstreetmap.org/copyright"
            rel="noreferrer"
          >
            OpenStreetMap contributors
          </a>{" "}
          (ODbL). City data by{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.geonames.org/"
            rel="noreferrer"
          >
            GeoNames
          </a>{" "}
          (CC BY 4.0). Map tiles by{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://openfreemap.org/"
            rel="noreferrer"
          >
            OpenFreeMap
          </a>
          . Places from{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://overturemaps.org/"
            rel="noreferrer"
          >
            Overture Maps
          </a>{" "}
          (CDLA Permissive 2.0) and powered by{" "}
          <a
            className="underline-offset-2 hover:underline"
            href="https://www.geoapify.com/"
            rel="noreferrer"
          >
            Geoapify
          </a>
          .{" "}
          <Link className="underline-offset-2 hover:underline" href="/#how-it-works">
            How scores work
          </Link>
          {" · "}
          <Link className="underline-offset-2 hover:underline" href="/privacy">
            Privacy
          </Link>
          {" · "}
          <Link className="underline-offset-2 hover:underline" href="/terms">
            Terms
          </Link>
          .
        </p>
      </div>
    </footer>
  );
}
