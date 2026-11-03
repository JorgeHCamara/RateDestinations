import type { Metadata } from "next";
import Link from "next/link";
import { ContactLink, LegalPage } from "@/components/legal/legal-page";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "What RateDestinations collects, why, who processes it, and how to get it deleted.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="November 3, 2026">
      <p>
        RateDestinations is a city guide where travellers rate cities and places. This page explains
        what we collect, why, and what you can ask us to do with it. We keep it short because we
        collect very little.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> If you sign in with Google, we receive your name, email
          address and profile picture from Google. If you sign in with an email link, we receive
          your email address. We use these only to sign you in and to show your name next to your
          ratings.
        </li>
        <li>
          <strong>What you post.</strong> Your star ratings, the tags you choose (for example
          &ldquo;Dirty&rdquo; or &ldquo;Great value&rdquo;) and any comment you write, with the
          date. These are public: anyone can see them on the place or city page, next to your
          display name.
        </li>
        <li>
          <strong>A sign-in cookie.</strong> One cookie keeps you signed in. We do not use
          advertising or analytics cookies, and we do not track you across other sites.
        </li>
        <li>
          <strong>Technical logs.</strong> Our hosting provider keeps short-lived server logs (such
          as IP address and the page requested) to run and secure the site.
        </li>
      </ul>

      <h2>What we do not do</h2>
      <ul>
        <li>We do not sell or rent your data, and we do not show ads.</li>
        <li>
          We do not read your Google contacts, email, calendar or anything beyond your basic
          profile.
        </li>
      </ul>

      <h2>Who processes data for us</h2>
      <ul>
        <li>
          <strong>Supabase</strong> stores the database and handles sign-in (servers in the United
          States).
        </li>
        <li>
          <strong>Vercel</strong> hosts the website.
        </li>
        <li>
          <strong>Google</strong> provides &ldquo;Sign in with Google&rdquo;, under Google&apos;s
          own privacy policy.
        </li>
        <li>
          <strong>Geoapify</strong> and <strong>OpenStreetMap</strong> provide the list of places in
          each city. We send them only a city&apos;s location, never anything about you.
        </li>
        <li>
          <strong>OpenFreeMap</strong> serves the map tiles; your browser requests them directly, so
          that service sees your IP address.
        </li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and ratings until you ask us to delete them. Ratings help other
        travellers, so they stay on the site while your account exists.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>You can change any of your ratings at any time from its place or city page.</li>
        <li>
          To see the data we hold about you, or to delete your account and everything you posted, or
          to remove a single rating, email <ContactLink /> from the address you signed in with. We
          will do it within 30 days.
        </li>
        <li>
          You can remove RateDestinations&apos; access to your Google account at any time in your
          Google Account settings, under Security, &ldquo;Third-party apps with account
          access&rdquo;.
        </li>
      </ul>

      <h2>Children</h2>
      <p>
        RateDestinations is not intended for children under 13, and we do not knowingly collect
        their data.
      </p>

      <h2>Changes</h2>
      <p>
        If we change this policy, we will update the date at the top of this page. See also our{" "}
        <Link href="/terms">terms of use</Link>.
      </p>
    </LegalPage>
  );
}
