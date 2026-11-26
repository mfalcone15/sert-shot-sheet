# SERT Digital Shot Sheet — 0.8.2

Standalone administrative test build for GitHub Pages. Replaces 0.8.1. Photograph and supporting-image attachment works again: the chosen files are kept, shown on the report, and printed on their own pages.

## Put it on GitHub

1. Unzip this archive.
2. Open your existing repository. Use **Add file → Upload files** and upload **these files** to the repository root, replacing the 0.8.1 copies. Do not upload the zip, and do not put the files inside an extra folder.
3. `index.html` must stay in the top file list.
4. Commit the upload. If Pages is already on for `main` / root, the site updates in a minute or two. Otherwise: Settings → Pages → Deploy from a branch → `main` → `/ (root)`.
5. On the phone, open the Pages address in Safari. If an old copy is stuck, close the tab and open the address again.

Reports stay in the browser on that phone. They are not encrypted. Use fictitious data only.

## Worksheet

- LBS = total grains / 7000
- LBS TNT = LBS × R.E. factor (default 1.66)
- MSD (ft) = K factor (default 18) × cube root of LBS TNT
- Room volume = length × width × height, in feet
- PSI = (LBS TNT / volume)^0.72 × 2410
- Limits shown on the sheet: 4 PSI exterior, 2 PSI interior

This is not an approved operational form and not a safety determination.

## Mobile photograph update
Separate camera and library buttons, responsive previews, captions, reordering, attachment count and processing feedback. The existing 12-photo limit and storage format are unchanged. Export a backup before updating. Test camera and library on your phone after deployment.
