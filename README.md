# IITC Plugin: Portal List Enhanced

![IITC](https://img.shields.io/badge/IITC-Plugin-blue.svg) ![License](https://img.shields.io/badge/License-GPL%203.0-green)

An enhanced version of the classic IITC Portal List plugin, designed to provide better data visualization, sorting, and export capabilities for Ingress agents.

## 🤝 Acknowledgements

This plugin is built upon the foundation of the generic **Portal List** plugin developed by the original [IITC (Ingress Intel Total Conversion)](https://iitc.me/) team.

**Development & Enhancements:**
* **Lead Developer:** Enrique H. (@kyke31)
* **Co-Pilot/AI Partner:** Google Gemini
* **Original Source:** IITC Standard Plugins

## 📦 Installation

This script requires a Userscript manager and IITC.

1.  **Prerequisites:** Ensure you have [Tampermonkey](https://www.tampermonkey.net/) (Chrome/Edge) or [Violentmonkey](https://violentmonkey.top/) (Firefox) installed.
2.  **Install IITC:** Ensure the main IITC CE (Community Edition) script is installed and active.
3.  **Install Plugin:**
    * Click on the `.user.js` file in this repository.
    * Your userscript manager should automatically prompt you to install.
    * Click **Install**.
4.  **Reload:** Refresh the Intel Map to load the plugin.

## 🚀 Functionality

This plugin displays a sortable list of all portals currently visible in the map view. Below is a breakdown of features, distinguishing between the classic core functionality and the new enhancements.

### 🔹 Core Features (From Original Plugin)
These features are inherited from the standard Portal List plugin:
* **Portal Listing:** Automatically lists all portals currently visible in the browser viewport.
* **Basic Sorting:** Allows sorting the list by:
    * Portal Name
    * Level
    * Team (Enlightened, Resistance, Neutral)
    * Health/Resonator charge.
* **Map Interaction:** Clicking a portal in the list centers the map on that portal.

### ✨ New & Enhanced Features (By Enrique H. & Gemini)
These functionalities have been added or significantly improved to assist with planning and automation:

* **Advanced Data Columns:** (Adjust based on your specific script additions)
    * Added specific coordinate columns/formatting for easier export.
    * Added visual indicators for specific portal attributes.
* **Optimized Sorting Logic:**
    * Enhanced sorting algorithms to handle large lists more efficiently without freezing the browser.
* **Export Capabilities:**
    * *Enhanced:* streamlined copy/paste functionality to easily move data from the list into external tools (like Excel, Google Sheets, or Maxfield/Fanfield planners).
* **UI/UX Improvements:**
    * Modernized table styling for better readability.
    * Improved mobile responsiveness for use on tablets/phones.

*(Note: If the script includes specific automation logic or timestamps, mention them here, e.g., "Console logs include `[yyyymmdd_hhmmss]` timestamps for debugging.")*

## 📜 License

**GNU General Public License v3.0**

This program is free software: you can redistribute it and/or modify it under the terms of the GNU General Public License as published by the Free Software Foundation, either version 3 of the License, or (at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with this program.  If not, see <https://www.gnu.org/licenses/>.
