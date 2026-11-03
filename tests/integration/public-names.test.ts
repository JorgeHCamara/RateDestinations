/**
 * Public names and throwaway emails in the database (migration 0010): names never come from an
 * email, ratings need a name, names can't be contact details, and throwaway accounts can't rate.
 * Needs DATABASE_URL; rolled back.
 */
import "dotenv/config";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.DATABASE_URL;
const run = url ? describe : describe.skip;

run("public names and throwaway emails (database)", () => {
  const client = new Client({ connectionString: url });
  const emailUser = "71111111-1111-4111-8111-111111111111";
  const googleUser = "72222222-2222-4222-8222-222222222222";
  const throwaway = "73333333-3333-4333-8333-333333333333";
  let placeId: number;
  const rate = (user: string) =>
    client.query("insert into place_ratings (place_id, user_id, stars) values ($1, $2, 4)", [
      placeId,
      user,
    ]);
  const name = async (user: string) =>
    (await client.query("select display_name from profiles where id = $1", [user])).rows[0]
      ?.display_name ?? null;

  beforeAll(async () => {
    await client.connect();
    await client.query("begin");
    await client.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
         ($1, 'jorge.camara@hotmail.com', '{}'),
         ($2, 'ana@gmail.com', '{"full_name":"Ana Silva"}'),
         ($3, 'troll@mailinator.com', '{"full_name":"Totally Real"}')`,
      [emailUser, googleUser, throwaway],
    );
    await client.query(
      "insert into blocked_email_domains (domain) values ('mailinator.com') on conflict do nothing",
    );
    placeId = (
      await client.query<{ id: number }>(
        `insert into places (city_id, source, source_id, name, category, lat, lng)
         select id, 'osm', 'node/names-test', 'Names Test Café', 'cafe', lat, lng
         from cities order by population desc limit 1 returning id`,
      )
    ).rows[0].id;
  });

  afterAll(async () => {
    await client.query("rollback");
    await client.end();
  });

  it("never takes a public name from an email; Google names are kept", async () => {
    expect(await name(emailUser)).toBeNull();
    expect(await name(googleUser)).toBe("Ana Silva");
  });

  it("refuses a rating until the person has a public name", async () => {
    await client.query("savepoint s");
    await expect(rate(emailUser)).rejects.toThrow(/public name required/);
    await client.query("rollback to savepoint s");
    await client.query("update profiles set display_name = 'Jorge' where id = $1", [emailUser]);
    await expect(rate(emailUser)).resolves.toBeTruthy();
  });

  it("refuses contact details as a name, even through the API", async () => {
    for (const bad of ["jorge.camara@hotmail.com", "www.mybar.pt", "912345678 call me"]) {
      await client.query("savepoint n");
      await expect(
        client.query("update profiles set display_name = $2 where id = $1", [googleUser, bad]),
      ).rejects.toThrow(/invalid public name/);
      await client.query("rollback to savepoint n");
    }
    await client.query("update profiles set display_name = '  Ana   S. ' where id = $1", [
      googleUser,
    ]);
    expect(await name(googleUser)).toBe("Ana S.");
  });

  it("refuses ratings from throwaway email accounts", async () => {
    expect(await name(throwaway)).toBe("Totally Real");
    await client.query("savepoint t");
    await expect(rate(throwaway)).rejects.toThrow(/email domain not allowed/);
    await client.query("rollback to savepoint t");
  });
});
