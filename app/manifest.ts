import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Take The Wall",
    short_name: "TakeTheWall",
    description: "One wall. One owner. $4.99.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f0e7",
    theme_color: "#dfff00",
    icons: [192, 512].map((size) => ({
      src: `/brand/takethewall-icon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
    })),
  };
}
