-- Add the Hyderabad city page and the Bangalore industrial sheds page to the shared ad template.
-- Both start as private drafts. Deploy the compatible backend and website first, apply this
-- before deploying the CMS (so it cannot create blank records), and approve the drafts last.
BEGIN;
ALTER TABLE "MicromarketAdPage" DROP CONSTRAINT IF EXISTS "MicromarketAdPage_city";
ALTER TABLE "MicromarketAdPage" ADD CONSTRAINT "MicromarketAdPage_city"
  CHECK ("citySlug" = 'bengaluru' OR ("citySlug" IN ('hosur', 'hyderabad') AND "slug" = "citySlug"));

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "hyderabad",
  "slug": "hyderabad",
  "name": "Hyderabad",
  "copy": {
    "heroHeading": "Warehouses and Godowns for Rent",
    "availableHeading": "Warehouses and Godowns Available Now in Hyderabad",
    "locationsHeading": "Explore Spaces in Hyderabad",
    "areaHeading": "Hyderabad's Warehouse Belts",
    "rentHeading": "Warehouse Rent in Hyderabad",
    "seoTitle": "Warehouses and Godowns for Rent in Hyderabad · WareOnGo",
    "metaDescription": "{listings} live, verified warehouses and godowns for rent in Hyderabad. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "Hyderabad's warehouse belts sit along its highways. **Medchal** and **Devaryamjal** lie north of the Outer Ring Road around the **Nagpur highway (NH-44)**, with **Kompally** and **Gundlapochampally** closer to the city on the same side. **Shamshabad** sits next to the airport in the south, and **Patancheru** is on the **Mumbai highway** to the west. Tell us your **size, budget and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Hyderabad is one of the most consistent large warehousing markets in the country. Its industrial stock is mostly purpose-built, rates across its main belts sit close together, and units are large for a city market. For an occupier that makes the choice unusually simple, which is to pick the belt that suits your road access and compare buildings.",
    "sections": [
      {
        "title": "Where the Stock Sits",
        "body": "Hyderabad's warehousing grew along two axes, NH-44 running north towards Nagpur and the airport corridor running south. The northern arm through **Medchal**, **Devaryamjal** and **Kompally** carries most of the stock and many of the biggest units, just beyond the Outer Ring Road where trucks avoid the city. The southern arm through **Shamshabad** serves air freight and the pharma cluster. A third, much smaller belt runs west towards **Patancheru** on the Mumbai highway."
      },
      {
        "title": "What Drives the Rent",
        "body": "Once you are past small city units, Hyderabad has one of the flattest cost curves of any city we cover. Rates barely move between mid-size and very large units, so scale buys specification rather than a lower rate. Small units inside the city are the exception: they are priced as city space and carry a clear premium, which is what sets the top of the range."
      },
      {
        "title": "What to Check",
        "body": "Generous docking is the practical difference between Hyderabad and most other cities, because the typical unit was designed for vehicle turnaround. Outside an industrial park, establish the land-use position first: HMDA runs change of land use around the city, and inside a TGIIC park the allotment sets what the plot may be used for. Fire clearance comes from the Telangana State Disaster Response and Fire Services Department. Longer leases have to be registered and stamped."
      }
    ]
  },
  "faqs": [
    {
      "q": "What Is the Rent for a Warehouse in Hyderabad?",
      "a": "Asking rents in Hyderabad run from {rentRange} per sq ft a month on our live listings. The belts trade close together, and the top of the range is small city units rather than warehousing."
    },
    {
      "q": "Is Warehouse Stock in Hyderabad Mostly PEB or RCC?",
      "a": "Mostly pre-engineered. Almost all of the belt stock was purpose-built, which is why specification is so consistent. RCC sits inside the city, where it is converted space at a much higher rate and a fraction of the size."
    }
  ],
  "mapBylines": [
    {
      "slug": "medchal",
      "byline": ""
    },
    {
      "slug": "kompally-devaryamjal",
      "byline": ""
    },
    {
      "slug": "shamshabad",
      "byline": ""
    },
    {
      "slug": "patancheru",
      "byline": ""
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "bengaluru",
  "slug": "sheds",
  "name": "Industrial Sheds",
  "copy": {
    "heroHeading": "Industrial Sheds and Factory Space for Rent",
    "availableHeading": "Industrial Sheds Available Now in Bangalore",
    "locationsHeading": "Where the Industrial Sheds Are in Bangalore",
    "areaHeading": "Is an Industrial Shed Right for You?",
    "rentHeading": "Industrial Shed and Factory Space Rent in Bangalore",
    "seoTitle": "Industrial Sheds and Factory Space for Rent or Lease in Bangalore · WareOnGo",
    "metaDescription": "{listings} live industrial sheds and factory spaces for rent or lease in Bangalore. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "Our largest cluster of **industrial sheds** is around **Budigere** off **Old Madras Road**, east of Bangalore. Others sit in **Jakkur** and **Yelahanka** in the north, on the **Whitefield** and **Varthur** side, in **Peenya**, and in the **Hosur Road** estates at **Jigani** and **Bommasandra**, with a few on **Tumkur Road** and **Mysore Road**. Most of what we list from 5,000 sq ft up is **5,000 to 30,000 sq ft**, with a median **clear height of 25 ft**.",
    "whoItSuits": "Sheds suit **light manufacturing**, **workshops**, **fabrication** and **storage** that does not need high racking, and businesses that want **factory space** close to the city. For a larger or higher building, a **pre-engineered warehouse** is usually the better fit, and we will show you both. Tell us your **size, power and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Industrial sheds, factory space and other industrial property for rent, lease or to let in Bangalore sit in a few clusters. The largest is around Budigere off Old Madras Road; others are in Jakkur and Yelahanka in the north, the Whitefield and Varthur side, Peenya, and the Hosur Road estates at Jigani and Bommasandra. Rent depends on where the shed is, its clear height and its power more than on its size. The table below shows asking rents on our live shed listings.",
    "description": "Clear height is on record for every shed we list from 5,000 sq ft up, with a median of 25 ft, and most record loading docks. Ask for the sanctioned power load and the floor type before a visit, and confirm that the land use allows your activity, especially for manufacturing."
  },
  "faqs": [
    {
      "q": "What Is the Rent for an Industrial Shed in Bangalore?",
      "a": "Asking rents for industrial sheds in Bangalore run from {rentRange} per sq ft a month on our live listings. Rent depends on the location, clear height and power more than on size, so tell us your size and budget and we shortlist only what fits."
    },
    {
      "q": "How Do I Find an Industrial Shed or Factory Space Near Me?",
      "a": "Tell us where your team, suppliers or customers are, and the size and power you need. We search our verified shed listings across Bangalore and send a shortlist within 4 hours, nearest options first."
    },
    {
      "q": "Can I Rent or Lease a Shed for Manufacturing?",
      "a": "Yes, if the land use and pollution category allow your activity. Tell us what you will make and the power you need, and we shortlist factory sheds where the paperwork fits, not just the size."
    }
  ],
  "mapBylines": [
    {
      "slug": "budigere",
      "byline": ""
    },
    {
      "slug": "whitefield",
      "byline": ""
    },
    {
      "slug": "jakkur-yelahanka",
      "byline": ""
    },
    {
      "slug": "peenya",
      "byline": ""
    },
    {
      "slug": "jigani-bommasandra",
      "byline": ""
    },
    {
      "slug": "nelamangala",
      "byline": ""
    },
    {
      "slug": "hoskote",
      "byline": ""
    },
    {
      "slug": "kumbalgodu",
      "byline": ""
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;
COMMIT;
