import AppIntents
import Foundation

extension Notification.Name {
    /// Posted (userInfo["action"]) when a Live Activity button runs in the app process.
    public static let safeNightLiveActivityIntent = Notification.Name("app.safenight.liveactivity.intent")
}

/// Pending actions are kept so the module can deliver one if JS was not listening yet.
public enum SafeNightIntentBus {
    public static var pending: [String] = []
    public static func post(_ action: String) {
        pending.append(action)
        NotificationCenter.default.post(name: .safeNightLiveActivityIntent, object: nil, userInfo: ["action": action])
    }
}

public struct CheckInIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Check in"
    public static var openAppWhenRun: Bool = true
    public init() {}
    public func perform() async throws -> some IntentResult {
        SafeNightIntentBus.post("check_in")
        return .result()
    }
}

public struct ImGoodIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "I'm good"
    public init() {}
    public func perform() async throws -> some IntentResult {
        SafeNightIntentBus.post("im_good")
        return .result()
    }
}

public struct NeedHelpIntent: LiveActivityIntent {
    public static var title: LocalizedStringResource = "Need help"
    public init() {}
    public func perform() async throws -> some IntentResult {
        SafeNightIntentBus.post("need_help")
        return .result()
    }
}
