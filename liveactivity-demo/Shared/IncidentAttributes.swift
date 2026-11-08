import ActivityKit
import Foundation

struct IncidentAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var stage: Int            // 0...5
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

enum Scenario {
    static let attributes = IncidentAttributes(subjectName: "Sam", venue: "Times Square, NYC")

    static func state(_ stage: Int) -> IncidentAttributes.ContentState {
        let s = max(0, min(5, stage))
        let now = Date()
        switch s {
        case 0: return .init(stage: 0, title: "Concern reported", detail: "Alex is worried Sam may have been drinking. Sam: please don't drive.", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        case 1: return .init(stage: 1, title: "Maya asked to help", detail: "SafeNight called Maya · no answer yet", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        case 2: return .init(stage: 2, title: "Jordan is on the way", detail: "Jordan accepted and is heading to Sam", helperName: "Jordan", etaMinutes: 4, updatedAt: now, isSimulated: true)
        case 3: return .init(stage: 3, title: "Ride booked by Sam", detail: "Pickup at 7th Ave & W 47th", helperName: nil, etaMinutes: 6, updatedAt: now, isSimulated: true)
        case 4: return .init(stage: 4, title: "Picked up", detail: "On the way home", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        default: return .init(stage: 5, title: "Sam is home ✓", detail: "Confirmed by Sam", helperName: nil, etaMinutes: nil, updatedAt: now, isSimulated: true)
        }
    }
}
