"use client";

import { useState } from "react";
import useSWR, { mutate } from "swr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher, QUE_API, type Connection } from "@/lib/que-api";

const LABELS: Record<string, string> = {
  url: "URL",
  db: "Database",
  apiKey: "API key",
};
const label = (field: string) =>
  LABELS[field] ??
  field
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase());

/** The list of connections: one row per package that needs a credential. */
export function ConnectionsList() {
  const { data: connections, error } = useSWR<Connection[]>(
    QUE_API.connections,
    fetcher,
  );

  return (
    <div className="divide-y rounded-xl border">
      {error ? (
        <p className="text-destructive p-4 text-sm">
          Couldn&apos;t load connections.
        </p>
      ) : !connections ? (
        <p className="text-muted-foreground p-4 text-sm">Loading…</p>
      ) : (
        connections.map((c) => <ConnectionRow key={c.name} connection={c} />)
      )}
    </div>
  );
}

export const CONNECTIONS_BLURB =
  "Connect your accounts. que only uses the tools for services you've connected.";

function ConnectionRow({ connection }: { connection: Connection }) {
  const connected = connection.connectedAt !== null;
  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (init: RequestInit) => {
    setBusy(true);
    setError(null);
    const res = await fetch(`${QUE_API.connections}/${connection.name}`, {
      ...init,
      headers: { "content-type": "application/json" },
    });
    setBusy(false);
    if (!res.ok)
      return setError((await res.json()).error ?? "Something went wrong");
    setValues({});
    setEditing(false);
    await mutate(QUE_API.connections);
  };

  return (
    <div
      data-testid={`connection-${connection.name}`}
      className="flex flex-col gap-4 p-5"
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className="font-medium">{connection.title}</span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                className={`size-1.5 rounded-full ${connected ? "bg-green-500" : "bg-muted-foreground/40"}`}
              />
              {connected ? "Connected" : "Not connected"}
            </span>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {connection.description}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 gap-2">
            {connected ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditing(true)}
                >
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => send({ method: "DELETE" })}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                Connect
              </Button>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="flex max-w-md flex-col gap-3">
          {connection.fields.map((f) => (
            <label key={f.name} className="flex flex-col gap-1 text-sm">
              {label(f.name)}
              <Input
                type={f.secret ? "password" : "text"}
                value={values[f.name] ?? ""}
                onChange={(e) =>
                  setValues({ ...values, [f.name]: e.target.value })
                }
                autoComplete="off"
              />
            </label>
          ))}
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                send({ method: "PUT", body: JSON.stringify({ values }) })
              }
            >
              {busy ? "Checking…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
