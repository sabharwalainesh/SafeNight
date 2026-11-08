// Shared legal/safety copy for web and mobile. Plain data so both apps render it natively.
// Hackathon demo: this is a good-faith draft, not reviewed by a lawyer.

export type LegalSection = { heading: string; body: string[] };
export type LegalDoc = { title: string; updated: string; intro: string; sections: LegalSection[] };

export const PRIVACY_POLICY: LegalDoc = {
  title: 'Privacy Policy',
  updated: 'November 8, 2026',
  intro:
    'SafeNight helps friends look out for each other on a night out. We collect as little as we can, and you stay in control of what is shared and with whom.',
  sections: [
    {
      heading: 'What we collect',
      body: [
        'Profile: your display name, avatar emoji and an optional profile photo. Photos are resized to a small thumbnail and stripped of metadata (such as camera location) before upload.',
        'Phone number (optional): used only to call or text you about a safety alert. It is private to you and the alerting service; other members never see it.',
        'Group activity: the groups you join, check-ins ("I\'m okay", "Need help"), alerts and their timeline.',
        'Location: only when you turn sharing on, only with the people you choose, and only until it expires. You can choose approximate instead of precise location.',
      ],
    },
    {
      heading: 'What we do not collect',
      body: [
        'We do not upload your address book. When you pick a contact to invite, only the invite message leaves your device, through your own Messages or share sheet.',
        'We do not sell your data, show ads, or track you across other apps or websites.',
      ],
    },
    {
      heading: 'Who can see what',
      body: [
        'Your name and photo are visible to members of groups you are currently in.',
        'Your location is visible only to people you granted access to, for the time you chose.',
        'Trusted contacts you add can be alerted if you ask for help or miss a check-in.',
      ],
    },
    {
      heading: 'Automated safety assistant',
      body: [
        'When an alert is raised, an AI assistant (NVIDIA Nemotron) reads the alert details to decide whether to notify or call your friends. Its proposals are checked by fixed safety rules before anything is sent.',
        'Calls are placed through ElevenLabs and Photon. In this demo, any "dispatch" call is simulated and never reaches real emergency services.',
      ],
    },
    {
      heading: 'Retention and deletion',
      body: [
        'Check-ins are kept for the number of days you choose in privacy settings, then removed.',
        'You can delete your profile, photo, phone number, contacts and settings at any time from You → Delete my data.',
      ],
    },
    {
      heading: 'Contact',
      body: ['Questions about privacy: open an issue on the SafeNight GitHub repository.'],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  updated: 'November 8, 2026',
  intro: 'By using SafeNight you agree to these terms.',
  sections: [
    {
      heading: 'Not an emergency service',
      body: [
        'SafeNight is not a substitute for emergency services. If you or someone else is in immediate danger, call 911 (or your local emergency number) yourself.',
        'Alerts, calls and location updates can be delayed or fail because of network, battery or device settings.',
      ],
    },
    {
      heading: 'Use it kindly',
      body: [
        'Only invite people who want to join. Do not use SafeNight to track anyone without their consent.',
        'Venue reports must be honest. We may remove reports that are false or abusive.',
      ],
    },
    {
      heading: 'Demo status',
      body: ['This is a hackathon prototype provided as is, without warranties.'],
    },
  ],
};

export const SAFETY_NOTE = 'SafeNight is not an emergency service. In immediate danger, call 911.';

export const ACKNOWLEDGEMENTS = [
  'Map data © OpenStreetMap contributors',
  'AI reasoning by NVIDIA Nemotron',
  'Voice calls by ElevenLabs and Photon',
  'Realtime backend by SpacetimeDB',
];
