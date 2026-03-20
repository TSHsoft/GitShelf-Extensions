# GitShelf Edge Extension

A Microsoft Edge (Chromium) extension for one-click saving of GitHub repositories and profiles to your GitShelf.

## Core Features
- **One-click Capture**: Directly save repositories or user profiles while browsing GitHub.
- **Background Sync**: Synchronizes authentication state from the GitShelf web application session using an encrypted bridge.
- **Interface Actions**: Interactive popup with theme switching (Dark/Light) and a dedicated Sign Out icon to manage account sessions.
- **Standalone Operation**: Fetches data and saves to IndexedDB independently once synchronized.

## Security & Architecture
- **Encrypted Synchronization**: User tokens are synchronized via an offscreen `ext-bridge` using **AES-GCM encryption**, preventing plain-text exposure in storage.
- **Origin Verification**: Communicates strictly with authorized `GitShelf` origins and matches encrypted session IDs to prevent unauthorized data access.
- **Manifest V3**: Built using modern browser extension standards.
- **Offscreen Processing**: Utilizes an offscreen document to interact with Shared IndexedDB, as background service workers lack direct DOM/IndexedDB access in some contexts.

## Installation (Manual)
1. Open Microsoft Edge and navigate to `edge://extensions`.
2. Toggle **Developer mode** (bottom-left area).
3. Select **Load unpacked**.
4. Choose the `gitshelf-extension` folder.

## Operating Instructions
1. **Initial Sync**: Open the GitShelf web application to allow the extension to securely bridge your GitHub credentials.
2. **Browsing**: Navigate to any repository (`github.com/owner/repo`) or user profile (`github.com/username`).
3. **Capture**: Click the GitShelf icon in the browser toolbar, then select **Save to Shelf**.
4. **Theme / Sign out**: Use the header icons to switch display modes or sign out from the extension.

## Compatibility
Compatible with Microsoft Edge, Google Chrome, and other Chromium-based browsers that support Manifest V3.
