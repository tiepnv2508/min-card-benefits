# US Credit Card Benefits

An open, community-maintained dataset of **recurring US credit card benefits** — monthly/quarterly/annual statement credits and perks — in a format apps can use to set up benefit tracking automatically.

Used by [Min](https://minbudget.net) (Budget & card perks tracker). Free for anyone to use under the MIT license.

## Why

Card benefit trackers usually make you type every credit by hand: *“$10 dining credit, monthly… $50 Resy credit, every six months…”*. This dataset lists every recurring benefit per card with the details an app needs:

- **value per period** and **how often it resets** (monthly, quarterly, semiannual, annual, or every N months)
- whether the period follows the **calendar** or your **cardmember year**
- whether it's a **statement credit** or applied **inside a partner app** (Uber Cash, DashPass…)
- **`matchKeywords`** — the words that appear on the posted statement credit, so an app can recognise *"AMEX RESY CREDIT"* as the Resy benefit automatically
- sources and a **last verified** date

## Use the data

One file has everything:

```
https://raw.githubusercontent.com/tiepnv2508/us-credit-card-benefits/main/exports/benefits.json
```

```jsonc
{
  "schemaVersion": 1,
  "cards": [
    {
      "cardId": "…",                 // id in andenacitelli/credit-card-bonuses-api
      "name": "Gold",
      "issuer": "AMERICAN_EXPRESS",
      "annualFee": 325,
      "lastVerified": "2026-10-20",
      "sources": ["https://www.americanexpress.com/…"],
      "benefits": [
        {
          "id": "resy-credit",
          "name": "Resy credit",
          "type": "credit",
          "value": 50,
          "frequency": "semiannual",
          "alignment": "calendar",
          "category": "dining",
          "inApp": false,
          "enrollmentRequired": true,
          "matchKeywords": ["resy"],
          "matchVerified": true,
          "descriptorExamples": ["AMEX RESY CREDIT"]
        }
      ]
    }
  ]
}
```

`cardId` matches the card ids in [andenacitelli/credit-card-bonuses-api](https://github.com/andenacitelli/credit-card-bonuses-api), so you can join benefits to card names, images and sign-up offers.

## Contribute

Benefits change every year, and nobody holds every card — your corrections are what keeps this accurate. See [CONTRIBUTING.md](CONTRIBUTING.md). The most valuable contributions:

1. **Real statement-credit descriptors** — what the credit actually says on your statement. That's how `matchVerified` becomes `true`.
2. **Benefit changes** — new credits, retired ones, new values.
3. **Missing cards.**

## Disclaimer

Not affiliated with any card issuer. Benefits, terms and enrollment requirements change; always confirm with your issuer. Card and brand names are trademarks of their owners, used here only to identify the products.
