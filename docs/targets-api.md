# Pushing department targets into ITTEK Solution

For whoever maintains the IT department's system. This is the whole of
what that system has to do: one HTTPS POST, whenever its figures change.

Nothing is read back out, and ITTEK never calls you. If your system can
make an outbound HTTPS request with a header, it can do this.

---

## What you need from DAN & DOR

1. **The address** — `https://ittek-solution-mpjc.onrender.com/api/targets/push`
2. **The key** — a long random string, given to you privately. It is a
   password: it goes in your server's configuration, never in a web page,
   a phone app, or anything a customer's browser downloads. Anyone holding
   it can write targets into the shop's system.

That is all. There is no account to create and no login step.

---

## The request

```
POST /api/targets/push
X-API-Key: <the key>
Content-Type: application/json
```

`Authorization: Bearer <the key>` works too, if that suits your HTTP
client better.

### One target

```json
{
  "department": "networking",
  "year": 2026,
  "month": 11,
  "target": 12,
  "achieved": 7,
  "unit": "installations"
}
```

### Several at once

```json
{
  "targets": [
    { "department": "networking", "year": 2026, "month": 11, "target": 12, "achieved": 7 },
    { "department": "networking", "year": 2026, "month": 12, "target": 15 }
  ]
}
```

Up to 60 in one call. A plain JSON array works as well as the `targets`
wrapper.

---

## The fields

| Field | Required | What it is |
|---|---|---|
| `department` | yes | `networking` for IT. Also `solar`, `electrical`. Case does not matter. |
| `year` | no | Defaults to the current year. |
| `month` | no | 1–12. Defaults to the current month. |
| `target` | see below | How many are meant to be done. A whole number, 0 or more. |
| `achieved` | see below | How many are done. A whole number, 0 or more. |
| `unit` | no | What is being counted: `installations`, `sites`, `call-outs`. Defaults to `jobs`. |
| `note` | no | Up to 500 characters, shown with the row. |

**At least one of `target` or `achieved` must be present.** A request with
neither is refused, because it asks for nothing to be stored.

### Leaving a field out is not sending zero

This matters more than anything else here.

- Send `achieved` and omit `target` → the target already stored is left
  alone. This is the normal shape of a nightly progress report.
- Send `target` and omit `achieved` → progress is left alone.
- Send `"achieved": 0` → that is a real report of none done, and is
  shown as 0%.
- Never send `achieved` at all → ITTEK shows "Nothing reported yet this
  month" rather than 0%. A department that has not sent its paperwork and
  one that has genuinely done nothing are different facts, and the shop
  chases the second.

### Sending the same month twice

Each `department` + `year` + `month` is one row. Sending it again updates
that row rather than adding another, so you can push as often as you like
— every night, or every time something changes. There is no need to check
first whether a row exists.

---

## What comes back

**Everything saved — 200**

```json
{
  "success": true,
  "data": { "saved": 2, "rejected": [], "message": "2 saved." }
}
```

**Some saved, some refused — 200**

```json
{
  "success": true,
  "data": {
    "saved": 1,
    "rejected": [{ "index": 1, "reason": "Unknown department. Use one of: solar, networking, electrical." }],
    "message": "1 saved, 1 refused."
  }
}
```

The good rows are stored. Check `rejected` — it is not empty on a
success, and ignoring it means believing figures the shop never kept.

**Nothing saved — 400.** Every row was refused; the first reason is in
`message`.

**401** — the key is wrong or missing.

**429** — more than 30 calls in a minute. Wait and retry.

**503** — the shop has not set its key yet. Nothing you can fix at your
end; tell them.

---

## Examples

### curl

```bash
curl -X POST https://ittek-solution-mpjc.onrender.com/api/targets/push \
  -H "X-API-Key: $ITTEK_KEY" \
  -H "X-Source-Name: IT Helpdesk" \
  -H "Content-Type: application/json" \
  -d '{"department":"networking","year":2026,"month":11,"target":12,"achieved":7,"unit":"installations"}'
```

### Node

```js
const res = await fetch('https://ittek-solution-mpjc.onrender.com/api/targets/push', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.ITTEK_KEY,
    'X-Source-Name': 'IT Helpdesk',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    department: 'networking',
    year: 2026,
    month: 11,
    target: 12,
    achieved: 7,
    unit: 'installations',
  }),
});

const body = await res.json();
if (!res.ok || body.data?.rejected?.length) {
  console.error('ITTEK refused some rows', res.status, body);
}
```

### `X-Source-Name`

Optional, up to 60 characters. Whatever you put here is shown on the
shop's screen as *"Progress reported by IT Helpdesk"*, so the owners can
see where a figure came from. Worth setting.

---

## Two practical notes

**The shop may be asleep.** On the free hosting plan the server spins
down when nobody is using it, and the first request after a quiet spell
can take up to a minute. Allow a generous timeout and retry once rather
than treating a slow reply as a failure.

**Keep the key out of the browser.** Push from your server, not from a
page. A key in front-end code is a key anybody can read with the
developer tools, and it writes into the shop's figures.
