const CODE = /^[A-Z0-9]{6}$/;

/** Extracts a 6-character code from safenight://join?code=X, …/join/X or https://…?join=X. Never trusts anything else in the URL. */
export function inviteCodeFromUrl(url: string | null | undefined): string {
  if (!url) return '';
  const m = /[?&](?:join|code)=([A-Za-z0-9]{6})(?:[&#]|$)/.exec(url) ?? /\/join\/([A-Za-z0-9]{6})(?:[/?#]|$)/.exec(url);
  const code = m?.[1]?.toUpperCase() ?? '';
  return CODE.test(code) ? code : '';
}
