import ActivityKit
import AppIntents
import Foundation

enum DemoAction { case checkIn, imGood, needHelp }

/// Hardcoded state machine shared by the app and the Live Activity buttons.
/// LiveActivityIntents run in the app's process, so the auto-advance Task lives here.
@MainActor
final class DemoEngine: ObservableObject {
    static let shared = DemoEngine()
    @Published private(set) var current: IncidentAttributes.ContentState?
    private var advanceTask: Task<Void, Never>?

    nonisolated static func next(_ s: IncidentAttributes.ContentState, _ a: DemoAction) -> IncidentAttributes.ContentState? {
        switch a {
        case .checkIn:
            return s.helpInProgress ? nil : Scenario.checkInDue()
        case .imGood:
            if s.helpInProgress {
                var n = s
                n.detail = "Check-in noted. Your alert stays open until you confirm you're home."
                n.updatedAt = Date()
                return n
            }
            return Scenario.allGood()
        case .needHelp:
            return s.helpInProgress ? nil : Scenario.state(1)
        }
    }

    func start() throws {
        let content = ActivityContent(state: Scenario.allGood(), staleDate: nil)
        _ = try Activity.request(attributes: Scenario.attributes, content: content)
        current = Scenario.allGood()
    }

    func perform(_ a: DemoAction) async {
        if Activity<IncidentAttributes>.activities.isEmpty { try? start() }
        for act in Activity<IncidentAttributes>.activities {
            guard let n = Self.next(act.content.state, a) else { continue }
            await act.update(ActivityContent(state: n, staleDate: nil))
            current = n
        }
        if a == .needHelp, current?.helpInProgress == true { startAdvancing() }
    }

    private func startAdvancing() {
        guard advanceTask == nil else { return }
        advanceTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 6_000_000_000)
                if Task.isCancelled { break }
                guard let self else { return }
                let more = await self.advance()
                if !more { break }
            }
            self?.advanceTask = nil
        }
    }

    /// Returns true while more stages remain.
    func advance() async -> Bool {
        var more = false
        for act in Activity<IncidentAttributes>.activities {
            let s = act.content.state
            guard s.helpInProgress else { continue }
            let n = Scenario.state(s.stage + 1)
            current = n
            let content = ActivityContent(state: n, staleDate: nil)
            if n.stage >= 5 {
                await act.end(content, dismissalPolicy: .after(Date().addingTimeInterval(8)))
            } else {
                await act.update(content)
                more = true
            }
        }
        return more
    }

    func reset() {
        advanceTask?.cancel()
        advanceTask = nil
        current = nil
        let all = Activity<IncidentAttributes>.activities
        Task { for a in all { await a.end(nil, dismissalPolicy: .immediate) } }
    }
}

struct CheckInIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Check in"
    func perform() async throws -> some IntentResult {
        await DemoEngine.shared.perform(.checkIn)
        return .result()
    }
}

struct ImGoodIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "I'm good"
    func perform() async throws -> some IntentResult {
        await DemoEngine.shared.perform(.imGood)
        return .result()
    }
}

struct NeedHelpIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Need help"
    func perform() async throws -> some IntentResult {
        await DemoEngine.shared.perform(.needHelp)
        return .result()
    }
}
