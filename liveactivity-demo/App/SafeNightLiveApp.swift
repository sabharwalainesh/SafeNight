import SwiftUI
import ActivityKit

@main
struct SafeNightLiveApp: App {
    var body: some Scene {
        WindowGroup { ContentView().preferredColorScheme(.dark) }
    }
}

@MainActor
final class DemoModel: ObservableObject {
    @Published var stage = -1
    @Published var running = false
    @Published var message: String?
    private var activity: Activity<IncidentAttributes>?
    private var task: Task<Void, Never>?

    static let titles = (0...5).map { Scenario.state($0).title }

    func start() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            message = "Live Activities are off. Turn on Live Activities in Settings → SafeNightLive."
            return
        }
        message = nil
        reset()
        do {
            let content = ActivityContent(state: Scenario.state(0), staleDate: nil)
            activity = try Activity.request(attributes: Scenario.attributes, content: content)
            stage = 0
            running = true
            task = Task { [weak self] in
                while !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 6_000_000_000)
                    if Task.isCancelled { break }
                    await self?.next()
                    if (self?.stage ?? 5) >= 5 { break }
                }
            }
        } catch {
            message = "Could not start: \(error.localizedDescription)"
        }
    }

    func next() async {
        guard let activity, stage < 5 else { return }
        stage += 1
        let st = Scenario.state(stage)
        let content = ActivityContent(state: st, staleDate: nil)
        if stage == 5 {
            running = false
            await activity.end(content, dismissalPolicy: .after(Date().addingTimeInterval(8)))
            self.activity = nil
        } else {
            await activity.update(content)
        }
    }

    func reset() {
        task?.cancel(); task = nil
        running = false
        stage = -1
        let all = Activity<IncidentAttributes>.activities
        Task { for a in all { await a.end(nil, dismissalPolicy: .immediate) } }
        activity = nil
    }
}

struct ContentView: View {
    @StateObject private var model = DemoModel()

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("SafeNight", systemImage: "shield.fill")
                        .font(.largeTitle.bold())
                    Text("Live Activity demo · hardcoded, no backend")
                        .foregroundStyle(.secondary)
                }
                Button { model.start() } label: {
                    Text(model.stage < 0 ? "Start demo" : "Restart demo")
                        .font(.title3.bold()).frame(maxWidth: .infinity).padding(.vertical, 18)
                }
                .buttonStyle(.borderedProminent).tint(.blue)

                if let m = model.message {
                    Text(m).foregroundStyle(.orange).font(.callout)
                }
                if model.stage >= 0 {
                    Text("Lock your phone now to watch the lock screen card update.")
                        .font(.headline).foregroundStyle(.orange)
                }
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(0..<6, id: \.self) { i in
                        HStack(spacing: 12) {
                            Image(systemName: i < model.stage ? "checkmark.circle.fill" : (i == model.stage ? "circle.inset.filled" : "circle"))
                                .foregroundStyle(i <= model.stage ? stageColor(i) : .gray)
                            Text(DemoModel.titles[i])
                                .fontWeight(i == model.stage ? .bold : .regular)
                                .foregroundStyle(i == model.stage ? .primary : .secondary)
                        }
                    }
                }
                .padding().frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(white: 0.1), in: RoundedRectangle(cornerRadius: 16))

                HStack {
                    Button("Next step") { Task { await model.next() } }
                        .buttonStyle(.bordered).disabled(model.stage < 0 || model.stage >= 5)
                    Button("Reset / End", role: .destructive) { model.reset() }
                        .buttonStyle(.bordered)
                }
                .controlSize(.large)
                Text("SIMULATED · nobody is being contacted.")
                    .font(.footnote).foregroundStyle(.secondary)
            }
            .padding(20)
        }
        .background(Color.black.ignoresSafeArea())
    }
}

func stageColor(_ stage: Int) -> Color {
    stage <= 1 ? .orange : (stage <= 4 ? .blue : .green)
}
