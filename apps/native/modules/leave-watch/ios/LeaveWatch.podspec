Pod::Spec.new do |s|
  s.name           = 'LeaveWatch'
  s.version        = '1.0.0'
  s.summary        = 'WatchConnectivity bridge for the leave watch companion app'
  s.description    = 'Publishes the widget timeline to the paired Apple Watch via WCSession'
  s.license        = 'MIT'
  s.author         = 'leave'
  s.homepage       = 'https://github.com/jhyunwoo/leave'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
