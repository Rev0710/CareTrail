export type Campaign = {
  id: string;
  organizer_id: string | null;
  title: string;
  summary: string;
  story: string;
  category: "Relief" | "Medical" | "Education";
  location: string;
  goal_stroops: string;
  raised_stroops: string;
  is_sample: boolean;
  status: string;
  created_at: string;
};
export type CampaignUpdate = {
  id: string;
  title: string;
  body: string;
  expense_stroops: string;
  outcome: string;
  created_at: string;
};
export type Donation = {
  id: string;
  campaign_id: string;
  amount_stroops: string;
  campaign_stroops: string;
  community_stroops: string;
  status:
    "draft" | "prepared" | "pending" | "confirmed" | "failed" | "needs_review";
  network: "testnet";
  tx_hash: string | null;
  created_at: string;
  campaigns?: { title: string };
};
