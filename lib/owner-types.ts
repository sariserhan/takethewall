export interface SharedTakeover {
  previousOwnerName?: string | null;
  owner: {
    id: string;
    contentType: string;
    linkType: string;
    displayName: string;
    takeoverNumber: number | null;
    outboundLinkEnabled: boolean;
    websiteUrl: string;
    domain: string;
    description: string;
    morseMessage?: string;
    logoUrl: string | null;
    activatedAt: number;
    activationSequence: number;
    impressions: number;
    uniqueVisitors: number;
    clicks: number;
    kind: string;
  };
  active: boolean;
  replacedAt: number | null;
  publicId: string;
  searchIndexable?: boolean;
  editorial?: string;
}
export interface OwnerDashboard extends SharedTakeover {
  feedback?: "yes" | "no" | "unsure" | null;
  feedbackEligible?: boolean;
  contentRevision: number;
  weeklyDigestEnabled: boolean;
  milestoneAlerts?: "on" | "pending" | "off";
  shareUrl: string;
  shareVisitors?: number;
  shareTakeovers?: number;
  regions: { regionCode: string; impressions: number }[];
}
