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
        RateDestinations is a city guide where locals and travellers rate cities and places. This
        page explains what we collect, why, and what you can ask us to do with it. We keep it short
        because we collect very little.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your account.</strong> If you sign in with Google, we receive your name, email
          address and profile picture from Google. If you sign in with an email link, we receive
          your email address. We use these only to sign you in. Next to your ratings we show the
          public name you choose (for a Google account, your Google name until you change it on
          &ldquo;My ratings&rdquo;); your email address is never shown.
        </li>
        <li>
          <strong>What you post.</strong> Your star ratings, the tags you choose (for example
          &ldquo;Dirty&rdquo; or &ldquo;Great value&rdquo;) and any comment you write, with the
          date. These are public: anyone can see them on the place or city page, next to your
          display name.
        </li>
        <li>
          <strong>Whether you live in a city you rate.</strong> When you rate a city you say whether
          you live there or are visiting. It is shown as a share of locals and visitors on the city
          page, and as a &ldquo;Local&rdquo; label next to your reviews of places in that city.
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

      <h2>Services we use</h2>
      <p>
        <strong>Supabase</strong> stores our database and handles sign-in (servers in the United
        States), <strong>Vercel</strong> hosts the site and counts visits without cookies, and{" "}
        <strong>Google</strong> provides &ldquo;Sign in with Google&rdquo;, under its own privacy
        policy. On the sign-in page, <strong>Cloudflare Turnstile</strong> checks that a person, not
        a bot, is signing in (it sees your IP address and browser to do so). Maps, map tiles and
        place photos load from <strong>OpenFreeMap</strong>, <strong>Wikimedia Commons</strong> or a
        place&apos;s own website, which see your IP address when they do; we never send them
        anything about you.
      </p>

      <h2>How long we keep it</h2>
      <p>
        We keep your account and ratings until you ask us to delete them. Ratings help everyone
        deciding about a city, so they stay on the site while your account exists.
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
