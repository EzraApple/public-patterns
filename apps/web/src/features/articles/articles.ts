export type ArticleFigure =
  | {
      kind: "inspection-timeline";
      duration: string;
      events: readonly {
        date: string;
        label: string;
        detail: string;
        tone: "alert" | "clear";
      }[];
    }
  | {
      kind: "comparison-trend";
      groups: readonly {
        label: string;
        previous: number;
        current: number;
      }[];
    }
  | {
      kind: "source-trace";
      duration: string;
      events: readonly {
        source: string;
        time: string;
        detail: string;
      }[];
      note: string;
    };

export type Article = {
  slug: string;
  category: string;
  significance: number;
  title: string;
  dek: string;
  publishedAt: string;
  readingMinutes: number;
  hero: {
    src: string;
    alt: string;
    caption: string;
  };
  sections: readonly {
    heading?: string;
    paragraphs: readonly string[];
  }[];
  figure: {
    title: string;
    caption: string;
    detail: ArticleFigure;
  };
  sources: readonly {
    label: string;
    href: string;
  }[];
};

export const articles = [
  {
    slug: "coffee-bar-reinspection",
    category: "Health",
    significance: 84,
    title:
      "Coffee Bar shut down after health inspectors find rodent droppings between coffee beans",
    dek: "The downtown San Francisco café at 101 Montgomery Street was closed May 2 and cleared to reopen three days later.",
    publishedAt: "July 28, 2026",
    readingMinutes: 1,
    hero: {
      src: "/articles/coffee-bar.webp",
      alt: "A quiet cafe exterior on a downtown San Francisco street",
      caption:
        "Illustrative image generated for this prototype. The reporting below is based on the linked public records.",
    },
    sections: [
      {
        paragraphs: [
          "San Francisco health inspectors ordered Coffee Bar to close on May 2, 2025, after a routine inspection found rodent droppings throughout the downtown café—including on food preparation tables, atop refrigeration units, and “between coffee beans,” according to the official inspection report.",
          "The Department of Public Health cited the 101 Montgomery Street location for six violations: vermin infestation, unsealed pest entry points, unclean nonfood surfaces, and missing food safety manager certification. Inspectors immediately suspended the café’s health permit under California health and safety code.",
          "City records show Coffee Bar passed a reinspection on May 5 with no violations recorded, clearing the way for the café to resume operations.",
        ],
      },
    ],
    figure: {
      title: "Three days from closure to passing reinspection",
      caption:
        "San Francisco Department of Public Health inspection records, permit 98227.",
      detail: {
        kind: "inspection-timeline",
        duration: "3 days",
        events: [
          {
            date: "May 2",
            label: "Closed",
            detail: "Routine inspection · 6 violations",
            tone: "alert",
          },
          {
            date: "May 5",
            label: "Passed",
            detail: "Reinspection",
            tone: "clear",
          },
        ],
      },
    },
    sources: [
      {
        label: "DataSF health inspection records",
        href: "https://data.sfgov.org/resource/tvy3-wexg.json?%24where=permit_number%3D%2798227%27&%24order=inspection_date",
      },
      {
        label: "San Francisco Chronicle reporting",
        href: "https://www.sfchronicle.com/bayarea/article/coffee-bar-closed-health-violations-20311170.php",
      },
    ],
  },
  {
    slug: "eviction-notices-h1-2025",
    category: "Housing",
    significance: 96,
    title: "San Francisco eviction notices more than double in first half of 2025",
    dek: "Landlords filed 812 eviction notices in the first six months of 2025, returning to pre-pandemic levels not seen since 2019, as non-payment cases drove the increase and rents climbed citywide.",
    publishedAt: "July 28, 2026",
    readingMinutes: 4,
    hero: {
      src: "/articles/eviction-notices-v2.webp",
      alt: "A row of apartment buildings on a foggy San Francisco street",
      caption:
        "Illustrative image generated for this prototype. Counts come from the linked city dataset.",
    },
    sections: [
      {
        paragraphs: [
          "San Francisco landlords filed 812 eviction notices with the city’s Rent Board between January and June 2025, more than double the 385 notices filed during the same period a year earlier, according to city data published on DataSF.",
          "The jump returned eviction notice filings to their highest first-half level since 2019, when the board recorded 810 notices, the San Francisco Chronicle reported. Every month in the first half of 2025 exceeded its 2024 counterpart, with April showing the widest gap: 177 notices compared to 55 the year before.",
        ],
      },
      {
        paragraphs: [
          "The increase was driven overwhelmingly by non-payment of rent, said Ora Prochovnick, director of litigation and policy at the Eviction Defense Collaborative. “I’ve been doing eviction defense work for a lot of years, and I’ve never seen people as deep in the hole as they are on the rent,” Prochovnick told the Chronicle and the San Francisco Public Press.",
          "The filings are notices submitted to the Rent Board per the city’s administrative code and do not necessarily result in completed evictions. Separate court data paints an even starker picture: San Francisco saw 1,910 eviction lawsuits filed in the first half of 2025, Prochovnick told the Chronicle, putting the city on pace for roughly 3,800 such filings that year—a 16 percent increase over 2024.",
          "The spike came nearly two years after the city lifted its pandemic-era eviction moratorium, and as San Francisco’s rental market heated up. The city’s median apartment rent surged 11 percent in June compared with a year earlier, the highest increase of any major U.S. city, according to Apartment List data cited by the Chronicle.",
          "The Tenderloin, Mission, Nob Hill, Western Addition, South of Market, and Financial District experienced the sharpest increases in eviction notices, based on landlords’ self-reported filings.",
          "The San Francisco Public Press reported in April that legal aid organizations serving extremely low-income residents faced deep cuts in the mayor’s budget proposal, which attorneys warned would further strain tenants at risk of losing their homes. The Tenant Right to Counsel program kept 93 percent of its clients housed between mid-2023 and mid-2024, according to the program.",
          "The Rent Board dataset showed the climb in notices had already begun in late 2024, when monthly filings rose above 100 in September, October, and November—well above the 51-to-91 range seen in the first half of that year.",
        ],
      },
    ],
    figure: {
      title: "Eviction notices filed by month",
      caption:
        "DataSF eviction notices, frozen July 27, 2026. Notices are not completed evictions.",
      detail: {
        kind: "comparison-trend",
        groups: [
          { label: "Jan", previous: 70, current: 119 },
          { label: "Feb", previous: 63, current: 128 },
          { label: "Mar", previous: 55, current: 131 },
          { label: "Apr", previous: 55, current: 177 },
          { label: "May", previous: 51, current: 153 },
          { label: "Jun", previous: 91, current: 104 },
        ],
      },
    },
    sources: [
      {
        label: "DataSF eviction notice records",
        href: "https://data.sfgov.org/d/5cei-gny5",
      },
      {
        label: "San Francisco Chronicle reporting",
        href: "https://www.sfchronicle.com/realestate/article/san-francisco-eviction-notices-20779377.php",
      },
      {
        label: "San Francisco Public Press reporting",
        href: "https://www.sfpublicpress.org/eviction-rates-in-sf-soar-as-legal-aid-faces-deep-funding-cuts/",
      },
      {
        label: "San Francisco Chronicle rent reporting",
        href: "https://www.sfchronicle.com/sf/article/apartment-rent-san-francisco-20778902.php",
      },
    ],
  },
  {
    slug: "harrison-mariposa-crash",
    category: "Public safety",
    significance: 91,
    title: "Driver killed when van crashes into Mission District apartment building",
    dek: "The early-morning crash at Harrison and Mariposa streets drew a 12-unit fire response and was under investigation by San Francisco police as of early October.",
    publishedAt: "July 28, 2026",
    readingMinutes: 3,
    hero: {
      src: "/articles/harrison-crash.webp",
      alt: "An empty Mission District intersection before dawn",
      caption:
        "Illustrative image generated for this prototype. Event details come from the linked records and reporting.",
    },
    sections: [
      {
        paragraphs: [
          "A van crashed into a four-story apartment building at Harrison and Mariposa streets in San Francisco’s Mission District around 1:50 a.m. on September 26, 2025, killing the driver. No building occupants were injured.",
          "The San Francisco Fire Department received the call at 1:56 a.m. and dispatched 12 units—engines, trucks, medics, and rescue squads—to the 2100 block of Harrison Street. All responding units listed a final disposition of “Medical Examiner.” The last unit became available shortly before 9 a.m.",
        ],
      },
      {
        paragraphs: [
          "San Francisco police opened a dispatch at 1:58 a.m. for a vehicle-into-building collision with injury, filing report #250541781. The case was listed as open with at least two supplemental updates as of early October. SFPD’s Major Accident Investigation Team was investigating the crash at the time.",
          "Surveillance footage showed the van speeding through multiple intersections before the crash, KQED reported. The city’s fire and building inspection departments assessed the structure and tagged it for repairs.",
        ],
      },
    ],
    figure: {
      title: "Three systems recorded the same event within three minutes",
      caption:
        "Times and row structure from frozen Fire/EMS, dispatch, and police records.",
      detail: {
        kind: "source-trace",
        duration: "2 min 28 sec",
        events: [
          {
            source: "Fire / EMS",
            time: "1:56:23",
            detail: "12 unit-response rows",
          },
          {
            source: "Police",
            time: "1:58:00",
            detail: "2 rows · 1 incident",
          },
          {
            source: "Dispatch",
            time: "1:58:51",
            detail: "1 call · vehicle vs. building",
          },
        ],
        note: "No matching injury-crash archive row was present in the frozen query.",
      },
    },
    sources: [
      {
        label: "DataSF Fire and EMS records",
        href: "https://data.sfgov.org/resource/nuek-vuh3.json?$where=call_number%3D%27252690172%27",
      },
      {
        label: "DataSF law-enforcement dispatch",
        href: "https://data.sfgov.org/resource/2zdj-bwza.json?$where=cad_number%3D%27252690173%27",
      },
      {
        label: "DataSF police incident reports",
        href: "https://data.sfgov.org/resource/wg3w-h783.json?$where=row_id%20in%28%27151445668050%27%2C%27151515568050%27%29",
      },
      {
        label: "KQED reporting",
        href: "https://www.kqed.org/news/12057733/1-killed-when-van-slams-into-sf-mission-district-apartment-building",
      },
    ],
  },
] as const satisfies readonly Article[];

export function getArticle(slug: string): Article | undefined {
  return articles.find((article) => article.slug === slug);
}
