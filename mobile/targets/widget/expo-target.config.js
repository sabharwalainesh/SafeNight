/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: 'widget',
  name: 'SafeNightLive',
  displayName: 'SafeNight Live',
  bundleIdentifier: '.livewidget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'ActivityKit', 'AppIntents', 'WidgetKit'],
};
