import { createFileRoute } from "@tanstack/react-router";
import { MarketingLanding3B } from "@/components/marketing-landing-3b";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mada — وكيل الطلبات الذكي للمطاعم" },
      {
        name: "description",
        content:
          "من أول رسالة إلى طلب جاهز للمطبخ. منصة Mada تستقبل طلبات الزبائن، تؤكد التفاصيل، وتدير القنوات والفروع من لوحة واحدة.",
      },
      { name: "theme-color", content: "#f7f2e7" },
      { property: "og:title", content: "Mada — وكيل الطلبات الذكي للمطاعم" },
      {
        property: "og:description",
        content: "وكيل ذكي يفهم طلب الزبون، يؤكد التفاصيل، ويرسل الطلب جاهزاً للمطبخ.",
      },
      { property: "og:locale", content: "ar_IQ" },
      { property: "og:image", content: "/landing/kitchen-hero.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "/landing/kitchen-hero.webp" },
    ],
  }),
  component: MarketingLanding3B,
});
