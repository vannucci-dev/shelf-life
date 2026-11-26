# 0001: Build as a PWA first

- Status: Accepted
- Date: 2026-11-26

## Context
The app is for personal use on a phone and needs a camera, barcode scanning, offline access and reminders. Building two native apps is slow, and going through the app stores adds friction for a personal project.

## Decision
Build a mobile-first Progressive Web App (React + TypeScript + Vite) that can be installed from the browser on iOS and Android.

## Consequences
- One codebase, deployed instantly, no app store review.
- Camera, `BarcodeDetector`/zxing, IndexedDB and Web Push are all available. On iOS, push requires installing the app to the home screen (iOS 16.4+).
- Background tasks are limited. Reminders must come from server push, not from the device.
- If PWA limits start to hurt, the same code can be wrapped with Capacitor.
