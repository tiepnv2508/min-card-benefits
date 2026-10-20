# Contributing

Thanks for helping! Every card lives in its own file: `cards/<issuer>/<card-slug>.json`.

## Rules

1. **List every recurring benefit** on the issuer's benefits page — including ones you don't personally use. Apps let users untick benefits they don't want; a missing benefit can't be tracked at all.
2. **`value` is per period.** A "$120/year dining credit, $10 per month" is `value: 10`, `frequency: "monthly"`.
3. **`frequency: "custom"`** needs `intervalMonths` (Global Entry every 4 years → `48`).
4. **`inApp: true`** when the credit is applied inside a partner app or issuer portal (Uber Cash, DashPass, Lyft, travel-portal credits) and no statement credit posts. These have empty `matchKeywords`.
5. **`matchKeywords`** are lower-case words that appear **whole** in the posted credit's description. Use the most specific word(s): `["resy"]`, `["clear"]`, `["dunkin"]`. Generic words (`credit`, `fee`, `annual`, `amex`, `chase`…) are ignored by matchers — never rely on them alone.
6. **`matchVerified: true` only if you've seen the credit post**, and add the exact text to `descriptorExamples`. Please redact anything personal (amounts are fine to omit).
7. **Sources:** link the issuer's own benefits page whenever possible, and set `lastVerified` to the day you checked it.

## Workflow

```sh
npm install
npm run build      # validates and regenerates exports/benefits.json
```

Commit both your card file and `exports/benefits.json`. CI runs `npm run validate` on every pull request.

## Finding a card's `cardId`

Look the card up in <https://raw.githubusercontent.com/andenacitelli/credit-card-bonuses-api/main/exports/data.json> and copy its `cardId`. If the card isn't there yet, open an issue and we'll sort it out.
