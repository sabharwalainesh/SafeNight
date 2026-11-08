import WidgetKit
import SwiftUI
import ActivityKit

@main
struct SafeNightLiveBundle: WidgetBundle {
    var body: some Widget { SafeNightLiveActivity() }
}

private func color(_ stage: Int) -> Color {
    stage <= 1 ? .orange : (stage <= 4 ? .blue : .green)
}

private struct ProgressBar: View {
    let stage: Int
    var body: some View {
        HStack(spacing: 4) {
            ForEach(0..<6, id: \.self) { i in
                Capsule().fill(i <= stage ? color(stage) : Color.white.opacity(0.2)).frame(height: 5)
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

private func shortStatus(_ s: IncidentAttributes.ContentState) -> String {
    if s.stage >= 5 { return "Home ✓" }
    if let e = s.etaMinutes { return "\(e) min" }
    return "\(s.stage + 1)/6"
}

struct LockScreenView: View {
    let state: IncidentAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "shield.fill").foregroundStyle(color(state.stage))
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
                        if let e = state.etaMinutes { Text("\(e) min").font(.title3.bold()).foregroundStyle(color(state.stage)) }
                    }
                }
            }
            ProgressBar(stage: state.stage)
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
                    Image(systemName: "shield.fill").foregroundStyle(color(context.state.stage)).font(.title2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text(shortStatus(context.state)).font(.headline).foregroundStyle(color(context.state.stage))
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.state.title).font(.headline)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.detail).font(.subheadline).foregroundStyle(.secondary)
                        ProgressBar(stage: context.state.stage)
                        if context.state.isSimulated { SimBadge() }
                    }
                }
            } compactLeading: {
                Image(systemName: "shield.fill").foregroundStyle(color(context.state.stage))
            } compactTrailing: {
                Text(shortStatus(context.state)).font(.caption.weight(.semibold)).foregroundStyle(color(context.state.stage))
            } minimal: {
                Image(systemName: "shield.fill").foregroundStyle(color(context.state.stage))
            }
        }
    }
}
