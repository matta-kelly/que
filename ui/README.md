# que UI

The settings app of que: a Next.js app where a user manages their account and connects their logins, and an admin manages users. que's MCP catalog gives a user the tools of the domains they hold and the connections they made here.
It talks to que's server (`server/runtime/`) through the proxy at `app/api/[..._path]`.

- `app/(app)/page.tsx`: the app's one page, the settings (`components/settings/settings.tsx`)
  - Home: a search box over a tile per section. The search also finds a connector or a person, and opens its section
  - Account: the user's name and picture (`PATCH /que/me`). The email comes from the login. A picture is cropped and shrunk in the browser to a 256px WebP
  - Connections: the user's domains (`GET /que/domains`), and a row for each connector that needs a credential, with its Connect form (`GET`, `PUT`, `DELETE /que/connections/:plugin`). que's server tests a credential before it keeps it
  - Users: everyone with access (`GET /que/users`). An admin also sees each user's grants and role, and changes them (`/que/admin/*`)
- `app/(app)/layout.tsx`: the app shell: the sidebar (a button for Home and each section, and the signed-in user, who opens Account), the command palette and the state of the page
- `components/shell/command-palette.tsx`: one search over actions (the theme) and settings (each section and each connector). `/` or Ctrl/⌘+K opens it. A prefix such as `settings:` searches one type only
- `app/api/[..._path]/route.ts`: the proxy. It forwards a same-origin request to que's server, with Cloudflare Access's identity token, and gives back the answer
- `components/` is in groups: `ui/` (shadcn), `shell/` (the app frame, with `shell/sidebar/`) and `settings/`. A feature is in one folder: its UI, its logic and its tests
- `hooks/`: React hooks that more than one feature uses
- `lib/`: three things many features share, and no more: the que API's URLs, types and fetcher for `useSWR` (`que-api.ts`), the fonts, and shadcn's `cn`. A lint rule stops a new file there
- a unit test is beside the code it tests (`*.test.ts`, `*.test.tsx`), and runs on Vitest, in `just check`. The browser tests are in `tests/e2e/`, and run on Playwright against the whole app
- `.env.local`: not needed. With none, the UI talks to que's own server on localhost:2024 (`app/api/[..._path]/que-server.ts`). `.env.example` lists the setting that points it elsewhere, `QUE_URL`
