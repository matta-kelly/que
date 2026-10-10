"use client";

// Account: your own profile. Name and picture are editable here; the email
// comes from your login. Uploaded pictures are cropped and shrunk in the
// browser (256px square, WebP) and stored on the user.

import { useRef, useState } from "react";
import { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar, useMe } from "@/components/user";
import { QUE_API, type User } from "@/lib/que-api";

const AVATAR_SIZE = 256;

// Center-crop to a square and shrink, so pictures stay a few KB.
async function toAvatarDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = AVATAR_SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  return canvas.toDataURL("image/webp", 0.85);
}

export function AccountSettings() {
  const { data: me, error } = useMe();
  if (error) return <p className="text-destructive text-sm">Couldn&apos;t load your profile.</p>;
  if (!me) return <p className="text-muted-foreground text-sm">Loading…</p>;
  // Keyed by id so the form starts from the loaded profile and nothing
  // overwrites what's being typed.
  return <AccountForm key={me.id} me={me} />;
}

function AccountForm({ me }: { me: User }) {
  const [name, setName] = useState(me.name);
  const [avatarUrl, setAvatarUrl] = useState(me.avatarUrl ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    try {
      setAvatarUrl(await toAvatarDataUrl(file));
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  const save = async () => {
    setStatus("saving");
    const res = await fetch(QUE_API.me, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, avatarUrl }),
    });
    setStatus(res.ok ? "saved" : "error");
    // The response is the saved profile: show it everywhere without refetching.
    if (res.ok) await mutate(QUE_API.me, await res.json(), { revalidate: false });
  };

  return (
    <div className="flex max-w-md flex-col gap-5">
      <div className="flex items-center gap-4">
        <UserAvatar user={{ name: name || me.name, avatarUrl: avatarUrl || null }} className="size-14" />
        <div className="min-w-0">
          <p className="truncate font-medium">{me.name}</p>
          <p className="text-muted-foreground truncate text-sm">{me.email}</p>
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Name
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="flex items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          aria-label="Upload picture"
          className="hidden"
          onChange={(e) => {
            void pick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
          Upload picture
        </Button>
        {avatarUrl && (
          <Button size="sm" variant="ghost" onClick={() => setAvatarUrl("")}>
            Remove
          </Button>
        )}
      </div>
      <label className="flex flex-col gap-1 text-sm">
        Email
        <Input value={me.email} disabled />
      </label>
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={status === "saving" || !name.trim()} onClick={save}>
          {status === "saving" ? "Saving…" : "Save"}
        </Button>
        {status === "saved" && <span className="text-muted-foreground text-sm">Saved</span>}
        {status === "error" && <span className="text-destructive text-sm">Couldn&apos;t save</span>}
      </div>
    </div>
  );
}
