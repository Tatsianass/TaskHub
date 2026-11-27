# App Review Notes: paste into App Store Connect > App Review Information > Notes

**Screen recording (item 1):** <PASTE LINK HERE: unlisted YouTube / iCloud / Drive link to the physical-device recording>
The recording starts at app launch and shows: Sign in with Apple, creating a task, the Eisenhower matrix, calendar, birthdays, reminders, voice input (Pro), the Pro paywall and free trial, Restore Purchases, and Settings > Delete account.

**1. Purpose and audience**
TaskHub Planner is a personal task manager built on the Eisenhower matrix (urgent / important). Tasks are sorted into four quadrants, each with a soft limit on active tasks. A task whose deadline is close moves up into the urgent quadrant. The app also has a month calendar, birthdays, and local reminders. It is for individuals who want simple personal planning for work and home. It solves the problem of ordinary to-do lists that overload users and give no priorities. It is available in 7 languages (ru, en, es, fr, de, pt, zh).

**2. How to access the main features**
- Sign in with Apple is the only sign-in method, so no demo username or password is needed. Tap "Sign in with Apple" and use any Apple ID. An account is created on first sign-in.
- Tasks tab: tap "+" to add a task. Typing "tomorrow" or "friday" in the title fills the date automatically.
- Calendar tab: month view of tasks and birthdays. Birthdays tab: add a name and date.
- Settings: language, theme, auto-escalation, notifications, Pro, sign out, delete account.
- No sample files are required.

**3. Account deletion**
Settings > Delete account (red button at the bottom) > confirm in the alert. This permanently deletes the account, all tasks and all birthdays from our server. For Sign in with Apple accounts, the app also revokes the Apple token. Subscriptions are managed by Apple and are not cancelled by deletion. The app says this and links to the App Store subscription settings.

**4. User-generated content**
All content (tasks, notes, birthdays) is private to the signed-in user. There is no sharing, public feed, messaging or other user-to-user interaction, so reporting and blocking mechanisms do not apply.

**5. In-app purchases (Pro)**
The free plan is fully usable. TaskHub Pro unlocks voice input, several reminders per task, home screen widgets and extra color themes. It has a 14-day free trial, then an auto-renewing subscription (plans as shown on the paywall; prices come from the App Store). Purchases are made with Apple In-App Purchase. The paywall has Restore Purchases, Terms and Privacy links, and Manage Subscription. Privacy policy: https://tatsianass.github.io/TaskHub/privacy.html . Support: https://tatsianass.github.io/TaskHub/support.html To test, open Settings > "Try Pro" or tap any Pro-locked feature (for example the microphone button when adding a task).

**6. External services**
- Sign in with Apple (authentication, including token revocation on account deletion)
- Our own API server (Node.js/Express) hosted on Fly.io, with a database storing accounts, tasks and birthdays
- RevenueCat (subscription management) on top of Apple StoreKit / In-App Purchase
- Apple Speech Recognition, used by the Pro voice-input feature through the system recognizer
- Apple local notifications for reminders (no push server)
No ads, analytics SDKs, AI services or other third-party data providers are used.

**7. Regional differences**
The app works the same in all regions. Only the interface language (7 languages) and the subscription price (set by the App Store for each storefront) differ.

**8. Regulated industry / third-party material**
None. The app is not in a regulated industry and contains no protected third-party content.

**Contact:** taskhubplanner@gmail.com
