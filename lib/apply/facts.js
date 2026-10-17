// Your fact bank. Every CV, cover letter and proposal the Apply tool makes
// is built ONLY from what is written here. Nothing is invented.
//
// To add a skill: add it to a skills group with the words job posts use for it.
// To add an achievement: add a bullet to a job with tags (words that make it relevant).
// Keep every line true. If you could not talk about it for two minutes in an
// interview, it does not belong here.

(function (root) {
  const FACTS = {
    person: {
      name: "Bryan Temple Onyenghan",
      brand: "Mr Accessibility",
      cpacc: "CPACC #24MJCBO132",
      location: "Abuja, Nigeria",
      remote: "Open to remote: US, UK, EU",
      email: "bryanonyen@gmail.com",
      phone: "+234 814 749 8009",
      linkedin: "https://www.linkedin.com/in/bryanonyenghan",
      portfolio: "https://bryanonyen.vercel.app",
      behance: "https://www.behance.net/gallery/252950233/BINT-Rider-Compatibility-Landing-page",
      business: "Bihub Technology (CAC BN-7748743)",
    },

    // Each track is one kind of role. The tool picks the track whose words
    // appear most in the job post.
    tracks: {
      accessibility: {
        label: "Accessibility",
        title: "Accessibility Engineer and Inclusive Web Developer (CPACC)",
        titleOk: /accessib|a11y|wcag|inclusive|compliance|section 508|ada /i,
        words: ["accessibility", "accessible", "a11y", "wcag", "aria", "screen reader", "section 508", "ada", "inclusive", "assistive", "remediation", "audit", "vpat", "compliance", "nvda", "jaws", "voiceover", "eaa", "pdf/ua"],
        profile: "CPACC-certified accessibility engineer who audits, designs and ships inclusive web experiences in React, Next.js, Shopify and WordPress. At Lotus, an assistive technology company named a TIME Best Invention, I delivered 100% PDF/UA compliance (0 failures across 163 tags). I also built its Shopify components to WCAG 2.2 AA across 30+ locales. I pair audit rigor with hands-on code, so teams fix issues fast and ship on time.",
        hook: "A 94% load-time cut. Zero PDF/UA failures across 163 tags. A 36-page healthcare site built to WCAG 2.2 AA.",
        story: "One example: a Shopify store was loading in 12.41 seconds. I found three causes, fixed them, and it now loads in 0.79 seconds. Every Core Web Vital went from red to green, and every fix stayed keyboard and screen reader friendly.",
      },
      frontend: {
        label: "Front-end",
        title: "Front-End Developer, React, Next.js and Shopify (CPACC)",
        titleOk: /front|web developer|software engineer|javascript|react|next|shopify|ui engineer|developer/i,
        words: ["react", "next.js", "nextjs", "typescript", "javascript", "front-end", "frontend", "front end", "shopify", "liquid", "tailwind", "css", "html", "supabase", "api", "web developer", "performance", "core web vitals", "component"],
        profile: "Front-end developer who ships fast, accessible products in React, Next.js and Shopify Liquid. I took a Shopify store from a 12.41s to a 0.79s load time. I also built live SaaS products on Next.js and Supabase with real Paystack payments. Every interface I build works with a keyboard and a screen reader from day one.",
        hook: "I built Bihub, a live storefront platform with Paystack payments, on Next.js and Supabase. I also took a Shopify store from 12.41s to 0.79s.",
        story: "One example: WashCare runs many laundries on one system, and each one's customer data has to stay private. I enforce that in Postgres row-level security on Supabase, so a bug in the app code still can't leak one laundry's data to another.",
      },
      design: {
        label: "Design",
        title: "Product and UX Designer, Accessibility-Focused (CPACC)",
        titleOk: /design|ux|ui|product designer|interaction/i,
        words: ["figma", "ux", "ui", "user experience", "product design", "designer", "wireframe", "prototype", "usability", "user research", "design system", "interaction", "visual design", "typography"],
        profile: "CPACC-certified product designer who runs the full loop: research, wireframes, prototypes, usability testing, then production code. I test with assistive technology most design teams never use, and I ship what I design. At Lotus, a TIME Best Invention, I design Shopify experiences and an editorial accessibility playbook. As a founder I designed and launched live products.",
        hook: "Someone opens your product, can't reach the main button with a keyboard, and leaves. You never hear about it. That's the problem I design out, before the first build.",
        story: "At Lotus I designed an editorial accessibility playbook with its own type system and grid, and shipped Shopify components from wireframe to production across 30+ locales.",
      },
    },

    // Skills you really have. "aliases" are the words a job post might use.
    skills: [
      { group: "Accessibility standards", items: [
        { label: "WCAG 2.2 AA", aliases: ["wcag", "wcag 2.1", "wcag 2.2", "web content accessibility guidelines"] },
        { label: "ARIA", aliases: ["aria", "wai-aria"] },
        { label: "Section 508", aliases: ["section 508", "508"] },
        { label: "ADA", aliases: ["ada", "americans with disabilities act"] },
        { label: "European Accessibility Act", aliases: ["european accessibility act", "eaa", "en 301 549"] },
        { label: "PDF/UA", aliases: ["pdf/ua", "accessible pdf", "pdf accessibility", "pdf remediation"] },
        { label: "Universal Design", aliases: ["universal design", "inclusive design"] },
      ] },
      { group: "Testing", items: [
        { label: "NVDA", aliases: ["nvda"] },
        { label: "JAWS", aliases: ["jaws"] },
        { label: "VoiceOver", aliases: ["voiceover", "voice over"] },
        { label: "screen reader testing", aliases: ["screen reader", "screen readers", "assistive technology", "assistive technologies"] },
        { label: "keyboard testing", aliases: ["keyboard", "keyboard navigation"] },
        { label: "Axe DevTools", aliases: ["axe", "axe devtools", "deque"] },
        { label: "WAVE", aliases: ["wave"] },
        { label: "Lighthouse", aliases: ["lighthouse"] },
        { label: "PAC", aliases: ["pac", "pdf accessibility checker"] },
        { label: "accessibility audits", aliases: ["audit", "audits", "auditing", "accessibility testing", "remediation"] },
        { label: "usability testing", aliases: ["usability testing", "user testing", "usability"] },
      ] },
      { group: "Front-end", items: [
        { label: "React", aliases: ["react", "react.js", "reactjs"] },
        { label: "Next.js", aliases: ["next.js", "nextjs", "next js"] },
        { label: "TypeScript", aliases: ["typescript"] },
        { label: "JavaScript", aliases: ["javascript", "es6"] },
        { label: "HTML5", aliases: ["html", "html5", "semantic html"] },
        { label: "CSS3", aliases: ["css", "css3", "scss", "sass"] },
        { label: "Tailwind CSS", aliases: ["tailwind", "tailwindcss"] },
        { label: "React Native", aliases: ["react native"] },
        { label: "responsive design", aliases: ["responsive", "mobile-first", "mobile first"] },
        { label: "Core Web Vitals", aliases: ["core web vitals", "performance", "page speed", "web performance", "lcp"] },
      ] },
      { group: "Commerce and CMS", items: [
        { label: "Shopify", aliases: ["shopify"] },
        { label: "Shopify Liquid", aliases: ["liquid", "shopify theme", "theme development"] },
        { label: "WordPress", aliases: ["wordpress"] },
        { label: "Elementor Pro", aliases: ["elementor"] },
        { label: "WooCommerce", aliases: ["woocommerce"] },
        { label: "Paystack", aliases: ["paystack", "payments", "payment integration"] },
        { label: "Klaviyo", aliases: ["klaviyo"] },
      ] },
      { group: "Design", items: [
        { label: "Figma", aliases: ["figma"] },
        { label: "design systems", aliases: ["design system", "design systems", "component library", "design tokens"] },
        { label: "wireframes and prototypes", aliases: ["wireframe", "wireframes", "prototype", "prototypes", "prototyping"] },
        { label: "user research", aliases: ["user research", "user interviews", "research"] },
        { label: "interaction design", aliases: ["interaction design", "user flows", "information architecture"] },
        { label: "editorial and print layout", aliases: ["indesign", "editorial", "print design", "brand guidelines"] },
      ] },
      { group: "Back-end and tools", items: [
        { label: "Supabase", aliases: ["supabase"] },
        { label: "Postgres", aliases: ["postgres", "postgresql", "sql"] },
        { label: "REST APIs", aliases: ["api", "apis", "rest api", "restful", "api integration"] },
        { label: "Git and GitHub", aliases: ["git", "github", "version control"] },
        { label: "Vercel", aliases: ["vercel"] },
        { label: "Chrome extensions", aliases: ["chrome extension", "browser extension"] },
      ] },
      { group: "Working style", items: [
        { label: "team training", aliases: ["training", "train", "coach", "educate", "workshop"] },
        { label: "documentation", aliases: ["documentation", "document", "playbook", "guidelines"] },
        { label: "remote collaboration", aliases: ["remote", "async", "distributed"] },
        { label: "client communication", aliases: ["stakeholder", "stakeholders", "client", "clients", "communication"] },
      ] },
    ],

    // One true sentence of proof per skill. The cover letter quotes these
    // instead of listing skill names, so every claim comes with evidence.
    // Several skills can share a sentence; it is only used once per letter.
    proofs: {
      "WCAG 2.2 AA": "My 36-page healthcare site and the Lotus Shopify theme were both built to WCAG 2.2 AA.",
      "ARIA": "On the Lotus theme I reach for native HTML first and add ARIA only where a custom control needs it.",
      "Section 508": "I test against WCAG 2.2 AA, which covers Section 508, the ADA and the European Accessibility Act in one pass.",
      "ADA": "I test against WCAG 2.2 AA, which covers Section 508, the ADA and the European Accessibility Act in one pass.",
      "European Accessibility Act": "I test against WCAG 2.2 AA, which covers Section 508, the ADA and the European Accessibility Act in one pass.",
      "PDF/UA": "The Lotus documents I fixed passed PDF/UA with 0 failures across 163 tags.",
      "PAC": "The Lotus documents I fixed passed PDF/UA with 0 failures across 163 tags.",
      "Universal Design": "I mapped the 7 Universal Design principles to the Lotus Ring, Switch Cover and Kit Box, then trained the team to use them.",
      "team training": "I mapped the 7 Universal Design principles to the Lotus Ring, Switch Cover and Kit Box, then trained the team to use them.",
      "NVDA": "At Lotus I test components with NVDA, JAWS and VoiceOver to catch what automated tools miss.",
      "JAWS": "At Lotus I test components with NVDA, JAWS and VoiceOver to catch what automated tools miss.",
      "VoiceOver": "At Lotus I test components with NVDA, JAWS and VoiceOver to catch what automated tools miss.",
      "screen reader testing": "At Lotus I test components with NVDA, JAWS and VoiceOver to catch what automated tools miss.",
      "usability testing": "At Lotus I test components with NVDA, JAWS and VoiceOver to catch what automated tools miss.",
      "keyboard testing": "Each component I hand over has been run with a keyboard alone, from first focus to last.",
      "Axe DevTools": "The healthcare site was checked with Axe DevTools and then by hand with NVDA.",
      "Lighthouse": "A Shopify store I fixed went from a 12.41s to a 0.79s load time, every Core Web Vital red to green.",
      "Core Web Vitals": "A Shopify store I fixed went from a 12.41s to a 0.79s load time, every Core Web Vital red to green.",
      "accessibility audits": "My audits rank each issue from P0 to P3, so a team fixes what blocks a purchase first.",
      "React": "Bihub, my storefront platform for Nigerian sellers, runs on Next.js and Supabase with live Paystack payments.",
      "Next.js": "Bihub, my storefront platform for Nigerian sellers, runs on Next.js and Supabase with live Paystack payments.",
      "TypeScript": "Bihub, my storefront platform for Nigerian sellers, runs on Next.js and Supabase with live Paystack payments.",
      "Paystack": "Bihub, my storefront platform for Nigerian sellers, runs on Next.js and Supabase with live Paystack payments.",
      "Shopify": "For Lotus I build custom Shopify sections in Liquid, used across 30+ locales.",
      "Shopify Liquid": "For Lotus I build custom Shopify sections in Liquid, used across 30+ locales.",
      "WordPress": "I built a 36-page healthcare site on WordPress with Elementor Pro.",
      "Elementor Pro": "I built a 36-page healthcare site on WordPress with Elementor Pro.",
      "Klaviyo": "At Lotus I wired in Klaviyo, Yotpo and Zendesk without breaking focus order.",
      "Figma": "I designed the Lotus Accessibility Playbook in Figma, with its own type system and grid.",
      "design systems": "I designed the Lotus Accessibility Playbook in Figma, with its own type system and grid.",
      "editorial and print layout": "I designed the Lotus Accessibility Playbook in Figma, with its own type system and grid.",
      "wireframes and prototypes": "My rider-matching concept went from wireframe to high-fidelity light and dark themes.",
      "interaction design": "I designed WashCare around one journey: the invoice leaves the counter and lands in the customer's WhatsApp.",
      "Supabase": "WashCare keeps each laundry's data apart with Postgres row-level security on Supabase.",
      "Postgres": "WashCare keeps each laundry's data apart with Postgres row-level security on Supabase.",
      "Chrome extensions": "Pinpoint, my Chrome extension, lets people draw on a shared screen in Meet, Zoom and Teams.",
      "documentation": "I co-authored the Lotus Accessibility Playbook for the product, content and training teams.",
    },

    // Words for tools you have NOT used. The tool warns you and never adds them.
    // If you learn one, move it into skills above.
    gaps: ["after effects", "lottie", "mixpanel", "hotjar", "angular", "vue", "svelte", "python", "django", "java", "c#", ".net", "php", "laravel", "ruby", "rails", "golang", "kubernetes", "aws", "azure", "gcp", "swift", "kotlin", "flutter", "salesforce", "magento", "bigcommerce", "drupal", "sketch", "adobe xd", "jest", "cypress", "playwright", "storybook", "redux"],

    jobs: [
      {
        title: { accessibility: "Accessibility Engineer and Digital Experience Support", frontend: "Shopify Developer and Accessibility Engineer", design: "Digital Experience and Accessibility Designer" },
        dates: "2023 - Present",
        org: "Lotus Laboratories Inc. (assistive technology, USA) | Remote",
        max: 5,
        bullets: [
          { text: "Shipped 100% PDF/UA-compliant documents (0 failures, 163 tags, 335 alt descriptions) for a TIME Best Invention product.", tags: ["pdf", "pdf/ua", "document", "compliance", "accessib", "remediation"] },
          { text: "Built accessible Shopify components (video gallery, hero video, partner map, tooltip system, email capture) to WCAG 2.2 AA, keyboard and screen reader operable across 30+ locales.", tags: ["shopify", "liquid", "component", "wcag", "theme", "front", "locali", "international", "e-commerce", "ecommerce"] },
          { text: "Ran screen reader testing with NVDA, JAWS and VoiceOver to catch problems automated tools miss, then fed fixes back into component design.", tags: ["screen reader", "nvda", "jaws", "voiceover", "testing", "qa", "usability", "assistive"] },
          { text: "Mapped the 7 Universal Design principles to the Lotus Ring, Switch Cover and Kit Box, and trained the product, content and engineering team to apply them.", tags: ["train", "universal design", "inclusive", "product", "coach", "educat", "advoca", "cross-functional"] },
          { text: "Co-authored and designed the Lotus Accessibility Playbook, an editorial, InDesign-ready publication used by product, content and training teams.", tags: ["design", "editorial", "document", "playbook", "brand", "content", "indesign", "guidelines"] },
          { text: "Integrated Klaviyo, Yotpo and Zendesk without breaking focus order or screen reader navigation.", tags: ["integrat", "klaviyo", "third-party", "api", "marketing", "focus"] },
          { text: "Produced short-form video and accessibility content for customer onboarding on YouTube Shorts and Instagram Reels.", tags: ["video", "content", "social", "onboarding", "caption", "marketing"] },
        ],
      },
      {
        title: { accessibility: "Founder and Lead Engineer", frontend: "Founder and Lead Engineer", design: "Founder and Product Designer" },
        dates: "2023 - Present",
        org: "Bihub Technology (registered business, BN-7748743) | Abuja, Nigeria",
        max: 5,
        bullets: [
          { text: "Cut a Shopify client's load time from 12.41s to 0.79s (94%) with three targeted fixes, moving every Core Web Vital from red to green.", tags: ["performance", "speed", "core web vitals", "lighthouse", "shopify", "optimi", "seo", "lcp"] },
          { text: "Built a 36-page healthcare website (WordPress, Elementor Pro) to WCAG 2.2 AA, verified with Axe DevTools and manual NVDA testing.", tags: ["wordpress", "healthcare", "health", "wcag", "axe", "nvda", "elementor", "audit"] },
          { text: "Built and launched Bihub, a live storefront platform for Nigerian sellers with Paystack payments, paid plans and real-time delivery tracking (Next.js, Supabase).", tags: ["next", "react", "supabase", "saas", "payment", "e-commerce", "ecommerce", "product", "startup", "typescript", "full-stack", "full stack"] },
          { text: "Built WashCare, a multi-tenant laundry platform with a counter till, WhatsApp invoices and role-based access through Postgres row-level security.", tags: ["multi-tenant", "saas", "postgres", "sql", "supabase", "role", "security", "back-end", "backend", "full-stack", "full stack", "b2b"] },
          { text: "Built Pinpoint, a Chrome extension for drawing on shared screens in Google Meet, Zoom and Teams, with live sync on Supabase Realtime.", tags: ["chrome", "extension", "realtime", "real-time", "collaboration", "javascript", "typescript"] },
          { text: "Designed WashCare around one journey: the invoice leaves the counter and lands in the customer's WhatsApp.", tags: ["design", "ux", "journey", "product design", "user flow", "figma"] },
          { text: "Delivered the KlariFi Bookkeeping and Tax website for a Canadian small business, with accessible forms.", tags: ["form", "small business", "website", "client", "freelance", "web"] },
          { text: "Improved load speed by 30%+ across client sites through image work, code splitting and removing render-blocking files.", tags: ["performance", "speed", "optimi", "image"] },
        ],
      },
      {
        title: { accessibility: "IT Infrastructure Pre-Sales Support", frontend: "IT Infrastructure Pre-Sales Support", design: "IT Infrastructure Pre-Sales Support" },
        dates: "2023 - 2024",
        org: "Bryan and Beckley International | Nigeria",
        max: 2,
        bullets: [
          { text: "Prepared quotations, technical documents and bills of quantities for structured cabling projects, including hotel projects in Rwanda.", tags: ["pre-sales", "presales", "quotation", "proposal", "documentation", "infrastructure", "network"] },
          { text: "Read CommScope and Systimax specifications for fibre and copper cabling solutions.", tags: ["network", "infrastructure", "hardware", "specification"] },
        ],
      },
    ],

    projects: [
      { text: "**Bihub** - storefront SaaS for Nigerian sellers - [bihubng.vercel.app](https://bihubng.vercel.app)", tracks: ["frontend", "design"] },
      { text: "**Pinpoint** - shared-screen drawing and comments for video calls - [pinpoint-ebon-sigma.vercel.app](https://pinpoint-ebon-sigma.vercel.app)", tracks: ["frontend"] },
      { text: "**AltAlly** - AI alt text tool with a freemium model and usage analytics", tracks: ["frontend", "accessibility"] },
      { text: "**Rider-Matching Platform (concept)** - wireframe to high-fidelity light and dark themes - [Behance case study](https://www.behance.net/gallery/252950233/BINT-Rider-Compatibility-Landing-page)", tracks: ["design"] },
    ],

    certifications: [
      "Certified Professional in Accessibility Core Competencies (CPACC), IAAP, July 2024. Certificate #24MJCBO132.",
      "Web Accessibility Specialist (WAS), in progress.",
      "Designing for Accessibility: WCAG 2.2 for UX Designers, Udemy, December 2023.",
    ],
    education: { degree: "BSc Computer Science", dates: "2017 - 2021", school: "Crawford University, Nigeria" },
    development: [
      "Member, International Association of Accessibility Professionals (IAAP).",
      "Axe-Con 2024 attendee.",
      "Accessibility educator on YouTube, Instagram, LinkedIn and Medium as Mr Accessibility.",
    ],

    // Services for contract proposals. "words" decide which ones a brief needs.
    services: [
      { id: "audit", name: "Accessibility audit", words: ["audit", "assessment", "evaluate", "evaluation", "review", "wcag", "compliance", "vpat", "test"], usd: 3000, ngn: 450000, unit: "fixed price",
        what: "I test your key pages and flows with a keyboard, NVDA and VoiceOver, plus Axe DevTools and Lighthouse. You get a report of every issue with who it blocks, where it is and how to fix it, ranked P0 to P3, and a retest after your fixes.",
        time: "1 to 2 weeks" },
      { id: "remediation", name: "Remediation (fixing the issues)", words: ["remediat", "fix", "implement", "resolve", "repair", "update the code"], usd: 2000, ngn: 350000, unit: "from",
        what: "I fix the issues in your code or theme, starting with anything that blocks a purchase or sign-up, then retest each fix with a screen reader.",
        time: "1 to 3 weeks" },
      { id: "build", name: "Website build or redesign", words: ["build a", "build our", "redesign", "new website", "landing page", "web app", "website build", "rebuild"], usd: 2500, ngn: 1200000, unit: "from",
        what: "I design and build your site to WCAG 2.2 AA: responsive layouts, content migration, an editable CMS and two rounds of revisions.",
        time: "3 to 6 weeks" },
      { id: "shopify", name: "Shopify theme work", words: ["shopify", "liquid", "theme"], usd: 1500, ngn: 400000, unit: "from",
        what: "I build or fix Shopify sections and templates in Liquid, keeping every component keyboard and screen reader operable.",
        time: "1 to 3 weeks" },
      { id: "performance", name: "Speed rescue", words: ["speed", "performance", "core web vitals", "slow", "lighthouse", "page speed"], usd: 1200, ngn: 300000, unit: "fixed price",
        what: "I find what slows your site down and fix it. My last Shopify rescue went from 12.41s to 0.79s.",
        time: "1 week" },
      { id: "pdf", name: "Accessible PDFs", words: ["pdf", "document remediation", "pdf/ua"], usd: 40, ngn: 15000, unit: "per page",
        what: "I tag and fix your PDFs to PDF/UA and check them with PAC until they show 0 failures.",
        time: "depends on page count" },
      { id: "training", name: "Team training", words: ["training", "workshop", "educate", "teach", "upskill", "coach"], usd: 1200, ngn: 250000, unit: "per session",
        what: "A practical session for designers, writers or developers: WCAG in plain words, live screen reader demos, and a checklist they keep.",
        time: "half a day" },
      { id: "retainer", name: "Monthly accessibility care", words: ["ongoing", "monthly", "retainer", "maintain", "maintenance", "support", "long-term", "long term", "part-time", "part time", "hours per week"], usd: 1500, ngn: 250000, unit: "per month",
        what: "Each month I scan your key templates, test new pages and campaigns before they go live, fix issues within the agreed hours and send a one-page report.",
        time: "monthly, minimum 3 months" },
      { id: "seo", name: "Local SEO and Google Business Profile", words: ["seo", "google business", "google maps", "local search", "map pack"], usd: 300, ngn: 180000, unit: "setup",
        what: "I audit your Google Business Profile against your top 3 competitors and fix categories, services, description, photos and review replies.",
        time: "4 weeks" },
    ],
  };

  if (typeof module !== "undefined" && module.exports) module.exports = FACTS;
  else root.FACTS = FACTS;
})(this);
