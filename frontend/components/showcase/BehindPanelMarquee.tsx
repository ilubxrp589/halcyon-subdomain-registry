"use client";

import { MarqueeRow } from "./MarqueeRow";
import { ShowcaseImage } from "@/services/api";

interface BehindPanelMarqueeProps {
  images: ShowcaseImage[];
}

export function BehindPanelMarquee({ images }: BehindPanelMarqueeProps) {
  if (images.length === 0) {
    return null;
  }

  return (
    <div className="behind-panel-marquee">
      <MarqueeRow
        images={images}
        direction="right"
        speed="medium"
        cardSize={240}
        gap={12}
      />
    </div>
  );
}

export default BehindPanelMarquee;
