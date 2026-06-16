# Hardened Security Specification for Olli

## 1. Data Invariants
1. **Meeting Ownership**: No meeting document can be created or updated without a verified `ownerId` that matches the authenticated user (`request.auth.uid`).
2. **Immutable Attributes**: `ownerId`, `id`, and `createdAt` must be completely immutable once a resource/meeting is created.
3. **Temporal Validity**: Timestamp values `createdAt` and `updatedAt` are strictly bounded. `createdAt` must match `request.time` exactly at creation, and `updatedAt` must sync with `request.time` on updates.
4. **Limits and Sizes**: Title text field length must not exceed 256 characters. Verbatim transcript strings must not exceed 200,000 characters. Markdown summaries must not exceed 100,000 characters to block Denials of Wallet.
5. **No Blind Access**: No user can read, list, update, or delete settings or meetings belonging to another user. Broad `allow list: if isSignedIn()` queries are blocked. Security boundaries must validate individual documents.

---

## 2. The "Dirty Dozen" Payloads
These payloads attempt to exploit access gaps, bypass validation schemas, spoof user credentials, or cause resource exhaustion:

### Payload 1: Identity Spoofing (Owner Hijacking on Create)
* **Goal**: Write a new meeting note claiming it is owned by a different user.
```json
{
  "id": "malicious_meeting_1",
  "title": "Stolen Meeting Info",
  "date": "2026-06-11T18:00:00.000Z",
  "duration": "10:00",
  "transcript": "Secret text",
  "summary": "Summary text",
  "ownerId": "victim_user_xyz",
  "createdAt": "2026-06-11T18:00:00.000Z",
  "updatedAt": "2026-06-11T18:00:00.000Z"
}
```

### Payload 2: Hostage-Taking (Assigning Someone Else's Settings)
* **Goal**: Write to the user settings collection using another user's UID to disrupt their settings layout.
```json
{
  "aiProvider": "custom_openai",
  "apiKey": "spoofed_open_ai_key",
  "audioFolder": "/InjectedFolder/",
  "autoDeleteAudio": false,
  "ownerId": "victim_user_xyz"
}
```

### Payload 3: Shadow Attributes (Ghost Key Injection on Create)
* **Goal**: Inject unapproved arbitrary permissions variables (`isAdmin: true`) directly into the meeting metadata fields.
```json
{
  "id": "malicious_meeting_2",
  "title": "Elevating Permissions",
  "date": "2026-06-11T18:00:00.000Z",
  "duration": "05:00",
  "transcript": "Test transcript",
  "summary": "Test summary",
  "ownerId": "attacker_user_123",
  "isAdmin": true,
  "createdAt": "request.time",
  "updatedAt": "request.time"
}
```

### Payload 4: Value Poisoning (Resource Exhaustion Title Attack)
* **Goal**: Inject a title field exceeding the 256-character storage limits to blow up database margins.
```json
{
  "id": "malicious_meeting_3",
  "title": "A".repeat(1000),
  "date": "2026-06-11T18:00:00.000Z",
  "duration": "02:00",
  "transcript": "Standard length transcript",
  "summary": "Standard summary",
  "ownerId": "attacker_user_123"
}
```

### Payload 5: Spoofed Modification Attack (Owner Hijacking on Update)
* **Goal**: Alter the `ownerId` of an exisiting meeting to pass ownership to a clean system account.
```json
{
  "ownerId": "admin_user_account"
}
```

### Payload 6: Untrusted Time Override (Client-Side CreatedAt)
* **Goal**: Use a spoofed timestamp parameter for transaction records rather than `request.time`.
```json
{
  "id": "malicious_meeting_4",
  "title": "Backdated Record",
  "date": "2020-01-01T00:00:00.000Z",
  "duration": "01:00",
  "transcript": "Test text",
  "summary": "Test summary",
  "ownerId": "attacker_user_123",
  "createdAt": "2020-01-01T00:00:00.000Z"
}
```

### Payload 7: Client-Side Admin Elevation Claim
* **Goal**: Modify user configuration metadata parameters with an unverified admin indicator inside the payload.
```json
{
  "aiProvider": "gemini",
  "audioFolder": "/Folder/",
  "autoDeleteAudio": true,
  "ownerId": "attacker_user_123",
  "sysRole": "superuser"
}
```

### Payload 8: Immutable Attribute Lock Bypass
* **Goal**: Tamper with `createdAt` during standard update transactions.
```json
{
  "createdAt": "2026-06-12T00:00:00.000Z"
}
```

### Payload 9: Path Poisoning/Resource Bloat on Document Id
* **Goal**: Inundate the router with an excessively bloated alphanumeric target ID (1.5KB target ID).
* **Target ID**: `("A" * 1500)`

### Payload 10: State Inversion (Malicious Missing Keys on Create)
* **Goal**: Create a meeting record without critical fields (`transcript` or `summary`) to crash front-end modules.
```json
{
  "id": "broken_meeting_1",
  "title": "Invisible Note",
  "date": "2026-06-11T18:00:00.000Z",
  "duration": "02:22",
  "ownerId": "attacker_user_123"
}
```

### Payload 11: Spoofed Email Verification Access
* **Goal**: Perform write operations when authenticated with a temporary unverified email account.
* **Header Constraints**: `request.auth.token.email_verified == false`

### Payload 12: Broken Enum Injecton on AppSettings
* **Goal**: Set the settings AI engine parameter to an unsupported provider (e.g. `mock_ai_processor`).
```json
{
  "aiProvider": "mock_ai_processor",
  "audioFolder": "/Vault/",
  "autoDeleteAudio": true,
  "ownerId": "attacker_user_123"
}
```

---

## 3. Test Runner Checklist (`firestore.rules.test.ts`)
The test runner executes standard integration mock checks against the Firestore Local Emulator verifying all security constraints:

```typescript
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment
} from "@firebase/rules-unit-testing";

let testEnv: RulesTestEnvironment;

describe("Firestore Security Rules Tests", () => {
  before(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: "gen-lang-client-0726562316",
      firestore: {
        rules: require("fs").readFileSync("firestore.rules", "utf8")
      }
    });
  });

  after(async () => {
    await testEnv.cleanup();
  });

  it("Blocks document creation where ownerId spoofing occurs", async () => {
    const attackerCtx = testEnv.authenticatedContext("attacker_123", { email_verified: true });
    const db = attackerCtx.firestore();
    const meetingRef = db.collection("meetings").doc("malicious_meeting_1");
    
    await assertFails(meetingRef.set({
      id: "malicious_meeting_1",
      title: "Stolen Note",
      date: new Date().toISOString(),
      duration: "05:00",
      transcript: "Secrets leaked",
      summary: "Leaks summarized",
      ownerId: "victim_user_xyz",
      createdAt: new Date().toISOString()
    }));
  });

  it("Blocks settings mutations targeting on victim spaces", async () => {
    const attackerCtx = testEnv.authenticatedContext("attacker_123", { email_verified: true });
    const db = attackerCtx.firestore();
    const settingsRef = db.collection("settings").doc("victim_user_xyz");
    
    await assertFails(settingsRef.set({
      aiProvider: "custom_openai",
      apiKey: "hijacked",
      audioFolder: "/Attack/",
      autoDeleteAudio: false,
      ownerId: "victim_user_xyz"
    }));
  });

  it("Enforces size constraints on user defined input titles", async () => {
    const attackerCtx = testEnv.authenticatedContext("attacker_123", { email_verified: true });
    const db = attackerCtx.firestore();
    const meetingRef = db.collection("meetings").doc("meeting_bloated_id");
    
    await assertFails(meetingRef.set({
      id: "meeting_bloated_id",
      title: "A".repeat(500), // Exceeds title size limit (256 characters)
      date: new Date().toISOString(),
      duration: "05:00",
      transcript: "Valid transcript",
      summary: "Valid summary",
      ownerId: "attacker_123",
      createdAt: new Date().toISOString()
    }));
  });
});
```
