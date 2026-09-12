export interface HistoryPage {
  entries: {
    publicId: string;
    name: string;
    description: string;
    image: string | null;
    activatedAt: number;
    replacedAt: number | null;
    sequence: number;
    live: boolean;
  }[];
  next: number | null;
}
