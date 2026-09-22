/** Actionable env hints. Signup URLs are public; never log the key values. */

export const CREDENTIAL_HELP = {
  careeronestop:
    "set CAREERONESTOP_USER_ID and CAREERONESTOP_API_TOKEN (https://www.careeronestop.org/Developers/WebAPI/registration.aspx). Do not persist Bing geocodes.",
  census: "set CENSUS_API_KEY (https://api.census.gov/data/key_signup.html)",
  bea: "set BEA_API_KEY to the 36-character BEA UserID (https://apps.bea.gov/API/signup/index.html)",
  fred: "set FRED_API_KEY (https://fred.stlouisfed.org/docs/api/api_key.html)",
} as const;

function present(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function careerOneStopAuth(env: NodeJS.ProcessEnv): { userId: string; token: string } | null {
  const userId = present(env.CAREERONESTOP_USER_ID);
  const token = present(env.CAREERONESTOP_API_TOKEN);
  if (!userId || !token) return null;
  return { userId, token };
}

export function keyedAdapterEnabled(
  source: "bls_ep" | "careeronestop" | "census" | "bea" | "fred",
  env: NodeJS.ProcessEnv
): boolean {
  if (source === "bls_ep") return true;
  if (source === "careeronestop") return careerOneStopAuth(env) != null;
  if (source === "census") return present(env.CENSUS_API_KEY) != null;
  if (source === "bea") return present(env.BEA_API_KEY) != null;
  return present(env.FRED_API_KEY) != null;
}
