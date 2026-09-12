export interface SharedTakeover {
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
}
export interface OwnerDashboard extends SharedTakeover {
  contentRevision: number;
  weeklyDigestEnabled: boolean;
  shareUrl: string;
  regions: { regionCode: string; impressions: number }[];
}
