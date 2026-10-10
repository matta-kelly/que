import { Inria_Sans, Source_Code_Pro } from "next/font/google";

// Fonts. Previously liked: body Inter, titles Inter 600. Swap back by using
// `Inter` here and in app/layout.tsx.

// Body text (applied in app/layout.tsx).
export const bodyFont = Inria_Sans({ subsets: ["latin"], weight: ["300", "400", "700"] });

// Title font: page headings.
export const titleFont = Inria_Sans({ subsets: ["latin"], weight: "700" });

// Brand font: the "Lotus and Luna" name.
export const brandFont = Source_Code_Pro({ subsets: ["latin"], weight: "600" });
