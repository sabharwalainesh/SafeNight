import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

@main
struct SafeNightLiveBundle: WidgetBundle {
    var body: some Widget { SafeNightLiveActivity() }
}

private typealias State = IncidentAttributes.ContentState

private extension IncidentAttributes.ContentState {
    var accent: Color { step <= 1 ? .orange : (step <= 4 ? .blue : .green) }
    var isHome: Bool { step >= 5 }
}

private struct ProgressBar: View {
    let state: State
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<6, id: \.self) { i in
                Capsule().fill(i <= state.step ? state.accent : Color.white.opacity(0.2)).frame(height: 5)
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
    private func pill(_ t: String, _ c: Color) -> some View {
        Text(t).font(.caption.weight(.semibold)).foregroundStyle(c)
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(Capsule().fill(c.opacity(0.22)))
    }

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: CheckInIntent()) { pill("Check in", .orange) }
            Button(intent: ImGoodIntent()) { pill("I'm good", .green) }
            Button(intent: NeedHelpIntent()) { pill("Need help", .red) }
        }
        .buttonStyle(.plain)
    }
}

private func shortStatus(_ s: State) -> String {
    if s.isHome { return "Home ✓" }
    if let e = s.etaMinutes { return "\(e) min" }
    return "\(s.step + 1)/6"
}

private struct LockScreenView: View {
    let state: State
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
                    Text(state.statusLabel).font(.headline).foregroundStyle(.white).privacySensitive()
                    Text("\(state.kindLabel) · \(state.subjectName)").font(.subheadline).foregroundStyle(.secondary).privacySensitive()
                }
                Spacer(minLength: 8)
                if state.helperName != nil || state.etaMinutes != nil {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let h = state.helperName { Text(h).font(.subheadline.weight(.semibold)).foregroundStyle(.white).privacySensitive() }
                        if let e = state.etaMinutes { Text("\(e) min").font(.title3.bold()).foregroundStyle(state.accent) }
                    }
                }
            }
            ProgressBar(state: state)
            if !state.isHome { ActionButtons() }
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
                    Text(context.state.statusLabel).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("\(context.state.kindLabel) · \(context.state.subjectName)")
                            .privacySensitive()
                            .font(.subheadline).foregroundStyle(.secondary)
                        ProgressBar(state: context.state)
                        if !context.state.isHome { ActionButtons() }
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
