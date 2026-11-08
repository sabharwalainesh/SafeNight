Pod::Spec.new do |s|
  s.name           = 'SafeNightLiveActivity'
  s.version        = '1.0.0'
  s.summary        = 'SafeNight incident Live Activity bridge'
  s.description    = 'ActivityKit bridge for SafeNight incident Live Activities'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '17.0' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = ["*.swift", "../../../targets/widget/Shared/*.swift"]
end
