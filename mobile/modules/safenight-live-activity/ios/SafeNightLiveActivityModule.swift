import ActivityKit
import ExpoModulesCore
import Foundation

struct IncidentAttrsRecord: Record {
    @Field var incidentId: String = ""
}

struct IncidentStateRecord: Record {
    @Field var kindLabel: String = ""
    @Field var statusLabel: String = ""
    @Field var subjectName: String = ""
    @Field var helperName: String?
    @Field var etaMinutes: Int?
    @Field var step: Int = 0
    @Field var isSimulated: Bool = true
    @Field var updatedAt: Double = 0 // epoch ms

    func toState() -> IncidentAttributes.ContentState {
        IncidentAttributes.ContentState(
            kindLabel: kindLabel, statusLabel: statusLabel, subjectName: subjectName,
            helperName: helperName, etaMinutes: etaMinutes, step: max(0, min(5, step)),
            isSimulated: isSimulated,
            updatedAt: updatedAt > 0 ? Date(timeIntervalSince1970: updatedAt / 1000) : Date())
    }
}

public class SafeNightLiveActivityModule: Module {
    private var observer: NSObjectProtocol?

    public func definition() -> ModuleDefinition {
        Name("SafeNightLiveActivity")
        Events("onIntent")

        OnStartObserving {
            self.observer = NotificationCenter.default.addObserver(
                forName: .safeNightLiveActivityIntent, object: nil, queue: .main
            ) { [weak self] note in
                guard let action = note.userInfo?["action"] as? String else { return }
                SafeNightIntentBus.pending.removeAll()
                self?.sendEvent("onIntent", ["action": action])
            }
            // Deliver anything that fired before JS started listening.
            let queued = SafeNightIntentBus.pending
            SafeNightIntentBus.pending.removeAll()
            for a in queued { self.sendEvent("onIntent", ["action": a]) }
        }
        OnStopObserving {
            if let o = self.observer { NotificationCenter.default.removeObserver(o) }
            self.observer = nil
        }

        Function("areActivitiesEnabled") { () -> Bool in
            ActivityAuthorizationInfo().areActivitiesEnabled
        }

        Function("start") { (attrs: IncidentAttrsRecord, state: IncidentStateRecord) throws -> String in
            let content = ActivityContent(state: state.toState(), staleDate: nil)
            let activity = try Activity.request(
                attributes: IncidentAttributes(incidentId: attrs.incidentId), content: content, pushType: nil)
            return activity.id
        }

        AsyncFunction("update") { (id: String, state: IncidentStateRecord) in
            guard let a = Activity<IncidentAttributes>.activities.first(where: { $0.id == id }) else { return }
            await a.update(ActivityContent(state: state.toState(), staleDate: nil))
        }

        AsyncFunction("end") { (id: String, state: IncidentStateRecord?, dismissAfterSeconds: Double?) in
            guard let a = Activity<IncidentAttributes>.activities.first(where: { $0.id == id }) else { return }
            let final = state.map { ActivityContent(state: $0.toState(), staleDate: nil) }
            let policy: ActivityUIDismissalPolicy =
                dismissAfterSeconds.map { .after(Date().addingTimeInterval($0)) } ?? .immediate
            await a.end(final, dismissalPolicy: policy)
        }

        AsyncFunction("endAll") { () in
            for a in Activity<IncidentAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
        }
    }
}
