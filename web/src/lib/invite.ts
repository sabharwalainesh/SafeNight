export function inviteCodeFromUrl(url: string): string {
  try { const code = new URL(url).searchParams.get('join')?.toUpperCase() ?? ''; return /^[A-Z0-9]{6}$/.test(code) ? code : ''; }
  catch { return ''; }
}
/** Never forward a persona, token, or unrelated query parameter in an invite. */
export function inviteUrl(base: string, code: string): string {
  const url = new URL(base);
  url.search = ''; url.hash = ''; url.searchParams.set('join', code);
  return url.toString();
}
export function inviteMessage(name: string, code: string): string {
  return `Join ${name} on SafeNight with code ${code}. Open Tonight → Join with a code. Sharing stays off until you choose it. This invitation expires.`;
}
export async function shareInvite(name: string, code: string): Promise<'shared' | 'copied' | 'cancelled'> {
  const url = inviteUrl(window.location.href, code);
  const text = inviteMessage(name, code);
  if (navigator.share) {
    try { await navigator.share({ title: `Join ${name}`, text, url }); return 'shared'; }
    catch (e) { if (e instanceof Error && e.name === 'AbortError') return 'cancelled'; throw e; }
  }
  await navigator.clipboard.writeText(`${text}\n${url}`);
  return 'copied';
}
