# Mada Premium UI Reference

This document is the fixed visual and product reference for the restaurant platform redesign. Do not simplify it into a generic dashboard and do not drift away from the four-screen concept approved by the owner.

## Core direction

- Product name: **Mada**
- Product type: Restaurant management SaaS with AI agent capabilities
- Mood: Calm, premium, minimal, highly polished
- Main visual language: warm ivory backgrounds, deep forest green, soft shadows, rounded cards, generous spacing, Arabic-first RTL layout
- Target quality: premium consumer-app finish while remaining a serious restaurant operations platform
- Responsive requirement: preserve the same visual language across mobile, tablet, and desktop
- Functional rule: redesign presentation without breaking Supabase data flows, AI agent logic, orders, menu, channels, analytics, customers, complaints, subscriptions, or settings

## Approved four-screen reference

### 1. Welcome / onboarding screen

- Centered Mada logo and restaurant platform identity
- Large Arabic headline: إدارة مطعمك بذكاء وسهولة
- Short supporting copy about orders, analytics, and managing everything in one platform
- Deep-green primary CTA
- Light decorative botanical or geometric details only
- No photographic background
- Premium spacing and calm visual hierarchy

### 2. Main dashboard screen

- Header with Mada wordmark, restaurant selector, notifications, and user greeting
- Four primary KPI cards: today sales, delivered orders, preparing orders, new orders
- Sales overview chart with percentage change
- Latest orders list with status, customer, time, and total
- Bottom navigation on mobile; structured sidebar/navigation on desktop
- Dashboard must feel operational and alive, not like a static template

### 3. Products / menu screen

- Arabic RTL header with add-product CTA
- Search and filtering controls
- Category chips
- Product cards containing image, title, description, price, availability toggle, and overflow actions
- Soft ivory card backgrounds and deep-green active states
- Fast scanning and touch-friendly spacing

### 4. Product details / editing screen

- Large product image area
- Product title, description, and price
- Option groups with checkboxes or selectors and price deltas
- Clear save action fixed or visually anchored near the bottom
- Support existing menu item fields, availability, options, stock tracking, aliases, and upsell category

## Design system rules

### Colors

- Forest green: primary brand and active controls
- Warm ivory: page and card surfaces
- Near-black green: primary text
- Muted sage/gray: secondary text and inactive controls
- Gold accent: revenue, premium indicators, or limited highlights only
- Status colors remain accessible and consistent

### Components

- Large radius cards and buttons
- Soft layered shadows, never harsh outlines
- Consistent 8px spacing rhythm
- Arabic typography must remain highly readable
- Icons should be simple and consistent using the existing Lucide icon system where possible
- Charts should use restrained visual treatment
- Inputs and dialogs must match the same premium language

## Implementation phases

1. Establish design tokens and reusable premium shell
2. Rebuild the main dashboard overview
3. Rebuild products/menu list
4. Rebuild product details/editing experience
5. Extend the same system to orders, conversations, channels, analytics, customers, complaints, subscriptions, AI health, marketing, integrations, and settings
6. Validate mobile, tablet, desktop, RTL, dark mode, loading states, empty states, and error states

## Non-negotiables

- Work on a separate branch until approved
- Preserve all current functions and database behavior
- Do not remove features to make the design easier
- Do not copy the reference mechanically where it conflicts with real restaurant workflows; adapt it while preserving the exact premium character
- The final result must look intentionally designed as one system, not a collection of unrelated tabs
