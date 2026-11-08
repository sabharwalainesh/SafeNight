# Minimal UI redesign — November 8, 2026

Editable Figma: https://www.figma.com/design/IkZo2MoprIda05xSUmK97n

The file contains representative Tonight, Night Out, Map, Alerts, Incident,
You and Venue reports screens, a desktop map layout, and a feature contract.
These are design references, not an executable prototype or an exhaustive
representation of every state. Map diagrams in Figma are schematic.
Figma uses Inter (the existing web font fallback) because SF Pro standalone
text did not render correctly through the design service. Apps retain their
native/system font stacks.

## Implemented presentation changes

- Shared charcoal surfaces, quiet neutral secondary controls, one blue action
  accent, more whitespace, readable headings and 44px minimum small controls.
- Web sidebar on desktop, existing four tabs on narrow displays. All routes
  remain available, including reports and diagnostics under You.
- Native header and tab hierarchy; runtime modes, identity, server and database
  details remain accessible under Connection details. Failures stay visible.
- Web map: named pins, selected member rows, accuracy and source labels,
  stale treatment without fading away the person's name, uncertainty circles,
  fit-to-group control and a 1.1-second scan effect. Existing location-post action
  remains simulated and explicitly labeled. No new geolocation permissions.
- Native map: selectable relative-position overview alongside the existing
  consent-filtered location list. This is not an embedded street map or routing
  engine. Overlapping markers remain accessible through individual list rows.
- Both scan effects only present already-authorized coordinates, never publish
  a location or claim a calculated safest/best route. Reduced motion skips them.

## Feature preservation

| Existing feature family | Location after redesign |
| --- | --- |
| Create/join, duration/cadence where available, session roster | Tonight and existing session details |
| Create/revoke invitations, leave/end session | Existing session controls |
| Volunteer/accept/withdraw/replace driver | Existing driver controls |
| Sharing scope, per-recipient grants, expiry, revoke | Existing sharing and consent controls |
| Okay, friend, ride, unwell, home and emergency check-ins | Existing status controls and help sheet |
| Private consumption, trusted-friend concerns, deterministic warning | Existing concern sheet and warning banner |
| Incident acknowledgment, decline, timeline, cancellation/resolution | Existing Alerts/incident screens |
| Nemotron plans, actions, receipts and coordination | Existing incident/coordination panels |
| Ride proposal, acceptance, booking, pickup and explicit home confirmation | Existing ride/home controls |
| Reports, votes, moderation, staffed resources | Existing web reports screen |
| Profile/phone, trusted contacts, privacy and deletion | Existing You screens |
| Demo/persona controls, diagnostics, live/mock distinctions | Existing entry points and native Connection details |
| Native Live Activity integration | Existing integration, unchanged |

No backend, permission checks, reducer contracts or feature providers were
removed. Platform differences have not been silently filled with mock features.
Blueprint-only Watch, widgets, re-exit and other planned capabilities remain
planned; this UI work does not deprecate or claim to implement them.

## Verification

Web production build and existing 117-test suite passed, including contrast,
accessibility and safety-flow checks. A new map regression test passed: focusing
or scanning keeps the four visible members and never calls postLocation.
Native TypeScript and all five existing native tests passed. Web map and member
list were visually inspected in the browser with a local mock group. Figma map,
home, incident and contract frames were screenshot-checked after text/contrast
fixes. Native device/simulator rendering was not exercised.
