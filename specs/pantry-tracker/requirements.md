# Requirements: Pantry Tracker

> Status: **Draft v0.2** (2026-11-26). Open questions resolved: defaults accepted, plus barcode scanning and recipe suggestions added to v1. See "Decisions" at the end.

## Introduction

The app helps a person (or household) know what food they have across three storage locations, the **fridge**, the **pantry** and the **spice rack**, and when each item expires. Adding items must be fast, ideally by taking a photo, so that keeping the inventory up to date costs less effort than forgetting about it. The main payoff is less food waste and fewer duplicate purchases.

### Goals
- Know at a glance what is in each location.
- Get warned before things expire.
- Add items in seconds, from a photo or a barcode scan.
- Get recipe ideas that use what I have, especially what's about to expire.

### Non-goals (v1)
- Meal planning calendars, nutrition tracking.
- Price tracking or grocery delivery integrations.
- Multi-user households (the data model allows it later).
- Bulk-adding from receipt photos (planned after v1).

### Glossary
- **Item**: one tracked thing, e.g. "Milk, 1 L".
- **Location**: Fridge, Pantry, Spice rack and Freezer.
- **Expiry date**: the date printed on the product (use-by or best-before), or an estimate.
- **Capture**: the flow of turning a photo into one or more draft items.

---

## Requirement 1: Manage inventory items

**User story:** As a user, I want to add, edit and remove items in each location, so that the inventory reflects what I actually have.

**Acceptance criteria**
1. WHEN the user creates an item THE SYSTEM SHALL require a name and a location, and SHALL accept optional quantity, unit, expiry date, opened date and notes.
2. WHEN the user saves an item THE SYSTEM SHALL show it in its location list immediately.
3. WHEN the user edits any field of an item THE SYSTEM SHALL persist the change and update the item's expiry status.
4. WHEN the user marks an item as used up or thrown away THE SYSTEM SHALL remove it from the active inventory AND SHALL record the reason (consumed / discarded) for history.
5. WHEN the user decreases the quantity of an item to zero THE SYSTEM SHALL ask whether to mark it as used up.
6. THE SYSTEM SHALL allow moving an item between locations without re-entering it.

## Requirement 2: Capture items from a photo

**User story:** As a user, I want to take a photo of a product (or a few products) and have the app fill in the details, so that adding items is nearly effortless.

**Acceptance criteria**
1. WHEN the user takes or selects a photo THE SYSTEM SHALL extract a candidate name and, if visible, an expiry date for each product detected.
2. WHEN extraction completes THE SYSTEM SHALL present the results as editable drafts AND SHALL NOT add them to the inventory until the user confirms.
3. WHERE a field was extracted with low confidence THE SYSTEM SHALL visibly flag that field for review.
4. IF no expiry date is detected THEN THE SYSTEM SHALL offer an estimated expiry based on the product type (see Requirement 4) AND SHALL mark it as estimated.
5. IF extraction fails or no product is detected THEN THE SYSTEM SHALL let the user fall back to manual entry with the photo still attached.
6. THE SYSTEM SHALL suggest a location for each draft (e.g. dairy → fridge, spices → spice rack), which the user can change.
7. WHEN the user confirms drafts THE SYSTEM SHALL add all confirmed items in one action.
8. THE SYSTEM SHALL return extraction results within 10 seconds for a single-product photo under normal network conditions.

## Requirement 3: Expiry tracking and status

**User story:** As a user, I want to see which items are expiring soon or already expired, so that I can use them in time or throw them out.

**Acceptance criteria**
1. THE SYSTEM SHALL classify each item with an expiry date as **Fresh**, **Expiring soon** (within N days, default 3, configurable) or **Expired**.
2. THE SYSTEM SHALL show a combined "Use soon" view listing expiring and expired items across all locations, sorted by expiry date ascending.
3. WHEN an item is opened AND its product type has a known "use within X days after opening" rule THE SYSTEM SHALL compute the effective expiry as the earlier of the printed date and the opened-date rule.
4. THE SYSTEM SHALL distinguish use-by dates (safety) from best-before dates (quality) where the user or extraction supplies that distinction.
5. Spices and long-life pantry items SHALL be allowed to have no expiry date without being flagged as incomplete.

## Requirement 4: Expiry estimates

**User story:** As a user, I want sensible default expiry estimates for items without a printed date (fresh produce, leftovers, bulk spices), so that I still get reminders.

**Acceptance criteria**
1. THE SYSTEM SHALL provide default shelf-life estimates per product category and location (e.g. "fresh herbs, fridge: 7 days").
2. WHEN an estimate is applied THE SYSTEM SHALL label the date as estimated everywhere it is shown.
3. THE SYSTEM SHALL let the user override an estimate on a single item.

## Requirement 5: Notifications

**User story:** As a user, I want to be reminded before food expires, so that I don't have to remember to check the app.

**Acceptance criteria**
1. WHEN one or more items enter the "Expiring soon" state THE SYSTEM SHALL send at most one digest notification per day listing them.
2. THE SYSTEM SHALL let the user choose the notification time and turn notifications off.
3. WHEN the user taps a notification THE SYSTEM SHALL open the "Use soon" view.

## Requirement 6: Find what I have

**User story:** As a user, I want to search and browse my inventory, so that I can check whether I already have something, for example while at the shop.

**Acceptance criteria**
1. WHEN the user types in search THE SYSTEM SHALL match item names across all locations, tolerating partial words and case differences.
2. THE SYSTEM SHALL let the user filter by location and expiry status, and sort by name, expiry date or date added.
3. WHEN the user searches for an item that exists in more than one entry THE SYSTEM SHALL show all entries with their quantities and expiry dates.

## Requirement 7: Data persistence and access

**User story:** As a user, I want my inventory to be saved reliably and available whenever I open the app, so that I can trust it.

**Acceptance criteria**
1. THE SYSTEM SHALL persist all inventory changes durably.
2. WHILE the device is offline THE SYSTEM SHALL allow browsing, searching and manual add/edit, AND SHALL sync changes when connectivity returns. Photo extraction, barcode lookup of new codes and recipe suggestions MAY require connectivity.
3. WHERE the user signs in on more than one device THE SYSTEM SHALL sync the inventory between them.
4. THE SYSTEM SHALL let the user export their inventory as CSV or JSON.

## Requirement 8: Privacy

**User story:** As a user, I want my photos and data handled respectfully, so that I'm comfortable using the camera feature.

**Acceptance criteria**
1. THE SYSTEM SHALL use captured photos only for item extraction and, if the user chooses, as the item's thumbnail.
2. THE SYSTEM SHALL NOT retain the original full-size photo after extraction unless the user opts in.
3. WHEN the user deletes their account or data THE SYSTEM SHALL delete all their items and stored photos.

## Requirement 9: Add items by barcode

**User story:** As a user, I want to scan a product's barcode, so that the name and details are filled in reliably without typing.

**Acceptance criteria**
1. WHEN the user scans a barcode THE SYSTEM SHALL look up the product and pre-fill name, brand, size/quantity, unit and category where available.
2. WHEN a lookup succeeds THE SYSTEM SHALL present the result as an editable draft AND SHALL ask for the expiry date, offering to photograph the date or apply an estimate (Requirement 4).
3. IF the barcode is not found THEN THE SYSTEM SHALL fall back to photo capture or manual entry AND SHALL remember the user's entry for that barcode so the next scan pre-fills it.
4. WHEN the user scans a barcode that matches an item already in the inventory THE SYSTEM SHALL offer to increase that item's quantity or add a separate entry with its own expiry date.
5. WHILE the device is offline THE SYSTEM SHALL resolve barcodes the user has scanned before from local data.
6. WHEN the user scans several barcodes in a row THE SYSTEM SHALL collect them as a batch of drafts to confirm together.

## Requirement 10: Recipe suggestions

**User story:** As a user, I want recipe ideas based on what I have, so that I use food before it expires and cook without an extra shop.

**Acceptance criteria**
1. WHEN the user opens Recipes THE SYSTEM SHALL suggest several recipes that use items in the current inventory.
2. THE SYSTEM SHALL rank suggestions to favour recipes that use items which are Expiring soon or opened.
3. FOR each suggestion THE SYSTEM SHALL show which ingredients the user has, which are missing, and which inventory items are close to expiry.
4. THE SYSTEM SHALL let the user steer suggestions with optional filters: max cooking time, dietary preferences (e.g. vegetarian), and "use only what I have".
5. THE SYSTEM SHALL treat common staples (salt, oil, water) as available without requiring them in the inventory, and SHALL use the spice rack contents when choosing recipes.
6. WHEN the user marks a recipe as cooked THE SYSTEM SHALL offer to decrease or remove the ingredients used from the inventory.
7. THE SYSTEM SHALL let the user save favourite recipes.
8. WHEN the "Use soon" digest (Requirement 5) lists items THE SYSTEM SHALL include one recipe idea that uses them, if one is available.
9. IF a recipe is generated rather than taken from a recipe source THEN THE SYSTEM SHALL label it as AI-generated.

---

## Decisions

| # | Question | Decision |
|---|----------|----------|
| OQ-1 | Platform | **PWA** (installable web app), mobile-first. |
| OQ-2 | Single user or household | **Single user** for v1, multi-device sync; data model allows households later. |
| OQ-3 | Offline | **Browse/search/edit offline**; photo extraction, barcode lookup of new codes and recipes need a connection. |
| OQ-4 | Photo extraction | **Cloud vision model** (Claude). |
| OQ-5 | Locations | **Fridge, Freezer, Pantry, Spice rack**; custom locations later. |
| OQ-6 | Barcodes | **In v1** (Requirement 9). |
| OQ-7 | Receipts | After v1. |
| OQ-8 | Audience | **Personal use** first. |
| new | Recipes | **In v1** (Requirement 10). |
