-- Extend the shared ad template to Hosur and the configured southern group.
-- New pages start as private drafts; approve after the compatible backend deploy.
BEGIN;
ALTER TABLE "MicromarketAdPage" DROP CONSTRAINT IF EXISTS "MicromarketAdPage_city";
ALTER TABLE "MicromarketAdPage" ADD CONSTRAINT "MicromarketAdPage_city"
  CHECK ("citySlug" = 'bengaluru' OR ("citySlug" = 'hosur' AND "slug" = 'hosur'));

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "bengaluru",
  "slug": "hoskote",
  "name": "Hoskote",
  "copy": {
    "heroHeading": "Warehouses, Godowns & Industrial Sheds for Rent",
    "availableHeading": "Warehouses, Godowns and Industrial Sheds Available Now in Hoskote",
    "locationsHeading": "Explore Spaces in & Around Hoskote",
    "areaHeading": "Is Hoskote Right for You?",
    "rentHeading": "Warehouse, Godown and Industrial Shed Rent in Hoskote",
    "seoTitle": "Warehouses, Godowns and Industrial Sheds for Rent in Hoskote · WareOnGo",
    "metaDescription": "{listings} live warehouses, godowns and industrial sheds for rent in Hoskote, Bangalore, on Old Madras Road. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "**Hoskote** sits on **NH-75 Old Madras Road**, east of **Whitefield**, where the highway leaves Bangalore for **Kolar** and **Chennai**. **Soukya Road** runs in from the Whitefield side, and **Ekarajapura** sits on **Sidlaghatta Road** to the north. Further east on the same highway is **Narsapura**. Most of what we list here is **large pre-engineered buildings**, with a median clear height of **32 ft** and road links into east Bangalore.",
    "whoItSuits": "Hoskote suits **occupiers serving east Bangalore**, **regional distribution** into **Andhra Pradesh** and **Tamil Nadu**, and **automotive supply** into the plants further east at Narsapura and Malur. Units run from **small sheds** to **buildings over 4 lakh sq ft**, and three in four of our listings here record **loading docks**. Tell us your **size, budget and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Rent in Hoskote depends on the building, its size and its specification. The table below shows asking rents on our live Hoskote listings, along Soukya Road and around Ekarajapura, and for Narsapura next door.",
    "description": "Most buildings here are pre-engineered, with a median clear height of 32 ft, and clear height and docks are on record for most of our Hoskote listings, so you can compare buildings before a visit. Confirm the dock count and floor loading against your racking plan before you shortlist."
  },
  "faqs": [
    {
      "q": "What Is the Rent for a Warehouse in Hoskote?",
      "a": "Asking rents in Hoskote run from {rentRange} per sq ft a month on our live listings. Rent depends on the building's size, specification and age, so tell us your size and budget and we shortlist only what fits."
    },
    {
      "q": "What Sizes Are Available in Hoskote?",
      "a": "Hoskote is weighted towards large space: most of what we list here is above 20,000 sq ft, and smaller units are a minor part of the stock. Tell us your size and we shortlist only what fits."
    },
    {
      "q": "Can I Find an Industrial Shed in Hoskote?",
      "a": "Yes, though sheds are a small part of the Hoskote stock, which is mostly pre-engineered warehousing. Tell us the size, power and clear height you need and we shortlist sheds and smaller units that fit."
    }
  ],
  "mapBylines": [
    {
      "slug": "hoskote",
      "byline": "Old Madras Road, NH-75"
    },
    {
      "slug": "whitefield",
      "byline": "East Bangalore"
    },
    {
      "slug": "devanahalli",
      "byline": "Airport Road"
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "hosur",
  "slug": "hosur",
  "name": "Hosur",
  "copy": {
    "heroHeading": "Warehouses, Industrial Sheds & Godowns for Rent",
    "availableHeading": "Warehouses, Industrial Sheds and Godowns Available Now in Hosur",
    "locationsHeading": "Explore Spaces in & Around Hosur",
    "areaHeading": "Is Hosur Right for You?",
    "rentHeading": "Warehouse, Industrial Shed and Godown Rent in Hosur",
    "seoTitle": "Warehouses, Industrial Sheds and Godowns for Rent in Hosur · WareOnGo",
    "metaDescription": "{listings} live warehouses, industrial sheds and godowns for rent in Hosur, Tamil Nadu, on NH-44. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "**Hosur** sits on **NH-44** south of Bangalore, on the **Tamil Nadu** side of the border, and grew as a manufacturing town around the **SIPCOT** industrial estates. **Kelamangalam** and **Uddanapalli** lie south of the town, **Thally Road** runs south-west towards Thally, and **Attibele** sits just across the border in Karnataka. Most of what we list here is **large pre-engineered buildings**, with a median clear height of **35 ft**.",
    "whoItSuits": "Hosur suits **automotive and electronics supply chains**, suppliers to the **SIPCOT** estates, and **large occupiers** who can work from a **Tamil Nadu address**. Most of what we list here is above **20,000 sq ft**, and four in five of our listings record **loading docks**. Approvals, fire clearance and stamp duty follow **Tamil Nadu's rules**. Tell us your **size, budget and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Rent in Hosur depends on the building, its size and its specification. The table below shows asking rents on our live Hosur listings, and for Attibele just across the border.",
    "description": "Hosur is in Tamil Nadu, so the fire NOC comes from Tamil Nadu Fire and Rescue Services and planning approval from the state's Directorate of Town and Country Planning, or the allotment terms inside SIPCOT. Confirm the clear height, dock count and floor loading of the building you are shown before you shortlist."
  },
  "faqs": [
    {
      "q": "What Is the Rent for a Warehouse in Hosur?",
      "a": "Asking rents in Hosur run from {rentRange} per sq ft a month on our live listings. Rent depends on the building's size, specification and age, so tell us your size and budget and we shortlist only what fits."
    },
    {
      "q": "Is Hosur in Bangalore?",
      "a": "No. Hosur is in Tamil Nadu, on NH-44 south of Bangalore, just past the Attibele border. Approvals, fire clearance and stamp duty follow Tamil Nadu's rules."
    },
    {
      "q": "Can I Find an Industrial Shed in Hosur?",
      "a": "Yes. Sheds are part of the Hosur stock alongside pre-engineered warehouses. Tell us the size, power and clear height you need and we shortlist only what fits."
    }
  ],
  "mapBylines": [
    {
      "slug": "hosur",
      "byline": ""
    },
    {
      "slug": "attibele",
      "byline": ""
    },
    {
      "slug": "bommasandra",
      "byline": "Hosur Road"
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "bengaluru",
  "slug": "nelamangala",
  "name": "Nelamangala",
  "copy": {
    "heroHeading": "Warehouses, Godowns & Industrial Sheds for Rent",
    "availableHeading": "Warehouses, Godowns and Industrial Sheds Available Now in Nelamangala",
    "locationsHeading": "Explore Spaces in & Around Nelamangala",
    "areaHeading": "Is Nelamangala Right for You?",
    "rentHeading": "Warehouse, Godown and Industrial Shed Rent in Nelamangala",
    "seoTitle": "Warehouses, Godowns and Industrial Sheds for Rent in Nelamangala · WareOnGo",
    "metaDescription": "{listings} live warehouses, godowns and industrial sheds for rent in Nelamangala, Bangalore, on Tumkur Road. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "**Nelamangala** sits where **NH-48 Tumkur Road** leaves Bangalore for **Tumakuru** and **Mumbai**, and where **NH-75** branches west towards **Hassan** and **Mangaluru**. **Budihal** and **T Begur** sit around Nelamangala itself, **Makali** lies between it and **Peenya** on the city side, and **Dobbaspet** is further out on NH-48. Most of what we list here is **large pre-engineered buildings**, with a median clear height of **35 ft**.",
    "whoItSuits": "Nelamangala suits **outbound distribution** for **Karnataka** and the **west coast**, **3PLs** running **full pallet volumes**, and occupiers who need a **large building** with direct highway access. Most of what we list here is above **20,000 sq ft**, and four in five of our listings record **loading docks**. Tell us your **size, budget and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Rent in Nelamangala depends on the building, its size and its specification. The table below shows asking rents on our live Nelamangala listings, around Budihal and T Begur, and for Dobbaspet and Makali next door.",
    "description": "Most buildings here are pre-engineered, with a median clear height of 35 ft, and clear height and docks are on record for most of our Nelamangala listings, so you can compare buildings before a visit. Confirm the dock count and floor loading against your racking plan before you shortlist."
  },
  "faqs": [
    {
      "q": "What Is the Rent for a Warehouse in Nelamangala?",
      "a": "Asking rents in Nelamangala run from {rentRange} per sq ft a month on our live listings. Rent depends on the building's size, specification and age, so tell us your size and budget and we shortlist only what fits."
    },
    {
      "q": "What Sizes Are Available in Nelamangala?",
      "a": "Nelamangala is weighted towards large space: most of what we list here is above 20,000 sq ft, and small units are scarce. Tell us your size and we shortlist only what fits."
    },
    {
      "q": "Can I Find an Industrial Shed in Nelamangala?",
      "a": "Yes, though sheds are a small part of the Nelamangala stock, which is mostly pre-engineered warehousing. Tell us the size, power and clear height you need and we shortlist sheds and smaller units that fit."
    }
  ],
  "mapBylines": [
    {
      "slug": "nelamangala",
      "byline": "Tumkur Road, NH-48"
    },
    {
      "slug": "dobbaspet",
      "byline": "Tumkur Road, NH-48"
    },
    {
      "slug": "peenya",
      "byline": "North-West Bangalore"
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;

WITH seed AS (SELECT $campaign${
  "version": 1,
  "citySlug": "bengaluru",
  "slug": "electronic-city-jigani-bommasandra",
  "name": "Electronic City, Jigani and Bommasandra",
  "copy": {
    "heroHeading": "Warehouses, Godowns & Industrial Sheds for Rent",
    "availableHeading": "Warehouses, Godowns and Industrial Sheds Available Now in Electronic City, Jigani and Bommasandra",
    "locationsHeading": "Explore Spaces in & Around Electronic City, Jigani & Bommasandra",
    "areaHeading": "Is Electronic City, Jigani or Bommasandra Right for You?",
    "rentHeading": "Warehouse, Godown and Industrial Shed Rent in Electronic City, Jigani and Bommasandra",
    "seoTitle": "Warehouses, Godowns and Industrial Sheds for Rent in Electronic City, Jigani and Bommasandra · WareOnGo",
    "metaDescription": "{listings} live warehouses, godowns and industrial sheds for rent in Electronic City, Jigani and Bommasandra, on Hosur Road. Share your requirement and get a curated shortlist in 4 hours. You only pay when you close."
  },
  "area": {
    "whereItIs": "**Hosur Road (NH-44)** runs south out of Bangalore towards **Hosur** and **Chennai**. **Electronic City** sits on it at the city end, the **KIADB** estates at **Bommasandra** and **Jigani** follow, joined by a link road, and **Attibele** sits further south at the **Tamil Nadu** border, with **Bannerghatta Road** to the west. The stock mixes **pre-engineered buildings**, **RCC units** and **sheds**, with direct access into south Bangalore.",
    "whoItSuits": "This stretch suits **electronics, pharma and auto suppliers** that need to sit next to the estates, **ancillary storage** for factories already operating here, and **city-facing distribution** into south and south-east Bangalore. Three in four of our listings here are under **20,000 sq ft**, from about **2,000 sq ft** up. Tell us your **size, budget and use**, and we'll shortlist across all of them."
  },
  "rentGuide": {
    "intro": "Rent here depends on the building, its type and its size, and the highest asking rents are for small RCC units on the Electronic City stretch. The table below shows asking rents on our live listings along the Electronic City stretch of Hosur Road, in Jigani and Bommasandra, and for Attibele nearby.",
    "description": "Units here are smaller than in Bangalore's outer belts, and fewer than half of our listings record loading docks. A good share is RCC, so confirm floor loading and clear height before you plan racking. On KIADB land, check that warehousing is allowed under the allotment."
  },
  "faqs": [
    {
      "q": "What Is the Rent for a Warehouse in Electronic City, Jigani or Bommasandra?",
      "a": "Asking rents here run from {rentRange} per sq ft a month on our live listings. Rent depends on the building's type, size and specification, so tell us your size and budget and we shortlist only what fits."
    },
    {
      "q": "Can I Rent a Warehouse in Electronic City?",
      "a": "Yes. Our listings on the Electronic City stretch of Hosur Road include pre-engineered warehouses, RCC units and sheds, mostly small to mid-size. Tell us the size you need and we shortlist only what fits."
    },
    {
      "q": "Can I Find an Industrial Shed in Jigani or Bommasandra?",
      "a": "Yes. Both estates have sheds and RCC units alongside pre-engineered buildings, mostly small to mid-size. Tell us the size, power and clear height you need and we shortlist only what fits."
    }
  ],
  "mapBylines": [
    {
      "slug": "hosur-road",
      "byline": "Hosur Road"
    },
    {
      "slug": "sarjapura",
      "byline": "Sarjapur Road"
    }
  ]
}$campaign$::jsonb AS content)
INSERT INTO "MicromarketAdPage" ("citySlug", "slug", "name", "draftContent")
SELECT content->>'citySlug', content->>'slug', content->>'name', content FROM seed
ON CONFLICT ("citySlug", "slug") DO NOTHING;
COMMIT;
