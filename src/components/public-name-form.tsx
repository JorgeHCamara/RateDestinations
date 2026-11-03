"use client";

import { useActionState, useState } from "react";
import { setPublicName, type PublicNameState } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PUBLIC_NAME_MAX, publicNameProblem } from "@/lib/public-name";

/** The name shown on someone's reviews: set after a first email sign-in, editable on "My ratings". */
export function PublicNameForm({
  initial,
  next,
  submitLabel = "Save",
}: {
  initial: string | null;
  /** Where to go once saved (the welcome step); without it the form stays and confirms. */
  next?: string;
  submitLabel?: string;
}) {
  const [state, action, pending] = useActionState<PublicNameState, FormData>(setPublicName, {});
  const [name, setName] = useState(initial ?? "");
  const [touched, setTouched] = useState(false);
  const problem = touched ? publicNameProblem(name) : null;
  const error = problem ?? state.error;
  return (
    <form action={action} className="space-y-3">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="space-y-1.5">
        <Label htmlFor="public-name">Your public name</Label>
        <Input
          id="public-name"
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          maxLength={PUBLIC_NAME_MAX}
          autoComplete="nickname"
          placeholder="e.g. Ana, or a nickname like TokyoLocal"
          aria-invalid={Boolean(error)}
          aria-describedby="public-name-help"
          required
        />
        <p id="public-name-help" className="text-muted-foreground text-xs">
          Shown next to your reviews. A nickname is fine; your email is never shown.
        </p>
      </div>
      {error && <p className="text-bad text-sm">{error}</p>}
      {state.ok && !error && <p className="text-good text-sm">Saved.</p>}
      <Button type="submit" disabled={pending || Boolean(publicNameProblem(name))}>
        {pending ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
