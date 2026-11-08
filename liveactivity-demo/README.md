# SafeNight Live Activity demo

A standalone, hardcoded iOS demo of the SafeNight Live Activity (lock screen card and Dynamic Island). It is not connected to SafeNight's backend and makes no network calls. Everything shown is SIMULATED (New Year's Eve, Times Square: six stages from "Concern reported" to "Sam is home").

## Run on an iPhone (about 10 minutes)

1. One time, in Terminal: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
2. Open `SafeNightLive.xcodeproj` in Xcode.
3. For both targets (`SafeNightLive` and `SafeNightLiveWidget`): Signing & Capabilities > Team = your Apple ID (a free account works; the app expires after 7 days).
4. If Xcode says the bundle id is taken, append your initials (for example `app.safenight.livedemo.ab`). Keep the widget id equal to the app id plus `.widget`.
5. iPhone: Settings > Privacy & Security > Developer Mode on (restarts the phone). Connect by cable and tap Trust.
6. Pick your phone as the run destination and press Run. On first launch trust the developer (see Troubleshooting).
7. Tap **Start demo**, then lock the phone. The card advances every 6 seconds; the final stage ends about 8 seconds after it appears.

The Dynamic Island needs an iPhone 14 Pro or newer. Older iPhones show only the lock screen card.

## Simulator

Download an iOS simulator runtime (Xcode > Settings > Components), choose an iPhone 14 Pro or newer simulator, and Run. Long-press the island to expand it.

## Troubleshooting

- "Live Activities are off": Settings > SafeNightLive > Live Activities on (also Settings > Face ID & Passcode, allow Live Activities when locked if needed).
- "Untrusted developer": Settings > General > VPN & Device Management > your Apple ID > Trust.
- Signing errors: confirm a Team is set on both targets and the bundle ids are unique.

CLI build check: `xcodegen generate && DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -project SafeNightLive.xcodeproj -scheme SafeNightLive -sdk iphoneos -configuration Debug CODE_SIGNING_ALLOWED=NO build`
