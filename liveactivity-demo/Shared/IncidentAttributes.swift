import ActivityKit
import Foundation
import SwiftUI

struct IncidentAttributes: ActivityAttributes {
    enum Mode: String, Codable, Hashable { case checkInDue, allGood, helpFlow }

    struct ContentState: Codable, Hashable {
        var mode: Mode
        var stage: Int            // 0...5 (progress, used in helpFlow)
        var title: String
        var detail: String
        var helperName: String?
        var etaMinutes: Int?
        var updatedAt: Date
        var isSimulated: Bool
    }
    var subjectName: String
    var venue: String
}

extension IncidentAttributes.ContentState {
    var accent: Color {
        switch mode {
        case .checkInDue: return .orange
        case .allGood: return .green
        case .helpFlow: return stage <= 1 ? .orange : (stage <= 4 ? .blue : .green)
        }
    }
    var helpInProgress: Bool { mode == .helpFlow && stage < 5 }
    var showButtons: Bool { !(mode == .helpFlow && stage >= 5) }
}

enum Scenario {
    static let attributes = IncidentAttributes(subjectName: "Sam", venue: "Times Square, NYC")

    static func checkInDue() -> IncidentAttributes.ContentState {
        .init(mode: .checkInDue, stage: 0, title: "Check-in time", detail: "Are you okay, Sam? Tap I'm good or Need help.", helperName: nil, etaMinutes: nil, updatedAt: Date(), isSimulated: true)
    }

    static func allGood() -> IncidentAttributes.ContentState {
        .init(mode: .allGood, stage: 0, title: "You're checked in ✓", detail: "Friends can see you're okay · next check-in in 30 min", helperName: nil, etaMinutes: nil, updatedAt: Date(), isSimulated: true)
    }

    static func state(_ stage: Int) -> IncidentAttributes.ContentState {
        let s = max(0, min(5, stage))
        let now = Date()
        switch s {
        case 0: return .init(mode: .helpFlow, stage: 0, title: "Concern reported", detail: "Alex is worried Sam may have been drinking. Sam: please don't drive.", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        case 1: return .init(mode: .helpFlow, stage: 1, title: "Maya asked to help", detail: "SafeNight called Maya · no answer yet", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        case 2: return .init(mode: .helpFlow, stage: 2, title: "Jordan is on the way", detail: "Jordan accepted and is heading to Sam", helperName: "Jordan", etaMinutes: 4, updatedAt: now, isSimulated: true)
        case 3: return .init(mode: .helpFlow, stage: 3, title: "Ride booked by Sam", detail: "Pickup at 7th Ave & W 47th", helperName: nil, etaMinutes: 6, updatedAt: now, isSimulated: true)
        case 4: return .init(mode: .helpFlow, stage: 4, title: "Picked up", detail: "On the way home", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        default: return .init(mode: .helpFlow, stage: 5, title: "Sam is home ✓", detail: "Confirmed by Sam", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        }
    }
}
