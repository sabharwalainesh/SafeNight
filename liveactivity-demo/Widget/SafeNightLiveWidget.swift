import WidgetKit
import SwiftUI
import ActivityKit
import AppIntents

@main
struct SafeNightLiveBundle: WidgetBundle {
    var body: some Widget { SafeNightLiveActivity() }
}

private typealias State = IncidentAttributes.ContentState

private struct ProgressBar: View {
    let state: State
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<6, id: \.self) { i in
                Capsule().fill(i <= state.stage ? state.accent : Color.white.opacity(0.2)).frame(height: 5)
            }
        }
    }
}

private struct SimBadge: View {
    var body: some View {
        Text("SIMULATED").font(.system(size: 9, weight: .bold)).padding(.horizontal, 6).padding(.vertical, 2)
            .background(Capsule().fill(Color.white.opacity(0.18))).foregroundStyle(.white)
    }
}

private struct ActionButtons: View {
    let state: State

    private func pill(_ t: String, _ c: Color) -> some View {
        Text(t).font(.caption.weight(.semibold)).foregroundStyle(c)
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(Capsule().fill(c.opacity(0.22)))
    }

    var body: some View {
        if state.showButtons {
            HStack(spacing: 8) {
                Button(intent: CheckInIntent()) { pill("Check in", .orange) }
                Button(intent: ImGoodIntent()) { pill("I'm good", .green) }
                Button(intent: NeedHelpIntent()) { pill("Need help", .red) }
            }
            .buttonStyle(.plain)
        }
    }
}

private func shortStatus(_ s: State) -> String {
    if s.mode == .checkInDue { return "Check in" }
    if s.mode == .allGood { return "OK ✓" }
    if s.stage >= 5 { return "Home ✓" }
    if let e = s.etaMinutes { return "\(e) min" }
    return "\(s.stage + 1)/6"
}

struct LockScreenView: View {
    let state: IncidentAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "shield.fill").foregroundStyle(state.accent)
                Text("SAFENIGHT").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                Spacer()
                if state.isSimulated { SimBadge() }
            }
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.title).font(.headline).foregroundStyle(.white)
                    Text(state.detail).font(.subheadline).foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if state.helperName != nil || state.etaMinutes != nil {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let h = state.helperName { Text(h).font(.subheadline.weight(.semibold)).foregroundStyle(.white) }
                        if let e = state.etaMinutes { Text("\(e) min").font(.title3.bold()).foregroundStyle(state.accent) }
                    }
                }
            }
            if state.mode == .helpFlow { ProgressBar(state: state) }
            ActionButtons(state: state)
        }
        .padding(16)
        .activityBackgroundTint(.black)
        .activitySystemActionForegroundColor(.white)
    }
}

struct SafeNightLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: IncidentAttributes.self) { context in
            LockScreenView(state: context.state)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "shield.fill").foregroundStyle(context.state.accent).font(.title2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(shortStatus(context.state)).font(.headline).foregroundStyle(context.state.accent)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.detail).font(.subheadline).foregroundStyle(.secondary)
                        if context.state.mode == .helpFlow { ProgressBar(state: context.state) }
                        ActionButtons(state: context.state)
                        if context.state.isSimulated { SimBadge() }
                    }
                }
            } compactLeading: {
                Image(systemName: "shield.fill").foregroundStyle(context.state.accent)
            } compactTrailing: {
                Text(shortStatus(context.state)).font(.caption.weight(.semibold)).foregroundStyle(context.state.accent)
            } minimal: {
                Image(systemName: "shield.fill").foregroundStyle(context.state.accent)
            }
        }
    }
}
