// Creates (or removes) the demo data Apple's App Review team signs in with:
// a private demo group, a demo player and a demo trainer account, a few
// fictional teammates, upcoming trainings and some chat messages. The demo
// group is separate from every real team, so real members never see any of it.
//
//   node --env-file=.env.local scripts/seed-review-demo.mjs          # create
//   node --env-file=.env.local scripts/seed-review-demo.mjs --remove # delete again
//
// The generated logins are written to appstore/REVIEW_ACCESS.local.txt
// (git-ignored) — paste them into App Store Connect → App Review Information.
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const CODE = "APPREVIEW";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen (.env.local).");
const svc = createClient(url, key, { auth: { persistSession: false } });

const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
const fail = (what, error) => {
  console.error(what, error);
  process.exit(1);
};

async function remove() {
  const { data: group } = await svc.from("groups").select("id").eq("code", CODE).maybeSingle();
  if (group) {
    await svc.from("termine").delete().contains("register_groups", [group.id]);
    const { data: members } = await svc.from("profiles").select("id").eq("group_id", group.id);
    for (const m of members ?? []) await svc.auth.admin.deleteUser(m.id);
    await svc.from("groups").delete().eq("id", group.id);
  }
  const { data: trainers } = await svc.from("profiles").select("id").like("email", "review-%@clubtermin.local");
  for (const t of trainers ?? []) await svc.auth.admin.deleteUser(t.id);
  console.log("Demo-Daten entfernt.");
}

async function create() {
  const { data: existing } = await svc.from("groups").select("id").eq("code", CODE).maybeSingle();
  if (existing) fail("Demo-Gruppe existiert schon. Erst mit --remove löschen.", "");

  const g = await svc.from("groups").insert({ name: "App-Review Demo", code: CODE, short_code: "DEMO" }).select().single();
  if (g.error) fail("Gruppe anlegen:", g.error);
  const groupId = g.data.id;

  const password = randomBytes(9).toString("base64url");
  const makeUser = async (name, role, pw, tag) => {
    const email = `review-${tag}-${randomBytes(4).toString("hex")}@clubtermin.local`;
    const { data, error } = await svc.auth.admin.createUser({ email, password: pw, email_confirm: true, user_metadata: { name } });
    if (error) fail(`Nutzer ${name}:`, error);
    const patch = { status: "approved", role, group_id: role === "trainer" ? null : groupId };
    const r = await svc.from("profiles").update(patch).eq("id", data.user.id);
    if (r.error) fail(`Profil ${name}:`, r.error);
    return data.user.id;
  };

  await makeUser("Apple Review", "member", password, "player");
  const trainer = await makeUser("Apple Review Trainer", "trainer", password, "trainer");
  // The owner-only RPC can't run under the service role, so the trainer ↔ group link is written directly.
  await svc.from("trainer_groups").upsert({ user_id: trainer, group_id: groupId });
  const mates = [];
  for (const name of ["Lena Beispiel", "Tom Muster", "Sara Demo", "Jan Test"]) {
    mates.push({ name, id: await makeUser(name, "member", randomBytes(12).toString("base64url"), "mate") });
  }

  const termine = [];
  for (const [title, off, max] of [
    ["Training Mittwoch", 3, 8],
    ["Training Freitag", 5, 8],
    ["Training Mittwoch", 10, 8],
  ]) {
    const t = await svc
      .from("termine")
      .insert({
        type: "training",
        title,
        trainer: "Apple Review Trainer",
        trainer_id: trainer,
        location: "Padel-Halle Beispielstadt",
        courts: "1, 2",
        date: day(off),
        start_time: "18:00:00",
        end_time: "19:30:00",
        description: "Demo-Termin für die App-Prüfung.",
        max_tn: max,
        price: null,
        visible_groups: [groupId],
        register_groups: [groupId],
        notify_create: false,
        reminder_enabled: false,
        created_by: trainer,
      })
      .select()
      .single();
    if (t.error) fail("Termin:", t.error);
    termine.push(t.data.id);
  }
  for (const m of mates.slice(0, 3)) {
    const r = await svc.from("registrations").insert({ termin_id: termine[0], user_id: m.id, status: "angemeldet" });
    if (r.error) fail("Anmeldung:", r.error);
  }
  const r2 = await svc.from("registrations").insert({ termin_id: termine[1], user_id: mates[3].id, status: "angemeldet" });
  if (r2.error) fail("Anmeldung:", r2.error);

  const chat = [
    [mates[0].id, "Hi zusammen, wer ist am Mittwoch dabei?"],
    [mates[1].id, "Ich bin angemeldet 👍"],
    [trainer, "Willkommen in der Demo-Gruppe! Hier könnt ihr euch zu Trainings an- und abmelden."],
  ];
  for (const [uid, content] of chat) {
    const r = await svc.from("messages").insert({ group_id: groupId, user_id: uid, content });
    if (r.error) fail("Nachricht:", r.error);
  }

  const out = [
    "ZUGANGSDATEN FÜR APPLE APP REVIEW (nicht committen!)",
    "",
    "Spieler-Zugang (Standardansicht):",
    "  Name:     Apple Review",
    `  Passwort: ${password}`,
    "",
    "Trainer-Zugang (zusätzlich Admin-Bereich):",
    "  Name:     Apple Review Trainer",
    `  Passwort: ${password}`,
    "",
    "Anmeldung erfolgt mit Vor- und Nachname plus Passwort (keine E-Mail).",
  ].join("\n");
  writeFileSync(new URL("../appstore/REVIEW_ACCESS.local.txt", import.meta.url), out);
  console.log("Demo-Daten angelegt. Zugangsdaten: appstore/REVIEW_ACCESS.local.txt");
}

if (process.argv.includes("--remove")) await remove();
else await create();
