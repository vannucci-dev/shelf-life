# 0005: Generate recipe suggestions with Claude

- Status: Accepted
- Date: 2026-11-26

## Context
Recipes should use what's in the inventory, with expiring items first, and respect filters such as time and diet. Recipe database APIs match on ingredient names poorly, cost money at scale, and don't know about expiry dates.

## Decision
A server function sends a compact inventory (names, quantities, days to expiry) and the filters to Claude. Claude returns 5 recipes as structured JSON, linked to inventory item ids. The server re-ranks them deterministically: expiring items used first, then fewest missing ingredients, then cooking time. Results are labelled "AI-generated".

## Consequences
- Suggestions are flexible and inventory-aware, including the spice rack.
- Recipes are not tested and can occasionally be off. The label and the user's own judgement cover this. Importing recipes from a URL can come later.
- Each call costs a little, so we cache the result per inventory snapshot and reuse it for the daily digest.
