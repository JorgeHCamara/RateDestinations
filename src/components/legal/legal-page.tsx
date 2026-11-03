import type { ReactNode } from "react";

/** Shared layout for the privacy policy and terms pages. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string;
  updated: string;
  children: ReactNode;
}) {
  return (
    <article className="container-page max-w-3xl py-12">
      <h1 className="font-display text-4xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 text-sm">Last updated {updated}</p>
      <div className="[&_a]:text-brand [&_h2]:font-display mt-8 space-y-6 text-[15px] leading-relaxed [&_a]:underline-offset-2 hover:[&_a]:underline [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </div>
    </article>
  );
}

/** Where people send privacy requests. Set NEXT_PUBLIC_CONTACT_EMAIL in the hosting environment. */
export function ContactLink() {
  const email = process.env.NEXT_PUBLIC_CONTACT_EMAIL;
  if (!email) return <>the contact address listed on this site</>;
  return <a href={`mailto:${email}`}>{email}</a>;
}
