import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Terms of use",
  description: "The rules for using RateDestinations and posting ratings.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="November 3, 2026">
      <p>
        By using RateDestinations you agree to these terms. If you do not agree, please do not use
        the site.
      </p>

      <h2>Ratings and comments</h2>
      <ul>
        <li>
          Rate places and cities you have actually visited, honestly and from your own experience.
        </li>
        <li>
          Do not post anything illegal, hateful, harassing, or personal information about other
          people, and do not rate places you own or are paid to promote.
        </li>
        <li>
          You keep ownership of what you write, and you let us show it on the site so others can
          read it.
        </li>
        <li>We may remove content or accounts that break these rules.</li>
      </ul>

      <h2>The information on the site</h2>
      <p>
        Scores and warnings come from the people who rate on the site, locals and travellers, and
        from open map data (OpenStreetMap and Overture Maps). They are opinions, not guarantees.
        Places change, close or move, so check before you rely on anything here, especially for
        safety.
      </p>

      <h2>No warranty</h2>
      <p>
        The site is provided &ldquo;as is&rdquo;, without warranties of any kind. To the extent the
        law allows, we are not liable for losses arising from your use of the site or from decisions
        you make based on it.
      </p>

      <h2>Data and attribution</h2>
      <p>
        Place data © OpenStreetMap contributors, available under the Open Database License. City
        data by GeoNames (CC BY 4.0). How we handle your personal data is described in our{" "}
        <Link href="/privacy">privacy policy</Link>.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <ContactLink />.
      </p>
    </LegalPage>
  );
}
