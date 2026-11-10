# OpsCore Buyer Demonstration Script

**Release: v0.11.62**

## Objective

Demonstrate the product through one complete operational story instead of a feature tour.

## Story

**Customer request → estimate → acceptance → work order → dispatch → field execution → evidence → completion → invoice → payment record → audit/export proof.**

### 1. Start with the buyer preflight

From `backend/`:

```bash
npm ci
npm run buyer:preflight
```

Do not skip a failed preflight. A failed gate is a finding, not something to hide.

### 2. Seed the local demonstration

Only use an empty development database:

```bash
npm run seed:demo
```

The seed data is explicitly non-production.

### 3. Show the operational console

Start:

```bash
HOST=127.0.0.1 PORT=3123 NODE_ENV=development SQLITE_PATH=./data/opscore.sqlite npm start
```

Open `/`.

Show:
- current operational queue;
- work-order detail;
- activity timeline;
- control-tower exceptions;
- evidence/completion state.

### 4. Prove security instead of describing it

Run:

```bash
npm run buyer:acceptance
```

Point out the cross-tenant tests and the explicit denial paths.

### 5. Prove the commercial loop

Use the commercial test suite to demonstrate:

`Estimate → Accepted → Work Order → Invoice → local Payment Record`

The package does **not** claim an external payment gateway is connected by this local flow.

### 6. Prove recoverability and portability

Run the backup verification and recovery drill against the local database/backup artifacts. Then run the organization export verification. These controls prove integrity of the generated artifacts; they do not certify a buyer's production infrastructure.

### 7. Show the truth boundary

Open `RELEASE_SCOPE.md` and `REVIEWED_STATEMENT.md`.

A serious buyer should see both verified capabilities and environment-dependent items.

### 8. Clean the demonstration

After the session:

```bash
npm run demo:clean
```

Do not ship local demo credentials or runtime attachments into production.
