import ActivityKit
import Foundation

/// Compiled into BOTH the app (via the SafeNightLiveActivity pod) and the widget extension
/// (from this folder: ../../../targets/widget/Shared, referenced by the podspec). ActivityKit needs the identical type on both sides.
public struct IncidentAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// e.g. "Possible impaired driving"
        public var kindLabel: String
        /// Headline, e.g. "Jordan is on the way"
        public var statusLabel: String
        public var subjectName: String
        public var helperName: String?
        public var etaMinutes: Int?
        /// 0...5: reported, asked, on the way, ride booked, picked up, home
        public var step: Int
        public var isSimulated: Bool
        public var updatedAt: Date

        public init(kindLabel: String, statusLabel: String, subjectName: String, helperName: String? = nil,
                    etaMinutes: Int? = nil, step: Int, isSimulated: Bool, updatedAt: Date) {
            self.kindLabel = kindLabel
            self.statusLabel = statusLabel
            self.subjectName = subjectName
            self.helperName = helperName
            self.etaMinutes = etaMinutes
            self.step = step
            self.isSimulated = isSimulated
            self.updatedAt = updatedAt
        }
    }

    public var incidentId: String

    public init(incidentId: String) { self.incidentId = incidentId }
}
