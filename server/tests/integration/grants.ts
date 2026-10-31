/**
 * The grant a fixture test makes: the runtime's control plane (access/control.ts) gives the user each domain of the
 * deployment the test runs on, as an admin would, before the test's run or its connection. A grant nothing reads yet
 * changes nothing a test asserts; it is there so the test's users reach the deployment's connectors once a run does.
 */

/**
 * Grants `email`'s user, named `name` as @que/identity names them, each of `domains`, recorded as granted by a test
 * admin, and gives back the user's id. It makes the user's row when it is not there yet, as a signed-in request does.
 */
export async function grant(
  email: string,
  name: string,
  ...domains: string[]
): Promise<string> {
  const { control } = await import("../../runtime/src/access/control.js");
  const { users } = await import("../../runtime/src/access/users.js");
  const user = await users.ensure({ email, name });
  for (const domain of domains) await control.grant(user.id, domain, "test");
  return user.id;
}
