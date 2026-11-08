import SwiftUI
import ActivityKit

@main
struct SafeNightLiveApp: App {
    var body: some Scene {
        WindowGroup { ContentView().preferredColorScheme(.dark) }
    }
}

struct ContentView: View {
    @StateObject private var engine = DemoEngine.shared
    @State private var message: String?

    private func start() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            message = "Live Activities are off. Turn on Live Activities in Settings → SafeNightLive."
            return
        }
        message = nil
        engine.reset()
        do { try engine.start() } catch { message = "Could not start: \(error.localizedDescription)" }
    }

    private func tinted(_ title: String, _ color: Color, _ action: DemoAction) -> some View {
        Button { Task { await engine.perform(action) } } label: {
            Text(title).font(.subheadline.weight(.semibold)).foregroundStyle(color)
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(Capsule().fill(color.opacity(0.2)))
        }
        .buttonStyle(.plain)
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("SafeNight", systemImage: "shield.fill")
                        .font(.largeTitle.bold())
                    Text("Live Activity demo · hardcoded, no backend")
                        .foregroundStyle(.secondary)
                }
                if engine.current == nil {
                    Button { start() } label: {
                        Text("Start demo")
                            .font(.title3.bold()).frame(maxWidth: .infinity).padding(.vertical, 18)
                    }
                    .buttonStyle(.borderedProminent).tint(.blue)
                }
                if let m = message {
                    Text(m).foregroundStyle(.orange).font(.callout)
                }

                if engine.current != nil, engine.current?.showButtons != false {
                    HStack(spacing: 10) {
                        tinted("Check in", .orange, .checkIn)
                        tinted("I'm good", .green, .imGood)
                        tinted("Need help", .red, .needHelp)
                    }
                }

                if let s = engine.current {
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Image(systemName: "shield.fill").foregroundStyle(s.accent)
                            Text("SAFENIGHT").font(.caption2.weight(.semibold)).tracking(1).foregroundStyle(.secondary)
                            Spacer()
                            Text("SIMULATED").font(.system(size: 9, weight: .bold))
                                .padding(.horizontal, 6).padding(.vertical, 2)
                                .background(Capsule().fill(Color.white.opacity(0.18)))
                        }
                        Text(s.title).font(.headline)
                        Text(s.detail).font(.subheadline).foregroundStyle(.secondary)
                        if s.mode == .helpFlow {
                            HStack(spacing: 4) {
                                ForEach(0..<6, id: \.self) { i in
                                    Capsule().fill(i <= s.stage ? s.accent : Color.white.opacity(0.2)).frame(height: 5)
                                }
                            }
                        }
                    }
                    .padding().frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color(white: 0.1), in: RoundedRectangle(cornerRadius: 16))
                    Text("Lock your phone to use the same buttons on the lock screen card.")
                        .font(.footnote).foregroundStyle(.orange)
                }

                Button("Reset / End", role: .destructive) { engine.reset() }
                    .buttonStyle(.bordered).controlSize(.large)
                    .disabled(engine.current == nil)
                Text("SIMULATED · nobody is being contacted.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
    }
}
