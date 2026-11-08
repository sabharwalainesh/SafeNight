# Judging script (about 5 minutes, no calls)

**Setup before the judges arrive (2 min):** both phones and one laptop on <https://safenight-liart.vercel.app>, refreshed once. Laptop tab 1 = Alex (`?as=alex`), phone 1 = Sam, phone 2 = Maya, laptop tab 2 = Jordan. Alex: You → Judge demo → **Reset demo group** → **Yes** → **Set up demo group**. Allow location on both phones. Keep the deck's architecture slide open on a second laptop or the pitch PDF.

**Backup if Wi‑Fi or Maincloud misbehaves:** one phone → You → **Demo mode (UT Dallas)**. It runs the whole story offline-from-server with simulated people (steps 7–8 below are the same features).

## 1. Problem and setup · 30 s
Deck slides 1–3 while the apps load. "Groups split up, a sent message is not help, always-on tracking gets turned off. SafeNight is consent first; the agent proposes, people decide."

## 2. Group, consent, driver · 45 s (Alex laptop + Sam phone)
- Alex → Tonight → the hangout: four people, Sam has the **Driver ✓** badge (he accepted explicitly).
- Sam phone → the session → **What I share**: approximate vs precise, duration, per-person toggles. "Every grant has a scope and an expiry."
- Alex → Map: real pins for both phones, accuracy circles. "This is live GPS over one WebSocket subscription; laptops with location blocked simply don't appear."

## 3. Deterministic safety rule · 20 s (Alex → Sam)
- Alex → Map → **Need help** → **Report a concern about someone** → Sam → "May have been drinking" → Send.
- Sam's phone shows **Do not drive** instantly. "No AI in that path. A rule fired on the server and the event table pushed it."

## 4. Nemotron agent with receipts · 60 s (Alex / Maya / Jordan)
- Alex → Alerts → the incident: **plan v1** from Nemotron, tool receipts, message to Maya marked **sent → delivered**, labeled SIMULATED. Point at "source: model" vs "source: policy".
- Maya phone: alert arrives; do nothing. "Delivered is not acknowledged."
- Alex → You → **Advance timer**: escalation, **plan v2** goes to Jordan.
- Jordan laptop → Alerts → incident → **I'm on it**. Status becomes acknowledged. "Humans close loops; the agent cannot resolve anything."

## 5. Ride and home · 30 s (Sam phone)
- Incident shows ride options (deep links; nothing is booked by the app). Sam: **Choose this → I booked this → Confirm pickup → I'm home safe → Yes**.
- Every screen flips to **Resolved by Sam**.

## 6. Come to me (live finder) · 60 s (Maya phone → Jordan)
- Maya → Map → **Need help** → **Come to me**.
- Jordan (laptop or phone 1 after switching persona) → tap the banner → **Accept & navigate**: live map with both people, distance ±m, the green "Live" dot (4 Hz SpacetimeDB stream), **Get walking directions** opens Apple/Google Maps. Maya sees "Jordan is coming · N m".
- **I've arrived** → "✓ Jordan arrived" on both. "Precise sharing existed only between those two, only until arrival. The grants are revoked server-side."

## 7. Demo mode (optional, 45 s) · one phone
You → **Demo mode (UT Dallas)**. Show the live status card (I'm okay / Need help), the alert, the Nemotron panel with policy badges, the OSRM route with turn-by-turn and **Simulate walking**, Messages with unread badge, the summary. "This is the scripted version we use when we can't bring four people."

## 8. Tech close · 30 s
Architecture slide. "One SpacetimeDB module is the whole backend: 40+ tables, 50+ reducers, per-user views with row-level security, scheduled reducers, event tables, a live position stream. Nemotron 3.5 runs inside a scheduled procedure with a policy allowlist. The client is a PWA on Vercel; phones install it from Safari."

## Questions judges ask, and the answer
- **Is the AI in the safety path?** No. Rules (do-not-drive, consent, emergency blocks) are deterministic. Nemotron only plans contact order and messages, through an allowlist, and every step is a receipt.
- **Privacy?** Consent per person, per scope, with expiry; RLS means the server never sends a row you weren't granted. Delete my data wipes everything.
- **What's simulated?** Messaging/calls (bridge off). Locations and the whole data path are real.
- **Why SpacetimeDB?** Transactions + subscriptions in one place: the no-drive banner lands in under a second with no API tier.

## Reset between groups of judges
Any device → You → Judge demo → Reset demo group → Yes → Set up demo group. Hard-refresh a phone if a screen looks stale.
