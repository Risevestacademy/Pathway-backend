# AnalyticsTyped

Fire-and-forget analytics via PostHog.

---

## Configuration

| Variable | Required | Default | Notes |
| :--- | :--- | :--- | :--- |
| `ANALYTICS_ENABLED` | No | `false` | When `false`, no network calls are made and no client is created. |
| `POSTHOG_API_KEY` | Only when `ANALYTICS_ENABLED=true` | — | Enforced by `@ValidateIf`. |
| `POSTHOG_HOST` | No | `https://eu.i.posthog.com` | EU host by default (GDPR compliance). |
| `ANALYTICS_OPT_IN_CACHE_TTL_SECONDS` | No | `60` | How long a user's opt-out flag is cached. |

---

## Usage

```typescript
constructor(private readonly analytics: AnalyticsService) {}

// No-prop event
this.analytics.capture('email_verified', userId);

// Event with properties
this.analytics.capture('user_signed_up', userId, {
  method: 'password',
});
```

> **Note:** `capture` never throws and never blocks execution. It is safe to call directly inside request handlers without delaying the HTTP response.

---

## Opt-out

- `capture` is for user-linked events: `distinctId` is the user id. Each event checks `User.analyticsEnabled` and is dropped for opted-out users, or when the lookup fails.
- The flag is cached in memory per user for `ANALYTICS_OPT_IN_CACHE_TTL_SECONDS` (default 60). Call `invalidateUser(userId)` after changing it so the next event on that instance re-reads it; other instances pick it up when the TTL expires.
- `captureAnonymous` is for events with no user data. It is never gated, and its `distinctId` must not identify a user.
- The flag never affects XP, streaks, badges or saved data.

---

## Rules

### Event Naming

- **snake_case:** Use `user_signed_up`, not `userSignedUp`.
- **Past tense:** Describe an action that already happened (`user_signed_up`, not `sign_up_user`).
- **Specific:** Use `pathway_saved`, not `user_action`. If you need qualifiers to disambiguate, split them into two distinct events.

### Properties

- **IDs and enums only:** Send specific parameters (e.g., `{ careerId: '...', method: 'password' }`).
- **No PII:** Do not send emails, names, free-text fields, or identifiable personal data.
- **Flat structure only:** Do not use nested objects or arrays. Flatten keys if nesting is needed.

### Emit After Write

Always emit events **after the database write succeeds** — never before.

```typescript
// ✅ Correct: Emits after database write completes
const user = await this.users.create(dto);
this.analytics.capture('user_signed_up', user.id, {
  method: 'password',
});

// ❌ Incorrect: Event fires even if write fails
this.analytics.capture('user_signed_up', 'pending', {
  method: 'password',
});
await this.users.create(dto);
```

> **Why?** Emitting before writes compromises event stream integrity. If a write fails, downstream funnels will count non-existent records.

---

## Adding an Event

1. Add the event name and property shape to `AnalyticsEventMap` in `analytics-events.ts`.
2. Call `capture` from the service owning the database write.
3. The TypeScript type system will reject unknown names and mismatched properties at compile time.

---

## Testing

- `analytics.service.spec.ts`: Tests no-op behavior when disabled, error containment, shutdown flushing, and the opt-out gate and its cache.

---

