import type { ReactNode } from "react";
import {
  AlertCircle,
  ArrowUpRight,
  HeartHandshake,
  ShieldCheck,
} from "lucide-react";
import { Link } from "react-router-dom";
import type { Campaign } from "../types/caretrail";
import { xlm } from "../lib/http";
export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="CareTrail home">
      <HeartHandshake size={28} strokeWidth={1.8} />
      <span>
        CareTrail<span className="brand-dot">.</span>
      </span>
    </Link>
  );
}
export function Notice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "error" : ""}`}
      role={error ? "alert" : undefined}
    >
      {error ? <AlertCircle size={18} /> : <ShieldCheck size={18} />}
      <div>{children}</div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty panel">
      <h2>{title}</h2>
      <p>{children}</p>
    </div>
  );
}
export function Split({ amount }: { amount?: string }) {
  let total = 0n;
  if (amount && /^\d+(\.\d{0,7})?$/.test(amount)) {
    const [w, f = ""] = amount.split(".");
    total = BigInt(w) * 10_000_000n + BigInt(f.padEnd(7, "0"));
  }
  const campaign = (total * 9n) / 10n;
  return (
    <div className="split-well">
      <div className="split-label">
        <span>Campaign recipient</span>
        <strong>{total ? `${xlm(String(campaign))} XLM` : "90%"}</strong>
      </div>
      <div
        className="split-track"
        aria-label="90 percent to campaign and 10 percent to community"
      >
        <span />
      </div>
      <div className="split-label">
        <span>Community recipient</span>
        <strong>
          {total ? `${xlm(String(total - campaign))} XLM` : "10%"}
        </strong>
      </div>
    </div>
  );
}
export function CampaignCard({ campaign }: { campaign: Campaign }) {
  const percent = Math.min(
    100,
    Number(
      (BigInt(campaign.raised_stroops) * 100n) / BigInt(campaign.goal_stroops),
    ),
  );
  return (
    <article className="campaign-card panel">
      <div className={`campaign-art art-${campaign.category.toLowerCase()}`}>
        <CampaignImage category={campaign.category} />
        <span>{campaign.category}</span>
        <span className="art-note">
          {campaign.is_sample ? "Sample campaign" : "Illustrative image"}
        </span>
      </div>
      <div className="campaign-body">
        <div className="meta">{campaign.location}</div>
        <h2>
          <Link to={`/campaigns/${campaign.id}`}>{campaign.title}</Link>
        </h2>
        <p>{campaign.summary}</p>
        <div className="funding">
          <strong>
            {xlm(campaign.raised_stroops)} <small>XLM</small>
          </strong>
          <span>of {xlm(campaign.goal_stroops)} XLM goal</span>
        </div>
        <progress
          value={percent}
          max={100}
          aria-label={`${percent}% of campaign goal`}
        />
        <Link className="card-link" to={`/campaigns/${campaign.id}`}>
          Explore this cause <ArrowUpRight size={18} />
        </Link>
      </div>
    </article>
  );
}
export function CampaignImage({
  category,
  className = "",
}: {
  category: Campaign["category"];
  className?: string;
}) {
  const name = category.toLowerCase();
  const descriptions = {
    Relief:
      "Illustrative sample scene of a community volunteer arranging relief supplies",
    Medical:
      "Illustrative sample healthcare scene with a stethoscope on a consultation desk",
    Education:
      "Illustrative sample scene of books, school supplies and a blue backpack",
  };
  return (
    <img
      className={`campaign-photo ${className}`}
      src={`/images/campaign-${name}.webp`}
      srcSet={`/images/campaign-${name}-small.webp 640w, /images/campaign-${name}.webp 1200w`}
      sizes="(max-width: 640px) 100vw, (max-width: 900px) 33vw, 420px"
      alt={descriptions[category]}
      loading="lazy"
      decoding="async"
      width={1200}
      height={800}
    />
  );
}
