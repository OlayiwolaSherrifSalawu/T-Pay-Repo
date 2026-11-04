# T-Pay

**Pay with PayPal when there is no internet.**

Market traders, salaried workers and bus conductors in Nigeria lose sales when networks drop. T-Pay lets a buyer hold money at PayPal while they have signal, spend it with no connection using a signed voucher, and settle automatically when either phone reconnects. A voice assistant that understands English, Nigerian Pidgin, Yoruba, Igbo and Hausa handles the bookkeeping for people who would rather talk than type.

Built for the PayPal AI Hackathon. It runs on the PayPal sandbox, and no real money moves.

## How it works

1. **Lock.** The buyer approves a PayPal authorisation for ₦15,000 (a USD hold, since PayPal does not process naira). The backend issues a signed certificate stating the ceiling, the rate and a 24-hour expiry.
2. **Pay, offline.** The buyer scans the seller's code and signs an ECDSA P-256 voucher with a key that cannot leave the device. The voucher passes by QR code. The seller's phone verifies it against the certificate with no network and shows a pending credit.
3. **Settle.** Whichever phone reconnects first submits the voucher, with no taps. The backend makes one partial capture against the authorisation, and both phones show the same PayPal capture ID.
4. **Release.** Melting voids what is left of the hold at PayPal.

The hard part is what happens when things go wrong:

| Problem | What T-Pay does |
|---|---|
| Both phones submit at once | One capture. 100 concurrent duplicates are tested. |
| Sellers reconnect out of order | Sequences are tracked as a seen-set, so a late voucher still settles. |
| A voucher is replayed | Refused, alerted, and the vault is blocked. |
| A tampered phone over-spends across sellers | An offline phone cannot see this, so it is *detected, not prevented*. Captures stop at the ceiling, the vault is blocked and the excess voucher is refused. |
| PayPal times out mid-capture | The order is read back before any retry, so a lost response never means a second charge. |
| PayPal is rate limiting | Backoff with jitter, then a terminal state rather than an endless loop. |
| The language model invents an amount | The model only proposes. Code checks the vault, and the user confirms before anything is signed. |

## Run it

Requires Node 24, a [PayPal sandbox app](https://developer.paypal.com/dashboard/applications/sandbox), and optionally a Gemini API key.

```bash
npm install
cp .env.example .env     # add your PayPal sandbox credentials
npm run dev:full         # app on :3000, API on :4000
```

Open `http://localhost:3000` as device A and `http://localhost:3000/?device=b` as device B. Lock a vault on A using a sandbox buyer account. Open **Receive** on B and **Pay** on A, then exchange the codes by camera or by copying them. Use your browser's developer tools to take a tab offline.

```bash
npm test          # 48 tests, including a two-device payment over HTTP
npm run lint      # typecheck
```

## What is real, and what is not

| Part | Status |
|---|---|
| Device keys, voucher signatures, offline verification | Real. WebCrypto P-256 with non-extractable keys. |
| PayPal authorise, partial capture, void, webhooks | Real integration, sandbox only. Live configuration is refused at startup. |
| Settlement, ledger, reconciliation | Real, on SQLite. |
| Paying a seller | The sandbox merchant receives the capture and T-Pay credits the seller in an internal ledger. Paying sellers out to their own accounts would need a partner and regulatory work. |
| Key protection | Software keys, labelled as such in the app. Web browsers cannot offer hardware-backed keys. |
| Exchange rate | A fixed demo rate, labelled in the app. |
| Assistant | Gemini when online, keyword rules when offline. Spoken output depends on the voices the device has installed. |
| Voice recognition | Uses the browser's speech service, which may need a connection. Typed commands work offline. |
| Bank accounts, airtime, transfers on the home screen | Sample data. |
| Fare collection | The seat manifest uses sample passengers. No voucher is involved yet. |
| React Native app | Not connected to this core yet. The web app is the demo surface. |

## Layout

- `core/voucher/`: canonical JSON and voucher signing, shared by browser and server
- `backend/src/v1/`: PayPal gateway, settlement service, assistant, SQLite store
- `src/tpay/`: the device wallet
- `core/resource-tracking/`, `core/hybrid-assistant/`: inventory, budget, transit and rule-based intents
- `docs/T-Pay-PRD.pdf`: the requirements baseline, written before this build

## Deploy

`render.yaml` deploys the app and API as one service with a persistent disk. Set `APP_URL`, the PayPal credentials and optionally `GEMINI_API_KEY`, then register `<APP_URL>/api/v1/webhooks/paypal` as a sandbox webhook and set `PAYPAL_WEBHOOK_ID`.
