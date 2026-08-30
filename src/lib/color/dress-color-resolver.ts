import { colorFamilyFromHex, type ColorFamily } from "@/lib/color/palette-matching";

/**
 * Text-only dress color resolver.
 *
 * The image itself is never sent to an LLM.
 *
 * Flow:
 * 1. The user manually enters the dress color/palette name.
 * 2. If it exactly matches one of the bride's existing palette names,
 *    use that palette swatch's existing hex deterministically.
 * 3. Otherwise ask a text-only model for a representative sRGB hex
 *    for the user's supplied color name.
 *
 * The user's entered label remains the stored/displayed color name.
 * The model is only responsible for resolving the representative hex.
 */

export interface DressColorPaletteOption {
  name: string;
  hex: string;
  family?: string | null;
}

export interface DressColorResolution {
  primaryHex: string;
  family: ColorFamily;
}

const GROQ_BASE =
  process.env.GROQ_API_BASE ?? "https://api.groq.com/openai/v1";

const GROQ_MODEL =
  process.env.GROQ_COLOR_MODEL ?? "qwen/qwen3.6-27b";

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

function isHex(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^#[0-9a-fA-F]{6}$/.test(value)
  );
}

function parseResolution(raw: string): DressColorResolution | null {
  const cleaned = raw
    .replace(/```json|```/gi, "")
    .trim();

  try {
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;

    if (!isHex(parsed.primaryHex)) {
      return null;
    }

    const primaryHex = parsed.primaryHex.toUpperCase();
    const family = typeof parsed.family === "string" && parsed.family ? parsed.family.toLowerCase() : null;
    const fallbackFamily = colorFamilyFromHex(primaryHex);
    const allowed = new Set(["red", "pink", "orange", "yellow", "brown", "purple", "blue", "green", "neutral", "dark"]);
    const resolvedFamily = family && allowed.has(family) ? family as ColorFamily : fallbackFamily;
    if (!resolvedFamily) return null;
    return {
      primaryHex,
      family: resolvedFamily,
    };
  } catch {
    return null;
  }
}

function buildPrompt(input: string): string {
  return [
    "You are a professional colorimetry specialist.",
    "",
    `The user has explicitly identified the dominant dress color as: "${input}"`,
    "",
    "Your ONLY task is to determine the most representative standard sRGB HEX value for that named color.",
    "",
    "Rules:",
    "- Preserve the user's color concept.",
    "- Do not rename the color.",
    "- Do not infer anything from an image; you have text only.",
    "- Use a standard, widely recognized representative color value.",
    "- Return exactly one 6-digit sRGB hexadecimal value.",
    "- Also classify the color into exactly one broad hue family: red, pink, orange, yellow, brown, purple, blue, green, neutral, or dark.",
    "- Treat family as a broad hue family, not a fashion brand/category.",
    "- Do not explain your answer.",
    "- Do not include markdown.",
    "- Do not include reasoning.",
    "- Return only the requested primaryHex and family keys.",
    "",
    'Return exactly this JSON shape:',
    '{"primaryHex":"#RRGGBB","family":"green"}',
    "",
    `Color label: ${input}`,
  ].join("\n");
}

interface ChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<unknown> | null;
    };
  }>;
}

async function callTextModel(
  url: string,
  apiKey: string,
  model: string,
  prompt: string,
  extraHeaders?: Record<string, string>,
  options?: {
    isQwen?: boolean;
  },
): Promise<DressColorResolution | null> {
  const isQwen = options?.isQwen ?? false;

  const body: Record<string, unknown> = {
    model,
    temperature: 0,
    max_tokens: 120,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "user",
        content: prompt,
      },
    ],
  };

  // Qwen 3.6 supports explicit non-thinking mode. This task is deliberately
  // simple and should return only the requested JSON object.
  if (isQwen) {
    body.reasoning_effort = "none";
    body.reasoning_format = "hidden";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });

  const raw = await response.text();

  if (!response.ok) {
    throw new Error(
      `Color resolver failed (${response.status}): ${raw.slice(0, 500)}`,
    );
  }

  let json: ChatResponse;

  try {
    json = JSON.parse(raw) as ChatResponse;
  } catch {
    throw new Error("Color resolver returned invalid API JSON");
  }

  const content = json.choices?.[0]?.message?.content;

  if (typeof content !== "string") {
    console.error(
      "Color resolver unexpected model response:",
      JSON.stringify(json).slice(0, 2000),
    );
    throw new Error("Color resolver returned no message content");
  }

  return parseResolution(content);
}

export async function resolveDressColor(
  colorLabel: string,
  palette: DressColorPaletteOption[] = [],
): Promise<DressColorResolution> {
  const cleanedLabel = colorLabel.trim();

  if (!cleanedLabel) {
    throw new Error("Please enter the dress color palette.");
  }

  // Deterministic exact palette match:
  // if the user enters the bride's palette name, reuse the bride's existing
  // swatch hex so the same named color can never drift across uploads.
  const exactPalette = palette.find(
    (swatch) =>
      normalizeName(swatch.name) === normalizeName(cleanedLabel),
  );

  if (exactPalette) {
    return {
      primaryHex: exactPalette.hex.toUpperCase(),
      family: (exactPalette.family as ColorFamily | undefined) ?? colorFamilyFromHex(exactPalette.hex) ?? "neutral",
    };
  }

  const prompt = buildPrompt(cleanedLabel);

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("Groq color resolution is not configured.");

  const result = await callTextModel(
    `${GROQ_BASE}/chat/completions`,
    groqKey,
    GROQ_MODEL,
    prompt,
    {
      "X-Title": "Vows & Vibe Dress Color Resolver",
    },
    { isQwen: GROQ_MODEL.startsWith("qwen/") },
  );

  if (!result) {
    throw new Error(
      "Could not resolve that color palette. Please try a more specific color name.",
    );
  }

  return result;
}
