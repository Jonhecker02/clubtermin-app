import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import type { GpsEntry } from "@/lib/gps";

// Reads a schedule flyer (photo, or a PDF page rendered to an image by the
// browser) and returns its tournament lines. Admins only — every call costs a
// few cents — and capped per person.
const LIMIT = 20;
const WINDOW_SECONDS = 60 * 60;
const MAX_BASE64_LENGTH = 6_000_000;

const SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      items: {
        type: "object",
        properties: {
          weekday: { type: "string" },
          day: { type: "integer" },
          month: { type: "integer" },
          time: { type: "string" },
          title: { type: "string" },
        },
        required: ["weekday", "day", "month", "time", "title"],
        additionalProperties: false,
      },
    },
  },
  required: ["entries"],
  additionalProperties: false,
} as const;

const SYSTEM = `You read tournament schedule flyers of a padel club and extract the dated list of tournaments.
Return one entry per row of the schedule list, in the order printed. For each row:
- weekday: the two-letter German weekday abbreviation as printed (MO, DI, MI, DO, FR, SA, SO), uppercase
- day and month: the date as numbers (e.g. "01.11." -> day 1, month 11)
- time: the start time as HH:MM 24-hour (e.g. "10:00")
- title: the tournament name exactly as printed (e.g. "GPS 250 Herren & Damen"), without date or time
Ignore headings, descriptions, QR codes, logos and any text that is not a schedule row. If a value is unreadable, make your best reading from context rather than skipping the row. Never invent rows.`;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { image?: string; media_type?: string };
  if (!body.image || body.image.length > MAX_BASE64_LENGTH) {
    return NextResponse.json({ error: "invalid_image" }, { status: 400 });
  }
  const mediaType = body.media_type === "image/png" ? "image/png" : "image/jpeg";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  const { data: caller } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!caller || !["owner", "trainer", "captain"].includes(caller.role)) {
    return NextResponse.json({ error: "not_authorized" }, { status: 403 });
  }

  const service = createServiceRoleClient();
  const limitKey = `gps-import:${user.id}`;
  if (await isRateLimited(service, limitKey, LIMIT, WINDOW_SECONDS)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 501 });
  }
  await recordAttempt(service, limitKey);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: SYSTEM,
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: body.image } },
            { type: "text", text: "Extract the tournament schedule from this flyer." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") return NextResponse.json({ error: "refused" }, { status: 422 });
    if (response.stop_reason === "max_tokens") return NextResponse.json({ error: "unreadable" }, { status: 422 });

    const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    const parsed = JSON.parse(text) as { entries?: GpsEntry[] };
    const entries = (parsed.entries ?? []).filter(
      (e) => Number.isInteger(e.day) && e.day >= 1 && e.day <= 31 && Number.isInteger(e.month) && e.month >= 1 && e.month <= 12 && !!e.title?.trim(),
    );
    return NextResponse.json({ entries });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) return NextResponse.json({ error: "not_configured" }, { status: 501 });
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "busy" }, { status: 503 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "unreadable" }, { status: 422 });
    return NextResponse.json({ error: "failed" }, { status: 502 });
  }
}
