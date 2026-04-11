<div align="center">

# 🧩 GitShelf Extensions

**The official browser extension for [GitShelf](https://github.com/TSHsoft/GitShelf) — capture and curate GitHub repositories and profiles with a single click.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Main Project](https://img.shields.io/badge/Project-GitShelf-ff69b4.svg?logo=github&logoColor=white)](https://github.com/TSHsoft/GitShelf)
[![Live App](https://img.shields.io/badge/Live-Vercel-646CFF.svg?logo=vercel&logoColor=white)](https://gitshelf.vercel.app/)
[![Star GitShelf](https://img.shields.io/github/stars/TSHsoft/GitShelf?style=social)](https://github.com/TSHsoft/GitShelf)
<br/>
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-orange.svg)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Platform: Edge/Chrome](https://img.shields.io/badge/Platform-Chromium-brightgreen.svg)](https://www.microsoft.com/edge/extensions/pub/)

</div>

---

## 🚀 Core Features
- **One-click Capture**: Directly save repositories or user profiles while browsing GitHub.
- **Smart Star Badge**: The extension icon automatically displays a yellow star (★) badge when browsing a repository or profile that is already saved in your GitShelf.
- **Background Sync**: Synchronizes authentication state from the [GitShelf web application](https://gitshelf.vercel.app/) session using an encrypted bridge.
- **Interface Actions**: Interactive popup with theme switching (Dark/Light) and a dedicated Sign Out icon to manage account sessions.
- **Standalone Operation**: Fetched data is saved to IndexedDB independently once synchronized.

## 🛡️ Security & Architecture
- **Encrypted Synchronization**: User tokens are synchronized via an offscreen `ext-bridge` using **AES-GCM encryption**, preventing plain-text exposure in storage.
- **Origin Verification**: Communicates strictly with authorized **GitShelf** origins and matches encrypted session IDs to prevent unauthorized data access.
- **Manifest V3**: Built using modern browser extension standards for better security and performance.
- **Offscreen Processing**: Utilizes an offscreen document to interact with Shared IndexedDB, as background service workers lack direct DOM/IndexedDB access in some contexts.

## 📦 Installation (Manual)

### **Microsoft Edge**
1. Open Edge and go to `edge://extensions`.
2. Toggle **Developer mode** (bottom-left).
3. Select **Load unpacked** and choose this folder.

### **Google Chrome**
1. Open Chrome and go to `chrome://extensions`.
2. Toggle **Developer mode** (top-right).
3. Select **Load unpacked** and choose this folder.

## 📖 How to Use
1. **Initial Sync**: Open the [GitShelf web application](https://gitshelf.vercel.app/) to allow the extension to securely bridge your GitHub credentials.
2. **Browsing**: Navigate to any repository (`github.com/owner/repo`) or user profile (`github.com/username`).
3. **Capture**: Click the GitShelf icon in your browser toolbar, then select **Save to Shelf**.
4. **Theme / Sign out**: Use the header icons to switch display modes or sign out from the extension.

## 🌐 Compatibility
Compatible with Microsoft Edge, Google Chrome, and other Chromium-based browsers that support Manifest V3.

## 📄 License
This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---

<div align="center">

Made with ❤️ by [TSHsoft](https://github.com/TSHsoft) — Part of the [GitShelf](https://github.com/TSHsoft/GitShelf) Ecosystem

</div>
